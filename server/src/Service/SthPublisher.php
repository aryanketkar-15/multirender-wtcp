<?php

declare(strict_types=1);

namespace Mra\Service;

use Mra\Crypto\Jcs;
use Mra\Repository\BaseRepository;
use Mra\Support\Clock;
use Mra\Support\SystemClock;
use PDO;

/**
 * Signs the current tree head and sends it to the witness, once per tree size. Meant to run on a
 * schedule (bin/publish_sth.php): a head that never leaves the server proves little.
 */
final class SthPublisher extends BaseRepository
{
    public function __construct(
        PDO $pdo,
        private readonly SthService $sth,
        private readonly WitnessTarget $witness,
        private readonly Clock $clock
    ) {
        parent::__construct($pdo);
    }

    /**
     * @return array{tree_size:int,root_hash:string,reference:string}|null null when this tree size
     *     has already been published to this witness
     */
    public function publish(): ?array
    {
        $head = $this->sth->sign();
        $already = $this->run(
            'SELECT COUNT(*) FROM mra_sth_publication WHERE sth_id = ? AND target = ?',
            [$head['id'], $this->witness->name()]
        )->fetchColumn();
        if ((int) $already > 0) {
            return null;
        }
        $size = (int) $head['record']['tree_size'];
        $reference = $this->witness->publish(
            $size,
            Jcs::encode(['record' => $head['record'], 'signature' => $head['signature']])
        );
        $this->run(
            'INSERT INTO mra_sth_publication (sth_id, target, reference, published_at) VALUES (?, ?, ?, ?)',
            [$head['id'], $this->witness->name(), $reference, SystemClock::db($this->clock->now())]
        );
        return ['tree_size' => $size, 'root_hash' => (string) $head['record']['root_hash'], 'reference' => $reference];
    }
}
