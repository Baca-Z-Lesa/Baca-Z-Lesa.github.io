<?php
// Odosielanie e-mailov: PHP mail() alebo jednoduchý SMTP klient (STARTTLS / SSL, AUTH LOGIN).

function send_mail(string $to, string $subject, string $text): bool
{
    global $CFG;
    $m = $CFG['mail'];
    $from = $m['from'];
    $fromName = '=?UTF-8?B?' . base64_encode($m['from_name']) . '?=';
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $headers = [
        'From' => "$fromName <$from>",
        'Reply-To' => $CFG['support_email'],
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => 'base64',
    ];
    $body = chunk_split(base64_encode($text));

    if (($m['mode'] ?? 'mail') === 'log') {
        // len na lokálne testovanie: e-mail sa nepošle, zapíše sa do app/data/mail.log
        $dir = __DIR__ . '/data';
        if (!is_dir($dir)) mkdir($dir, 0700, true);
        return file_put_contents($dir . '/mail.log', '[' . gmdate('Y-m-d H:i:s') . "] To: $to\nSubject: $subject\n$text\n----\n", FILE_APPEND | LOCK_EX) !== false;
    }
    if (($m['mode'] ?? 'mail') !== 'smtp') {
        $h = '';
        foreach ($headers as $k => $v) $h .= "$k: $v\r\n";
        return @mail($to, $subj, $body, $h, '-f' . $from);
    }
    return smtp_send($m, $to, $subj, $headers, $body);
}

function smtp_send(array $m, string $to, string $subj, array $headers, string $body): bool
{
    $host = ($m['smtp_secure'] === 'ssl' ? 'ssl://' : '') . $m['smtp_host'];
    $fp = @stream_socket_client($host . ':' . (int)$m['smtp_port'], $errno, $errstr, 20);
    if (!$fp) { error_log("SMTP: $errstr"); return false; }
    stream_set_timeout($fp, 20);
    $read = function () use ($fp) {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $out;
    };
    $cmd = function (string $c, array $ok) use ($fp, $read) {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $r = $read();
        if (!in_array((int)substr($r, 0, 3), $ok, true)) throw new RuntimeException('SMTP: ' . trim($r));
        return $r;
    };
    try {
        $cmd('', [220]);
        $me = gethostname() ?: 'localhost';
        $cmd("EHLO $me", [250]);
        if ($m['smtp_secure'] === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('SMTP: TLS zlyhalo');
            $cmd("EHLO $me", [250]);
        }
        if ($m['smtp_user'] !== '') {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode($m['smtp_user']), [334]);
            $cmd(base64_encode($m['smtp_pass']), [235]);
        }
        $cmd('MAIL FROM:<' . $m['from'] . '>', [250]);
        $cmd("RCPT TO:<$to>", [250, 251]);
        $cmd('DATA', [354]);
        $msg = "To: <$to>\r\nSubject: $subj\r\nDate: " . date('r') . "\r\nMessage-ID: <" . bin2hex(random_bytes(8)) . '@' . substr(strrchr($m['from'], '@'), 1) . ">\r\n";
        foreach ($headers as $k => $v) $msg .= "$k: $v\r\n";
        $msg .= "\r\n" . str_replace("\n.", "\n..", $body);
        $cmd($msg . "\r\n.", [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return true;
    } catch (Throwable $e) {
        error_log($e->getMessage());
        fclose($fp);
        return false;
    }
}

function send_license_mail(array $order): bool
{
    global $CFG;
    $plan = plan_name($order['plan']);
    $text = "Hi,\n\n"
          . "thanks for buying $plan! Here is your licence key:\n\n"
          . "    {$order['license_key']}\n\n"
          . "How to activate it:\n"
          . "  1. Open Project Gallery.\n"
          . "  2. Open Settings → About and licence (or press Ctrl+K and type \"licence\").\n"
          . "  3. Paste the key and click Activate (needs internet once).\n\n"
          . "The key is yours for good and works on up to 3 of your own computers at once.\n"
          . "To move it, click \"Deactivate on this computer\" on the old one.\n"
          . "If anything doesn't work, just reply to this e-mail.\n\n"
          . "Download: " . rtrim($CFG['site_url'], '/') . "/\n\n"
          . "— " . $CFG['mail']['from_name'] . "\n";
    return send_mail($order['email'], "Your $plan licence key", $text);
}
