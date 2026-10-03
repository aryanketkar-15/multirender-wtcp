<?php

declare(strict_types=1);

// Registers an Attestor Module build by its manifest, or retires one.
//   php bin/register_attestor.php ../attestor/dist/manifest.json
//   php bin/register_attestor.php --deprecate sha256:<hash>
//   php bin/register_attestor.php --revoke sha256:<hash>

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\Config\DatabaseConfig;
use Mra\Config\Env;
use Mra\Repository\AttestorRegistry;
use Mra\Repository\Database;

Env::load(dirname(__DIR__) . '/.env');
$registry = new AttestorRegistry(Database::connection(DatabaseConfig::fromEnv()));

try {
    if (in_array($argv[1] ?? '', ['--deprecate', '--revoke'], true)) {
        $hash = $argv[2] ?? '';
        $registry->setStatus($hash, $argv[1] === '--revoke' ? 'revoked' : 'deprecated');
        echo "Marked {$hash} as " . ltrim($argv[1], '-') . "d.\n";
        exit(0);
    }
    $path = $argv[1] ?? '';
    $manifest = json_decode((string) @file_get_contents($path), true);
    if (!is_array($manifest)) {
        fwrite(STDERR, "usage: php bin/register_attestor.php <manifest.json>\n");
        exit(2);
    }
    $registry->register($manifest);
    echo "Registered attestor {$manifest['version']} ({$manifest['sha256']}).\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'register_attestor failed: ' . $e->getMessage() . "\n");
    exit(1);
}
