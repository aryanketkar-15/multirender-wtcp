<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Http\Response;

Env::load(dirname(__DIR__) . '/.env');

try {
    (new Kernel(App::fromEnv()))->handle(Request::fromGlobals())->send();
} catch (Throwable $e) {
    error_log('bootstrap failure: ' . get_class($e));
    Response::error(500, 'server_error', 'Service unavailable.')->send();
}
