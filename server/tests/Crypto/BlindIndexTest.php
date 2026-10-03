<?php

declare(strict_types=1);

namespace Mra\Tests\Crypto;

use InvalidArgumentException;
use Mra\Crypto\BlindIndex;
use Mra\Crypto\CryptoFactory;
use PHPUnit\Framework\TestCase;
use RuntimeException;

final class BlindIndexTest extends TestCase
{
    private function index(string $fill = "\x07"): BlindIndex
    {
        return new BlindIndex(str_repeat($fill, 32));
    }

    public function testDeterministic(): void // T1.1.4
    {
        $this->assertSame($this->index()->forEmail('a@b.com'), $this->index()->forEmail('a@b.com'));
    }

    public function testNormalisesCaseAndWhitespace(): void // T1.1.5
    {
        $this->assertSame($this->index()->forEmail('A@B.com'), $this->index()->forEmail('  a@b.com  '));
    }

    public function testDifferentAddressesDiffer(): void
    {
        $this->assertNotSame($this->index()->forEmail('a@b.com'), $this->index()->forEmail('c@b.com'));
    }

    public function testChangingThePepperChangesTheIndex(): void
    {
        $this->assertNotSame($this->index("\x07")->forEmail('a@b.com'), $this->index("\x08")->forEmail('a@b.com'));
    }

    public function testIndexIs32Bytes(): void
    {
        $this->assertSame(32, strlen($this->index()->forEmail('a@b.com')));
    }

    public function testShortPepperRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new BlindIndex('short');
    }

    public function testFactoryRefusesIdenticalKeyAndPepper(): void
    {
        $same = str_repeat('ab', 32);
        $this->expectException(RuntimeException::class);
        CryptoFactory::fromConfig(['encryption_key_hex' => $same, 'blind_index_pepper_hex' => $same]);
    }

    public function testFactoryBuildsBothFromDistinctValues(): void
    {
        $parts = CryptoFactory::fromConfig([
            'encryption_key_hex' => str_repeat('ab', 32),
            'blind_index_pepper_hex' => str_repeat('cd', 32),
        ]);
        $this->assertSame(32, strlen($parts['index']->forEmail('x@y.z')));
    }

    public function testFactoryRequiresBothValues(): void
    {
        $this->expectException(RuntimeException::class);
        CryptoFactory::fromConfig(['encryption_key_hex' => null, 'blind_index_pepper_hex' => null]);
    }
}
