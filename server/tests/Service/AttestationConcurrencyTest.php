<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\App;
use Mra\Http\Kernel;
use Mra\Http\Request;
use Mra\Repository\Database;
use Mra\Service\SessionService;
use Mra\Tests\Support\ClientSimulator;
use Mra\Tests\Support\ScratchDatabase;
use PHPUnit\Framework\TestCase;

/**
 * T4.3.10: one nonce, several simultaneous attestations, exactly one success. Uses real commits in
 * a scratch database and real operating-system processes, so the atomic nonce consumption is run,
 * not reasoned about.
 */
final class AttestationConcurrencyTest extends TestCase
{
    private const DB = 'mra_scratch_attest';

    /** @var array<string,string|false> */
    private array $savedEnv = [];

    protected function setUp(): void
    {
        ScratchDatabase::create(self::DB);
        foreach (['APP_ENV' => 'test', 'DB_TEST_NAME' => self::DB, 'ATTESTOR_BASE_URL' => 'http://attestor.test'] as $k => $v) {
            $this->savedEnv[$k] = getenv($k);
            putenv("{$k}={$v}");
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->savedEnv as $k => $v) {
            putenv($v === false ? $k : "{$k}={$v}");
        }
        ScratchDatabase::drop(self::DB);
    }

    public function testSimultaneousSubmissionsOfOneAttestationYieldExactlyOneSuccess(): void
    {
        $app = App::fromEnv();
        $app->attestors->register([
            'version' => '1.0.0',
            'file' => 'mra-attestor-1.0.0.js',
            'sha384' => 'sha384-' . str_repeat('A', 64),
            'sha256' => 'sha256:' . str_repeat('c', 64),
        ]);
        $userId = $app->users->create('race@example.com', 'Race', 'h');
        $app->users->markVerified($userId);
        $made = $app->sessions->create($userId);
        $kernel = new Kernel($app);
        $client = ClientSimulator::create();
        $headers = ['x-csrf-token' => $made['session']->csrfToken];
        $cookies = [SessionService::COOKIE => $made['token']];

        for ($round = 0; $round < 4; $round++) {
            $kernel->handle(new Request('POST', '/api/client-key', ['fingerprint' => $client->fingerprint], $headers, $cookies, '198.51.100.9'));
            $bundle = $kernel->handle(new Request('GET', '/api/bundle', [], $headers, $cookies, '198.51.100.9'))->data();
            $this->assertArrayHasKey('commitment_hash', $bundle, 'round ' . $round);

            $results = $this->race([
                'token' => $made['token'],
                'csrf' => $made['session']->csrfToken,
                'body' => $client->body($bundle),
            ]);
            sort($results);
            $this->assertSame(['201 ok', '409 REPLAY_DETECTED', '409 REPLAY_DETECTED'], $results, "round {$round}");
            $this->assertSame($round + 1, $app->attestations->count(), 'exactly one row per commitment');
        }
    }

    /**
     * @param array<string,mixed> $spec
     * @return list<string>
     */
    private function race(array $spec): array
    {
        $file = tempnam(sys_get_temp_dir(), 'mra-attest-') ?: throw new \RuntimeException('tmp');
        file_put_contents($file, json_encode($spec));
        $flags = array_filter(explode(' ', (string) getenv('MRA_TEST_PHP_FLAGS')));
        $script = dirname(__DIR__) . '/Support/attest_child.php';
        $start = microtime(true) + 2.0;
        $procs = [];
        $pipes = [];
        $env = array_merge(getenv(), ['APP_ENV' => 'test', 'DB_TEST_NAME' => self::DB, 'ATTESTOR_BASE_URL' => 'http://attestor.test']);
        for ($i = 0; $i < 3; $i++) {
            $cmd = [PHP_BINARY, ...$flags, $script, $file, (string) $start];
            $procs[$i] = proc_open($cmd, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes[$i], null, $env);
        }
        $out = [];
        foreach ($procs as $i => $proc) {
            $out[] = trim((string) stream_get_contents($pipes[$i][1]));
            $err = trim((string) stream_get_contents($pipes[$i][2]));
            $this->assertSame('', $err, 'child stderr: ' . $err);
            proc_close($proc);
        }
        unlink($file);
        return $out;
    }
}
