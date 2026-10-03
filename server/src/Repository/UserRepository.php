<?php

declare(strict_types=1);

namespace Mra\Repository;

use Mra\Crypto\BlindIndex;
use Mra\Crypto\FieldEncryptor;
use Mra\Model\User;
use PDO;
use PDOException;

/**
 * Personal data (email, name) is encrypted; lookup is by blind index. Password hashes are stored
 * as produced by password_hash() and are never encrypted (decision D-15).
 */
final class UserRepository extends BaseRepository
{
    private const CTX_EMAIL = 'users.email_enc';
    private const CTX_NAME = 'users.name_enc';

    public function __construct(PDO $pdo, private readonly FieldEncryptor $cipher, private readonly BlindIndex $index)
    {
        parent::__construct($pdo);
    }

    /** @throws DuplicateEmailException */
    public function create(string $email, string $name, string $passwordHash): int
    {
        try {
            $this->run(
                'INSERT INTO users (email_enc, email_bidx, name_enc, password_hash) VALUES (?, ?, ?, ?)',
                [
                    $this->cipher->encrypt(trim($email), self::CTX_EMAIL),
                    $this->index->forEmail($email),
                    $this->cipher->encrypt($name, self::CTX_NAME),
                    $passwordHash,
                ]
            );
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                throw new DuplicateEmailException('Email already registered.');
            }
            throw $e;
        }
        return (int) $this->pdo->lastInsertId();
    }

    public function findByEmail(string $email): ?User
    {
        return $this->fetchOne('WHERE email_bidx = ?', [$this->index->forEmail($email)]);
    }

    public function findById(int $id): ?User
    {
        return $this->fetchOne('WHERE id = ?', [$id]);
    }

    public function markVerified(int $id): void
    {
        $this->run('UPDATE users SET verified_at = UTC_TIMESTAMP(6) WHERE id = ? AND verified_at IS NULL', [$id]);
    }

    public function updatePasswordHash(int $id, string $hash): void
    {
        $this->run('UPDATE users SET password_hash = ? WHERE id = ?', [$hash, $id]);
    }

    /** @param array<int,mixed> $params */
    private function fetchOne(string $where, array $params): ?User
    {
        $row = $this->run(
            'SELECT id, email_enc, name_enc, password_hash, verified_at, created_at FROM users ' . $where,
            $params
        )->fetch();
        if ($row === false) {
            return null;
        }
        return new User(
            (int) $row['id'],
            $this->cipher->decrypt($row['email_enc'], self::CTX_EMAIL),
            $this->cipher->decrypt($row['name_enc'], self::CTX_NAME),
            $row['password_hash'],
            $row['verified_at'],
            $row['created_at']
        );
    }
}
