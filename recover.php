<?php
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/layout.php';

$sent = false;
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim((string)($_POST['email'] ?? ''));
    if (!csrf_ok()) {
        $error = 'Your session expired. Please try again.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'That e-mail address doesn\'t look right.';
    } else {
        $pdo = db();
        $ip = 'ip:' . ($_SERVER['REMOTE_ADDR'] ?? '?');
        $who = 'mail:' . strtolower($email);
        // najviac 3 pokusy za hodinu na adresu aj na IP
        $pdo->prepare('DELETE FROM recover_log WHERE at < ?')->execute([time() - 3600]);
        $cnt = $pdo->prepare('SELECT COUNT(*) FROM recover_log WHERE who = ? OR who = ?');
        $cnt->execute([$ip, $who]);
        if ((int)$cnt->fetchColumn() >= 3) {
            $error = 'Too many tries. Please wait an hour or write to ' . cfg('support_email') . '.';
        } else {
            $log = $pdo->prepare('INSERT INTO recover_log (who, at) VALUES (?, ?)');
            $log->execute([$ip, time()]);
            $log->execute([$who, time()]);
            $q = $pdo->prepare('SELECT * FROM orders WHERE lower(email) = lower(?) AND status = "paid" ORDER BY id');
            $q->execute([$email]);
            $orders = $q->fetchAll(PDO::FETCH_ASSOC);
            if ($orders) {
                $lines = '';
                foreach ($orders as $o) $lines .= '    ' . $o['license_key'] . '   (' . plan_name($o['plan']) . ', ' . substr($o['created_at'], 0, 10) . ")\n";
                send_mail($email, 'Your Project Gallery licence key', "Hi,\n\nhere are the licence keys bought with this e-mail address:\n\n$lines\nPaste one in Project Gallery → Settings → About and licence → Activate.\n\n— " . cfg('mail')['from_name'] . "\n");
            }
            $sent = true;   // vždy rovnaká odpoveď – stránka neprezradí, či adresa niečo kúpila
        }
    }
}

page_head('Lost your key?');
?>
<section class="done narrow">
  <h1>Lost your key?</h1>
  <?php if ($sent): ?>
    <p class="lede-s">If that address bought Pro, the key is on its way. Check your spam folder too. Nothing after ten minutes? Write to <a href="mailto:<?= h(cfg('support_email')) ?>"><?= h(cfg('support_email')) ?></a>.</p>
  <?php else: ?>
    <p class="lede-s">Type the e-mail you paid with and I'll send the key there again.</p>
    <?php if ($error): ?><p class="msg msg-err"><?= h($error) ?></p><?php endif; ?>
    <form method="post" action="recover.php" class="form">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <label>E-mail
        <input type="email" name="email" required autocomplete="email" placeholder="you@example.com">
      </label>
      <button class="btn btn-ink" type="submit">Send my key</button>
    </form>
  <?php endif; ?>
</section>
<?php
page_foot();
