<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

/** The reference consent page used by determinism and sensitivity tests. */
final class BundleFixture
{
    /** @return array<string,mixed> */
    public static function spec(): array
    {
        return [
            'bundle_id' => 'bnd_fixture_0001',
            'markup' => '<section id="consent-region"><h1>Data sharing</h1>'
                . '<p id="disclosure">We share your usage data with our partners for advertising.</p>'
                . '<label><input type="checkbox" id="agree"> I agree</label>'
                . '<button id="btn-agree" type="button">Accept</button>'
                . '<button id="btn-reject" type="button">Reject</button></section>',
            'css' => '#consent-region { max-width: 32rem; } button { padding: 8px 16px; }',
            'critical_region' => '#consent-region',
            'region_policy' => 'consent/v1',
            'attestor_hash' => 'sha256:' . str_repeat('ab', 32),
            'assets' => ['fonts/inter.woff2' => 'font-bytes', 'img/logo.svg' => '<svg/>'],
            'fonts' => [['family' => 'Inter', 'sha256' => 'sha256:' . str_repeat('cd', 32)]],
        ];
    }
}
