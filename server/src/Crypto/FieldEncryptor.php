<?php

declare(strict_types=1);

namespace Mra\Crypto;

/** Seam for encryption at rest. Implemented by FieldCipher (milestone 1.1). */
interface FieldEncryptor
{
    public function encrypt(string $plaintext): string;

    public function decrypt(string $ciphertext): string;
}
