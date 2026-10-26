<?php
// Licencie, verzia 2.
//  - Kľúč PG-XXXXX-XXXXX-XXXXX-XXXXX je obyčajné náhodné číslo uložené v databáze
//    (nedá sa vypočítať, existuje len to, čo vydá tento server).
//  - Aplikácia kľúč aktivuje cez activate.php a dostane podpísaný token viazaný na
//    počítač s platnosťou 30 dní; ten si potom sama obnovuje.
//  - Token je podpísaný súkromným kľúčom app/keys/private.pem (ECDSA P-256, SHA-256).
//    V aplikácii je len verejný kľúč – vie podpis overiť, ale nevie ho vyrobiť.

const PG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PG_TOKEN_DAYS = 30;          // ako dlho funguje Pro bez pripojenia
const PG_MAX_DEVICES = 3;          // koľko počítačov naraz môže mať jeden kľúč

function pg_normalize(string $key): string
{
    return strtoupper(preg_replace('/\s+/', '', $key));
}

function pg_format_ok(string $key): bool
{
    return (bool)preg_match('/^PG-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/', $key);
}

// nový náhodný kľúč (100 bitov náhody)
function pg_generate(): string
{
    $groups = [];
    for ($g = 0; $g < 4; $g++) {
        $s = '';
        for ($i = 0; $i < 5; $i++) $s .= PG_ALPHABET[random_int(0, 31)];
        $groups[] = $s;
    }
    return 'PG-' . implode('-', $groups);
}

function pg_b64url(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

// DER podpis z OpenSSL → 64 bajtov r||s (formát, ktorý čaká Windows BCrypt)
function pg_der_to_raw(string $der): string
{
    $pos = 2;
    if (ord($der[1]) & 0x80) $pos += ord($der[1]) & 0x7f;
    $out = '';
    for ($n = 0; $n < 2; $n++) {
        $len = ord($der[$pos + 1]);
        $int = ltrim(substr($der, $pos + 2, $len), "\0");
        $out .= str_pad($int, 32, "\0", STR_PAD_LEFT);
        $pos += 2 + $len;
    }
    return $out;
}

// payload: PG2|kľúč|zariadenie|plán|vydané|platí_do  (unix čas)
function pg_issue_token(string $key, string $device, string $plan, int $days = PG_TOKEN_DAYS): string
{
    $now = time();
    $payload = implode('|', ['PG2', $key, $device, $plan, $now, $now + $days * 86400]);
    $pk = openssl_pkey_get_private((string)file_get_contents(__DIR__ . '/keys/private.pem'));
    if (!$pk || !openssl_sign($payload, $der, $pk, OPENSSL_ALGO_SHA256)) throw new RuntimeException('signing failed');
    return pg_b64url($payload) . '.' . pg_b64url(pg_der_to_raw($der));
}
