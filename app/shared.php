<?php
// Zdieľané stránky projektov (project.php – API pre aplikáciu, p.php – verejná stránka, admin.php – prehľad).
// Súbory obrázkov sú v priečinku shared/<slug>/ (banner.png, 1.jpg … 6.jpg); PHP sa v ňom nespúšťa (.htaccess).

const SH_MAX_PER_USER = 50;              // max. zdieľaných projektov na účet
const SH_MAX_SHOTS = 6;
const SH_MAX_BANNER = 3 * 1024 * 1024;   // PNG
const SH_MAX_SHOT = 1536 * 1024;         // JPG
const SH_MAX_DIM = 4096;

function shared_db(): PDO
{
    $pdo = db();
    static $ready = false;
    if (!$ready) {
        $pdo->exec('CREATE TABLE IF NOT EXISTS shared_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            pkey TEXT NOT NULL,
            title TEXT NOT NULL,
            data TEXT NOT NULL,
            shots INTEGER NOT NULL DEFAULT 0,
            banner INTEGER NOT NULL DEFAULT 0,
            bytes INTEGER NOT NULL DEFAULT 0,
            views INTEGER NOT NULL DEFAULT 0,
            hidden INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, pkey)
        )');
        $ready = true;
    }
    return $pdo;
}

// koreň webu (bez lomky na konci) – z nastavení, inak z aktuálnej požiadavky
function site_base(): string
{
    $s = rtrim((string)cfg('site_url'), '/');
    if ($s !== '' && stripos($s, 'example.com') === false) return $s;
    $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
    $host = preg_replace('/[^A-Za-z0-9.\-:\[\]]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return $scheme . '://' . $host . $dir;
}

function shared_slug_ok(string $slug): bool
{
    return (bool)preg_match('/^[a-z0-9][a-z0-9-]{2,63}$/', $slug);
}

function shared_url(string $slug): string
{
    return site_base() . '/p.php?id=' . rawurlencode($slug);
}

function shared_dir(string $slug): string
{
    return dirname(__DIR__) . '/shared/' . $slug;
}

// .htaccess, ktorý v priečinku s nahratými obrázkami vypne spúšťanie skriptov (pre istotu sa vytvorí vždy)
function shared_protect_root(): void
{
    $root = dirname(__DIR__) . '/shared';
    if (!is_dir($root)) mkdir($root, 0755, true);
    $ht = $root . '/.htaccess';
    if (!is_file($ht)) {
        file_put_contents($ht, "# nahraté obrázky – žiadne skripty, žiadny výpis priečinka\n"
            . "Options -Indexes -ExecCGI\n"
            . "<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php7.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php8.c>\n  php_flag engine off\n</IfModule>\n"
            . "RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .phps .pl .py .cgi .sh\n"
            . "RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .phps\n"
            . "<FilesMatch \"(?i)\\.(php\\d?|phtml|phar|phps|pl|py|cgi|sh|shtml|html?|svg|js)$\">\n"
            . "  <IfModule mod_authz_core.c>\n    Require all denied\n  </IfModule>\n"
            . "  <IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n  </IfModule>\n"
            . "</FilesMatch>\n"
            . "<IfModule mod_headers.c>\n  Header set X-Content-Type-Options nosniff\n"
            . "  Header set Content-Security-Policy \"default-src 'none'; img-src 'self'; sandbox\"\n</IfModule>\n");
    }
    if (!is_file($root . '/index.html')) file_put_contents($root . '/index.html', '');
}

function shared_delete_files(string $slug): void
{
    if (!shared_slug_ok($slug)) return;
    $dir = shared_dir($slug);
    if (!is_dir($dir)) return;
    foreach (glob($dir . '/*') ?: [] as $f) if (is_file($f)) unlink($f);
    @rmdir($dir);
}

function shared_bytes(string $slug): int
{
    $n = 0;
    foreach (glob(shared_dir($slug) . '/*') ?: [] as $f) if (is_file($f)) $n += (int)filesize($f);
    return $n;
}

// ASCII slug z názvu + náhodná prípona (adresa sa nedá uhádnuť)
function shared_new_slug(string $title): string
{
    $s = $title;
    if (function_exists('iconv')) {
        $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
        if (is_string($t)) $s = $t;
    }
    $s = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $s));
    $s = trim(substr(trim($s, '-'), 0, 40), '-');
    if ($s === '') $s = 'project';
    $alpha = 'abcdefghijkmnpqrstuvwxyz23456789';
    $r = '';
    for ($i = 0; $i < 6; $i++) $r .= $alpha[random_int(0, strlen($alpha) - 1)];
    return $s . '-' . $r;
}

// prihlásený používateľ z tokenu účtu (rovnaká relácia ako account.php)
function shared_auth_user(array $in): ?array
{
    $auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
    $token = preg_match('/^Bearer\s+([0-9a-f]{64})$/i', trim($auth), $m) ? strtolower($m[1]) : strtolower((string)($in['token'] ?? ''));
    if (!preg_match('/^[0-9a-f]{64}$/', $token)) return null;
    $pdo = db();
    $s = $pdo->prepare('SELECT s.id AS sid, u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
    $s->execute([hash('sha256', $token)]);
    $user = $s->fetch(PDO::FETCH_ASSOC);
    if (!$user) return null;
    $pdo->prepare('UPDATE sessions SET last_seen = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s'), $user['sid']]);
    return $user;
}

function pg_b64url_dec(string $s): string
{
    $r = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $r === false ? '' : $r;
}

// 64 bajtov r||s → DER (pre openssl_verify)
function pg_raw_to_der(string $raw): string
{
    $enc = function (string $i): string {
        $i = ltrim($i, "\0");
        if ($i === '' || (ord($i[0]) & 0x80)) $i = "\0" . $i;
        return "\x02" . chr(strlen($i)) . $i;
    };
    $body = $enc(substr($raw, 0, 32)) . $enc(substr($raw, 32, 32));
    return "\x30" . chr(strlen($body)) . $body;
}

// overí podpísaný token licencie z aplikácie (Pro); vráti plán alebo null
function pg_verify_token(string $token): ?string
{
    $parts = explode('.', $token);
    if (count($parts) !== 2 || strlen($token) > 1000) return null;
    $payload = pg_b64url_dec($parts[0]);
    $sig = pg_b64url_dec($parts[1]);
    if ($payload === '' || strlen($sig) !== 64) return null;
    $pk = openssl_pkey_get_private((string)@file_get_contents(__DIR__ . '/keys/private.pem'));
    if (!$pk) return null;
    $pub = openssl_pkey_get_details($pk)['key'] ?? '';
    if ($pub === '' || openssl_verify($payload, pg_raw_to_der($sig), $pub, OPENSSL_ALGO_SHA256) !== 1) return null;
    $f = explode('|', $payload);
    if (count($f) !== 6 || $f[0] !== 'PG2' || (int)$f[5] < time()) return null;
    // zablokovaný alebo vrátený kľúč neplatí
    $q = db()->prepare('SELECT status FROM orders WHERE license_key = ?');
    $q->execute([$f[1]]);
    $st = $q->fetchColumn();
    if ($st !== false && !in_array($st, ['paid', 'manual'], true)) return null;
    return $f[3];
}
