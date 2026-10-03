<?php

declare(strict_types=1);

namespace Mra\Controller;

use Mra\Http\Request;
use Mra\Http\Response;
use Mra\Model\Session;
use Mra\Service\OtpService;
use Mra\Service\RateLimitedException;
use Mra\Service\SessionService;
use Mra\Validation\Rules\Email;
use Mra\Validation\Schemas;
use Mra\Validation\Validator;

final class OtpController
{
    public const FAILURE = 'That code is incorrect or has expired';

    public function __construct(private readonly OtpService $otp, private readonly SessionService $sessions)
    {
    }

    /** Same 202 whether or not the address is registered. */
    public function request(Request $request): Response
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
            $this->otp->request((string) $email, $request->ip);
        } catch (RateLimitedException $e) {
            return Response::error(429, 'rate_limited', 'Too many code requests. Try again later.')
                ->withHeader('Retry-After', (string) $e->retryAfter);
        }
        return Response::json(['status' => 'code_sent_if_account_exists'], 202);
    }

    public function verify(Request $request): Response
    {
        if ($request->malformedBody) {
            return Response::error(400, 'bad_request', 'Request body must be valid JSON.');
        }
        $errors = Validator::check($request->body, Schemas::otp());
        if ($errors !== []) {
            // Format errors on the code share the generic failure text; only a bad email is specific.
            return Response::json(['error' => 'invalid_code', 'message' => self::FAILURE], 422);
        }
        $ok = $this->otp->verify((string) $request->body['email'], (string) $request->body['code'], $request->ip);
        if (!$ok) {
            return Response::json(['error' => 'invalid_code', 'message' => self::FAILURE], 422);
        }
        $res = Response::json(['status' => 'verified']);
        // A privilege change: if the caller holds a session, replace its identifier (fixation defence).
        $session = $request->attribute('session');
        if ($session instanceof Session) {
            $new = $this->sessions->regenerate($session, $session->userId);
            $res = $res->withCookie(SessionService::cookie($new['token']));
        }
        return $res;
    }
}
