<?php

declare(strict_types=1);

namespace Mra\Tests\Validation;

use Mra\Validation\RegionPolicy;
use PHPUnit\Framework\TestCase;

final class RegionPolicyTest extends TestCase
{
    private const GOOD = '<section id="consent-region"><h2>Notice</h2><p>We share your data with partners.</p>'
        . '<label><input type="checkbox" id="agree"> I agree</label>'
        . '<button id="btn-agree" type="button">Accept</button><button id="btn-reject" type="button">Reject</button></section>';

    /** @return list<string> */
    private function check(string $markup, string $css = '', string $selector = '#consent-region', string $policy = 'consent/v1'): array
    {
        return RegionPolicy::check($markup, $css, $selector, $policy);
    }

    public function testACompliantRegionPasses(): void
    {
        $this->assertSame([], $this->check(self::GOOD));
    }

    public function testMissingPartsAreEachReported(): void
    {
        $this->assertContains('no disclosure text', $this->check(str_replace('<p>We share your data with partners.</p>', '', self::GOOD)));
        $this->assertContains('no accept control', $this->check(str_replace('id="btn-agree"', 'id="x"', self::GOOD)));
        $this->assertContains('no reject control', $this->check(str_replace('id="btn-reject"', 'id="x"', self::GOOD)));
    }

    public function testAnEmptyDisclosureParagraphIsNotDisclosure(): void
    {
        $this->assertContains('no disclosure text', $this->check(str_replace('We share your data with partners.', '   ', self::GOOD)));
    }

    /** @return array<string,array{string}> */
    public static function hidingStyles(): array
    {
        return [
            'display none' => ['display:none'],
            'visibility hidden' => ['visibility: hidden'],
            'opacity zero' => ['opacity:0'],
            'font size zero' => ['font-size:0'],
        ];
    }

    /** @dataProvider hidingStyles */
    public function testInlineHidingOfTheRejectControlIsAViolation(string $style): void
    {
        $markup = str_replace('id="btn-reject"', 'id="btn-reject" style="' . $style . '"', self::GOOD);
        $this->assertContains('reject control is hidden', $this->check($markup));
    }

    public function testHidingThroughAnAncestorOrAttributeIsAViolation(): void
    {
        $viaParent = str_replace('<button id="btn-reject"', '<div style="display:none"><button id="btn-reject"', self::GOOD);
        $viaParent = str_replace('Reject</button>', 'Reject</button></div>', $viaParent);
        $this->assertContains('reject control is hidden', $this->check($viaParent));
        $this->assertContains('reject control is hidden', $this->check(str_replace('id="btn-reject"', 'id="btn-reject" hidden', self::GOOD)));
        $this->assertContains('reject control is hidden', $this->check(str_replace('id="btn-reject"', 'id="btn-reject" aria-hidden="true"', self::GOOD)));
    }

    public function testHidingThroughTheBundleStylesheetIsAViolation(): void
    {
        $this->assertContains('reject control is hidden', $this->check(self::GOOD, '#btn-reject{display:none}'));
        $this->assertContains('accept control is hidden', $this->check(self::GOOD, '#btn-agree{opacity:0}'));
        $this->assertContains('critical region is hidden', $this->check(self::GOOD, '#consent-region{visibility:hidden}'));
        $this->assertSame([], $this->check(self::GOOD, '#btn-reject{border:1px solid red}'));
    }

    public function testAControlThatIsNotAControlElementIsAViolation(): void
    {
        $markup = str_replace('<button id="btn-reject" type="button">Reject</button>', '<span id="btn-reject">Reject</span>', self::GOOD);
        $this->assertContains('reject control is not a control element', $this->check($markup));
    }

    public function testControlsOutsideTheDeclaredRegionDoNotCount(): void
    {
        $markup = '<section id="consent-region"><p>We share your data.</p></section>'
            . '<button id="btn-agree">Accept</button><button id="btn-reject">Reject</button>';
        $violations = $this->check($markup);
        $this->assertContains('no accept control', $violations);
        $this->assertContains('no reject control', $violations);
    }

    public function testMissingRegionUnknownPolicyAndUnsafeSelectorsAreRefused(): void
    {
        $this->assertSame(['critical region is absent from the bundle'], $this->check('<p>x</p>'));
        $this->assertSame(['unknown policy consent/v2'], $this->check(self::GOOD, '', '#consent-region', 'consent/v2'));
        $this->assertSame(['critical region must be selected by id'], $this->check(self::GOOD, '', 'body > div'));
        $this->assertSame(['critical region must be selected by id'], $this->check(self::GOOD, '', "#a'] | //*[@id='b"));
    }
}
