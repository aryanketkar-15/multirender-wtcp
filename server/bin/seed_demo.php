<?php

declare(strict_types=1);

// Seeds demo and evaluation accounts for reliable viva and testing runs.
// Usage: php bin/seed_demo.php

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;
use Mra\Repository\DuplicateEmailException;

Env::load(dirname(__DIR__) . '/.env');

$app = App::fromEnv();

$accounts = [
    [
        'email' => 'demo@vit.edu',
        'name' => 'Demo Student',
        'password' => 'DemoPassword123!',
        'admin' => false,
    ],
    [
        'email' => 'admin@vit.edu',
        'name' => 'System Administrator',
        'password' => 'AdminPassword123!',
        'admin' => true,
    ],
];

echo "== MRA Demo Account Seeder ==\n";

foreach ($accounts as $acc) {
    $existing = $app->users->findByEmail($acc['email']);
    if ($existing !== null) {
        $app->users->markVerified($existing->id);
        $app->users->setAdmin($existing->id, $acc['admin']);
        echo "[OK] Updated existing user: {$acc['email']} (ID: {$existing->id}, Admin: " . ($acc['admin'] ? 'Yes' : 'No') . ")\n";
    } else {
        try {
            $hash = password_hash($acc['password'], PASSWORD_ARGON2ID);
            $id = $app->users->create($acc['email'], $acc['name'], $hash);
            $app->users->markVerified($id);
            $app->users->setAdmin($id, $acc['admin']);
            echo "[CREATED] Seeded user: {$acc['email']} (ID: {$id}, Password: {$acc['password']})\n";
        } catch (DuplicateEmailException $e) {
            echo "[SKIP] Duplicate email: {$acc['email']}\n";
        }
    }
}

echo "Demo seeding complete.\n";
