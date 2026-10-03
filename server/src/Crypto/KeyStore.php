<?php

declare(strict_types=1);

namespace Mra\Crypto;

use InvalidArgumentException;
use Mra\Config\Env;

/**
 * The server's Ed25519 signing identity. The private seed comes from the environment
 * (MRA_SERVER_SK, 64 hex characters) and never touches the repository, a config file or a log.
 * Retired public keys stay resolvable by key_id so historical commitments keep verifying after a
 * rotation. MRA_RETIRED_KEYS is a comma-separated list of `key_id:public_key_hex`.
 */
final class KeyStore
{
    private readonly string $secretKey;
    private readonly string $currentPublic;

    /** @param array<string,string> $retiredPublicKeys key_id => raw 32-byte public key */
    public function __construct(
        private readonly string $currentKeyId,
        string $seed,
        private readonly array $retiredPublicKeys = []
    ) {
        if (preg_match('/^[A-Za-z0-9_.-]{1,32}$/', $currentKeyId) !== 1) {
            throw new InvalidArgumentException('key_id must be 1-32 characters of [A-Za-z0-9_.-].');
        }
        if (strlen($seed) !== SODIUM_CRYPTO_SIGN_SEEDBYTES) {
            throw new InvalidArgumentException('Signing seed must be exactly 32 bytes.');
        }
        $pair = sodium_crypto_sign_seed_keypair($seed);
        $this->secretKey = sodium_crypto_sign_secretkey($pair);
        $this->currentPublic = sodium_crypto_sign_publickey($pair);
        sodium_memzero($seed);
    }

    public static function fromEnv(): self
    {
        $hex = Env::require('MRA_SERVER_SK');
        $seed = ctype_xdigit($hex) && strlen($hex) === 64 ? hex2bin($hex) : false;
        if ($seed === false) {
            throw new InvalidArgumentException('MRA_SERVER_SK must be 64 hexadecimal characters.');
        }
        $retired = [];
        foreach (array_filter(explode(',', Env::get('MRA_RETIRED_KEYS', '') ?? '')) as $entry) {
            [$id, $pk] = array_pad(explode(':', trim($entry), 2), 2, '');
            $bin = ctype_xdigit($pk) && strlen($pk) === 64 ? hex2bin($pk) : false;
            if ($id === '' || $bin === false) {
                throw new InvalidArgumentException('MRA_RETIRED_KEYS entries must be key_id:64-hex-public-key.');
            }
            $retired[$id] = $bin;
        }
        return new self(Env::get('MRA_KEY_ID', 'k1') ?? 'k1', $seed, $retired);
    }

    public function currentKeyId(): string
    {
        return $this->currentKeyId;
    }

    /** @return string raw 64-byte detached signature */
    public function sign(string $message): string
    {
        return sodium_crypto_sign_detached($message, $this->secretKey);
    }

    /** Raw public key for any known key id (current or retired), or null. */
    public function publicKey(string $keyId): ?string
    {
        if ($keyId === $this->currentKeyId) {
            return $this->currentPublic;
        }
        return $this->retiredPublicKeys[$keyId] ?? null;
    }

    /** @return list<array{key_id:string,alg:string,public_key:string,status:string}> */
    public function publicKeys(): array
    {
        $out = [[
            'key_id' => $this->currentKeyId,
            'alg' => 'Ed25519',
            'public_key' => bin2hex($this->currentPublic),
            'status' => 'current',
        ]];
        foreach ($this->retiredPublicKeys as $id => $pk) {
            $out[] = ['key_id' => $id, 'alg' => 'Ed25519', 'public_key' => bin2hex($pk), 'status' => 'retired'];
        }
        return $out;
    }
}
