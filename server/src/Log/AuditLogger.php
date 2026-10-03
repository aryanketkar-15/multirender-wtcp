<?php

declare(strict_types=1);

namespace Mra\Log;

use InvalidArgumentException;
use Mra\Crypto\FieldEncryptor;
use Mra\Repository\BaseRepository;
use PDO;
use PDOException;

/** Application audit log: who did what. Operational, rotated, distinct from the Merkle log. */
final class AuditLogger extends BaseRepository
{
    public const OUTCOMES = ['success', 'failure', 'denied'];

    public function __construct(PDO $pdo, private readonly ?FieldEncryptor $encryptor = null)
    {
        parent::__construct($pdo);
    }

    /**
     * @param array<array-key,mixed> $detail
     * @return int id of the new row
     */
    public function record(
        string $action,
        string $outcome = 'success',
        ?int $actorId = null,
        ?string $targetType = null,
        ?string $targetId = null,
        array $detail = [],
        ?string $ip = null,
        ?string $userAgent = null
    ): int {
        if (!in_array($outcome, self::OUTCOMES, true)) {
            throw new InvalidArgumentException("Unknown audit outcome: {$outcome}");
        }
        try {
            $this->run(
                'INSERT INTO audit_log (actor_id, action, target_type, target_id, outcome, detail, ip_enc, ua_enc)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $actorId,
                    $action,
                    $targetType,
                    $targetId,
                    $outcome,
                    $detail === [] ? null : json_encode(Redactor::redact($detail), JSON_UNESCAPED_UNICODE),
                    $this->seal($ip, 'audit_log.ip_enc'),
                    $this->seal($userAgent, 'audit_log.ua_enc'),
                ]
            );
            return (int) $this->pdo->lastInsertId();
        } catch (PDOException $e) {
            throw new LogWriteException('Audit log write failed.', 0, $e);
        }
    }

    /** IP and user agent are personal data: encrypted, or stored null. Never plaintext. */
    private function seal(?string $value, string $context): ?string
    {
        return ($value === null || $this->encryptor === null) ? null : $this->encryptor->encrypt($value, $context);
    }
}
