<?php
// Spoločné načítanie: nastavenia, databáza, Stripe, e-mail, vybavenie objednávky.
declare(strict_types=1);

$CFG = require __DIR__ . '/config.php';
require __DIR__ . '/license.php';
require __DIR__ . '/mail.php';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}

function cfg(string $key)
{
    global $CFG;
    return $CFG[$key] ?? null;
}

function h(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function url(string $path): string
{
    return rtrim((string)cfg('site_url'), '/') . '/' . ltrim($path, '/');
}

// ---------------------------------------------------------------- CSRF

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

function csrf_ok(): bool
{
    return isset($_POST['csrf'], $_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$_POST['csrf']);
}

// formulár nákupu prichádza aj zo statickej buy.html (bez tokenu) – overí sa, že ho poslal vlastný web
function same_origin(): bool
{
    $src = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
    if ($src === '') return true;   // niektoré prehliadače hlavičky neposielajú
    $host = parse_url($src, PHP_URL_HOST);
    return $host !== null && strcasecmp($host, (string)parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) === 0
        || strcasecmp((string)$host, (string)parse_url((string)cfg('site_url'), PHP_URL_HOST)) === 0;
}

// ---------------------------------------------------------------- databáza (SQLite)

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $path = cfg('db_path');
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0700, true);
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        payment_intent TEXT,
        email TEXT NOT NULL,
        plan TEXT NOT NULL,
        school TEXT,
        license_key TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT "paid",
        created_at TEXT NOT NULL,
        emailed_at TEXT
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS recover_log (who TEXT NOT NULL, at INTEGER NOT NULL)');
    // počítače, na ktorých je kľúč aktivovaný (max PG_MAX_DEVICES)
    $pdo->exec('CREATE TABLE IF NOT EXISTS activations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_key TEXT NOT NULL,
        device TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        UNIQUE(license_key, device)
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS activate_log (who TEXT NOT NULL, at INTEGER NOT NULL)');
    // účty (prihlásenie e-mailom v aplikácii) a ich synchronizované dáta
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT,
        rev INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS login_codes (
        email TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires INTEGER NOT NULL,
        tries INTEGER NOT NULL DEFAULT 0
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        device TEXT,
        name TEXT,
        created_at TEXT NOT NULL,
        last_seen TEXT NOT NULL
    )');
    $pdo->exec('CREATE TABLE IF NOT EXISTS account_log (who TEXT NOT NULL, at INTEGER NOT NULL)');
    return $pdo;
}

// ---------------------------------------------------------------- Stripe (bez knižnice, cez cURL)

function stripe(string $method, string $path, array $params = []): array
{
    $ch = curl_init('https://api.stripe.com/v1/' . ltrim($path, '/') . ($method === 'GET' && $params ? '?' . http_build_query($params) : ''));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_USERPWD => cfg('stripe_secret') . ':',
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_TIMEOUT => 30,
    ]);
    if ($method !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($body === false) throw new RuntimeException('Stripe: ' . $err);
    $data = json_decode($body, true) ?: [];
    if ($code >= 400) throw new RuntimeException('Stripe: ' . ($data['error']['message'] ?? "HTTP $code"));
    return $data;
}

// podpis webhooku: hlavička Stripe-Signature „t=…,v1=…“
function stripe_verify(string $payload, string $header, string $secret, int $tolerance = 300): bool
{
    $t = null;
    $sigs = [];
    foreach (explode(',', $header) as $part) {
        [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
        if ($k === 't') $t = (int)$v;
        if ($k === 'v1') $sigs[] = $v;
    }
    if (!$t || !$sigs || abs(time() - $t) > $tolerance) return false;
    $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
    foreach ($sigs as $s) if (hash_equals($expected, $s)) return true;
    return false;
}

// ---------------------------------------------------------------- vybavenie objednávky

// Zo zaplatenej Checkout Session vytvorí objednávku s kľúčom a pošle e-mail.
// Volá sa z webhooku aj zo stránky success.php – druhé volanie len vráti existujúcu objednávku.
function fulfill(array $session): ?array
{
    if (($session['payment_status'] ?? '') !== 'paid') return null;
    $sid = (string)$session['id'];
    $pdo = db();

    $find = $pdo->prepare('SELECT * FROM orders WHERE session_id = ?');
    $find->execute([$sid]);
    if ($o = $find->fetch(PDO::FETCH_ASSOC)) return $o;

    $plan = $session['metadata']['plan'] ?? 'pro';
    $email = $session['customer_details']['email'] ?? ($session['customer_email'] ?? '');
    $created = false;
    for ($try = 0; $try < 5 && !$created; $try++) {
        try {
            $ins = $pdo->prepare('INSERT INTO orders (session_id, payment_intent, email, plan, school, license_key, amount, currency, created_at)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $ins->execute([
                $sid,
                is_string($session['payment_intent'] ?? null) ? $session['payment_intent'] : null,
                $email,
                $plan,
                $session['metadata']['school'] ?? null,
                pg_generate(),
                (int)($session['amount_total'] ?? 0),
                (string)($session['currency'] ?? cfg('currency')),
                gmdate('Y-m-d H:i:s'),
            ]);
            $created = true;
        } catch (PDOException $e) {
            // súčasné volanie z webhooku a zo success.php – druhé narazí na UNIQUE(session_id)
            $find->execute([$sid]);
            if ($o = $find->fetch(PDO::FETCH_ASSOC)) return $o;
        }
    }
    $find->execute([$sid]);
    $order = $find->fetch(PDO::FETCH_ASSOC);
    if ($order && $order['email']) {
        if (send_license_mail($order)) {
            $pdo->prepare('UPDATE orders SET emailed_at = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s'), $order['id']]);
        }
    }
    return $order ?: null;
}

function plan_name(string $plan): string
{
    $plans = cfg('plans');
    return $plans[$plan]['name'] ?? 'Project Gallery Pro';
}
