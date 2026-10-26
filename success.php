<?php
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/layout.php';

$sid = (string)($_GET['session_id'] ?? '');
$order = null;
$state = 'error';

if (preg_match('/^cs_(test|live)_[A-Za-z0-9]+$/', $sid)) {
    try {
        $session = stripe('GET', 'checkout/sessions/' . $sid);
        if (($session['payment_status'] ?? '') === 'paid') {
            $order = fulfill($session);
            $state = $order ? 'paid' : 'error';
        } else {
            $state = 'pending';   // napr. bankový prevod – kľúč príde e-mailom cez webhook
        }
    } catch (Throwable $e) {
        error_log($e->getMessage());
    }
}

page_head('Thank you');
?>
<section class="done">
<?php if ($state === 'paid'): ?>
  <p class="kicker">Checkout · step 2 of 2</p>
  <h1>Thank you. Here's your key.</h1>
  <div class="keybox">
    <code id="key"><?= h($order['license_key']) ?></code>
    <button class="btn btn-line" type="button" id="copy">Copy</button>
  </div>
  <p class="lede-s">I've also sent it to <b><?= h($order['email']) ?></b>, so you don't have to write it down.</p>

  <ol class="steps">
    <li><b>Open Project Gallery.</b> Don't have it yet? <a data-href="download" href="#">Download it here.</a></li>
    <li><b>Open <i>Settings</i> → <i>About and licence</i></b> (or press Ctrl+K and type “licence”).</li>
    <li><b>Paste the key</b> and click Activate. That's it — no restart. The key works on up to 3 of your computers.</li>
  </ol>
  <p class="fine">Something not working? Write to <a href="mailto:<?= h(cfg('support_email')) ?>"><?= h(cfg('support_email')) ?></a> and mention this e-mail address.</p>
  <script>
    document.getElementById('copy').addEventListener('click', function () {
      var k = document.getElementById('key').textContent;
      navigator.clipboard.writeText(k).then(function () { document.getElementById('copy').textContent = 'Copied'; });
    });
  </script>
<?php elseif ($state === 'pending'): ?>
  <h1>Almost there.</h1>
  <p class="lede-s">Your payment is still being processed by the bank. As soon as it's confirmed, the key will arrive by e-mail — usually within a few minutes, sometimes a day for bank transfers.</p>
<?php else: ?>
  <h1>Hmm, I can't find that order.</h1>
  <p class="lede-s">If you've paid, don't worry — the key is on its way to your e-mail. If it doesn't arrive within an hour, use <a href="recover.php">Lost your key?</a> or write to <a href="mailto:<?= h(cfg('support_email')) ?>"><?= h(cfg('support_email')) ?></a>.</p>
<?php endif; ?>
</section>
<?php
page_foot();
