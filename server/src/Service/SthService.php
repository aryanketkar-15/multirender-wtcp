<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Crypto\Jcs;
use Mra\Crypto\Signer;
use Mra\Repository\BaseRepository;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;

/**
 * Signed tree heads. A head commits the server to one log state: its size and root, signed with the
 * server's Ed25519 key. Heads published outside the server's control are what make a later rewrite
 * of history detectable even by someone who never held the log.
 */
final class SthService extends BaseRepository
{
    public const TYPE = 'signed_tree_head';

    public function __construct(
        PDO $pdo,
        private readonly MerkleLog $log,
        private readonly Signer $signer,
        private readonly Clock $clock
    ) {
        parent::__construct($pdo);
    }

    /**
     * Signs the current head, or returns the existing one if this tree size already has a head.
     *
     * @return array{id:int,record:array<string,mixed>,signature:string}
     */
    public function sign(): array
    {
        $size = $this->log->size();
        $existing = $this->forSize($size);
        if ($existing !== null) {
            return $existing;
        }
        $now = $this->clock->now();
        $record = [
            'v' => BundleBuilder::VERSION,
            'type' => self::TYPE,
            'tree_size' => $size,
            'root_hash' => 'sha256:' . bin2hex($this->log->root($size)),
            'timestamp' => $now->format('Y-m-d\TH:i:s\Z'),
            'key_id' => $this->signer->keyId(),
        ];
        $canonical = Jcs::encode($record);
        $signature = $this->signer->sign($canonical);
        $this->run(
            'INSERT INTO mra_sth (tree_size, root_hash, key_id, signature, record_json, signed_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$size, $this->log->root($size), $record['key_id'], $signature, $canonical, SystemClock::db($now)]
        );
        return ['id' => (int) $this->pdo->lastInsertId(), 'record' => $record, 'signature' => $signature];
    }

    /** @return array{id:int,record:array<string,mixed>,signature:string}|null */
    public function latest(): ?array
    {
        $row = $this->run('SELECT * FROM mra_sth ORDER BY tree_size DESC LIMIT 1')->fetch();
        return $row === false ? null : $this->shape($row);
    }

    /** @return array{id:int,record:array<string,mixed>,signature:string}|null */
    public function forSize(int $size): ?array
    {
        $row = $this->run('SELECT * FROM mra_sth WHERE tree_size = ?', [$size])->fetch();
        return $row === false ? null : $this->shape($row);
    }

    /** Checks the signature on a head, resolving the key by its key_id. */
    public function verify(array $record, string $signature): bool
    {
        return ($record['type'] ?? null) === self::TYPE
            && is_string($record['key_id'] ?? null)
            && $this->signer->verify(Jcs::encode($record), $signature, $record['key_id']);
    }

    /**
     * @param array<string,mixed> $row
     * @return array{id:int,record:array<string,mixed>,signature:string}
     */
    private function shape(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'record' => json_decode((string) $row['record_json'], true, 512, JSON_THROW_ON_ERROR),
            'signature' => (string) $row['signature'],
        ];
    }
}
