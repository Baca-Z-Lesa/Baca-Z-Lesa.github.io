<?php
// Jednoduchý prehľad objednávok. Zapína sa nastavením admin_password_hash v app/config.php.
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/layout.php';
require __DIR__ . '/app/shared.php';

$hash = (string)cfg('admin_password_hash');
if ($hash === '') { http_response_code(404); exit; }

if (isset($_GET['logout'])) { unset($_SESSION['admin']); header('Location: admin.php'); exit; }

$error = '';
if (empty($_SESSION['admin'])) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_ok()) {
        if (password_verify((string)($_POST['password'] ?? ''), $hash)) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            header('Location: admin.php');
            exit;
        }
        sleep(1);
        $error = 'Wrong password.';
    }
    page_head('Admin');
    ?>
    <section class="done narrow">
      <h1>Orders</h1>
      <?php if ($error): ?><p class="msg msg-err"><?= h($error) ?></p><?php endif; ?>
      <form method="post" class="form">
        <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
        <label>Password <input type="password" name="password" required autofocus></label>
        <button class="btn btn-ink" type="submit">Log in</button>
      </form>
    </section>
    <?php
    page_foot();
    exit;
}

$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_ok() && isset($_POST['resend'])) {
    $q = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $q->execute([(int)$_POST['resend']]);
    if ($o = $q->fetch(PDO::FETCH_ASSOC)) $msg = send_license_mail($o) ? 'E-mail sent to ' . $o['email'] . '.' : 'Sending failed – check the mail settings.';
}
if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_ok()) {
    $pdo = db();
    // zablokovať / odblokovať kľúč (zablokovaný prestane v aplikácii fungovať najneskôr o 30 dní, pri ďalšej obnove hneď)
    if (isset($_POST['block'])) {
        $pdo->prepare('UPDATE orders SET status = CASE WHEN status = "blocked" THEN (CASE WHEN session_id LIKE "manual-%" THEN "manual" ELSE "paid" END) ELSE "blocked" END WHERE id = ?')->execute([(int)$_POST['block']]);
        $msg = 'Status changed.';
    }
    // odobrať jeden počítač (uvoľní miesto, ten počítač stratí Pro pri ďalšej obnove)
    if (isset($_POST['unlink'])) {
        $pdo->prepare('DELETE FROM activations WHERE id = ?')->execute([(int)$_POST['unlink']]);
        $msg = 'Device removed.';
    }
    // ručne vydaný kľúč (darček, recenzent, vlastný počítač)
    if (isset($_POST['manual'])) {
        $key = pg_generate();
        $pdo->prepare('INSERT INTO orders (session_id, email, plan, license_key, amount, currency, status, created_at) VALUES (?, ?, ?, ?, 0, ?, "manual", ?)')
            ->execute(['manual-' . bin2hex(random_bytes(8)), trim((string)($_POST['email'] ?? '')), ($_POST['plan'] ?? '') === 'student' ? 'student' : 'pro', $key, (string)cfg('currency'), gmdate('Y-m-d H:i:s')]);
        $msg = 'New key: ' . $key;
    }
    // zdieľané stránky projektov: skryť / zobraziť alebo zmazať (napr. nevhodný obsah)
    if (isset($_POST['sh_hide'])) {
        shared_db()->prepare('UPDATE shared_projects SET hidden = 1 - hidden WHERE id = ?')->execute([(int)$_POST['sh_hide']]);
        $msg = 'Shared page visibility changed.';
    }
    if (isset($_POST['sh_delete'])) {
        $q = shared_db()->prepare('SELECT slug FROM shared_projects WHERE id = ?');
        $q->execute([(int)$_POST['sh_delete']]);
        if (($slug = $q->fetchColumn()) !== false) {
            shared_db()->prepare('DELETE FROM shared_projects WHERE id = ?')->execute([(int)$_POST['sh_delete']]);
            shared_delete_files((string)$slug);
            $msg = 'Shared page deleted.';
        }
    }
}

