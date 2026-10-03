<?php

declare(strict_types=1);

namespace Mra\Crypto;

use RuntimeException;

final class CryptoFactory
{
    /** @return array{cipher:FieldCipher,index:BlindIndex} */
    public static function fromConfig(?array $config = null): array
    {
        $config ??= require dirname(__DIR__, 2) . '/config/crypto.php';
        $key = $config['encryption_key_hex'] ?? null;
        $pepper = $config['blind_index_pepper_hex'] ?? null;
        if ($key === null || $pepper === null) {
            throw new RuntimeException('APP_ENCRYPTION_KEY and BLIND_INDEX_PEPPER must both be set.');
        }
        if (hash_equals($key, $pepper)) {
            throw new RuntimeException('The encryption key and the blind index pepper must be different values.');
        }
        return ['cipher' => FieldCipher::fromHex($key), 'index' => BlindIndex::fromHex($pepper)];
    }
}
