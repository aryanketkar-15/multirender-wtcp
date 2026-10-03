<?php

declare(strict_types=1);

namespace Mra\Crypto;

/** Seam for encryption at rest. Implemented by FieldCipher. */
interface FieldEncryptor
{
    /** @param string $context binds the ciphertext to its column so values cannot be swapped between columns */
    public function encrypt(string $plaintext, string $context = ''): string;

    /** @throws DecryptionException on any authentication failure */
    public function decrypt(string $ciphertext, string $context = ''): string;
}
