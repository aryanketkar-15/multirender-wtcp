<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Crypto\Jcs;
use Mra\Model\Bundle;

/**
 * Turns the admin-editable consent settings into a sealed bundle. The critical region always holds
 * the three things the region policy requires: disclosure text, an accept control and a reject
 * control. The consent checkbox is never rendered pre-ticked. Identical settings yield an
 * identical bundle (the bundle id is derived from the content, not from a clock).
 */
final class ConsentBundleFactory
{
    public const REGION = '#consent-region';
    public const POLICY = 'consent/v1';

    private const CSS = '#consent-region{max-width:32rem;font-family:system-ui,sans-serif}'
        . '#consent-region button{min-height:44px;padding:0 20px;font:inherit;border-radius:8px;cursor:pointer}'
        . '#btn-agree{background:#0b5c6b;color:#fff;border:0}'
        . '#btn-reject{background:#fff;color:#0b5c6b;border:2px solid #0b5c6b}'
        . '#btn-agree[disabled]{opacity:.55;cursor:not-allowed}';

    public function __construct(
        private readonly BundleBuilder $builder,
        private readonly string $attestorHash,
        private readonly string $attestorVersion
    ) {
    }

    public function attestorVersion(): string
    {
        return $this->attestorVersion;
    }

    /** @param array{disclosure_text:string,accept_label:string,reject_label:string,validity_minutes:int,retention_days:int} $s */
    public function build(array $s): Bundle
    {
        $e = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $markup = '<section id="consent-region" aria-labelledby="consent-title">'
            . '<h2 id="consent-title">Your consent</h2>'
            . '<p id="disclosure">' . $e($s['disclosure_text']) . '</p>'
            . '<p id="retention">Records are kept for ' . (int) $s['retention_days'] . ' days.</p>'
            . '<label for="agree"><input type="checkbox" id="agree" name="agree"> I have read and understood this notice</label>'
            . '<div id="actions">'
            . '<button type="button" id="btn-agree">' . $e($s['accept_label']) . '</button> '
            . '<button type="button" id="btn-reject">' . $e($s['reject_label']) . '</button>'
            . '</div></section>';

        $spec = [
            'markup' => $markup,
            'css' => self::CSS,
            'critical_region' => self::REGION,
            'region_policy' => self::POLICY,
            'attestor_hash' => $this->attestorHash,
        ];
        $id = 'bnd_' . substr(hash('sha256', Jcs::encode($spec)), 0, 20);
        return $this->builder->build(['bundle_id' => $id] + $spec);
    }
}
