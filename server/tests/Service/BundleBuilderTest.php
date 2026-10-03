<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use Mra\Repository\BundleRepository;
use Mra\Service\BundleBuilder;
use Mra\Tests\Support\BundleFixture;
use Mra\Tests\TestCase;

final class BundleBuilderTest extends TestCase
{
    /** Pinned: every machine, OS and PHP build must reproduce exactly this hash from the fixture. */
    private const GOLDEN = 'sha256:ffcdc29f7d6bbf09dcdc7f546f3b7f5f0f9b502d1f8d09801df73291fe729c22';

    private BundleBuilder $builder;

    protected function setUp(): void
    {
        parent::setUp();
        $this->builder = new BundleBuilder();
    }

    /** @param array<string,mixed> $override */
    private function hash(array $override = []): string
    {
        return $this->builder->build($override + BundleFixture::spec())->hash;
    }

    public function testHundredBuildsYieldExactlyOneHash(): void // T2.1.1
    {
        $hashes = [];
        for ($i = 0; $i < 100; $i++) {
            $hashes[$this->hash()] = true;
        }
        $this->assertCount(1, $hashes);
    }

    public function testHashMatchesTheGoldenValueSoMachinesCanBeCompared(): void
    {
        $this->assertSame(self::GOLDEN, $this->hash());
    }

    public function testSeparateProcessesAgree(): void
    {
        $flags = array_filter(explode(' ', (string) getenv('MRA_TEST_PHP_FLAGS')));
        $cmd = implode(' ', array_map('escapeshellarg', [PHP_BINARY, ...$flags, dirname(__DIR__, 2) . '/bin/bundle_hash.php', '5']));
        $this->assertSame(self::GOLDEN, trim((string) shell_exec($cmd)));
    }

    public function testOneCharacterChangeInTheDisclosureChangesTheHash(): void // T2.1.2
    {
        $spec = BundleFixture::spec();
        $changed = str_replace('advertising', 'advertisinG', $spec['markup']);
        $this->assertNotSame($spec['markup'], $changed);
        $this->assertNotSame($this->hash(), $this->hash(['markup' => $changed]));
    }

    public function testZeroWidthCharacterInjectionChangesTheHash(): void
    {
        $spec = BundleFixture::spec();
        $this->assertNotSame(
            $this->hash(),
            $this->hash(['markup' => str_replace('Accept', "Ac\u{200b}cept", $spec['markup'])])
        );
    }

    public function testAttributeOrderIsIrrelevant(): void // T2.1.3
    {
        $a = '<div id="x" class="a b" data-k="1"><input type="checkbox" id="c" name="n"></div>';
        $b = '<div data-k="1" class="a b" id="x"><input name="n" id="c" type="checkbox"></div>';
        $this->assertSame($this->hash(['markup' => $a]), $this->hash(['markup' => $b]));
    }

    public function testWhitespaceAndFormattingAreIrrelevant(): void // T2.1.4
    {
        $minified = '<section id="r"><h1>Title</h1><p>Hello <b>big</b> world</p><button>OK</button></section>';
        $formatted = "<section id=\"r\">\n    <h1>Title</h1>\n    <p>\n        Hello   <b>big</b>\n  world\n    </p>\n"
            . "    <button>OK</button>\n</section>\n";
        $this->assertSame($this->hash(['markup' => $minified]), $this->hash(['markup' => $formatted]));
    }

    public function testEntityEncodingAndVoidFormAndCommentsAreIrrelevant(): void
    {
        $a = '<p>Tom &amp; Jerry &copy; 2026</p><br><!-- note --><img alt="x" src="data:image/png;base64,AA==">';
        $b = '<p>Tom & Jerry © 2026</p><br/><img src="data:image/png;base64,AA==" alt="x" />';
        $this->assertSame($this->hash(['markup' => $a]), $this->hash(['markup' => $b]));
    }

    public function testSpaceBetweenInlineElementsIsSemanticAndKept(): void
    {
        $this->assertNotSame(
            $this->hash(['markup' => '<p><b>a</b> <i>b</i></p>']),
            $this->hash(['markup' => '<p><b>a</b><i>b</i></p>'])
        );
    }

    public function testWhitespaceInsidePreIsPreserved(): void
    {
        $this->assertNotSame(
            $this->hash(['markup' => '<pre>a  b</pre>']),
            $this->hash(['markup' => '<pre>a b</pre>'])
        );
    }

