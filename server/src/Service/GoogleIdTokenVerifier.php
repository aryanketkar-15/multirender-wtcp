<?php

declare(strict_types=1);

namespace Mra\Service;

use Closure;
use Mra\Support\Clock;

/**
 * Verifies a Google ID token (a JWT) the way Google documents: RS256 signature against Google's
 * published keys, issuer, audience equal to OUR client id, expiry, and a verified email.
 *
 * Only RS256 is accepted. A token claiming `none` or an HMAC algorithm is refused before any key is
 * touched (algorithm-confusion attacks), and the key is chosen by `kid` from the published set.
 */
final class GoogleIdTokenVerifier
{
    public const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
    private const LEEWAY = 60;

    /**
     * @param Closure(bool):array<string,mixed> $jwks returns the published key set; true forces a refresh
     */
    public function __construct(
        private readonly string $clientId,
        private readonly Closure $jwks,
        private readonly Clock $clock
    ) {
    }

    /** @return array{sub:string,email:string,name:string} */
    public function verify(string $jwt): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3 || strlen($jwt) > 4096) {
            throw new GoogleTokenException('malformed');
        }
        $header = self::json($parts[0]);
        $claims = self::json($parts[1]);
        $signature = self::b64url($parts[2]);

        if (($header['alg'] ?? null) !== 'RS256' || !is_string($header['kid'] ?? null)) {
            throw new GoogleTokenException('algorithm');
        }
        $pem = $this->keyFor($header['kid']);
        $ok = openssl_verify($parts[0] . '.' . $parts[1], $signature, $pem, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            throw new GoogleTokenException('signature');
        }

        if (!in_array($claims['iss'] ?? null, self::ISSUERS, true)) {
            throw new GoogleTokenException('issuer');
        }
        $aud = $claims['aud'] ?? null;
        if (!(is_string($aud) ? $aud === $this->clientId : (is_array($aud) && in_array($this->clientId, $aud, true)))) {
            throw new GoogleTokenException('audience');
        }
        $now = $this->clock->now()->getTimestamp();
        if (!is_int($claims['exp'] ?? null) || $claims['exp'] + self::LEEWAY < $now) {
            throw new GoogleTokenException('expired');
        }
        if (isset($claims['iat']) && (!is_int($claims['iat']) || $claims['iat'] - self::LEEWAY > $now)) {
            throw new GoogleTokenException('issued_in_future');
        }
        $sub = $claims['sub'] ?? null;
        if (!is_string($sub) || $sub === '' || strlen($sub) > 255) {
            throw new GoogleTokenException('subject');
        }
        $email = $claims['email'] ?? null;
        if (!is_string($email) || filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 254) {
            throw new GoogleTokenException('email');
        }
        if (($claims['email_verified'] ?? null) !== true && ($claims['email_verified'] ?? null) !== 'true') {
            throw new GoogleTokenException('email_unverified');
        }
        $name = isset($claims['name']) && is_string($claims['name']) && trim($claims['name']) !== ''
            ? trim($claims['name'])
            : explode('@', $email)[0];

        return ['sub' => $sub, 'email' => $email, 'name' => mb_substr($name, 0, 100)];
    }

    /** The signing key for a `kid`; one forced refresh when it is not in the cached set (key rotation). */
    private function keyFor(string $kid): string
    {
        foreach ([false, true] as $refresh) {
            $set = ($this->jwks)($refresh);
            foreach ($set['keys'] ?? [] as $jwk) {
                if (self::isRsaKeyWithId($jwk, $kid)) {
                    return self::pemFromRsaJwk($jwk['n'], $jwk['e']);
                }
            }
        }
        throw new GoogleTokenException('unknown_key');
    }

    private static function isRsaKeyWithId(mixed $jwk, string $kid): bool
    {
        return is_array($jwk)
            && ($jwk['kid'] ?? null) === $kid
            && ($jwk['kty'] ?? null) === 'RSA'
            && is_string($jwk['n'] ?? null)
            && is_string($jwk['e'] ?? null);
    }

    /** SubjectPublicKeyInfo PEM for an RSA public key given as base64url modulus and exponent. */
    public static function pemFromRsaJwk(string $n, string $e): string
    {
        $rsaKey = self::der(0x30, self::derInt(self::b64url($n)) . self::derInt(self::b64url($e)));
        $algorithm = self::der(0x30, "\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" . "\x05\x00");
        $spki = self::der(0x30, $algorithm . self::der(0x03, "\x00" . $rsaKey));
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function der(int $tag, string $content): string
    {
        $len = strlen($content);
        $lenBytes = $len < 128 ? chr($len) : (function (int $l): string {
            $out = '';
            while ($l > 0) {
                $out = chr($l & 0xff) . $out;
                $l >>= 8;
            }
            return chr(0x80 | strlen($out)) . $out;
        })($len);
        return chr($tag) . $lenBytes . $content;
    }

    private static function derInt(string $bytes): string
    {
        $bytes = ltrim($bytes, "\x00");
        if ($bytes === '' || (ord($bytes[0]) & 0x80) !== 0) {
            $bytes = "\x00" . $bytes;
        }
        return self::der(0x02, $bytes);
    }

    private static function b64url(string $s): string
    {
        $decoded = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
        if ($decoded === false) {
            throw new GoogleTokenException('encoding');
        }
        return $decoded;
    }

    /** @return array<string,mixed> */
    private static function json(string $part): array
    {
        $data = json_decode(self::b64url($part), true);
        if (!is_array($data)) {
            throw new GoogleTokenException('encoding');
        }
        return $data;
    }
}
