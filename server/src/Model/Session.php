<?php

declare(strict_types=1);

namespace Mra\Model;

use DateTimeImmutable;

final class Session
{
    public function __construct(
        public readonly string $id,
        public readonly ?int $userId,
        public readonly string $csrfToken,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $lastSeenAt,
        public readonly ?string $clientPubkeyFpr = null
    ) {
    }

    public function isAuthenticated(): bool
    {
        return $this->userId !== null;
    }
}
