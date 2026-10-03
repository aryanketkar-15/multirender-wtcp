<?php

declare(strict_types=1);

// Prints the fixture bundle hash. Run on every developer machine: the output must be identical.
// Usage: php bin/bundle_hash.php [repetitions]

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\Service\BundleBuilder;
use Mra\Tests\Support\BundleFixture;

$runs = max(1, (int) ($argv[1] ?? 100));
$builder = new BundleBuilder();
$hashes = [];
for ($i = 0; $i < $runs; $i++) {
    $hashes[$builder->build(BundleFixture::spec())->hash] = true;
}
if (count($hashes) !== 1) {
    fwrite(STDERR, 'NON-DETERMINISTIC: ' . count($hashes) . " distinct hashes in {$runs} builds\n");
    exit(1);
}
echo array_key_first($hashes) . "\n";
