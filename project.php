<?php
// Zdieľané stránky projektov – API pre aplikáciu (Pro). JSON, POST, prihlásenie rovnakým tokenom ako account.php
// (hlavička "Authorization: Bearer <token>" alebo "token" v tele).
//   {"action":"publish","pkey":"…","license":"<token licencie>","project":{"title","short","description","features":[],
//     "tags":[],"language","release_url","repo_url"},"shots":N,"banner":true}   → {"ok":true,"slug":"…","url":"…"}
//   {"action":"image","slug":"…","slot":"banner"|1..6,"data":"<base64 PNG/JPG>"}        → {"ok":true}
//   {"action":"unpublish","slug":"…"}                                                     → {"ok":true}
//   {"action":"list"}                                    → {"ok":true,"items":[{"slug","title","url","pkey","updated_at","views"}]}
// Chyby: {"ok":false,"error":"auth|pro|invalid|limit|rate|too_big|image|not_found|bad request"}
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/shared.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const SH_MAX_BODY = 5 * 1024 * 1024;

function out(array $r, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sh_rate(string $who, int $max): void
{
    $pdo = db();
    $who = hash('sha256', $who . 'pg-share');
    $pdo->prepare('DELETE FROM account_log WHERE at < ?')->execute([time() - 3600]);
    $c = $pdo->prepare('SELECT COUNT(*) FROM account_log WHERE who = ?');
    $c->execute([$who]);
    if ((int)$c->fetchColumn() >= $max) out(['ok' => false, 'error' => 'rate'], 429);
    $pdo->prepare('INSERT INTO account_log (who, at) VALUES (?, ?)')->execute([$who, time()]);
}

// čistý text: platné UTF-8, bez riadiacich znakov, orezaný na $max znakov
function sh_text($v, int $max, bool $multiline = false): string
{
    if (!is_string($v)) return '';
    if (!mb_check_encoding($v, 'UTF-8')) $v = mb_convert_encoding($v, 'UTF-8', 'UTF-8');
    $v = str_replace("\r\n", "\n", $v);
    $v = preg_replace($multiline ? '/[\x00-\x08\x0B-\x1F\x7F]/u' : '/[\x00-\x1F\x7F]/u', '', $v) ?? '';
    return trim(mb_substr($v, 0, $max));
}

function sh_list($v, int $count, int $max): array
{
    $out = [];
    if (!is_array($v)) return $out;
    foreach ($v as $x) {
        $t = sh_text($x, $max);
        if ($t !== '') $out[] = $t;
        if (count($out) >= $count) break;
    }
    return $out;
}

function sh_url($v): string
{
    $u = sh_text($v, 500);
    if ($u === '' || !preg_match('#^https?://#i', $u) || !filter_var($u, FILTER_VALIDATE_URL)) return '';
    return $u;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok' => false, 'error' => 'method'], 405);
$raw = (string)file_get_contents('php://input', false, null, 0, SH_MAX_BODY + 1);
if (strlen($raw) > SH_MAX_BODY) out(['ok' => false, 'error' => 'too_big'], 413);
$in = json_decode($raw, true);
if (!is_array($in)) out(['ok' => false, 'error' => 'bad request'], 400);

$user = shared_auth_user($in);
if (!$user) out(['ok' => false, 'error' => 'auth'], 401);
$uid = (int)$user['id'];
$pdo = shared_db();
$action = (string)($in['action'] ?? '');
$now = gmdate('Y-m-d H:i:s');

function sh_own(PDO $pdo, int $uid, $slug): array
{
    $slug = is_string($slug) ? $slug : '';
    if (!shared_slug_ok($slug)) out(['ok' => false, 'error' => 'invalid'], 400);
    $q = $pdo->prepare('SELECT * FROM shared_projects WHERE slug = ? AND user_id = ?');
    $q->execute([$slug, $uid]);
    $row = $q->fetch(PDO::FETCH_ASSOC);
    if (!$row) out(['ok' => false, 'error' => 'not_found'], 404);
    return $row;
}

switch ($action) {
    case 'list':
        $q = $pdo->prepare('SELECT slug, pkey, title, updated_at, views, hidden FROM shared_projects WHERE user_id = ? ORDER BY updated_at DESC');
        $q->execute([$uid]);
        $items = [];
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $items[] = ['slug' => $r['slug'], 'pkey' => $r['pkey'], 'title' => $r['title'], 'url' => shared_url($r['slug']),
                        'updated_at' => $r['updated_at'], 'views' => (int)$r['views'], 'hidden' => (bool)$r['hidden']];
        }
        out(['ok' => true, 'items' => $items]);

    case 'publish':
        sh_rate('pub:' . $uid, 60);
        if (pg_verify_token((string)($in['license'] ?? '')) === null) out(['ok' => false, 'error' => 'pro'], 403);
        $pkey = sh_text($in['pkey'] ?? '', 300);
        $p = is_array($in['project'] ?? null) ? $in['project'] : [];
        $title = sh_text($p['title'] ?? '', 120);
        if ($pkey === '' || $title === '') out(['ok' => false, 'error' => 'invalid'], 400);
        $data = [
            'short' => sh_text($p['short'] ?? '', 300),
            'description' => sh_text($p['description'] ?? '', 8000, true),
            'features' => sh_list($p['features'] ?? [], 30, 300),
            'tags' => sh_list($p['tags'] ?? [], 20, 40),
            'language' => sh_text($p['language'] ?? '', 40),
            'release_url' => sh_url($p['release_url'] ?? ''),
            'repo_url' => sh_url($p['repo_url'] ?? ''),
            'author' => sh_text($p['author'] ?? '', 80),
        ];
        $shots = max(0, min(SH_MAX_SHOTS, (int)($in['shots'] ?? 0)));
        $banner = !empty($in['banner']) ? 1 : 0;
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $q = $pdo->prepare('SELECT * FROM shared_projects WHERE user_id = ? AND pkey = ?');
        $q->execute([$uid, $pkey]);
        $row = $q->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $slug = $row['slug'];
            $pdo->prepare('UPDATE shared_projects SET title = ?, data = ?, shots = ?, banner = ?, updated_at = ? WHERE id = ?')
                ->execute([$title, $json, $shots, $banner, $now, $row['id']]);
            // obrázky navyše (menej screenshotov ako minule) sa zmažú
            for ($i = $shots + 1; $i <= SH_MAX_SHOTS; $i++) @unlink(shared_dir($slug) . "/$i.jpg");
            if (!$banner) @unlink(shared_dir($slug) . '/banner.png');
        } else {
            $c = $pdo->prepare('SELECT COUNT(*) FROM shared_projects WHERE user_id = ?');
            $c->execute([$uid]);
            if ((int)$c->fetchColumn() >= SH_MAX_PER_USER) out(['ok' => false, 'error' => 'limit'], 403);
            $slug = '';
            for ($try = 0; $try < 5; $try++) {
                $slug = shared_new_slug($title);
                try {
                    $pdo->prepare('INSERT INTO shared_projects (user_id, slug, pkey, title, data, shots, banner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                        ->execute([$uid, $slug, $pkey, $title, $json, $shots, $banner, $now, $now]);
                    break;
                } catch (PDOException $e) {
                    $slug = '';
                }
            }
            if ($slug === '') out(['ok' => false, 'error' => 'server'], 500);
        }
        $pdo->prepare('UPDATE shared_projects SET bytes = ? WHERE slug = ?')->execute([shared_bytes($slug), $slug]);
        out(['ok' => true, 'slug' => $slug, 'url' => shared_url($slug)]);

    case 'image':
        sh_rate('img:' . $uid, 400);
        $row = sh_own($pdo, $uid, $in['slug'] ?? '');
        $slot = $in['slot'] ?? '';
        $isBanner = $slot === 'banner';
        $n = $isBanner ? 0 : (int)$slot;
        if (!$isBanner && ($n < 1 || $n > (int)$row['shots'])) out(['ok' => false, 'error' => 'invalid'], 400);
        $bin = base64_decode((string)($in['data'] ?? ''), true);
        if ($bin === false || $bin === '') out(['ok' => false, 'error' => 'image'], 400);
        if (strlen($bin) > ($isBanner ? SH_MAX_BANNER : SH_MAX_SHOT)) out(['ok' => false, 'error' => 'too_big'], 413);
        // len skutočné PNG (banner) / JPEG (screenshoty) v rozumných rozmeroch
        $info = @getimagesizefromstring($bin);
        $want = $isBanner ? IMAGETYPE_PNG : IMAGETYPE_JPEG;
        $magic = $isBanner ? "\x89PNG\r\n\x1a\n" : "\xFF\xD8\xFF";
        if (!$info || $info[2] !== $want || strncmp($bin, $magic, strlen($magic)) !== 0
            || $info[0] < 16 || $info[1] < 16 || $info[0] > SH_MAX_DIM || $info[1] > SH_MAX_DIM)
            out(['ok' => false, 'error' => 'image'], 400);
        shared_protect_root();
        $dir = shared_dir($row['slug']);
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $file = $dir . '/' . ($isBanner ? 'banner.png' : $n . '.jpg');
        if (file_put_contents($file . '.tmp', $bin, LOCK_EX) === false || !rename($file . '.tmp', $file)) out(['ok' => false, 'error' => 'server'], 500);
        $pdo->prepare('UPDATE shared_projects SET bytes = ?, updated_at = ? WHERE id = ?')->execute([shared_bytes($row['slug']), $now, $row['id']]);
        out(['ok' => true]);

    case 'unpublish':
        $row = sh_own($pdo, $uid, $in['slug'] ?? '');
        $pdo->prepare('DELETE FROM shared_projects WHERE id = ?')->execute([$row['id']]);
        shared_delete_files($row['slug']);
        out(['ok' => true]);
}
out(['ok' => false, 'error' => 'bad request'], 400);
