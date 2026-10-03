<?php

declare(strict_types=1);

namespace Mra\Log;

use DateInterval;
use DateTimeImmutable;
use DateTimeZone;
use InvalidArgumentException;
use PDO;

/**
 * Archives rows older than the retention period into a dated table, then removes them from the
 * live table in one transaction. Reconciles counts so a loss is detected, not assumed away.
 */
final class LogRotator
{
    public const TABLES = ['audit_log', 'security_log'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly int $retentionDays,
        private readonly int $maxLiveRows
    ) {
        if ($retentionDays < 1) {
            throw new InvalidArgumentException('Retention must be at least one day.');
        }
    }

    /**
     * @return array{table:string,archive:string,before:int,archived:int,live_after:int,reconciled:bool,over_cap:bool}
     */
    public function rotate(string $table, ?DateTimeImmutable $now = null): array
    {
        if (!in_array($table, self::TABLES, true)) {
            throw new InvalidArgumentException('Unknown log table.');
        }
        $now ??= new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $cutoff = $now->sub(new DateInterval('P' . $this->retentionDays . 'D'))->format('Y-m-d H:i:s.u');
        $archive = $table . '_archive_' . $now->format('Ymd');

        $before = $this->count($table);
        // DDL commits implicitly, so the archive table is created before the transaction begins.
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS `{$archive}` LIKE `{$table}`");
        $archiveBefore = $this->count($archive);

        $this->pdo->beginTransaction();
        try {
            $copy = $this->pdo->prepare(
                "INSERT INTO `{$archive}` SELECT * FROM `{$table}` WHERE created_at < ?"
            );
            $copy->execute([$cutoff]);
            $moved = $copy->rowCount();
            $delete = $this->pdo->prepare("DELETE FROM `{$table}` WHERE created_at < ?");
            $delete->execute([$cutoff]);
            if ($delete->rowCount() !== $moved) {
                throw new \RuntimeException('Rotation count mismatch; rolled back.');
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $liveAfter = $this->count($table);
        $archiveAfter = $this->count($archive);
        return [
            'table' => $table,
            'archive' => $archive,
            'before' => $before,
            'archived' => $moved,
            'live_after' => $liveAfter,
            'reconciled' => $before === $liveAfter + ($archiveAfter - $archiveBefore),
            'over_cap' => $liveAfter > $this->maxLiveRows,
        ];
    }

    private function count(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
    }
}
