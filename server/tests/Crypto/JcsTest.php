<?php

declare(strict_types=1);

namespace Mra\Tests\Crypto;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use PHPUnit\Framework\TestCase;

/** Vectors are taken from RFC 8785: section 3.2.2.3 / appendix B (numbers), 3.2.3 (sorting), 3.2.4. */
final class JcsTest extends TestCase
{
    private static function double(string $hex): float
    {
        return unpack('E', pack('J', hexdec($hex)))[1];
    }

    /** @return array<string,array{string,string}> */
    public static function numberVectors(): array
    {
        return [
            'zero' => ['0000000000000000', '0'],
            'minus zero' => ['8000000000000000', '0'],
            'min subnormal' => ['0000000000000001', '5e-324'],
            'max' => ['7fefffffffffffff', '1.7976931348623157e+308'],
            '2^53' => ['4340000000000000', '9007199254740992'],
            '-2^53' => ['c340000000000000', '-9007199254740992'],
            'large integral' => ['4430000000000000', '295147905179352830000'],
            '9.999999999999997e+22' => ['44b52d02c7e14af5', '9.999999999999997e+22'],
            '1e+23' => ['44b52d02c7e14af6', '1e+23'],
            '1.0000000000000001e+23' => ['44b52d02c7e14af7', '1.0000000000000001e+23'],
            '999999999999999700000' => ['444b1ae4d6e2ef4e', '999999999999999700000'],
            '999999999999999900000' => ['444b1ae4d6e2ef4f', '999999999999999900000'],
            '1e+21' => ['444b1ae4d6e2ef50', '1e+21'],
            '9.999999999999997e-7' => ['3eb0c6f7a0b5ed8c', '9.999999999999997e-7'],
            '0.000001' => ['3eb0c6f7a0b5ed8d', '0.000001'],
        ];
    }

    /** @dataProvider numberVectors */
    public function testRfcNumberVectors(string $bits, string $expected): void // T2.1.5
    {
        $this->assertSame($expected, Jcs::number(self::double($bits)));
    }

    public function testNaNAndInfinityAreRefused(): void
    {
        foreach ([NAN, INF, -INF] as $bad) {
            try {
                Jcs::number($bad);
                $this->fail('expected refusal');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testMembersAreSortedByUtf16CodeUnits(): void // RFC 8785 section 3.2.3
    {
        $input = [
            "\u{20ac}" => 'Euro Sign',
            "\r" => 'Carriage Return',
            "\u{fb33}" => 'Hebrew Letter Dalet With Dagesh',
            '1' => 'One',
            "\u{1f600}" => 'Emoji: Grinning Face',
            "\u{80}" => 'Control',
            "\u{f6}" => 'Latin Small Letter O With Diaeresis',
        ];
        $keys = array_map('strval', array_keys(json_decode(Jcs::encode($input), true)));
        $this->assertSame(["\r", '1', "\u{80}", "\u{f6}", "\u{20ac}", "\u{1f600}", "\u{fb33}"], $keys);
    }

    public function testSurrogatePairSortsBeforeBmpCharactersAboveD800(): void
    {
        // U+1F600 is D83D DE00 in UTF-16, so it sorts before U+FB33 although its code point is larger.
        $json = Jcs::encode(["\u{fb33}" => 1, "\u{1f600}" => 2]);
        $this->assertLessThan(strpos($json, "\u{fb33}"), strpos($json, "\u{1f600}"));
    }

    public function testRfcSection324Example(): void // T2.1.6 (unicode and escapes)
    {
        $input = [
            'numbers' => [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
            'string' => "\u{20ac}$\x0f\nA'B\"\\\\\"/",
            'literals' => [null, true, false],
        ];
        $expected = '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],'
            . '"string":"' . "\u{20ac}" . '$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}';
        $this->assertSame($expected, Jcs::encode($input));
    }

    public function testNonAsciiIsEmittedRawNotEscaped(): void
    {
        $this->assertSame("\"\u{e9}\u{4e16}\u{1f600}\"", Jcs::encode("\u{e9}\u{4e16}\u{1f600}"));
        $this->assertSame('"a/b"', Jcs::encode('a/b'));
    }

    public function testControlCharactersUseLowercaseHexAndShortForms(): void
    {
        $this->assertSame('"\\u0000\\u001f\\b\\f\\n\\r\\t"', Jcs::encode("\x00\x1f\x08\x0c\n\r\t"));
        $this->assertSame("\"\x7f\"", Jcs::encode("\x7f"));
        $this->assertSame("\"\u{2028}\"", Jcs::encode("\u{2028}"));
    }

    public function testInvalidUtf8IsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Jcs::encode("\xff\xfe");
    }

    public function testEmptyListVersusEmptyObject(): void
    {
        $this->assertSame('[]', Jcs::encode([]));
        $this->assertSame('{}', Jcs::encode(new \stdClass()));
    }

    public function testNestedStructuresAndNumericStringKeys(): void
    {
        $this->assertSame('{"1":"a","10":"b","2":"c"}', Jcs::encode(['10' => 'b', '2' => 'c', '1' => 'a']));
        $this->assertSame('{"a":{"b":[1,{"c":true}]}}', Jcs::encode(['a' => ['b' => [1, ['c' => true]]]]));
    }

    public function testInsertionOrderNeverMatters(): void
    {
        $a = ['x' => 1, 'y' => ['p' => 1, 'q' => 2], 'z' => 3];
        $b = ['z' => 3, 'y' => ['q' => 2, 'p' => 1], 'x' => 1];
        $this->assertSame(Jcs::encode($a), Jcs::encode($b));
    }

    public function testIntegersAndWholeFloatsAgree(): void
    {
        $this->assertSame('5', Jcs::encode(5));
        $this->assertSame('5', Jcs::encode(5.0));
        $this->assertSame('-12', Jcs::encode(-12));
        $this->assertSame('0.5', Jcs::encode(0.5));
    }

    public function testUnsafeIntegersAndUnsupportedTypesAreRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Jcs::encode(PHP_INT_MAX);
    }

    public function testObjectsOfUnknownClassAreRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Jcs::encode(new \DateTimeImmutable());
    }
}
