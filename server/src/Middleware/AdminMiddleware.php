<?php

declare(strict_types=1);

namespace Mra\Middleware;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\SecurityLogger;
use Mra\Model\User;

/** Administrator-only routes. Checked against the stored account on every request. */
final class AdminMiddleware
{
    public function __construct(private readonly SecurityLogger $security)
    {
    }

    public function __invoke(Request $request, callable $next): Response
    {
        $user = $request->attribute('user');
        if (!$user instanceof User || !$user->isAdmin) {
            $this->security->record('admin.denied', 'warning', $user instanceof User ? $user->id : null, [
                'path' => $request->path,
            ], $request->ip);
            return Response::error(403, 'forbidden', 'You do not have access to this resource.');
        }
        return $next($request);
    }
}
