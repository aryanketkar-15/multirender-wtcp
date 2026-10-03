<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Mra\App;
use Mra\Config\Env;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Mail\DeferredMailer;

Env::load(dirname(__DIR__) . '/.env');

try {
    $app = App::fromEnv();
    (new Kernel($app))->handle(Request::fromGlobals())->send();
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    }
    // Deferred work (mail) runs after the client has its response, so latency leaks nothing.
    if ($app->mailer instanceof DeferredMailer) {
        $app->mailer->flush();
    }
} catch (Throwable $e) {
    error_log('bootstrap failure: ' . get_class($e));
    Response::error(500, 'server_error', 'Service unavailable.')->send();
}
