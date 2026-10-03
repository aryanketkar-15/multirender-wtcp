<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Model\Session;
use Mra\Model\User;
use Mra\Repository\UserRepository;
use Mra\Service\AuthService;
use Mra\Service\SessionService;
use Mra\Validation\Rules\Email;
use Mra\Validation\Rules\Required;

final class AuthController
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly SessionService $sessions,
        private readonly UserRepository $users
    ) {
    }

    /** Establishes an anonymous session if needed and hands the client its CSRF token. */
    public function session(Request $request): Response
    {
        $session = $request->attribute('session');
        $created = null;
        if (!$session instanceof Session) {
            $created = $this->sessions->create();
            $session = $created['session'];
        }
        $user = $session->userId !== null ? $this->users->findById($session->userId) : null;
        $res = Response::json([
            'authenticated' => $session->userId !== null,
            'user' => $user !== null ? self::present($user) : null,
            'csrf_token' => $session->csrfToken,
        ]);
        return $created === null ? $res : $res->withCookie(SessionService::cookie($created['token']));
    }

    public function login(Request $request): Response
    {
        $session = $request->attribute('session');
        if (!$session instanceof Session) {
            return Response::error(403, 'csrf_rejected', 'This request could not be verified.');
        }
        $email = $request->body['email'] ?? null;
        $password = $request->body['password'] ?? null;
        if (!(new Email())->passes($email, []) || !(new Required())->passes($password, [])) {
            return self::invalid();
        }
        $result = $this->auth->login((string) $email, (string) $password, $session, $request->ip, $request->userAgent);
        return match ($result['status']) {
            'throttled' => Response::error(429, 'rate_limited', 'Too many sign-in attempts. Try again later.')
                ->withHeader('Retry-After', (string) $result['retry_after']),
            'unverified' => Response::error(403, 'email_not_verified', 'Verify your email address to sign in.'),
            'invalid' => self::invalid(),
            'ok' => Response::json([
                'authenticated' => true,
                'user' => self::present($result['user']),
                'csrf_token' => $result['session']->csrfToken,
            ])->withCookie(SessionService::cookie($result['token'])),
        };
    }

    public function logout(Request $request): Response
    {
        $session = $request->attribute('session');
        if ($session instanceof Session) {
            $this->auth->logout($session, $request->ip, $request->userAgent);
        }
        return Response::json(['authenticated' => false])->withCookie(SessionService::expiredCookie());
    }

    private static function invalid(): Response
    {
        return Response::error(401, 'invalid_credentials', 'Email or password is incorrect.');
    }

    /** @return array{id:int,email:string,name:string,verified:bool} */
    private static function present(User $user): array
    {
        return ['id' => $user->id, 'email' => $user->email, 'name' => $user->name, 'verified' => $user->isVerified()];
    }
}
