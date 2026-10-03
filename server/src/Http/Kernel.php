<?php

declare(strict_types=1);

namespace Mra\Http;

use Mra\App;
use Mra\Controller\OtpController;
use Mra\Controller\RegistrationController;
use Throwable;

/** Routes a Request to a controller and turns any failure into a safe, generic response. */
final class Kernel
{
    private readonly Router $router;

    public function __construct(private readonly App $app)
    {
        $this->router = new Router();
        $this->routes();
    }

    public function handle(Request $request): Response
    {
        try {
            return $this->router->dispatch($request);
        } catch (Throwable) {
            // Internal detail never reaches the client; the failure is still visible in the PHP log.
            return Response::error(500, 'server_error', 'Something went wrong. Please try again.');
        }
    }

    private function routes(): void
    {
        $app = $this->app;

        $registration = new RegistrationController($app->registration);
        $this->router->add('POST', '/api/register', [$registration, 'register']);

        $otp = new OtpController($app->otp);
        $this->router->add('POST', '/api/otp/request', [$otp, 'request']);
        $this->router->add('POST', '/api/otp/verify', [$otp, 'verify']);
    }
}
