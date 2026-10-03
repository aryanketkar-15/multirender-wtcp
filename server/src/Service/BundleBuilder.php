<?php

declare(strict_types=1);

namespace Mra\Service;

use InvalidArgumentException;
use Mra\Crypto\Jcs;
use Mra\Model\Bundle;

/**
 * Builds the sealed render bundle. Determinism is the whole point: identical input yields a
 * byte-identical canonical form and hash. Non-determinism enters through four doors, each closed
 * here: map iteration order (JCS sorts keys), timestamps (none are injected; the bundle id is
 * input), float formatting (JCS number rules) and markup attribute order (MarkupNormalizer).
 */
final class BundleBuilder
{
    public const VERSION = 'mra/1.0';

    /**
     * @param array{
     *     bundle_id:string,
     *     markup:string,
     *     css:string,
     *     critical_region:string,
     *     region_policy:string,
     *     attestor_hash:string,
     *     assets?:array<string,string>,
     *     fonts?:list<array{family:string,sha256:string}>
     * } $spec assets maps a path to the raw bytes of the asset
     */
    public function build(array $spec): Bundle
    {
        foreach (['bundle_id', 'markup', 'css', 'critical_region', 'region_policy', 'attestor_hash'] as $field) {
            if (!isset($spec[$field]) || !is_string($spec[$field]) || $spec[$field] === '') {
                throw new InvalidArgumentException("Bundle field missing or empty: {$field}");
            }
        }
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $spec['attestor_hash']) !== 1) {
            throw new InvalidArgumentException('attestor_hash must be sha256:<64 hex>.');
        }

        $markup = MarkupNormalizer::normalize($spec['markup']);
        $css = self::normalizeCss($spec['css']);
        self::assertSelfContained($markup, $css);

        $assets = [];
        foreach ($spec['assets'] ?? [] as $path => $bytes) {
            $assets[] = ['path' => (string) $path, 'sha256' => 'sha256:' . hash('sha256', $bytes)];
        }
        usort($assets, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']));

        $fonts = $spec['fonts'] ?? [];
        usort($fonts, static fn (array $a, array $b): int => strcmp($a['family'] . $a['sha256'], $b['family'] . $b['sha256']));

        $data = [
            'v' => self::VERSION,
            'bundle_id' => $spec['bundle_id'],
            'markup' => $markup,
            'css' => $css,
            'assets' => $assets,
            'fonts' => $fonts,
            'critical_region' => $spec['critical_region'],
            'region_policy' => $spec['region_policy'],
            'attestor_hash' => $spec['attestor_hash'],
        ];
        $canonical = Jcs::encode($data);
        return new Bundle(
            $spec['bundle_id'],
            $canonical,
            'sha256:' . hash('sha256', $canonical),
            $spec['region_policy'],
            $data
        );
    }

    public static function hashOf(string $canonical): string
    {
        return 'sha256:' . hash('sha256', $canonical);
    }

    private static function normalizeCss(string $css): string
    {
        $css = preg_replace('#/\*.*?\*/#s', '', $css) ?? $css;
        $css = preg_replace('/\s+/', ' ', $css) ?? $css;
        $css = preg_replace('/\s*([{};:,>])\s*/', '$1', $css) ?? $css;
        return trim(str_replace(';}', '}', $css));
    }

    /** A bundle that fetches anything at render time is not sealed. */
    private static function assertSelfContained(string $markup, string $css): void
    {
        if (preg_match('~(?:src|href|action|poster|srcset)="\s*(?:https?:|ftp:|//)~i', $markup) === 1) {
            throw new InvalidArgumentException('Markup references an external resource.');
        }
        if (preg_match('#@import|url\(\s*[\'"]?\s*(?:https?:|//|ftp:)#i', $css) === 1) {
            throw new InvalidArgumentException('CSS references an external resource.');
        }
        if (stripos($markup, '<script') !== false) {
            throw new InvalidArgumentException('Sealed markup must not contain scripts.');
        }
    }
}
