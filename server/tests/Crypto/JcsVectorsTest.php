<?php

declare(strict_types=1);

namespace Mra\Tests\Crypto;

use Mra\Crypto\Jcs;
use PHPUnit\Framework\TestCase;

/**
 * Shares its vectors with the attestor (attestor/tests/fixtures/jcs-vectors.json). The TypeScript
 * suite runs the same file, so the two canonicalisers are proven to agree byte for byte (T3.4.2).
 */
final class JcsVectorsTest extends TestCase
{
    private const FILE = __DIR__ . '/../../../attestor/tests/fixtures/jcs-vectors.json';

    /** @return array<string,array{string,string}> */
    public static function vectors(): array
    {
        $all = json_decode((string) file_get_contents(self::FILE), true, 512, JSON_THROW_ON_ERROR);
        $cases = [];
        foreach ($all as $v) {
            $cases[$v['name']] = [$v['json'], $v['canonical']];
        }
        return $cases;
    }

    /** @dataProvider vectors */
    public function testPhpAgreesWithTheSharedVector(string $json, string $canonical): void
    {
        $this->assertSame($canonical, Jcs::encode(json_decode($json, false, 512, JSON_THROW_ON_ERROR)));
    }

    public function testThereAreVectors(): void
    {
        $this->assertGreaterThanOrEqual(15, count(self::vectors()));
    }
}
