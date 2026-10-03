<?php

declare(strict_types=1);

// Signs the current tree head and publishes it to the witness repository, once per tree size.
// Intended for cron or a scheduled job.
//   STH_WITNESS_DIR   working clone of the witness repository (required)
//   STH_WITNESS_PUSH  1 to push after committing (the clone's own git config supplies credentials)

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;
use Mra\Service\GitWitness;
use Mra\Service\SthPublisher;

Env::load(dirname(__DIR__) . '/.env');

try {
    $app = App::fromEnv();
    $witness = new GitWitness(
        Env::require('STH_WITNESS_DIR'),
        Env::get('STH_WITNESS_PUSH', '0') === '1',
        Env::get('STH_WITNESS_REMOTE', 'origin') ?? 'origin',
        Env::get('STH_WITNESS_BRANCH', 'main') ?? 'main'
    );
    $result = (new SthPublisher($app->pdo, $app->sth, $witness, $app->clock))->publish();
    echo $result === null
        ? "Nothing new to publish.\n"
        : "Published tree size {$result['tree_size']} ({$result['root_hash']}) as {$result['reference']}.\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'publish_sth failed: ' . $e->getMessage() . "\n");
    exit(1);
}
