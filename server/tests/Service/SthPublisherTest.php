<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\Crypto\Jcs;
use Mra\Service\GitWitness;
use Mra\Service\MerkleLog;
use Mra\Service\MerkleProof;
use Mra\Service\SthPublisher;
use Mra\Tests\TestCase;

/**
 * T4.4.7: signed tree heads reach a witness repository outside the application. A real git
 * repository stands in for `mra-sth-witness`: a bare "remote" and a working clone that pushes to it.
 */
final class SthPublisherTest extends TestCase
{
    private string $base = '';
    private string $remote = '';
    private string $work = '';

    protected function setUp(): void
    {
        parent::setUp();
        exec('git --version', $out, $code);
        if ($code !== 0) {
            $this->markTestSkipped('git is not available');
        }
        $this->base = sys_get_temp_dir() . '/mra-witness-' . bin2hex(random_bytes(4));
        $this->remote = $this->base . '/remote.git';
        $this->work = $this->base . '/work';
        mkdir($this->base, 0775, true);
        $this->git(['init', '--bare', '--initial-branch=main', $this->remote]);
        $this->git(['init', '--initial-branch=main', $this->work]);
        $this->git(['-C', $this->work, 'remote', 'add', 'origin', $this->remote]);
    }

    protected function tearDown(): void
    {
        if ($this->base !== '' && is_dir($this->base)) {
            $this->removeTree($this->base);
        }
        parent::tearDown();
    }

    /** @param list<string> $args */
    private function git(array $args): string
    {
        $process = proc_open(['git', ...$args], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $out = trim((string) stream_get_contents($pipes[1]));
        $err = trim((string) stream_get_contents($pipes[2]));
        $this->assertSame(0, proc_close($process), $err);
        return $out;
    }

    private function removeTree(string $dir): void
    {
        foreach (
            new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST
            ) as $item
        ) {
            @chmod($item->getPathname(), 0777);
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($dir);
    }

    private function grow(int $by): void
    {
        $log = new MerkleLog($this->pdo, $this->clock);
        for ($i = 0; $i < $by; $i++) {
            $log->append(static fn (int $n): array => [
                'kind' => 'test',
                'ref_hash' => 'sha256:' . hash('sha256', 'w' . $n . random_bytes(4)),
            ]);
        }
    }

    private function publisher(): SthPublisher
    {
        $app = $this->makeApp();
        return new SthPublisher($this->pdo, $app->sth, new GitWitness($this->work, true), $this->clock);
    }

    public function testASignedHeadIsCommittedAndPushedToTheWitness(): void
    {
        $this->grow(5);
        $result = $this->publisher()->publish();
        $this->assertNotNull($result);
        $this->assertSame(5, $result['tree_size']);

        $log = $this->git(['--git-dir', $this->remote, 'log', '--format=%s', 'main']);
        $this->assertSame('sth: tree size 5', $log);
        $this->assertSame($result['reference'], $this->git(['--git-dir', $this->remote, 'rev-parse', 'main']));

        $published = json_decode($this->git(['--git-dir', $this->remote, 'show', 'main:latest.json']), true);
        $this->assertSame(5, $published['record']['tree_size']);
        $app = $this->makeApp();
        $this->assertTrue($app->sth->verify($published['record'], $published['signature']), 'the published head verifies');
        $this->assertSame('sha256:' . bin2hex($app->log->root(5)), $published['record']['root_hash']);
        $this->assertSame(Jcs::encode($published), trim($this->git(['--git-dir', $this->remote, 'show', 'main:sth/0000000005.json'])));
    }

    public function testNothingIsPublishedTwiceForTheSameTreeSize(): void
    {
        $this->grow(3);
        $publisher = $this->publisher();
        $this->assertNotNull($publisher->publish());
        $this->assertNull($publisher->publish());
        $this->assertSame('1', $this->git(['--git-dir', $this->remote, 'rev-list', '--count', 'main']));
    }

    public function testEachGrowthAddsACommitAndTheHeadsStayConsistent(): void
    {
        $this->grow(4);
        $publisher = $this->publisher();
        $publisher->publish();
        $this->grow(7);
        $publisher->publish();
        $this->assertSame('2', $this->git(['--git-dir', $this->remote, 'rev-list', '--count', 'main']));

        $old = json_decode($this->git(['--git-dir', $this->remote, 'show', 'main~1:latest.json']), true)['record'];
        $new = json_decode($this->git(['--git-dir', $this->remote, 'show', 'main:latest.json']), true)['record'];
        $this->assertSame([4, 11], [$old['tree_size'], $new['tree_size']]);

        $log = $this->makeApp()->log;
        $this->assertTrue(MerkleProof::verifyConsistency(
            4,
            11,
            substr($old['root_hash'], 7),
            substr($new['root_hash'], 7),
            $log->consistencyProof(4, 11)
        ), 'the two published heads are provably one append-only history');
    }

    public function testThePublicationIsRecordedAndNamesTheCommit(): void
    {
        $this->grow(2);
        $result = $this->publisher()->publish();
        $row = $this->pdo->query('SELECT target, reference FROM mra_sth_publication')->fetch();
        $this->assertStringStartsWith('git:', $row['target']);
        $this->assertSame($result['reference'], $row['reference']);
    }

    public function testACommitCommitsToTheBotIdentityNotToAnyDeveloper(): void
    {
        $this->grow(2);
        $this->publisher()->publish();
        $this->assertSame(
            'mra-sth-bot <mra-sth-bot@users.noreply.github.com>',
            $this->git(['--git-dir', $this->remote, 'log', '-1', '--format=%an <%ae>', 'main'])
        );
    }

    public function testAFailingWitnessIsReportedAndNotRecordedAsPublished(): void
    {
        $this->grow(2);
        $app = $this->makeApp();
        $broken = new GitWitness($this->base . '/does-not-exist', true);
        $publisher = new SthPublisher($this->pdo, $app->sth, $broken, $this->clock);
        try {
            $publisher->publish();
            $this->fail('expected a failure');
        } catch (\Throwable) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM mra_sth_publication')->fetchColumn());
    }
}
