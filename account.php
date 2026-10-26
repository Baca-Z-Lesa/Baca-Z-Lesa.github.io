<?php
// Účet v aplikácii (prihlásenie e-mailom + synchronizácia zoznamu projektov a nastavení). JSON, POST.
//   {"action":"request_code","email":"…"}                         → {"ok":true}  (pošle 6-miestny kód, platí 10 min)
//   {"action":"verify","email":"…","code":"123456","device":"<hex>","name":"PC"} → {"ok":true,"token":"…","email":"…"}
//   S hlavičkou "Authorization: Bearer <token>" (alebo "token" v tele, ak hosting hlavičku zahadzuje):
//   {"action":"get"}                                  → {"ok":true,"data":{…}|null,"rev":N,"updated_at":"…"}
//   {"action":"put","data":{…},"base_rev":N}          → {"ok":true,"rev":N+1}  alebo 409 {"ok":false,"error":"conflict","data":…,"rev":…}
//   {"action":"logout"} · {"action":"sessions"} · {"action":"revoke_session","id":N}
// Chyby: {"ok":false,"error":"invalid|code|expired|tries|rate|auth|too_big|conflict|server|mail"}
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ACC_MAX_BODY = 2 * 1024 * 1024;   // max. veľkosť synchronizovaných dát

