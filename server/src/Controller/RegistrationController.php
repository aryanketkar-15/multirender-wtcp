<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Repository\DuplicateEmailException;
use Mra\Service\RateLimitedException;
use Mra\Service\RegistrationService;
use Mra\Validation\ValidationException;

final class RegistrationController
{
    public function __construct(private readonly RegistrationService $service)
    {
    }

    public function register(Request $request): Response
    {
        if ($request->malformedBody) {
            return Response::error(400, 'bad_request', 'Request body must be valid JSON.');
        }
        try {
            $user = $this->service->register($request->body, $request->ip, $request->userAgent);
        } catch (RateLimitedException $e) {
            return Response::error(429, 'rate_limited', 'Too many attempts. Try again later.')
                ->withHeader('Retry-After', (string) $e->retryAfter);
        } catch (ValidationException $e) {
            return Response::json(['error' => 'validation_failed', 'fields' => $e->errors], 422);
        } catch (DuplicateEmailException) {
            // Deliberately generic: the response must not reveal that the address is registered.
            return Response::error(409, 'conflict', 'We could not create that account. If you already have one, sign in.');
        }
        return Response::json([
            'user' => ['id' => $user->id, 'email' => $user->email, 'name' => $user->name],
            'verification_required' => true,
        ], 201);
    }
}
