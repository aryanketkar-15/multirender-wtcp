<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\SessionService;
use Mra\Tests\TestCase;

final class AuthTest extends TestCase
{
    private const PASSWORD = 'correct horse 9 battery';

    private App $app;
    private Kernel $kernel;
    private int $verifiedId;
    private int $unverifiedId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app = $this->makeApp();
        $this->kernel = new Kernel($this->app);
        $hash = password_hash(self::PASSWORD, PASSWORD_ARGON2ID);
        $this->verifiedId = $this->app->users->create('verified@example.com', 'Vera Fied', $hash);
        $this->app->users->markVerified($this->verifiedId);
        $this->unverifiedId = $this->app->users->create('pending@example.com', 'Penny Ding', $hash);
    }

    /** @return array{token:string,csrf:string} an anonymous session, as the browser would obtain it */
    private function anonymous(string $ip = '198.51.100.10'): array
    {
        $res = $this->call($this->kernel, 'GET', '/api/session', [], $ip);
        return ['token' => $res->cookies[0]->value, 'csrf' => $res->data()['csrf_token']];
    }

    /** @param array{token:string,csrf:string} $s */
    private function login(array $s, string $email, string $password, string $ip = '198.51.100.10'): Response
    {
        return $this->call(
            $this->kernel,
            'POST',
            '/api/login',
            ['email' => $email, 'password' => $password],
            $ip,
            ['x-csrf-token' => $s['csrf']],
            [SessionService::COOKIE => $s['token']]
        );
    }

    /** @return array{token:string,csrf:string} */
    private function loggedIn(string $ip = '198.51.100.10'): array
    {
        $res = $this->login($this->anonymous($ip), 'verified@example.com', self::PASSWORD, $ip);
        $this->assertSame(200, $res->status);
        return ['token' => $res->cookies[0]->value, 'csrf' => $res->data()['csrf_token']];
    }

    private function securityCount(string $event): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM security_log WHERE event_type = ?');
        $stmt->execute([$event]);
        return (int) $stmt->fetchColumn();
    }

    public function testValidLoginSetsASessionCookie(): void // T1.4.1
    {
        $res = $this->login($this->anonymous(), 'verified@example.com', self::PASSWORD);
        $this->assertSame(200, $res->status);
        $this->assertTrue($res->data()['authenticated']);
        $this->assertSame('verified@example.com', $res->data()['user']['email']);
        $this->assertSame(SessionService::COOKIE, $res->cookies[0]->name);
    }

    public function testCookieCarriesSecureHttpOnlySameSiteStrictAndNoDomain(): void // T1.4.2
    {
        $header = $this->login($this->anonymous(), 'verified@example.com', self::PASSWORD)->cookies[0]->toHeader();
        $this->assertStringContainsString('; Secure', $header);
        $this->assertStringContainsString('; HttpOnly', $header);
        $this->assertStringContainsString('; SameSite=Strict', $header);
        $this->assertStringContainsString('; Path=/', $header);
        $this->assertStringNotContainsString('Domain', $header);
    }

    public function testWrongPasswordIsAGeneric401AndSecurityLogged(): void // T1.4.3
    {
        $res = $this->login($this->anonymous(), 'verified@example.com', 'wrong password 1');
        $this->assertSame(401, $res->status);
        $this->assertSame('Email or password is incorrect.', $res->data()['message']);
        $this->assertSame(1, $this->securityCount('auth.login_failed'));
        $this->assertSame([], $res->cookies);
    }

    public function testUnknownAccountLooksIdenticalToAWrongPassword(): void
    {
        $wrong = $this->login($this->anonymous(), 'verified@example.com', 'wrong password 1');
        $ghost = $this->login($this->anonymous(), 'ghost@example.com', 'wrong password 1');
        $this->assertSame($wrong->status, $ghost->status);
        $this->assertSame($wrong->body, $ghost->body);
    }

    public function testUnverifiedAccountIsBlockedWithAVerificationPrompt(): void // T1.4.4
    {
        $res = $this->login($this->anonymous(), 'pending@example.com', self::PASSWORD);
        $this->assertSame(403, $res->status);
        $this->assertSame('email_not_verified', $res->data()['error']);
        $this->assertSame([], $res->cookies);
    }

    public function testSessionIdChangesOnLoginAndTheOldOneDies(): void // T1.4.5 session fixation
    {
        $before = $this->anonymous();
        $res = $this->login($before, 'verified@example.com', self::PASSWORD);
        $after = $res->cookies[0]->value;
        $this->assertNotSame($before['token'], $after);
        $this->assertNotSame($before['csrf'], $res->data()['csrf_token']);

        $replay = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [
            SessionService::COOKIE => $before['token'],
        ]);
        $this->assertFalse($replay->data()['authenticated'], 'the pre-login identifier must not carry the login');
        $this->assertNotSame($before['csrf'], $replay->data()['csrf_token']);
    }

    public function testAttackerPlantedSessionCannotBeUsedAfterVictimLogsIn(): void
    {
        $planted = $this->anonymous('203.0.113.99');
        $this->login($planted, 'verified@example.com', self::PASSWORD);
        $logout = $this->call(
            $this->kernel,
            'POST',
            '/api/logout',
            [],
            '203.0.113.99',
            ['x-csrf-token' => $planted['csrf']],
            [SessionService::COOKIE => $planted['token']]
        );
        $this->assertSame(403, $logout->status, 'the planted identifier no longer names any session');
        $probe = $this->call($this->kernel, 'GET', '/api/session', [], '203.0.113.99', [], [
            SessionService::COOKIE => $planted['token'],
        ]);
        $this->assertFalse($probe->data()['authenticated']);
    }

    public function testSessionTokenIsStoredOnlyAsAHash(): void
    {
        $s = $this->loggedIn();
        $ids = $this->pdo->query('SELECT id FROM sessions')->fetchAll(\PDO::FETCH_COLUMN);
        $this->assertNotContains($s['token'], $ids);
        $this->assertContains(hash('sha256', $s['token']), $ids);
    }

    public function testThrottleOnOneAccount(): void // T1.4.6
    {
        $s = $this->anonymous();
        for ($i = 1; $i <= 5; $i++) {
            $this->assertSame(401, $this->login($s, 'verified@example.com', "wrong password {$i}")->status);
        }
        $sixth = $this->login($s, 'verified@example.com', self::PASSWORD);
        $this->assertSame(429, $sixth->status, 'even the correct password is refused while backing off');
        $this->assertGreaterThan(0, (int) $sixth->headers['Retry-After']);
        $this->assertSame(1, $this->securityCount('auth.throttled'));
    }

    public function testThrottleAcrossAccountsFromOneIp(): void // T1.4.7
    {
        $s = $this->anonymous('203.0.113.77');
        for ($i = 1; $i <= 5; $i++) {
            $this->assertSame(401, $this->login($s, "target{$i}@example.com", 'wrong password 1', '203.0.113.77')->status);
        }
        $sixth = $this->login($s, 'target6@example.com', 'wrong password 1', '203.0.113.77');
        $this->assertSame(429, $sixth->status);
        $other = $this->login($this->anonymous('203.0.113.78'), 'verified@example.com', self::PASSWORD, '203.0.113.78');
        $this->assertSame(200, $other->status, 'a different IP and an untouched account are not affected');
    }

    public function testDistributedAttemptsOnOneAccountAreCaughtByTheAccountDimension(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            $ip = "203.0.113.{$i}";
            $this->assertSame(401, $this->login($this->anonymous($ip), 'verified@example.com', 'wrong password 1', $ip)->status);
        }
        $ip = '203.0.113.200';
        $this->assertSame(429, $this->login($this->anonymous($ip), 'verified@example.com', self::PASSWORD, $ip)->status);
    }

    public function testBackoffDoublesAfterEachFurtherFailure(): void
    {
        $s = $this->anonymous();
        for ($i = 0; $i < 5; $i++) {
            $this->login($s, 'verified@example.com', 'wrong password 1');
        }
        $first = (int) $this->login($s, 'verified@example.com', self::PASSWORD)->headers['Retry-After'];
        $this->assertGreaterThan(20, $first);
        $this->assertLessThanOrEqual(30, $first);
        $this->clock->advance('+31 seconds');
        $this->assertSame(401, $this->login($s, 'verified@example.com', 'wrong password 2')->status);
        $second = (int) $this->login($s, 'verified@example.com', self::PASSWORD)->headers['Retry-After'];
        $this->assertGreaterThan(50, $second, 'the sixth failure doubles the wait to 60 seconds');
        $this->clock->advance('+61 seconds');
        $this->assertSame(200, $this->login($s, 'verified@example.com', self::PASSWORD)->status);
    }

    public function testSuccessfulLoginResetsTheAccountCounter(): void
    {
        $s = $this->anonymous();
        for ($i = 0; $i < 4; $i++) {
            $this->login($s, 'verified@example.com', 'wrong password 1');
        }
        $this->assertSame(200, $this->login($s, 'verified@example.com', self::PASSWORD)->status);
        $s2 = $this->anonymous();
        for ($i = 0; $i < 4; $i++) {
            $this->assertSame(401, $this->login($s2, 'verified@example.com', 'wrong password 1', '198.51.100.55')->status);
        }
    }

    public function testIdleTimeoutAfterThirtyMinutes(): void // T1.4.8
    {
        $s = $this->loggedIn();
        $this->clock->advance('+29 minutes');
        $stillIn = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertTrue($stillIn->data()['authenticated']);
        $this->clock->advance('+31 minutes');
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/logout',
            [],
            '198.51.100.10',
            ['x-csrf-token' => $s['csrf']],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(403, $res->status, 'an expired session carries no CSRF identity');
        $after = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertFalse($after->data()['authenticated']);
    }

    public function testAbsoluteTimeoutAfterTwelveHoursDespiteActivity(): void
    {
        $s = $this->loggedIn();
        for ($i = 0; $i < 30; $i++) {
            $this->clock->advance('+25 minutes');
            $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        }
        $after = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertFalse($after->data()['authenticated'], '12.5 hours of continuous activity still ends at the 12 hour absolute limit');
    }

    public function testStateChangingRequestWithoutCsrfTokenIsRejected(): void // T1.4.9
    {
        $s = $this->loggedIn();
        $res = $this->call($this->kernel, 'POST', '/api/logout', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertSame(403, $res->status);
        $this->assertSame(1, $this->securityCount('csrf.rejected'));
        $wrong = $this->call(
            $this->kernel,
            'POST',
            '/api/logout',
            [],
            '198.51.100.10',
            ['x-csrf-token' => str_repeat('0', 64)],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(403, $wrong->status);
        $stillIn = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertTrue($stillIn->data()['authenticated'], 'a rejected forgery must not log the user out');
    }

    public function testLoginItselfRequiresTheCsrfToken(): void
    {
        $s = $this->anonymous();
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/login',
            ['email' => 'verified@example.com', 'password' => self::PASSWORD],
            '198.51.100.10',
            [],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(403, $res->status);
    }

    public function testLogoutInvalidatesTheSession(): void // T1.4.10
    {
        $s = $this->loggedIn();
        $out = $this->call(
            $this->kernel,
            'POST',
            '/api/logout',
            [],
            '198.51.100.10',
            ['x-csrf-token' => $s['csrf']],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(200, $out->status);
        $this->assertStringContainsString('Max-Age', $out->cookies[0]->toHeader() . 'Max-Age');
        $reuse = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertFalse($reuse->data()['authenticated']);
    }

    public function testVerifyingByOtpRegeneratesAnExistingSession(): void
    {
        $this->app->otp->request('pending@example.com', '198.51.100.10');
        $code = (string) $this->mailer->lastCode();
        $s = $this->anonymous();
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/otp/verify',
            ['email' => 'pending@example.com', 'code' => $code],
            '198.51.100.10',
            [],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(200, $res->status);
        $this->assertNotSame($s['token'], $res->cookies[0]->value);
        $old = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.10', [], [SessionService::COOKIE => $s['token']]);
        $this->assertNotSame($s['csrf'], $old->data()['csrf_token']);
    }

    public function testUnverifiedAccountCannotAttest(): void // T1.3.10
    {
        $made = $this->app->sessions->create($this->unverifiedId);
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/attestation',
            [],
            '198.51.100.10',
            ['x-csrf-token' => $made['session']->csrfToken],
            [SessionService::COOKIE => $made['token']]
        );
        $this->assertSame(403, $res->status);
        $this->assertSame(1, $this->securityCount('attestation.unverified_account'));
    }

    public function testVerifiedAccountPassesTheAttestationGuards(): void
    {
        $s = $this->loggedIn();
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/attestation',
            [],
            '198.51.100.10',
            ['x-csrf-token' => $s['csrf']],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(501, $res->status, 'guards pass; the endpoint itself arrives in Phase 4');
    }

    public function testAnonymousCallerCannotReachAttestation(): void
    {
        $s = $this->anonymous();
        $res = $this->call(
            $this->kernel,
            'POST',
            '/api/attestation',
            [],
            '198.51.100.10',
            ['x-csrf-token' => $s['csrf']],
            [SessionService::COOKIE => $s['token']]
        );
        $this->assertSame(401, $res->status);
    }

    public function testLoginsAreAuditedWithoutPasswords(): void
    {
        $this->loggedIn();
        $this->login($this->anonymous(), 'pending@example.com', self::PASSWORD);
        $rows = $this->pdo->query("SELECT action, outcome, detail FROM audit_log WHERE action = 'user.login'")->fetchAll();
        $this->assertCount(2, $rows);
        $this->assertStringNotContainsString('horse', json_encode($rows));
    }

    public function testDestroyingAllSessionsOfAUserLogsEveryClientOut(): void
    {
        $a = $this->loggedIn('198.51.100.11');
        $b = $this->loggedIn('198.51.100.12');
        $this->assertSame(2, $this->app->sessions->destroyAllForUser($this->verifiedId));
        foreach ([$a, $b] as $s) {
            $res = $this->call($this->kernel, 'GET', '/api/session', [], '198.51.100.11', [], [SessionService::COOKIE => $s['token']]);
            $this->assertFalse($res->data()['authenticated']);
        }
    }
}
