<?php
require __DIR__ . '/app/bootstrap.php';
require __DIR__ . '/app/layout.php';

$plans = cfg('plans');
$plan = $_GET['plan'] ?? $_POST['plan'] ?? 'pro';
if (!isset($plans[$plan])) $plan = 'pro';
$p = $plans[$plan];
$student = $plan === 'student';

$error = '';
$email = trim((string)($_POST['email'] ?? ''));
$school = trim((string)($_POST['school'] ?? ''));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!same_origin()) {
        $error = 'Please start the checkout again from the website.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'That e-mail address doesn\'t look right.';
    } elseif ($student && mb_strlen($school) < 2) {
        $error = 'Please tell me which school you go to.';
    } elseif (empty($_POST['terms'])) {
        $error = 'Please confirm the terms.';
    } else {
        try {
            $params = [
                'mode' => 'payment',
                'customer_email' => $email,
                'line_items' => [[
                    'quantity' => 1,
                    'price_data' => [
                        'currency' => cfg('currency'),
                        'unit_amount' => $p['amount'],
                        'product_data' => [
                            'name' => $p['name'],
                            'description' => 'Lifetime licence key for one person, all of their computers.',
                        ],
                    ],
                ]],
                'metadata' => ['plan' => $plan, 'school' => $student ? mb_substr($school, 0, 200) : ''],
                'payment_intent_data' => ['metadata' => ['plan' => $plan]],
                'invoice_creation' => ['enabled' => 'true'],
                'allow_promotion_codes' => 'true',
                'success_url' => url('success.php') . '?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => url('buy.html') . '?plan=' . $plan . '&cancelled=1',
            ];
            $session = stripe('POST', 'checkout/sessions', $params);
            header('Location: ' . $session['url'], true, 303);
            exit;
        } catch (Throwable $e) {
            error_log($e->getMessage());
            $error = 'The payment page couldn\'t be opened right now. Please try again in a minute, or write to ' . cfg('support_email') . '.';
        }
    }
}

page_head('Buy ' . $p['name']);
?>
<div class="checkout">
  <section class="co-form">
    <p class="kicker">Checkout · step 1 of 2</p>
    <h1><?= $student ? 'Pro, student price.' : 'Get Pro.' ?></h1>
    <p class="lede-s">Leave your e-mail, then you'll pay on a secure Stripe page. The key comes right after, on screen and in your inbox.</p>

    <?php if (isset($_GET['cancelled'])): ?>
      <p class="msg">No worries — nothing was charged. You can try again whenever you like.</p>
    <?php endif; ?>
    <?php if ($error): ?>
      <p class="msg msg-err"><?= h($error) ?></p>
    <?php endif; ?>

    <form method="post" action="buy.php" class="form">
      <input type="hidden" name="csrf" value="<?= h(csrf_token()) ?>">
      <input type="hidden" name="plan" value="<?= h($plan) ?>">

      <label>E-mail for the licence key
        <input type="email" name="email" required autocomplete="email" value="<?= h($email) ?>" placeholder="you@example.com">
      </label>

      <?php if ($student): ?>
      <label>School or university
        <input type="text" name="school" required maxlength="200" value="<?= h($school) ?>" placeholder="e.g. Gymnázium Jura Hronca">
        <span class="hint">The student price is for people who are studying right now. I might ask you for an ISIC or school ID later.</span>
      </label>
      <?php endif; ?>

      <label class="check">
        <input type="checkbox" name="terms" value="1" required>
        <span>I agree to the <a href="terms.html" target="_blank">terms</a>. I understand the key is a digital product delivered right away, and that I can still ask for a refund within 14 days.</span>
      </label>

      <button class="btn btn-ink" type="submit">Continue to payment — <?= h($p['label']) ?></button>
      <p class="hint">Card, Apple Pay or Google Pay. Payments are handled by Stripe, I never see your card.</p>
    </form>
  </section>

  <aside class="co-sum">
    <h2>Your order</h2>
    <div class="sum-row"><span><?= h($p['name']) ?></span><b><?= h($p['label']) ?></b></div>
    <ul>
      <li>Portfolio website export</li>
      <li>Presentation to PDF</li>
      <li>Build from the gallery</li>
      <li>Automatic screenshots</li>
      <li>GitHub stars, issues, new repo</li>
      <li>Your colours, styles, backgrounds</li>
      <li>Yearly activity, streaks, achievements</li>
    </ul>
    <p class="sum-note">One payment. No subscription. The key doesn't expire.</p>
    <?php if (!$student): ?>
      <p class="sum-note">Student? <a href="buy.html?plan=student">It's <?= h($plans['student']['label']) ?> for you.</a></p>
    <?php else: ?>
      <p class="sum-note"><a href="buy.html?plan=pro">Not a student? Regular Pro is <?= h($plans['pro']['label']) ?>.</a></p>
    <?php endif; ?>
  </aside>
</div>
<?php
page_foot();
