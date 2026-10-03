<?php

declare(strict_types=1);

// Signs the current tree head (once per tree size) without publishing it anywhere.
// bin/publish_sth.php does this and also sends the head to the witness repository.

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;

Env::load(dirname(__DIR__) . '/.env');

try {
    $head = App::fromEnv()->sth->sign();
    echo json_encode(['tree_size' => $head['record']['tree_size'], 'root_hash' => $head['record']['root_hash']]) . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'sign_sth failed: ' . $e->getMessage() . "\n");
    exit(1);
}
