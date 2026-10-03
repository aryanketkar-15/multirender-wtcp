<?php

declare(strict_types=1);

namespace Mra\Service;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;
use InvalidArgumentException;

/**
 * Serialises an HTML fragment into one canonical form so that reformatting, minification,
 * attribute reordering and entity choice cannot change the bundle hash:
 * lower-case tags, attributes sorted by name, a fixed escape set, void elements as `<br/>`,
 * comments dropped, runs of ASCII whitespace collapsed, layout-only whitespace removed.
 */
final class MarkupNormalizer
{
    private const VOID = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'];
    private const BLOCK = [
        'address', 'article', 'aside', 'blockquote', 'body', 'button', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset',
        'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p',
        'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'label', 'input', 'select', 'textarea',
        'br',
    ];
    private const PRESERVE = ['pre', 'textarea'];

    public static function normalize(string $html): string
    {
        if (preg_match('//u', $html) !== 1) {
            throw new InvalidArgumentException('Markup is not valid UTF-8.');
        }
        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML(
            '<?xml encoding="UTF-8"><html><body><div id="__root">' . $html . '</div></body></html>',
            LIBXML_HTML_NODEFDTD
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('__root');
        if ($root === null) {
            throw new InvalidArgumentException('Markup could not be parsed.');
        }
        return trim(self::children($root, false));
    }

    private static function children(DOMNode $parent, bool $preserve): string
    {
        $out = '';
        $nodes = iterator_to_array($parent->childNodes, false);
        foreach ($nodes as $i => $node) {
            if ($node instanceof DOMText) {
                $out .= self::text($node, $nodes[$i - 1] ?? null, $nodes[$i + 1] ?? null, $preserve);
            } elseif ($node instanceof DOMElement) {
                $out .= self::element($node, $preserve);
            }
            // Comments, processing instructions and doctypes are dropped.
        }
        return $out;
    }

    private static function text(DOMText $node, ?DOMNode $prev, ?DOMNode $next, bool $preserve): string
    {
        $value = $node->nodeValue ?? '';
        if ($preserve) {
            return self::escapeText($value);
        }
        $collapsed = preg_replace('/[ \t\r\n\f]+/', ' ', $value) ?? $value;
        if (trim($collapsed, ' ') === '') {
            $layoutOnly = $prev === null || $next === null || self::isBlock($prev) || self::isBlock($next);
            return $layoutOnly ? '' : ' ';
        }
        if ($prev === null || self::isBlock($prev)) {
            $collapsed = ltrim($collapsed, ' ');
        }
        if ($next === null || self::isBlock($next)) {
            $collapsed = rtrim($collapsed, ' ');
        }
        return self::escapeText($collapsed);
    }

    private static function element(DOMElement $el, bool $preserve): string
    {
        $tag = strtolower($el->tagName);
        $attributes = [];
        foreach ($el->attributes ?? [] as $attr) {
            $attributes[strtolower($attr->nodeName)] = $attr->nodeValue ?? '';
        }
        ksort($attributes, SORT_STRING);
        $open = '<' . $tag;
        foreach ($attributes as $name => $value) {
            $open .= ' ' . $name . '="' . self::escapeAttribute($value) . '"';
        }
        if (in_array($tag, self::VOID, true)) {
            return $open . '/>';
        }
        $inner = self::children($el, $preserve || in_array($tag, self::PRESERVE, true));
        return $open . '>' . $inner . '</' . $tag . '>';
    }

    private static function isBlock(DOMNode $node): bool
    {
        return $node instanceof DOMElement && in_array(strtolower($node->tagName), self::BLOCK, true);
    }

    private static function escapeText(string $s): string
    {
        return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $s);
    }

    private static function escapeAttribute(string $s): string
    {
        return str_replace(['&', '"', '<', '>'], ['&amp;', '&quot;', '&lt;', '&gt;'], $s);
    }
}
