<?php

declare(strict_types=1);

namespace Mra\Middleware;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\SecurityLogger;
use Mra\Model\User;

/**
 * Ownership check for `/api/pack/{id}`-style routes. The acting identity is the authenticated
 * session's user, never a value from the body or query string (insecure direct object reference).
 * An unknown id and someone else's id are indistinguishable: both return 403.
 */
final class AuthorizationMiddleware
{
    /** @param callable(string):?int $ownerOf resolves a resource id to its owner's user id */
    public function __construct(
        private readonly SecurityLogger $security,
        private $ownerOf,
        private readonly string $param = 'id'
    ) {
    }

    public function __invoke(Request $request, callable $next): Response
    {
        $user = $request->attribute('user');
        $resource = $request->attribute('route.' . $this->param);
        if (!$user instanceof User || !is_string($resource)) {
            return Response::error(401, 'unauthenticated', 'Sign in to continue.');
        }
        $owner = ($this->ownerOf)($resource);
        if ($owner === null || $owner !== $user->id) {
            $this->security->record('authz.cross_subject_denied', 'warning', $user->id, [
                'path' => $request->path,
            ], $request->ip);
            return Response::error(403, 'forbidden', 'You do not have access to this resource.');
        }
        return $next($request);
    }
}
