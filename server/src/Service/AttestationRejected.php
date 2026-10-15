<?php

declare(strict_types=1);

namespace Mra\Service;

/** A client attestation was refused. Each failure path has its own stable code and HTTP status. */
final class AttestationRejected extends \RuntimeException
{
    public const SCHEMA_INVALID = 'SCHEMA_INVALID';
    public const CLIENT_SIGNATURE_INVALID = 'CLIENT_SIGNATURE_INVALID';
    public const KEY_BINDING_INVALID = 'KEY_BINDING_INVALID';
    public const COMMITMENT_UNKNOWN = 'COMMITMENT_UNKNOWN';
    public const SESSION_MISMATCH = 'SESSION_MISMATCH';
    public const NONCE_MISMATCH = 'NONCE_MISMATCH';
    public const REPLAY_DETECTED = 'REPLAY_DETECTED';
    public const COMMITMENT_EXPIRED = 'COMMITMENT_EXPIRED';
    public const ATTESTOR_UNRECOGNISED = 'ATTESTOR_UNRECOGNISED';
    public const ATTESTOR_MISMATCH = 'ATTESTOR_MISMATCH';
    public const ACTION_TARGET_INVALID = 'ACTION_TARGET_INVALID';
    public const REGION_POLICY_VIOLATION = 'REGION_POLICY_VIOLATION';
    public const REPRESENTATION_MISMATCH = 'REPRESENTATION_MISMATCH';

    /** @param array<array-key,mixed> $detail safe to log and to return: never contains secrets */
    public function __construct(
        public readonly string $errorCode,
        public readonly int $status,
        string $message,
        public readonly array $detail = []
    ) {
        parent::__construct($message);
    }
}