function out(array $r, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// jednoduchá brzda: max $max záznamov za hodinu pre daný kľúč
function acc_rate(string $who, int $max): void
{
    $pdo = db();
    $who = hash('sha256', $who . 'pg-acc');
    $pdo->prepare('DELETE FROM account_log WHERE at < ?')->execute([time() - 3600]);
    $c = $pdo->prepare('SELECT COUNT(*) FROM account_log WHERE who = ?');
    $c->execute([$who]);
    if ((int)$c->fetchColumn() >= $max) out(['ok' => false, 'error' => 'rate'], 429);
    $pdo->prepare('INSERT INTO account_log (who, at) VALUES (?, ?)')->execute([$who, time()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'method'], 405);
$raw = (string)file_get_contents('php://input', false, null, 0, ACC_MAX_BODY + 65536);
if (strlen($raw) > ACC_MAX_BODY + 65535) out(['ok' => false, 'error' => 'too_big'], 413);
$in = json_decode($raw, true);
if (!is_array($in)) out(['ok' => false, 'error' => 'bad request'], 400);

$pdo = db();
$action = (string)($in['action'] ?? '');
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$now = gmdate('Y-m-d H:i:s');

if ($action === 'request_code' || $action === 'verify') {
    $email = mb_strtolower(trim((string)($in['email'] ?? '')));
    if (strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'error' => 'invalid']);

    if ($action === 'request_code') {
        acc_rate('ip-code:' . $ip, 10);
        acc_rate('mail-code:' . $email, 5);
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $pdo->prepare('INSERT OR REPLACE INTO login_codes (email, code_hash, expires, tries) VALUES (?, ?, ?, 0)')
            ->execute([$email, password_hash($code, PASSWORD_DEFAULT), time() + 600]);
        $text = "Hi,\n\nyour Project Gallery sign-in code is:\n\n    $code\n\n"
              . "Type it into the app (Settings → Account). It is valid for 10 minutes.\n"
              . "If you didn't ask for it, just ignore this e-mail.\n\n— " . cfg('mail')['from_name'] . "\n";
        if (!send_mail($email, "Project Gallery sign-in code: $code", $text)) out(['ok' => false, 'error' => 'mail'], 500);
        out(['ok' => true]);
    }

    // verify
    acc_rate('ip-verify:' . $ip, 30);
    $code = preg_replace('/\D/', '', (string)($in['code'] ?? ''));
    $q = $pdo->prepare('SELECT * FROM login_codes WHERE email = ?');
    $q->execute([$email]);
    $row = $q->fetch(PDO::FETCH_ASSOC);
    if (!$row) out(['ok' => false, 'error' => 'expired']);
    if ((int)$row['expires'] < time()) {
        $pdo->prepare('DELETE FROM login_codes WHERE email = ?')->execute([$email]);
        out(['ok' => false, 'error' => 'expired']);
    }
    if ((int)$row['tries'] >= 5) {
        $pdo->prepare('DELETE FROM login_codes WHERE email = ?')->execute([$email]);
        out(['ok' => false, 'error' => 'tries']);
    }
    if (strlen($code) !== 6 || !password_verify($code, $row['code_hash'])) {
        $pdo->prepare('UPDATE login_codes SET tries = tries + 1 WHERE email = ?')->execute([$email]);
        out(['ok' => false, 'error' => 'code', 'left' => max(0, 4 - (int)$row['tries'])]);
    }
    $pdo->prepare('DELETE FROM login_codes WHERE email = ?')->execute([$email]);

    $pdo->prepare('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)')->execute([$email, $now]);
    $u = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $u->execute([$email]);
    $uid = (int)$u->fetchColumn();

    $device = mb_substr(preg_replace('/[^0-9a-zA-Z]/', '', (string)($in['device'] ?? '')), 0, 64);
    $name = mb_substr(trim((string)($in['name'] ?? '')), 0, 64);
    // jeden počítač = jedna relácia (opätovné prihlásenie nahradí starú)
    if ($device !== '') $pdo->prepare('DELETE FROM sessions WHERE user_id = ? AND device = ?')->execute([$uid, $device]);
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('INSERT INTO sessions (user_id, token_hash, device, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$uid, hash('sha256', $token), $device, $name, $now, $now]);
    out(['ok' => true, 'token' => $token, 'email' => $email]);
}

// ---------------------------------------------------------------- prihlásené akcie

$auth = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''));
$token = preg_match('/^Bearer\s+([0-9a-f]{64})$/i', trim($auth), $m) ? strtolower($m[1]) : strtolower((string)($in['token'] ?? ''));
if (!preg_match('/^[0-9a-f]{64}$/', $token)) out(['ok' => false, 'error' => 'auth'], 401);
$s = $pdo->prepare('SELECT s.id AS sid, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
$s->execute([hash('sha256', $token)]);
$user = $s->fetch(PDO::FETCH_ASSOC);
if (!$user) out(['ok' => false, 'error' => 'auth'], 401);
$pdo->prepare('UPDATE sessions SET last_seen = ? WHERE id = ?')->execute([$now, $user['sid']]);
$uid = (int)$user['id'];

switch ($action) {
    case 'get':
        out(['ok' => true, 'email' => $user['email'], 'data' => $user['data'] !== null ? json_decode($user['data'], true) : null,
             'rev' => (int)$user['rev'], 'updated_at' => $user['updated_at']]);

    case 'put':
        if (!isset($in['data']) || !is_array($in['data'])) out(['ok' => false, 'error' => 'invalid'], 400);
        $data = json_encode($in['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (strlen($data) > ACC_MAX_BODY) out(['ok' => false, 'error' => 'too_big'], 413);
        $base = (int)($in['base_rev'] ?? -1);
        $upd = $pdo->prepare('UPDATE users SET data = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?');
        $upd->execute([$data, $now, $uid, $base]);
        if ($upd->rowCount() !== 1) {
            $q = $pdo->prepare('SELECT data, rev, updated_at FROM users WHERE id = ?');
            $q->execute([$uid]);
            $cur = $q->fetch(PDO::FETCH_ASSOC);
            out(['ok' => false, 'error' => 'conflict', 'data' => $cur['data'] !== null ? json_decode($cur['data'], true) : null,
                 'rev' => (int)$cur['rev'], 'updated_at' => $cur['updated_at']], 409);
        }
        out(['ok' => true, 'rev' => $base + 1, 'updated_at' => $now]);

    case 'logout':
        $pdo->prepare('DELETE FROM sessions WHERE id = ?')->execute([$user['sid']]);
        out(['ok' => true]);

    case 'sessions':
        $q = $pdo->prepare('SELECT id, name, created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC');
        $q->execute([$uid]);
        $list = [];
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $list[] = ['id' => (int)$r['id'], 'name' => (string)$r['name'], 'created_at' => $r['created_at'],
                       'last_seen' => $r['last_seen'], 'current' => (int)$r['id'] === (int)$user['sid']];
        }
        out(['ok' => true, 'email' => $user['email'], 'sessions' => $list, 'rev' => (int)$user['rev'], 'updated_at' => $user['updated_at']]);

    case 'revoke_session':
        $pdo->prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')->execute([(int)($in['id'] ?? 0), $uid]);
        out(['ok' => true]);
}
out(['ok' => false, 'error' => 'bad request'], 400);
