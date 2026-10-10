<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Http\Kernel;
use Mra\Service\SessionService;
use Mra\Tests\TestCase;

final class AuthorizationTest extends TestCase
{
    private App $app;
    private Kernel $kernel;
    private int $aliceId;
    private int $bobId;
    /** @var array{token:string,csrf:string} */
    private array $alice;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $this->aliceId = $this->app->users->create('alice@example.com', 'Alice', 'h');
        $this->bobId = $this->app->users->create('bob@example.com', 'Bob', 'h');
        $this->app->packs->create('pack-alice', $this->aliceId);
        $this->app->packs->create('pack-bob', $this->bobId);
        $made = $this->app->sessions->create($this->aliceId);
        $this->alice = ['token' => $made['token'], 'csrf' => $made['session']->csrfToken];
    }

    private function get(string $path, ?array $session = null, array $body = []): \Mra\Http\Response
    {
        $cookies = $session === null ? [] : [SessionService::COOKIE => $session['token']];
        return $this->call($this->kernel, 'GET', $path, $body, '198.51.100.30', [], $cookies);
    }

    private function denials(): int
    {
        return (int) $this->pdo->query(
            "SELECT COUNT(*) FROM security_log WHERE event_type = 'authz.cross_subject_denied'"
        )->fetchColumn();
    }

    public function testOwnerReachesTheirOwnPack(): void // T1.5.1
    {
        $res = $this->get('/api/pack/pack-alice', $this->alice);
        $this->assertSame(200, $res->status);
        $this->assertSame('pack-alice', $res->data()['pack_id']);
        $this->assertSame(200, $this->get('/api/pack/pack-alice/download', $this->alice)->status);
    }

    public function testAnotherUsersPackIsForbiddenAndLogged(): void // T1.5.2
    {
        $res = $this->get('/api/pack/pack-bob', $this->alice);
        $this->assertSame(403, $res->status);
        $this->assertSame(1, $this->denials());
        $this->assertSame(403, $this->get('/api/pack/pack-bob/download', $this->alice)->status);
        $this->assertSame(2, $this->denials());
    }

    public function testNonexistentPackReturns404(): void // T5.1.7
    {
        $unknown = $this->get('/api/pack/pack-does-not-exist', $this->alice);
        $this->assertSame(404, $unknown->status);
    }

    public function testUnauthenticatedRequestsAreDenied(): void // T1.5.3
    {
        $this->assertSame(401, $this->get('/api/pack/pack-alice')->status);
        $anon = $this->app->sessions->create();
        $this->assertSame(401, $this->get('/api/pack/pack-alice', ['token' => $anon['token'], 'csrf' => ''])->status);
    }

    public function testIdentityInTheRequestBodyOrQueryIsIgnored(): void // T1.5.4
    {
        $res = $this->get('/api/pack/pack-bob', $this->alice, ['user_id' => $this->bobId, 'owner' => 'bob@example.com']);
        $this->assertSame(403, $res->status, 'claiming to be the owner in the body changes nothing');
        $own = $this->get('/api/pack/pack-alice', $this->alice, ['user_id' => $this->bobId]);
        $this->assertSame(200, $own->status, 'and claiming to be someone else does not revoke real ownership');
    }

    public function testRouteParameterCannotEscapeIntoOtherPaths(): void
    {
        $this->assertSame(404, $this->get('/api/pack/a/b', $this->alice)->status);
        $this->assertSame(404, $this->get('/api/pack/%7Bid%7D', $this->alice)->status);
        $this->assertSame(404, $this->get('/api/pack/', $this->alice)->status);
        $this->assertSame(404, $this->get('/api/pack/{id}', $this->alice)->status);
    }

    public function testEveryPackRouteIsProtected(): void
    {
        foreach (['/api/pack/pack-alice', '/api/pack/pack-alice/download'] as $path) {
            $this->assertSame(401, $this->get($path)->status, $path);
        }
    }
}
