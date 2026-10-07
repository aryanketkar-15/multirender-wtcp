<?php

declare(strict_types=1);

namespace Mra\Http;

use Mra\App;
use Mra\Controller\AdminController;
use Mra\Controller\AttestationController;
use Mra\Controller\AuthController;
use Mra\Controller\BundleController;
use Mra\Controller\KeyController;
use Mra\Controller\LogController;
use Mra\Controller\OtpController;
use Mra\Controller\PackController;
use Mra\Controller\PasswordController;
use Mra\Controller\RegistrationController;
use Mra\Middleware\AdminMiddleware;
use Mra\Middleware\AuthMiddleware;
use Mra\Middleware\AuthorizationMiddleware;
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

        $this->router->add('GET', '/.well-known/mra-key', [new KeyController($app->keys), 'show']);

        $password = new PasswordController($app->passwordReset);
        $this->router->add('POST', '/api/password/forgot', [$password, 'forgot']);
        $this->router->add('POST', '/api/password/reset', [$password, 'reset']);

        // Evidence packs: every route sits behind ownership authorization (stubs until a later phase).
        $owns = new AuthorizationMiddleware($app->security, fn (string $id): ?int => $app->packs->ownerOf($id));
        $packs = new PackController();
        $this->router->add('GET', '/api/pack/{id}', [$packs, 'show'], [$session, $auth, $owns]);
        $this->router->add('GET', '/api/pack/{id}/download', [$packs, 'show'], [$session, $auth, $owns]);

        $bundle = new BundleController(
            $app->consentSettings,
            $app->consentBundles,
            $app->bundles,
            $app->nonces,
            $app->commitments,
            $app->sessions,
            $app->audit,
            $app->log
        );
        $this->router->add('POST', '/api/client-key', [$bundle, 'registerKey'], [$session, $csrf, $auth, $verified]);
        $this->router->add('GET', '/api/bundle', [$bundle, 'show'], [$session, $auth, $verified]);

        $admin = new AdminMiddleware($app->security);
        $adminController = new AdminController($app->consentSettings, $app->audit);
        $this->router->add('GET', '/api/admin/consent', [$adminController, 'show'], [$session, $auth, $admin]);
        $this->router->add('POST', '/api/admin/consent', [$adminController, 'update'], [$session, $csrf, $auth, $admin]);

        $logController = new LogController($app->log, $app->sth);
        $this->router->add('GET', '/api/log/head', [$logController, 'head']);
        $this->router->add('GET', '/api/log/proof/{index}', [$logController, 'proof']);
        $this->router->add('GET', '/api/log/consistency', [$logController, 'consistency']);

        $attestation = new AttestationController($app->attestationValidator, $app->security, $app->audit, $app->sth);
        $this->router->add('POST', '/api/attest', [$attestation, 'submit'], [$session, $csrf, $auth, $verified]);
    }
}
