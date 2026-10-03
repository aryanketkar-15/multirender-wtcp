<?php

declare(strict_types=1);

namespace Mra\Middleware;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\SecurityLogger;
use Mra\Model\Session;

/**
 * Every state-changing request carrying a session must present that session's CSRF token in the
 * X-CSRF-Token header. SameSite=Strict is the first defence; this is the second.
 */
final class CsrfMiddleware
{
    public function __construct(private readonly SecurityLogger $security)
    {
    }

    public function __invoke(Request $request, callable $next): Response
    {
        if (!$request->isStateChanging()) {
            return $next($request);
        }
        $session = $request->attribute('session');
        $sent = $request->header('X-CSRF-Token');
        if (!$session instanceof Session || $sent === null || !hash_equals($session->csrfToken, $sent)) {
            $this->security->record('csrf.rejected', 'warning', $session instanceof Session ? $session->userId : null, [
                'path' => $request->path,
            ], $request->ip);
            return Response::error(403, 'csrf_rejected', 'This request could not be verified.');
        }
        return $next($request);
    }
}
