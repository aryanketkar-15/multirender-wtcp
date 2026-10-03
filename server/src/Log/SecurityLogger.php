<?php

declare(strict_types=1);

namespace Mra\Log;

use InvalidArgumentException;
use Mra\Crypto\FieldEncryptor;
use Mra\Repository\BaseRepository;
use PDO;
use PDOException;

/** Security log: failed logins, throttling, authorization denials, tamper signals. */
final class SecurityLogger extends BaseRepository
{
    public const SEVERITIES = ['info', 'warning', 'critical'];

    public function __construct(PDO $pdo, private readonly ?FieldEncryptor $encryptor = null)
    {
        parent::__construct($pdo);
    }

    /**
     * @param array<array-key,mixed> $detail
     * @return int id of the new row
     */
    public function record(
        string $eventType,
        string $severity = 'warning',
        ?int $actorId = null,
        array $detail = [],
        ?string $ip = null
    ): int {
        if (!in_array($severity, self::SEVERITIES, true)) {
            throw new InvalidArgumentException("Unknown severity: {$severity}");
        }
        try {
            $this->run(
                'INSERT INTO security_log (event_type, actor_id, detail, ip_enc, severity) VALUES (?, ?, ?, ?, ?)',
                [
                    $eventType,
                    $actorId,
                    $detail === [] ? null : json_encode(Redactor::redact($detail), JSON_UNESCAPED_UNICODE),
                    ($ip === null || $this->encryptor === null) ? null : $this->encryptor->encrypt($ip),
                    $severity,
                ]
            );
            return (int) $this->pdo->lastInsertId();
        } catch (PDOException $e) {
            throw new LogWriteException('Security log write failed.', 0, $e);
        }
    }
}
