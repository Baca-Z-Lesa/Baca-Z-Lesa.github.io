<?php
// Aktivácia licencie z aplikácie (JSON, POST).
//   {"action":"activate"|"refresh"|"deactivate", "key":"PG-…", "device":"<32 hex>", "name":"PC-NAME"}
// Odpoveď: {"ok":true,"token":"…"}  alebo  {"ok":false,"error":"invalid|blocked|limit|rate|server","revoked":bool}
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out(array $r, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($r);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'method'], 405);

$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) out(['ok' => false, 'error' => 'bad request'], 400);

$action = (string)($in['action'] ?? 'activate');
$key = pg_normalize((string)($in['key'] ?? ''));
$device = strtolower((string)($in['device'] ?? ''));
$name = mb_substr(trim((string)($in['name'] ?? '')), 0, 64);

if (!pg_format_ok($key) || !preg_match('/^[0-9a-f]{32}$/', $device)) out(['ok' => false, 'error' => 'invalid']);

$pdo = db();

// brzda proti skúšaniu kľúčov: max 20 pokusov za hodinu z jednej IP
$ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . 'pg');
$pdo->prepare('DELETE FROM activate_log WHERE at < ?')->execute([time() - 3600]);
$cnt = $pdo->prepare('SELECT COUNT(*) FROM activate_log WHERE who = ?');
$cnt->execute([$ip]);
if ((int)$cnt->fetchColumn() >= 20) out(['ok' => false, 'error' => 'rate'], 429);
$pdo->prepare('INSERT INTO activate_log (who, at) VALUES (?, ?)')->execute([$ip, time()]);

$q = $pdo->prepare('SELECT * FROM orders WHERE license_key = ?');
$q->execute([$key]);
$order = $q->fetch(PDO::FETCH_ASSOC);
if (!$order) out(['ok' => false, 'error' => 'invalid', 'revoked' => true]);

$now = gmdate('Y-m-d H:i:s');

if ($action === 'deactivate') {
    $pdo->prepare('DELETE FROM activations WHERE license_key = ? AND device = ?')->execute([$key, $device]);
    out(['ok' => true]);
}

if (!in_array($order['status'], ['paid', 'manual'], true)) {
    // vrátené peniaze alebo zablokovaný kľúč – aplikácia Pro vypne
    $pdo->prepare('DELETE FROM activations WHERE license_key = ? AND device = ?')->execute([$key, $device]);
    out(['ok' => false, 'error' => 'blocked', 'revoked' => true]);
}

$a = $pdo->prepare('SELECT id FROM activations WHERE license_key = ? AND device = ?');
$a->execute([$key, $device]);
if ($a->fetchColumn()) {
    $pdo->prepare('UPDATE activations SET last_seen = ?, name = ? WHERE license_key = ? AND device = ?')->execute([$now, $name, $key, $device]);
} else {
    if ($action === 'refresh') out(['ok' => false, 'error' => 'blocked', 'revoked' => true]);   // počítač bol odobratý v admin.php
    $c = $pdo->prepare('SELECT COUNT(*) FROM activations WHERE license_key = ?');
    $c->execute([$key]);
    if ((int)$c->fetchColumn() >= PG_MAX_DEVICES) out(['ok' => false, 'error' => 'limit', 'max' => PG_MAX_DEVICES]);
    $pdo->prepare('INSERT INTO activations (license_key, device, name, created_at, last_seen) VALUES (?, ?, ?, ?, ?)')
        ->execute([$key, $device, $name, $now, $now]);
}

try {
    out(['ok' => true, 'token' => pg_issue_token($key, $device, (string)$order['plan'])]);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'server'], 500);
}
