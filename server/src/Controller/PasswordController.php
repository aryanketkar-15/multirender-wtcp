<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Service\PasswordResetService;
use Mra\Service\RateLimitedException;
use Mra\Validation\Rules\Email;
use Mra\Validation\ValidationException;

final class PasswordController
{
    public const INVALID_LINK = 'This reset link is invalid or has expired.';

    public function __construct(private readonly PasswordResetService $resets)
    {
    }

    /** Same 202 whether or not the address has an account. */
    public function forgot(Request $request): Response
    {
        if ($request->malformedBody) {
            return Response::error(400, 'bad_request', 'Request body must be valid JSON.');
        }
        $email = $request->body['email'] ?? null;
        if (!(new Email())->passes($email, [])) {
            return Response::json(
                ['error' => 'validation_failed', 'fields' => ['email' => 'Enter a valid email address']],
                422
            );
        }
        try {
            $this->resets->request((string) $email, $request->ip);
        } catch (RateLimitedException $e) {
            return Response::error(429, 'rate_limited', 'Too many requests. Try again later.')
                ->withHeader('Retry-After', (string) $e->retryAfter);
        }
        return Response::json(['status' => 'reset_link_sent_if_account_exists'], 202);
    }

    public function reset(Request $request): Response
    {
        if ($request->malformedBody) {
            return Response::error(400, 'bad_request', 'Request body must be valid JSON.');
        }
        try {
            $ok = $this->resets->reset($request->body, $request->ip);
        } catch (ValidationException $e) {
            return Response::json(['error' => 'validation_failed', 'fields' => $e->errors], 422);
        }
        return $ok
            ? Response::json(['status' => 'password_changed'])
            : Response::json(['error' => 'invalid_token', 'message' => self::INVALID_LINK], 422);
    }
}
