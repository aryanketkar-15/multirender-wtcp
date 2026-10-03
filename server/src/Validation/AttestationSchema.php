<?php

declare(strict_types=1);

namespace Mra\Validation;

/**
 * The client attestation contract. Strict: unknown members are rejected, so the set of signed
 * fields is unambiguous and nothing can ride along unauthenticated. Every client input is hostile,
 * so this runs before anything touches the database.
 */
final class AttestationSchema
{
    public const DIGEST = '/^sha256:[a-f0-9]{64}$/';

    private const TOP = [
        'v', 'type', 'session_id', 'commitment_hash', 'critical_region_digest', 'context_digest',
        'action', 'action_target', 'env', 'attestor_hash', 'nonce', 'client_ts', 'client_pubkey',
    ];
    private const ENV = ['engine', 'engine_major', 'viewport_bucket', 'dpr_bucket', 'forced_colors', 'reduced_motion'];

    /**
     * @param array<string,mixed> $body the request body: attestation and signature
     * @return array<string,string> field => problem (empty when valid)
     */
    public static function check(array $body): array
    {
        $errors = [];
        $unexpected = array_diff(array_keys($body), ['attestation', 'signature']);
        if ($unexpected !== []) {
            $errors['body'] = 'Unexpected members: ' . implode(', ', array_map('strval', $unexpected));
        }
        $signature = $body['signature'] ?? null;
        if (!is_string($signature) || preg_match('/^[A-Za-z0-9_-]{86}$/', $signature) !== 1) {
            $errors['signature'] = 'Expected 64 bytes as unpadded base64url.';
        }
        $a = $body['attestation'] ?? null;
        if (!is_array($a) || array_is_list($a)) {
            return $errors + ['attestation' => 'Expected an object.'];
        }

        foreach (array_diff(array_keys($a), self::TOP) as $extra) {
            $errors['attestation.' . $extra] = 'Unknown member.';
        }
        foreach (self::TOP as $field) {
            if (!array_key_exists($field, $a)) {
                $errors['attestation.' . $field] = 'Missing.';
            }
        }
        $str = static fn (string $f): ?string => isset($a[$f]) && is_string($a[$f]) ? $a[$f] : null;
        $rules = [
            'v' => static fn (?string $x): bool => $x === 'mra/1.0',
            'type' => static fn (?string $x): bool => $x === 'client_attestation',
            'session_id' => static fn (?string $x): bool => $x !== null && preg_match('/^[a-f0-9]{16}$/', $x) === 1,
            'commitment_hash' => static fn (?string $x): bool => $x !== null && preg_match(self::DIGEST, $x) === 1,
            'critical_region_digest' => static fn (?string $x): bool => $x !== null && preg_match(self::DIGEST, $x) === 1,
            'context_digest' => static fn (?string $x): bool => $x !== null && preg_match(self::DIGEST, $x) === 1,
            'attestor_hash' => static fn (?string $x): bool => $x !== null && preg_match(self::DIGEST, $x) === 1,
            'action' => static fn (?string $x): bool => in_array($x, ['accept', 'reject'], true),
            'action_target' => static fn (?string $x): bool => $x !== null && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $x) === 1,
            'nonce' => static fn (?string $x): bool => $x !== null && preg_match('/^[a-f0-9]{64}$/', $x) === 1,
            'client_ts' => static fn (?string $x): bool => self::isTimestamp($x),
            'client_pubkey' => static fn (?string $x): bool => $x !== null && strlen($x) <= 400
                && str_starts_with($x, '-----BEGIN PUBLIC KEY-----'),
        ];
        foreach ($rules as $field => $ok) {
            if (array_key_exists($field, $a) && !$ok($str($field))) {
                $errors['attestation.' . $field] = 'Invalid.';
            }
        }
        return $errors + self::checkEnv($a['env'] ?? null);
    }

    /** @return array<string,string> */
    private static function checkEnv(mixed $env): array
    {
        if (!is_array($env) || array_is_list($env)) {
            return ['attestation.env' => 'Expected an object.'];
        }
        $errors = [];
        foreach (array_diff(array_keys($env), self::ENV) as $extra) {
            $errors['attestation.env.' . $extra] = 'Unknown member.';
        }
        $checks = [
            'engine' => in_array($env['engine'] ?? null, ['Blink', 'Gecko', 'WebKit', 'Unknown'], true),
            'engine_major' => is_string($env['engine_major'] ?? null) && preg_match('/^\d{1,4}$/', $env['engine_major']) === 1,
            'viewport_bucket' => in_array($env['viewport_bucket'] ?? null, ['small', 'medium', 'large'], true),
            'dpr_bucket' => in_array($env['dpr_bucket'] ?? null, ['1x', '2x', '3x'], true),
            'forced_colors' => is_bool($env['forced_colors'] ?? null),
            'reduced_motion' => is_bool($env['reduced_motion'] ?? null),
        ];
        foreach ($checks as $field => $ok) {
            if (!$ok) {
                $errors['attestation.env.' . $field] = 'Invalid.';
            }
        }
        return $errors;
    }

    private static function isTimestamp(?string $x): bool
    {
        if ($x === null || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $x) !== 1) {
            return false;
        }
        $d = \DateTimeImmutable::createFromFormat('Y-m-d\TH:i:s\Z', $x, new \DateTimeZone('UTC'));
        return $d !== false && $d->format('Y-m-d\TH:i:s\Z') === $x;
    }
}
