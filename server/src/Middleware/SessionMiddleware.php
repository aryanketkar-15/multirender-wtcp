<?php

declare(strict_types=1);

namespace Mra\Middleware;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Service\SessionService;

/** Attaches the caller's session (if the cookie names a live one) as the `session` attribute. */
final class SessionMiddleware
{
    public function __construct(private readonly SessionService $sessions)
    {
    }

    public function __invoke(Request $request, callable $next): Response
    {
        $session = $this->sessions->resolve($request->cookie(SessionService::COOKIE));
        return $next($session === null ? $request : $request->with('session', $session));
    }
}
