<?php

declare(strict_types=1);

namespace Mra\Service;

/** Somewhere outside the consent server's control that records each signed tree head. */
interface WitnessTarget
{
    public function name(): string;

    /**
     * @param string $json canonical JSON of {record, signature}
     * @return string a reference to the published item (for a git witness, the commit id)
     */
    public function publish(int $treeSize, string $json): string;
}
