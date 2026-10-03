<?php

declare(strict_types=1);

namespace Mra\Service;

use RuntimeException;

/**
 * Publishes tree heads as commits to a git repository (the `mra-sth-witness` repository by the
 * playbook default, open item O-02). Each head is `sth/<size>.json`, and `latest.json` always holds
 * the newest. Because git history is hash-chained and the repository lives elsewhere, rewriting an
 * earlier head after the fact would be visible to anyone who has a clone.
 *
 * The directory is a working clone. Push credentials, if any, belong to the clone's own git
 * configuration and are never read or stored here.
 */
final class GitWitness implements WitnessTarget
{
    public function __construct(
        private readonly string $directory,
        private readonly bool $push = false,
        private readonly string $remote = 'origin',
        private readonly string $branch = 'main',
        private readonly string $authorName = 'mra-sth-bot',
        private readonly string $authorEmail = 'mra-sth-bot@users.noreply.github.com'
    ) {
    }

    public function name(): string
    {
        return 'git:' . basename($this->directory);
    }

    public function publish(int $treeSize, string $json): string
    {
        $dir = $this->directory . '/sth';
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Witness directory is not writable.');
        }
        $body = $json . "\n";
        $file = sprintf('sth/%010d.json', $treeSize);
        file_put_contents($this->directory . '/' . $file, $body);
        file_put_contents($this->directory . '/latest.json', $body);

        $this->git(['add', $file, 'latest.json']);
        $this->git([
            '-c', 'user.name=' . $this->authorName,
            '-c', 'user.email=' . $this->authorEmail,
            '-c', 'commit.gpgsign=false',
            'commit', '-m', "sth: tree size {$treeSize}",
        ]);
        $commit = trim($this->git(['rev-parse', 'HEAD']));
        if ($this->push) {
            $this->git(['push', $this->remote, 'HEAD:' . $this->branch]);
        }
        return $commit;
    }

    /** @param list<string> $args */
    private function git(array $args): string
    {
        $process = proc_open(
            ['git', '-C', $this->directory, ...$args],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes
        );
        if (!is_resource($process)) {
            throw new RuntimeException('Could not start git.');
        }
        $out = (string) stream_get_contents($pipes[1]);
        $err = (string) stream_get_contents($pipes[2]);
        if (proc_close($process) !== 0) {
            // git's message names paths and refs, never credentials supplied by this process.
            throw new RuntimeException('git ' . implode(' ', $args) . ' failed: ' . trim($err));
        }
        return $out;
    }
}
