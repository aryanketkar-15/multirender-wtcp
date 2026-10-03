<?php

declare(strict_types=1);

namespace Mra\Model;

/** A sealed render bundle: the canonical JSON text and its SHA-256 hash. Immutable. */
final class Bundle
{
    /** @param array<string,mixed> $data the bundle object that was canonicalised */
    public function __construct(
        public readonly string $bundleId,
        public readonly string $canonical,
        public readonly string $hash,
        public readonly string $regionPolicy,
        public readonly array $data
    ) {
    }
}