    public function testStylesheetChangeChangesTheHash(): void // T2.1.7
    {
        $this->assertNotSame($this->hash(), $this->hash(['css' => '#consent-region { max-width: 33rem; }']));
    }

    public function testCssFormattingAndCommentsAreIrrelevant(): void
    {
        $a = '#r{color:red;margin:0}';
        $b = "/* c */\n#r {\n  color: red;\n  margin: 0;\n}\n";
        $this->assertSame($this->hash(['css' => $a]), $this->hash(['css' => $b]));
    }

    public function testAssetContentChangeChangesTheHash(): void
    {
        $this->assertNotSame($this->hash(), $this->hash(['assets' => ['fonts/inter.woff2' => 'other-bytes']]));
    }

    public function testAssetInsertionOrderIsIrrelevant(): void
    {
        $this->assertSame(
            $this->hash(['assets' => ['a' => '1', 'b' => '2']]),
            $this->hash(['assets' => ['b' => '2', 'a' => '1']])
        );
    }

    public function testEveryMetadataFieldIsCovered(): void
    {
        $base = $this->hash();
        $this->assertNotSame($base, $this->hash(['critical_region' => '#other']));
        $this->assertNotSame($base, $this->hash(['region_policy' => 'consent/v2']));
        $this->assertNotSame($base, $this->hash(['attestor_hash' => 'sha256:' . str_repeat('ee', 32)]));
        $this->assertNotSame($base, $this->hash(['bundle_id' => 'bnd_fixture_0002']));
    }

    public function testCanonicalFormContainsNoTimestampOrRandomValue(): void
    {
        $canonical = $this->builder->build(BundleFixture::spec())->canonical;
        $this->assertDoesNotMatchRegularExpression('/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/', $canonical);
        $this->assertSame(Jcs::encode(json_decode($canonical, true)), $canonical, 'already canonical');
        $this->assertSame('sha256:' . hash('sha256', $canonical), $this->hash());
    }

    /** @return array<string,array{array<string,string>}> */
    public static function externalReferences(): array
    {
        return [
            'remote image' => [['markup' => '<img src="https://evil.example/x.png">']],
            'protocol-relative' => [['markup' => '<a href="//evil.example/">x</a>']],
            'remote form action' => [['markup' => '<form action="http://evil.example/p"></form>']],
            'css import' => [['css' => '@import "https://evil.example/a.css";']],
            'css remote url' => [['css' => 'p{background:url(https://evil.example/a.png)}']],
            'script' => [['markup' => '<script>alert(1)</script>']],
        ];
    }

    /**
     * @param array<string,string> $override
     * @dataProvider externalReferences
     */
    public function testBundleMustBeSelfContained(array $override): void // T2.1.8 (no external request possible)
    {
        $this->expectException(InvalidArgumentException::class);
        $this->hash($override);
    }

    public function testDataUrisAndFragmentLinksAreAllowed(): void
    {
        $this->assertNotSame('', $this->hash(['markup' => '<a href="#top">x</a><img src="data:image/png;base64,AA==">']));
    }

    public function testMissingFieldsAndBadAttestorHashAreRefused(): void
    {
        $spec = BundleFixture::spec();
        unset($spec['css']);
        $this->expectException(InvalidArgumentException::class);
        $this->builder->build($spec);
    }

    public function testMalformedAttestorHashIsRefused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->hash(['attestor_hash' => 'md5:abc']);
    }

    public function testRepositoryRoundTripAndTamperDetection(): void
    {
        $repo = new BundleRepository($this->pdo);
        $bundle = $this->builder->build(BundleFixture::spec());
        $repo->save($bundle);
        $repo->save($bundle);
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM mra_bundle')->fetchColumn());
        $this->assertSame($bundle->canonical, $repo->canonical($bundle->bundleId));

        $this->pdo->prepare('UPDATE mra_bundle SET canonical_blob = ? WHERE bundle_id = ?')
            ->execute([str_replace('Accept', 'Agree', $bundle->canonical), $bundle->bundleId]);
        $this->assertNull($repo->canonical($bundle->bundleId), 'a modified blob no longer matches its hash');
    }

    public function testBundleIdCannotBeReusedForDifferentContent(): void
    {
        $repo = new BundleRepository($this->pdo);
        $repo->save($this->builder->build(BundleFixture::spec()));
        $this->expectException(\RuntimeException::class);
        $repo->save($this->builder->build(['markup' => '<p>different</p>'] + BundleFixture::spec()));
    }
}
