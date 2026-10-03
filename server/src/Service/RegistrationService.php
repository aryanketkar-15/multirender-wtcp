<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Log\AuditLogger;
use Mra\Log\SecurityLogger;
use Mra\Model\User;
use Mra\Repository\DuplicateEmailException;
use Mra\Repository\UserRepository;
use Mra\Validation\Schemas;
use Mra\Validation\ValidationException;
use Mra\Validation\Validator;

final class RegistrationService
{
    public const LIMIT = 5;
    public const WINDOW = 3600;
    private const INVALID_LIMIT = 3;
    private const INVALID_WINDOW = 600;

    public function __construct(
        private readonly UserRepository $users,
        private readonly ThrottleService $throttle,
        private readonly AuditLogger $audit,
        private readonly SecurityLogger $security
    ) {
    }

    /**
     * @param array<string,mixed> $input
     * @throws RateLimitedException
     * @throws ValidationException
     * @throws DuplicateEmailException
     */
    public function register(array $input, string $ip, ?string $userAgent): User
    {
        if ($this->throttle->isLimited('register', $ip, self::LIMIT, self::WINDOW)) {
            $this->security->record('register.rate_limited', 'warning', null, [], $ip);
            throw new RateLimitedException($this->throttle->retryAfter('register', $ip, self::WINDOW));
        }
        $this->throttle->record('register', $ip);

        try {
            Validator::assert($input, Schemas::registration());
        } catch (ValidationException $e) {
            $this->throttle->record('register_invalid', $ip);
            if ($this->throttle->count('register_invalid', $ip, self::INVALID_WINDOW) >= self::INVALID_LIMIT) {
                $this->security->record(
                    'register.repeated_validation_failure',
                    'warning',
                    null,
                    ['fields' => array_keys($e->errors)],
                    $ip
                );
            }
            throw $e;
        }

        $hash = password_hash((string) $input['password'], PASSWORD_ARGON2ID);
        try {
            $id = $this->users->create(trim((string) $input['email']), trim((string) $input['name']), $hash);
        } catch (DuplicateEmailException $e) {
            $this->audit->record('user.register', 'failure', null, null, null, ['reason' => 'conflict'], $ip, $userAgent);
            throw $e;
        }

        $this->audit->record('user.register', 'success', $id, 'user', (string) $id, [], $ip, $userAgent);
        return $this->users->findById($id) ?? throw new \RuntimeException('User vanished after insert.');
    }
}
