<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use Mra\Service\GoogleIdTokenVerifier;
use Mra\Support\Clock;

/**
 * Plays Google's part in tests: an RSA key pair, the matching published key set, and ID tokens
 * signed the way Google signs them. Nothing here talks to the network.
 */
final class GoogleTokenFactory
{
    public const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    public const KID = 'test-kid-1';

    /** @var \OpenSSLAsymmetricKey */
    private $key;
    /** @var array{n:string,e:string} */
    private array $jwk;

    public function __construct(private readonly Clock $clock, private readonly string $kid = self::KID)
    {
        $opts = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];
        $conf = getenv('OPENSSL_CONF');
        if (is_string($conf) && $conf !== '') {
            $opts['config'] = $conf;
        }
        $key = openssl_pkey_new($opts);
        if ($key === false) {
            throw new \RuntimeException('OpenSSL could not create an RSA key: ' . openssl_error_string());
        }
        $this->key = $key;
        $rsa = openssl_pkey_get_details($key)['rsa'];
        $this->jwk = ['n' => self::b64($rsa['n']), 'e' => self::b64($rsa['e'])];
    }

    /** @return array<string,mixed> the published key set */
    public function jwks(): array
    {
        return ['keys' => [['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => $this->kid] + $this->jwk]];
    }

    public function verifier(?\Closure $jwks = null): GoogleIdTokenVerifier
    {
        return new GoogleIdTokenVerifier(self::CLIENT_ID, $jwks ?? fn (bool $refresh): array => $this->jwks(), $this->clock);
    }

    /**
     * @param array<string,mixed> $claims overrides; a null value removes the claim
     * @param array<string,mixed> $header overrides for the JWT header
     */
    public function token(array $claims = [], array $header = []): string
    {
        $now = $this->clock->now()->getTimestamp();
        $payload = array_filter($claims + [
            'iss' => 'https://accounts.google.com',
            'aud' => self::CLIENT_ID,
            'sub' => '110169484474386276334',
            'email' => 'asha@example.com',
            'email_verified' => true,
            'name' => 'Asha Verma',
            'iat' => $now,
            'exp' => $now + 3600,
        ], static fn ($v): bool => $v !== null);
        $head = $header + ['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $this->kid];
        $signingInput = self::b64(json_encode($head, JSON_THROW_ON_ERROR)) . '.' . self::b64(json_encode($payload, JSON_THROW_ON_ERROR));
        openssl_sign($signingInput, $signature, $this->key, OPENSSL_ALGO_SHA256);
        return $signingInput . '.' . self::b64($signature);
    }

    /** A token whose header says HS256 and which is "signed" with the public key text as the secret. */
    public function hmacConfusionToken(): string
    {
        $now = $this->clock->now()->getTimestamp();
        $head = self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT', 'kid' => $this->kid], JSON_THROW_ON_ERROR));
        $body = self::b64(json_encode([
            'iss' => 'https://accounts.google.com', 'aud' => self::CLIENT_ID, 'sub' => 'attacker',
            'email' => 'victim@example.com', 'email_verified' => true, 'exp' => $now + 3600,
        ], JSON_THROW_ON_ERROR));
        $pem = GoogleIdTokenVerifier::pemFromRsaJwk($this->jwk['n'], $this->jwk['e']);
        return $head . '.' . $body . '.' . self::b64(hash_hmac('sha256', $head . '.' . $body, $pem, true));
    }

    public function unsignedToken(): string
    {
        $head = self::b64(json_encode(['alg' => 'none', 'typ' => 'JWT', 'kid' => $this->kid], JSON_THROW_ON_ERROR));
        $body = self::b64(json_encode([
            'iss' => 'https://accounts.google.com', 'aud' => self::CLIENT_ID, 'sub' => 'attacker',
            'email' => 'victim@example.com', 'email_verified' => true, 'exp' => $this->clock->now()->getTimestamp() + 3600,
        ], JSON_THROW_ON_ERROR));
        return $head . '.' . $body . '.';
    }

    private static function b64(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
