<?php

declare(strict_types=1);

namespace Mra\Http;

use Mra\App;
use Mra\Controller\AuthController;
use Mra\Controller\OtpController;
use Mra\Controller\RegistrationController;
use Mra\Middleware\AuthMiddleware;
use Mra\Middleware\CsrfMiddleware;
use Mra\Middleware\SessionMiddleware;
use Mra\Middleware\VerifiedMiddleware;
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

        $session = new SessionMiddleware($app->sessions);
        $csrf = new CsrfMiddleware($app->security);
        $auth = new AuthMiddleware($app->users);
        $verified = new VerifiedMiddleware($app->security);

        $otp = new OtpController($app->otp, $app->sessions);
        $this->router->add('POST', '/api/otp/request', [$otp, 'request']);
        $this->router->add('POST', '/api/otp/verify', [$otp, 'verify'], [$session]);

        $authController = new AuthController($app->auth, $app->sessions, $app->users);
        $this->router->add('GET', '/api/session', [$authController, 'session'], [$session]);
        $this->router->add('POST', '/api/login', [$authController, 'login'], [$session, $csrf]);
        $this->router->add('POST', '/api/logout', [$authController, 'logout'], [$session, $csrf, $auth]);

        // Attestation endpoint: guarded now so no later milestone can forget the guard. Implemented in Phase 4.
        $this->router->add(
            'POST',
            '/api/attestation',
            static fn (Request $r): Response => Response::error(501, 'not_implemented', 'Not implemented yet.'),
            [$session, $csrf, $auth, $verified]
        );
    }
}
