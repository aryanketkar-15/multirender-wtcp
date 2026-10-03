<?php

declare(strict_types=1);

// Development only: php -S 127.0.0.1:8080 -t public dev-router.php
// PHP's built-in server answers dot-prefixed paths such as /.well-known/ with its own 404 before
// reaching index.php; routing everything through the front controller avoids that. Production web
// servers rewrite all requests to public/index.php instead.
require __DIR__ . '/public/index.php';
