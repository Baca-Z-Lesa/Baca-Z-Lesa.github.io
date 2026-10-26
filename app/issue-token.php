<?php
// Len z príkazového riadku (z webu je priečinok app/ zamknutý):
//   php app/issue-token.php <ID počítača> [dni] [plán]
// Vydá aktiváciu pre konkrétny počítač bez servera, napr. pre tvoj vlastný (10 rokov).
// ID počítača ukazuje aplikácia v okne O aplikácii → Licencia.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/license.php';

$device = strtolower($argv[1] ?? '');
if (!preg_match('/^[0-9a-f]{32}$/', $device)) { fwrite(STDERR, "Použitie: php app/issue-token.php <ID počítača> [dni] [plán]\n"); exit(1); }
$days = (int)($argv[2] ?? 3650);
$plan = $argv[3] ?? 'owner';
echo pg_issue_token('PG-OWNER-' . strtoupper(substr($device, 0, 5)), $device, $plan, $days), "\n";
