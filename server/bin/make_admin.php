<?php

declare(strict_types=1);

// Grants or revokes administrator rights: php bin/make_admin.php user@example.com [revoke]

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;

Env::load(dirname(__DIR__) . '/.env');
$email = $argv[1] ?? '';
if ($email === '') {
    fwrite(STDERR, "usage: php bin/make_admin.php <email> [revoke]\n");
    exit(2);
}
$app = App::fromEnv();
$user = $app->users->findByEmail($email);
if ($user === null) {
    fwrite(STDERR, "No such user.\n");
    exit(1);
}
$revoke = ($argv[2] ?? '') === 'revoke';
$app->users->setAdmin($user->id, !$revoke);
echo ($revoke ? 'Revoked' : 'Granted') . " administrator rights for user {$user->id}.\n";
