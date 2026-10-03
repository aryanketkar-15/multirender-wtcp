<?php

declare(strict_types=1);

namespace Mra\Tests\Crypto;

use InvalidArgumentException;
use Mra\Crypto\DecryptionException;
use Mra\Crypto\FieldCipher;
use PHPUnit\Framework\TestCase;

final class FieldCipherTest extends TestCase
{
    private function cipher(): FieldCipher
    {
        return new FieldCipher(str_repeat("\x01", 32));
    }

    public function testRoundTrip(): void // T1.1.1
    {
        $c = $this->cipher();
        $this->assertSame('alice@example.com', $c->decrypt($c->encrypt('alice@example.com')));
    }

    public function testUnicodeRoundTrip(): void
    {
        $c = $this->cipher();
        $this->assertSame('Ayşe Çelik 山田太郎', $c->decrypt($c->encrypt('Ayşe Çelik 山田太郎')));
    }

    public function testCiphertextIsNonDeterministic(): void // T1.1.2
    {
        $c = $this->cipher();
        $this->assertNotSame($c->encrypt('same'), $c->encrypt('same'));
    }

    public function testTamperedCiphertextIsRejected(): void // T1.1.3
    {
        $c = $this->cipher();
        $ct = $c->encrypt('secret value');
        $ct[strlen($ct) - 3] = $ct[strlen($ct) - 3] ^ "\x01";
        $this->expectException(DecryptionException::class);
        $c->decrypt($ct);
    }

    public function testTamperedNonceIsRejected(): void
    {
        $c = $this->cipher();
        $ct = $c->encrypt('secret value');
        $ct[0] = $ct[0] ^ "\x01";
        $this->expectException(DecryptionException::class);
        $c->decrypt($ct);
    }

    public function testWrongKeyFailsClosed(): void // T1.1.8
    {
        $ct = $this->cipher()->encrypt('secret value');
        $this->expectException(DecryptionException::class);
        (new FieldCipher(str_repeat("\x02", 32)))->decrypt($ct);
    }

    public function testWrongContextFailsClosed(): void
    {
        $c = $this->cipher();
        $ct = $c->encrypt('a@b.com', 'users.email_enc');
        $this->expectException(DecryptionException::class);
        $c->decrypt($ct, 'users.name_enc');
    }

    public function testTruncatedCiphertextIsRejected(): void
    {
        $this->expectException(DecryptionException::class);
        $this->cipher()->decrypt('short');
    }

    public function testKeyMustBe32Bytes(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new FieldCipher('too short');
    }

    public function testFromHexRejectsMalformedKey(): void
    {
        $this->expectException(InvalidArgumentException::class);
        FieldCipher::fromHex('zz');
    }

    public function testFromHexAcceptsA64CharKey(): void
    {
        $c = FieldCipher::fromHex(str_repeat('ab', 32));
        $this->assertSame('x', $c->decrypt($c->encrypt('x')));
    }
}
