<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Http\Cookie;
use Mra\Model\Session;
use Mra\Repository\SessionRepository;
use Mra\Support\Clock;

/**
 * Server-side sessions. The cookie carries 32 random bytes; the database holds only their hash.
 * Idle timeout 30 minutes, absolute timeout 12 hours. Regeneration deletes the old session, which
 * is the equivalent of session_regenerate_id(true): the old identifier stops working at once.
 */
final class SessionService
{
    public const COOKIE = 'mra_sid';
    public const IDLE = 1800;
    public const ABSOLUTE = 43200;

    public function __construct(private readonly SessionRepository $repo, private readonly Clock $clock)
    {
    }

    /** @return array{token:string,session:Session} */
    public function create(?int $userId = null): array
    {
        $token = bin2hex(random_bytes(32));
        $now = $this->clock->now();
        $this->repo->insert(self::hash($token), $userId, bin2hex(random_bytes(32)), $now);
        return ['token' => $token, 'session' => $this->repo->find(self::hash($token)) ?? throw new \RuntimeException('session')];
    }

    public function resolve(?string $token): ?Session
    {
        if ($token === null || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $hash = self::hash($token);
        $session = $this->repo->find($hash);
        if ($session === null) {
            return null;
        }
        $now = $this->clock->now();
        $idleExpired = $now->getTimestamp() - $session->lastSeenAt->getTimestamp() > self::IDLE;
        $absoluteExpired = $now->getTimestamp() - $session->createdAt->getTimestamp() > self::ABSOLUTE;
        if ($idleExpired || $absoluteExpired) {
            $this->repo->delete($hash);
            return null;
        }
        $this->repo->touch($hash, $now);
        return $session;
    }

    /**
     * Issues a fresh identifier and CSRF token, then destroys the old session.
     *
     * @return array{token:string,session:Session}
     */
    public function regenerate(Session $old, ?int $userId): array
    {
        $new = $this->create($userId);
        $this->repo->delete($old->id);
        return $new;
    }

    public function destroy(Session $session): void
    {
        $this->repo->delete($session->id);
    }

    public function destroyAllForUser(int $userId): int
    {
        return $this->repo->deleteForUser($userId);
    }

    public static function cookie(string $token): Cookie
    {
        return new Cookie(self::COOKIE, $token, self::ABSOLUTE);
    }

    public static function expiredCookie(): Cookie
    {
        return Cookie::expired(self::COOKIE);
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
