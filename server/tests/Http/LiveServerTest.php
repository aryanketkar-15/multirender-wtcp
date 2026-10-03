<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\Config\DatabaseConfig;
use Mra\Repository\Database;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Real HTTP against PHP's built-in server: proves enforcement happens on the server, not in the
 * browser (T1.2.6) and that the live response headers carry the hardening the config promises.
 */
final class LiveServerTest extends TestCase
{
    /** @var resource|null */
    private $process = null;
    private int $port = 0;
    private PDO $pdo;

    protected function setUp(): void
    {
        $this->pdo = Database::connection(DatabaseConfig::fromEnv(true));
        $this->cleanCommittedRows();
        $probe = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
        $addr = (string) stream_socket_get_name($probe, false);
        $this->port = (int) substr($addr, (int) strrpos($addr, ':') + 1);
        fclose($probe);

        $flags = array_filter(explode(' ', (string) getenv('MRA_TEST_PHP_FLAGS')));
        $cmd = [PHP_BINARY, ...$flags, '-S', "127.0.0.1:{$this->port}", '-t', dirname(__DIR__, 2) . '/public'];
        $env = array_merge(getenv(), ['APP_ENV' => 'test']);
        $tmp = sys_get_temp_dir();
        $io = [['pipe', 'r'], ['file', $tmp . '/mra-live.out', 'w'], ['file', $tmp . '/mra-live.err', 'w']];
        $this->process = proc_open($cmd, $io, $pipes, null, $env);
        for ($i = 0; $i < 50; $i++) {
            $sock = @fsockopen('127.0.0.1', $this->port, $e1, $e2, 0.1);
            if ($sock) {
                fclose($sock);
                return;
            }
            usleep(100000);
        }
        $this->fail('Built-in server did not start.');
    }

    protected function tearDown(): void
    {
        if (is_resource($this->process)) {
            proc_terminate($this->process);
            proc_close($this->process);
        }
        $this->cleanCommittedRows();
    }

    /** The live server commits on its own connection, so its rows must be removed explicitly. */
    private function cleanCommittedRows(): void
    {
        foreach (['sessions', 'throttle_event', 'security_log', 'audit_log'] as $table) {
            $this->pdo->exec("DELETE FROM {$table}");
        }
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,headers:list<string>,body:string}
     */
    private function post(string $path, array $body): array
    {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode($body),
            'ignore_errors' => true,
            'timeout' => 10,
        ]]);
        $text = (string) file_get_contents("http://127.0.0.1:{$this->port}{$path}", false, $ctx);
        $headers = $http_response_header ?? [];
        preg_match('#HTTP/\S+ (\d{3})#', $headers[0] ?? '', $m);
        return ['status' => (int) ($m[1] ?? 0), 'headers' => $headers, 'body' => $text];
    }

    public function testLiveSetCookieHeaderCarriesAllThreeHardeningAttributes(): void // T1.4.2 (live header)
    {
        $text = (string) file_get_contents("http://127.0.0.1:{$this->port}/api/session", false, stream_context_create([
            'http' => ['ignore_errors' => true, 'timeout' => 10],
        ]));
        $this->assertArrayHasKey('csrf_token', json_decode($text, true));
        $cookie = '';
        foreach ($http_response_header ?? [] as $header) {
            if (stripos($header, 'Set-Cookie:') === 0) {
                $cookie = $header;
            }
        }
        $this->assertStringStartsWith('Set-Cookie: mra_sid=', $cookie);
        foreach (['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/'] as $attribute) {
            $this->assertStringContainsString('; ' . $attribute, $cookie);
        }
        $this->assertStringNotContainsString('Domain', $cookie);
    }

    public function testServerEnforcesValidationWithoutTheBrowser(): void // T1.2.6
    {
        $res = $this->post('/api/register', [
            'name' => 'Curl User',
            'email' => 'not-an-email',
            'password' => 'correct horse 9 battery',
            'password_confirm' => 'correct horse 9 battery',
            'accept_terms' => true,
        ]);
        $this->assertSame(422, $res['status']);
        $data = json_decode($res['body'], true);
        $this->assertSame('Enter a valid email address', $data['fields']['email']);
    }

    public function testEveryRuleFailsIdenticallyOverHttp(): void
    {
        $res = $this->post('/api/register', ['name' => 'x', 'email' => '', 'password' => 'short', 'password_confirm' => 'other']);
        $this->assertSame(422, $res['status']);
        $fields = array_keys(json_decode($res['body'], true)['fields']);
        sort($fields);
        $this->assertSame(['accept_terms', 'email', 'name', 'password', 'password_confirm'], $fields);
    }

    public function testResponsesCarryHardeningHeadersAndNoServerErrorDetail(): void
    {
        $res = $this->post('/api/register', []);
        $joined = strtolower(implode("\n", $res['headers']));
        $this->assertStringContainsString('x-content-type-options: nosniff', $joined);
        $this->assertStringContainsString('cache-control: no-store', $joined);
        $this->assertStringNotContainsString('stack trace', strtolower($res['body']));
        $this->assertStringNotContainsString('pdoexception', strtolower($res['body']));
    }
}