$orders = db()->query('SELECT * FROM orders ORDER BY id DESC LIMIT 500')->fetchAll(PDO::FETCH_ASSOC);
$devices = [];
foreach (db()->query('SELECT * FROM activations ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $d) $devices[$d['license_key']][] = $d;
$total = 0;
foreach ($orders as $o) if ($o['status'] === 'paid') $total += (int)$o['amount'];

page_head('Admin');
?>
<section class="admin">
  <h1>Orders <small><?= count($orders) ?> · <?= number_format($total / 100, 2, ',', ' ') ?> €</small></h1>
  <p><a href="admin.php?logout=1">Log out</a></p>
  <?php if ($msg): ?><p class="msg"><?= h($msg) ?></p><?php endif; ?>
  <form method="post" class="form" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:0 0 16px">
    <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
    <label>E-mail (optional) <input type="email" name="email"></label>
    <label>Plan <select name="plan"><option value="pro">Pro</option><option value="student">Student</option></select></label>
    <button class="btn btn-line btn-s" name="manual" value="1">Create key</button>
  </form>
  <table class="orders">
    <thead><tr><th>#</th><th>Date (UTC)</th><th>E-mail</th><th>Plan</th><th>Key</th><th>Amount</th><th>Status</th><th>Devices</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($orders as $o): ?>
      <tr class="<?= !in_array($o['status'], ['paid', 'manual'], true) ? 'muted' : '' ?>">
        <td><?= (int)$o['id'] ?></td>
        <td><?= h($o['created_at']) ?></td>
        <td><?= h($o['email']) ?><?= $o['school'] ? '<br><small>' . h($o['school']) . '</small>' : '' ?></td>
        <td><?= h($o['plan']) ?></td>
        <td><code><?= h($o['license_key']) ?></code></td>
        <td><?= number_format($o['amount'] / 100, 2, ',', ' ') ?> <?= h(strtoupper($o['currency'])) ?></td>
        <td><?= h($o['status']) ?><?= $o['emailed_at'] ? '' : '<br><small>not e-mailed</small>' ?></td>
        <td>
          <?php foreach ($devices[$o['license_key']] ?? [] as $d): ?>
            <form method="post" style="margin:0 0 4px"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
              <small title="<?= h($d['device']) ?>"><?= h($d['name'] ?: substr($d['device'], 0, 8)) ?> · <?= h(substr($d['last_seen'], 0, 10)) ?></small>
              <button class="btn btn-line btn-s" name="unlink" value="<?= (int)$d['id'] ?>" title="Remove this computer">×</button></form>
          <?php endforeach; ?>
          <small><?= count($devices[$o['license_key']] ?? []) ?> / <?= PG_MAX_DEVICES ?></small>
        </td>
        <td>
          <form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
            <button class="btn btn-line btn-s" name="resend" value="<?= (int)$o['id'] ?>">Resend</button>
            <button class="btn btn-line btn-s" name="block" value="<?= (int)$o['id'] ?>"><?= $o['status'] === 'blocked' ? 'Unblock' : 'Block' ?></button></form>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
<?php
// účty z aplikácie (prihlásenie e-mailom, synchronizácia)
$users = db()->query('SELECT id, email, created_at, rev, updated_at, LENGTH(data) AS size FROM users ORDER BY id DESC LIMIT 500')->fetchAll(PDO::FETCH_ASSOC);
$sess = [];
foreach (db()->query('SELECT user_id, name, last_seen FROM sessions ORDER BY last_seen DESC')->fetchAll(PDO::FETCH_ASSOC) as $x) $sess[$x['user_id']][] = $x;
?>
  <h2 style="margin-top:32px">Accounts <small><?= count($users) ?></small></h2>
  <table class="orders">
    <thead><tr><th>#</th><th>E-mail</th><th>Created (UTC)</th><th>Devices</th><th>Last sync (UTC)</th><th>Data</th></tr></thead>
    <tbody>
    <?php foreach ($users as $u): ?>
      <tr>
        <td><?= (int)$u['id'] ?></td>
        <td><?= h($u['email']) ?></td>
        <td><?= h($u['created_at']) ?></td>
        <td><?php foreach ($sess[$u['id']] ?? [] as $x): ?><small><?= h($x['name'] ?: '?') ?> · <?= h(substr($x['last_seen'], 0, 16)) ?></small><br><?php endforeach; ?>
          <small><?= count($sess[$u['id']] ?? []) ?></small></td>
        <td><?= h((string)$u['updated_at']) ?></td>
        <td><small>rev <?= (int)$u['rev'] ?> · <?= number_format((int)$u['size'] / 1024, 1) ?> kB</small></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
<?php
// zdieľané stránky projektov (p.php)
$shared = shared_db()->query('SELECT s.*, u.email FROM shared_projects s LEFT JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 500')->fetchAll(PDO::FETCH_ASSOC);
$sharedBytes = 0;
foreach ($shared as $x) $sharedBytes += (int)$x['bytes'];
?>
  <h2 style="margin-top:32px">Shared projects <small><?= count($shared) ?> · <?= number_format($sharedBytes / 1048576, 1) ?> MB</small></h2>
  <table class="orders">
    <thead><tr><th>#</th><th>Title</th><th>E-mail</th><th>Updated (UTC)</th><th>Images</th><th>Size</th><th>Views</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($shared as $x): ?>
      <tr class="<?= (int)$x['hidden'] ? 'muted' : '' ?>">
        <td><?= (int)$x['id'] ?></td>
        <td><a href="p.php?id=<?= h(rawurlencode($x['slug'])) ?>" target="_blank" rel="noopener"><?= h($x['title']) ?></a><br><small><?= h($x['slug']) ?></small></td>
        <td><?= h((string)$x['email']) ?></td>
        <td><?= h($x['updated_at']) ?><br><small>created <?= h(substr($x['created_at'], 0, 10)) ?></small></td>
        <td><small><?= (int)$x['banner'] ? 'banner + ' : '' ?><?= (int)$x['shots'] ?> shots</small></td>
        <td><small><?= number_format((int)$x['bytes'] / 1024, 0) ?> kB</small></td>
        <td><?= (int)$x['views'] ?></td>
        <td>
          <form method="post"><input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
            <button class="btn btn-line btn-s" name="sh_hide" value="<?= (int)$x['id'] ?>"><?= (int)$x['hidden'] ? 'Show' : 'Hide' ?></button>
            <button class="btn btn-line btn-s" name="sh_delete" value="<?= (int)$x['id'] ?>" onclick="return confirm('Delete this shared page and its images?')">Delete</button></form>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
</section>
<?php
page_foot();
