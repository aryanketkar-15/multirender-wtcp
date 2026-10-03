<?php

declare(strict_types=1);

namespace Mra\Validation;

use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * Region policy `consent/v1` (decision D-04). The declared critical region must contain disclosure
 * text, an accept control and a reject control, none of them hidden. Without this a server could
 * declare a narrow region holding only compliant content and put the deception outside it.
 *
 * The accept and reject controls are identified by the ids `btn-agree` and `btn-reject`, which is
 * the convention of this policy version.
 */
final class RegionPolicy
{
    public const POLICY = 'consent/v1';
    public const ACCEPT_ID = 'btn-agree';
    public const REJECT_ID = 'btn-reject';

    /**
     * @return list<string> violations; empty when the region satisfies the policy
     */
    public static function check(string $markup, string $css, string $regionSelector, string $policy): array
    {
        if ($policy !== self::POLICY) {
            return ["unknown policy {$policy}"];
        }
        if (preg_match('/^#([A-Za-z][\w-]*)$/', $regionSelector, $m) !== 1) {
            return ['critical region must be selected by id'];
        }
        $doc = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><html><body>' . $markup . '</body></html>', LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $xpath = new DOMXPath($doc);
        $region = $xpath->query('//*[@id=' . self::literal($m[1]) . ']')->item(0);
        if (!$region instanceof DOMElement) {
            return ['critical region is absent from the bundle'];
        }

        $violations = [];
        $disclosure = $xpath->query('.//p[normalize-space(.) != ""]', $region);
        if ($disclosure === false || $disclosure->length === 0) {
            $violations[] = 'no disclosure text';
        }
        foreach ([self::ACCEPT_ID => 'accept', self::REJECT_ID => 'reject'] as $id => $label) {
            $control = $xpath->query('.//*[@id=' . self::literal($id) . ']', $region)->item(0);
            if (!$control instanceof DOMElement) {
                $violations[] = "no {$label} control";
                continue;
            }
            if (!in_array(strtolower($control->tagName), ['button', 'a', 'input'], true)) {
                $violations[] = "{$label} control is not a control element";
            }
            if (self::hidden($control, $region) || self::hiddenByCss($css, $id)) {
                $violations[] = "{$label} control is hidden";
            }
        }
        if (self::hiddenByCss($css, $m[1])) {
            $violations[] = 'critical region is hidden';
        }
        return $violations;
    }

    private static function literal(string $value): string
    {
        return "'" . str_replace("'", '', $value) . "'";
    }

    private static function hidden(DOMElement $el, DOMElement $stop): bool
    {
        for ($node = $el; $node instanceof DOMElement; $node = $node->parentNode instanceof DOMElement ? $node->parentNode : null) {
            if (
                $node->hasAttribute('hidden')
                || strtolower($node->getAttribute('aria-hidden')) === 'true'
                || preg_match('/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])|font-size\s*:\s*0(?![.\d])/i', $node->getAttribute('style')) === 1
            ) {
                return true;
            }
            if ($node->isSameNode($stop)) {
                break;
            }
        }
        return false;
    }

    private static function hiddenByCss(string $css, string $id): bool
    {
        $quoted = preg_quote($id, '/');
        return preg_match('/#' . $quoted . '\s*\{[^}]*(display:none|visibility:hidden|opacity:0(?![.\d])|font-size:0(?![.\d]))/i', $css) === 1;
    }
}
