<?php

declare(strict_types=1);

namespace Mra\Repository;

use InvalidArgumentException;

/**
 * Which Attestor Module builds the system recognises. A hash that is not in here is not trusted,
 * and the verifier rejects attestations that name it. Rows are never deleted: a retired version is
 * marked deprecated or revoked so that historical evidence stays verifiable.
 */
final class AttestorRegistry extends BaseRepository
{
    public const STATUSES = ['active', 'deprecated', 'revoked'];

    /** @param array{version:string,file:string,sha384:string,sha256:string} $manifest */
    public function register(array $manifest): void
    {
        if (preg_match('/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/', $manifest['version']) !== 1) {
            throw new InvalidArgumentException('version must be semver.');
        }
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $manifest['sha256']) !== 1) {
            throw new InvalidArgumentException('sha256 must be sha256:<64 hex>.');
        }
        if (preg_match('/^sha384-[A-Za-z0-9+\/]{64}$/', $manifest['sha384']) !== 1) {
            throw new InvalidArgumentException('sha384 must be an SRI value.');
        }
        if (preg_match('/^[\w.-]+\.js$/', $manifest['file']) !== 1) {
            throw new InvalidArgumentException('file must be a plain .js file name.');
        }
        $known = $this->find($manifest['sha256']);
        if ($known !== null) {
            return; // idempotent
        }
        $this->run(
            'INSERT INTO attestor_registry (version, hash, integrity, file_name, status) VALUES (?, ?, ?, ?, ?)',
            [$manifest['version'], $manifest['sha256'], $manifest['sha384'], $manifest['file'], 'active']
        );
    }

    /** @return array{version:string,hash:string,integrity:string,file_name:string,status:string}|null */
    public function find(string $hash): ?array
    {
        $row = $this->run(
            'SELECT version, hash, integrity, file_name, status FROM attestor_registry WHERE hash = ?',
            [$hash]
        )->fetch();
        return $row === false ? null : $this->shape($row);
    }

    /** The build new commitments should name: the most recently published active one. */
    public function active(): ?array
    {
        $row = $this->run(
            'SELECT version, hash, integrity, file_name, status FROM attestor_registry
             WHERE status = ? ORDER BY id DESC LIMIT 1',
            ['active']
        )->fetch();
        return $row === false ? null : $this->shape($row);
    }

    /** True when the hash is known and still active. A deprecated build verifies old evidence only. */
    public function isRecognised(string $hash, bool $includeDeprecated = false): bool
    {
        $row = $this->find($hash);
        if ($row === null || $row['status'] === 'revoked') {
            return false;
        }
        return $row['status'] === 'active' || $includeDeprecated;
    }

    public function setStatus(string $hash, string $status): void
    {
        if (!in_array($status, self::STATUSES, true)) {
            throw new InvalidArgumentException("Unknown status: {$status}");
        }
        $this->run('UPDATE attestor_registry SET status = ? WHERE hash = ?', [$status, $hash]);
    }

    /**
     * @param array<string,mixed> $row
     * @return array{version:string,hash:string,integrity:string,file_name:string,status:string}
     */
    private function shape(array $row): array
    {
        return [
            'version' => (string) $row['version'],
            'hash' => (string) $row['hash'],
            'integrity' => (string) $row['integrity'],
            'file_name' => (string) $row['file_name'],
            'status' => (string) $row['status'],
        ];
    }
}
