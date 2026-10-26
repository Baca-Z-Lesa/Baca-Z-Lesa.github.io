<?php
// Stripe webhook – nastav v Stripe → Developers → Webhooks:
//   URL: https://TVOJWEB/webhook.php
//   udalosti: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded
require __DIR__ . '/app/bootstrap.php';

$payload = file_get_contents('php://input');
$sig = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
if (!stripe_verify($payload, $sig, (string)cfg('stripe_webhook_secret'))) {
    http_response_code(400);
    exit('bad signature');
}

$event = json_decode($payload, true);
$type = $event['type'] ?? '';
$obj = $event['data']['object'] ?? [];

try {
    switch ($type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
            fulfill($obj);   // pri neuhradenej platbe (payment_status != paid) nerobí nič
            break;

        case 'charge.refunded':
            // vrátené peniaze – objednávka sa označí (kľúč v aplikácii sa overuje offline,
            // ak ho chceš zablokovať, pridaj ho do zoznamu v ďalšej verzii aplikácie)
            if (!empty($obj['payment_intent'])) {
                db()->prepare('UPDATE orders SET status = "refunded" WHERE payment_intent = ?')->execute([$obj['payment_intent']]);
            }
            break;
    }
} catch (Throwable $e) {
    error_log($e->getMessage());
    http_response_code(500);   // Stripe to skúsi znova
    exit('error');
}

http_response_code(200);
echo 'ok';
