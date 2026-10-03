<?php

declare(strict_types=1);

/**
 * Fails when line coverage on files changed against a base ref is below the floor.
 * Usage: php scripts/php-coverage-gate.php server/coverage/clover.xml [base-ref] [floor]
 */

$cloverPath = $argv[1] ?? 'server/coverage/clover.xml';
$base = $argv[2] ?? 'origin/main';
$floor = (float) ($argv[3] ?? 70);

$changed = [];
exec('git diff --name-only --diff-filter=AM ' . escapeshellarg($base) . '...HEAD -- server/src', $changed);
if ($changed === []) {
    echo "No changed server/src files; coverage gate passes.\n";
    exit(0);
}

$xml = simplexml_load_file($cloverPath);
if ($xml === false) {
    fwrite(STDERR, "Cannot read {$cloverPath}\n");
    exit(2);
}

$covered = 0;
$total = 0;
foreach ($xml->xpath('//file') ?: [] as $file) {
    $path = str_replace('\\', '/',(string) $file['name']);
    foreach ($changed as $c) {
        if (str_ends_with($path, $c)) {
            $metrics = $file->metrics;
            $total += (int) $metrics['statements'];
            $covered += (int) $metrics['coveredstatements'];
        }
    }
}

$pct = $total === 0 ? 100.0 : 100 * $covered / $total;
printf("Changed-file line coverage: %.1f%% (%d/%d), floor %.0f%%\n", $pct, $covered, $total, $floor);
exit($pct + 1e-9 >= $floor ? 0 : 1);
