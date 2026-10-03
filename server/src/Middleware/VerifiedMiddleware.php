<?php

declare(strict_types=1);

namespace Mra\Middleware;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Log\SecurityLogger;
use Mra\Model\User;

/** Unverified accounts cannot produce attestations. Checked on every request, server-side. */
final class VerifiedMiddleware
{
    public function __construct(private readonly SecurityLogger $security)
    {
    }

    public function __invoke(Request $request, callable $next): Response
    {
        $user = $request->attribute('user');
        if (!$user instanceof User || !$user->isVerified()) {
            $this->security->record(
                'attestation.unverified_account',
                'warning',
                $user instanceof User ? $user->id : null,
                ['path' => $request->path],
                $request->ip
            );
            return Response::error(403, 'email_not_verified', 'Verify your email address to continue.');
        }
        return $next($request);
    }
}
