<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Model\Session;
use Mra\Service\GoogleAuthService;
use Mra\Service\SessionService;

final class GoogleAuthController
{
    public function __construct(private readonly GoogleAuthService $google, private readonly ?string $clientId)
    {
    }

    /** Tells the browser whether to offer Google sign-in. The client id is public by design. */
    public function config(Request $request): Response
    {
        return Response::json(['google_client_id' => $this->google->enabled() ? $this->clientId : null]);
    }

    public function login(Request $request): Response
    {
        $session = $request->attribute('session');
        if (!$session instanceof Session) {
            return Response::error(403, 'csrf_rejected', 'This request could not be verified.');
        }
        $credential = $request->body['credential'] ?? null;
        if (!is_string($credential) || $credential === '' || strlen($credential) > 4096) {
            return Response::error(401, 'invalid_google_token', 'Google sign-in could not be verified.');
        }
        $result = $this->google->signIn($credential, $session, $request->ip, $request->userAgent);
        return match ($result['status']) {
            'not_configured' => Response::error(404, 'not_found', 'Not found.'),
            'throttled' => Response::error(429, 'rate_limited', 'Too many attempts. Try again later.')
                ->withHeader('Retry-After', (string) $result['retry_after']),
            'invalid' => Response::error(401, 'invalid_google_token', 'Google sign-in could not be verified.'),
            'ok' => Response::json([
                'authenticated' => true,
                'created' => $result['created'],
                'user' => [
                    'id' => $result['user']->id,
                    'email' => $result['user']->email,
                    'name' => $result['user']->name,
                    'verified' => $result['user']->isVerified(),
                    'admin' => $result['user']->isAdmin,
                ],
                'csrf_token' => $result['session']->csrfToken,
            ])->withCookie(SessionService::cookie($result['token'])),
        };
    }
}
