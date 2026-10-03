<?php

declare(strict_types=1);

namespace Mra\Middleware;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Model\Session;
use Mra\Repository\UserRepository;

/**
 * Requires an authenticated session. Identity comes only from the session, never from request
 * input. The user row is loaded fresh so a deleted account loses access immediately.
 */
final class AuthMiddleware
{
    public function __construct(private readonly UserRepository $users)
    {
    }

    public function __invoke(Request $request, callable $next): Response
    {
        $session = $request->attribute('session');
        if (!$session instanceof Session || $session->userId === null) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        $user = $this->users->findById($session->userId);
        if ($user === null) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        return $next($request->with('user', $user));
    }
}
