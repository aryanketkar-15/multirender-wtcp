<?php

declare(strict_types=1);

namespace Mra\Tests\Http;

use Mra\App;
use Mra\Http\Kernel;
use Mra\Http\Response;
use Mra\Service\SessionService;
use Mra\Tests\Support\GoogleTokenFactory;
use Mra\Tests\TestCase;

/** Sign in and sign up with Google through the real kernel, with Google's part played locally. */
final class GoogleSignInTest extends TestCase
{
    private const PASSWORD = 'correct horse 9 battery';

    private GoogleTokenFactory $google;
    private App $app;
    private Kernel $kernel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->google = new GoogleTokenFactory($this->clock);
        $this->app = $this->makeApp($this->google->verifier(), GoogleTokenFactory::CLIENT_ID);
        $this->kernel = new Kernel($this->app);
    }

    /** @return array{token:string,csrf:string} */
    private function anonymous(string $ip = '198.51.100.20'): array
    {
        $res = $this->call($this->kernel, 'GET', '/api/session', [], $ip);
        return ['token' => $res->cookies[0]->value, 'csrf' => $res->data()['csrf_token']];
    }

    private function signInWith(string $credential, ?array $session = null, string $ip = '198.51.100.20'): Response
    {
        $s = $session ?? $this->anonymous($ip);
        return $this->call(
            $this->kernel,
            'POST',
            '/api/auth/google',
            ['credential' => $credential],
            $ip,
            ['x-csrf-token' => $s['csrf']],
            [SessionService::COOKIE => $s['token']]
        );
    }

    /**
     * @param array<string,mixed> $body
     * @param array{token:string,csrf:string} $session
     */
    private function post(string $path, array $body, array $session, string $ip, bool $withCsrf = true): Response
    {
        return $this->call(
            $this->kernel,
            'POST',
            $path,
            $body,
            $ip,
            $withCsrf ? ['x-csrf-token' => $session['csrf']] : [],
            [SessionService::COOKIE => $session['token']]
        );
    }

    private function userCount(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    }

    public function testTheConfigEndpointAdvertisesGoogleOnlyWhenItIsConfigured(): void
    {
        $this->assertSame(GoogleTokenFactory::CLIENT_ID, $this->call($this->kernel, 'GET', '/api/auth/config')->data()['google_client_id']);

        $plain = new Kernel($this->makeApp());
        $this->assertNull($this->call($plain, 'GET', '/api/auth/config')->data()['google_client_id']);
    }

    public function testWithoutConfigurationTheEndpointDoesNotExist(): void
    {
        $plain = new Kernel($this->makeApp());
        $s = $this->call($plain, 'GET', '/api/session', [], '198.51.100.21');
        $res = $this->call(
            $plain,
            'POST',
            '/api/auth/google',
            ['credential' => $this->google->token()],
            '198.51.100.21',
            ['x-csrf-token' => $s->data()['csrf_token']],
            [SessionService::COOKIE => $s->cookies[0]->value]
        );
        $this->assertSame(404, $res->status);
    }

    public function testTheCsrfTokenIsRequired(): void
    {
        $s = $this->anonymous();
        $res = $this->post('/api/auth/google', ['credential' => $this->google->token()], $s, '198.51.100.20', false);
        $this->assertSame(403, $res->status);
        $this->assertSame(0, $this->userCount());
    }

    public function testTheFirstSignInCreatesAVerifiedAccountAndStartsASession(): void
    {
        $anon = $this->anonymous();
        $res = $this->signInWith($this->google->token(), $anon);
        $this->assertSame(200, $res->status);
        $this->assertTrue($res->data()['authenticated']);
        $this->assertTrue($res->data()['created']);
        $this->assertTrue($res->data()['user']['verified'], 'Google has verified the address');
        $this->assertSame('asha@example.com', $res->data()['user']['email']);
        $this->assertNotSame($anon['token'], $res->cookies[0]->value, 'the session identifier is replaced on sign-in');

        $stored = $this->app->users->findByEmail('asha@example.com');
        $this->assertNotNull($stored);
        $this->assertSame('Asha Verma', $stored->name);
        $row = $this->pdo->query('SELECT email_enc, google_sub_bidx FROM users')->fetch();
        $this->assertStringNotContainsString('asha@example.com', $row['email_enc'], 'the email is encrypted at rest');
        $this->assertStringNotContainsString('110169484474386276334', (string) $row['google_sub_bidx'], 'the Google subject is not stored raw');
    }

    public function testASecondSignInUsesTheSameAccount(): void
    {
        $first = $this->signInWith($this->google->token());
        $second = $this->signInWith($this->google->token());
        $this->assertSame(200, $second->status);
        $this->assertFalse($second->data()['created']);
        $this->assertSame($first->data()['user']['id'], $second->data()['user']['id']);
        $this->assertSame(1, $this->userCount());
    }

    public function testAGoogleAccountIsMatchedByItsSubjectEvenIfTheEmailChanges(): void
    {
        $first = $this->signInWith($this->google->token());
        $again = $this->signInWith($this->google->token(['email' => 'asha.new@example.com']));
        $this->assertSame($first->data()['user']['id'], $again->data()['user']['id']);
        $this->assertSame('asha@example.com', $again->data()['user']['email'], 'the stored email is not rewritten by the token');
        $this->assertSame(1, $this->userCount());
    }

    public function testAnExistingVerifiedAccountWithTheSameEmailIsLinkedAndKeepsItsPassword(): void
    {
        $id = $this->app->users->create('asha@example.com', 'Asha', password_hash(self::PASSWORD, PASSWORD_ARGON2ID));
        $this->app->users->markVerified($id);

        $res = $this->signInWith($this->google->token());
        $this->assertSame($id, $res->data()['user']['id']);
        $this->assertFalse($res->data()['created']);
        $this->assertSame(1, $this->userCount());

        $s = $this->anonymous('198.51.100.22');
        $login = $this->post('/api/login', ['email' => 'asha@example.com', 'password' => self::PASSWORD], $s, '198.51.100.22');
        $this->assertSame(200, $login->status, 'the password still works after linking');
    }

    public function testAnUnverifiedAccountRegisteredWithSomeoneElsesEmailIsClaimedAndItsPasswordKilled(): void
    {
        // The pre-hijacking attack: an attacker registers the victim's address with a password of their
        // own and never verifies it. When the real owner signs in with Google, the attacker must not
        // keep a working password for that account.
        $attackerPassword = 'attacker password 123';
        $id = $this->app->users->create('asha@example.com', 'Not Asha', password_hash($attackerPassword, PASSWORD_ARGON2ID));

        $res = $this->signInWith($this->google->token());
        $this->assertSame($id, $res->data()['user']['id']);
        $this->assertTrue($res->data()['user']['verified']);

        $s = $this->anonymous('198.51.100.23');
        $login = $this->post('/api/login', ['email' => 'asha@example.com', 'password' => $attackerPassword], $s, '198.51.100.23');
        $this->assertSame(401, $login->status, 'the attacker password no longer works');
        $count = $this->pdo->prepare("SELECT COUNT(*) FROM security_log WHERE event_type = 'auth.unverified_account_claimed_by_google'");
        $count->execute();
        $this->assertSame(1, (int) $count->fetchColumn());
    }

    public function testRefusedTokensDoNotSignInOrCreateAnything(): void
    {
        $bad = [
            'tampered' => substr($this->google->token(), 0, -4) . 'AAAA',
            'wrong audience' => $this->google->token(['aud' => 'other-client']),
            'unverified email' => $this->google->token(['email_verified' => false]),
            'alg none' => $this->google->unsignedToken(),
            'hmac confusion' => $this->google->hmacConfusionToken(),
        ];
        foreach ($bad as $label => $token) {
            $res = $this->signInWith($token, null, '198.51.100.24');
            $this->assertSame(401, $res->status, $label);
            $this->assertSame('invalid_google_token', $res->data()['error'], $label);
        }
        $this->assertSame(0, $this->userCount());
    }

    public function testRepeatedFailuresFromOneAddressAreThrottled(): void
    {
        $ip = '198.51.100.25';
        $s = $this->anonymous($ip);
        for ($i = 0; $i < 20; $i++) {
            $this->assertSame(401, $this->signInWith('x.y.z', $s, $ip)->status);
        }
        $blocked = $this->signInWith($this->google->token(), $s, $ip);
        $this->assertSame(429, $blocked->status);
        $this->assertSame(0, $this->userCount());
    }

    public function testMissingOrOversizedCredentialsAreRefused(): void
    {
        $s = $this->anonymous('198.51.100.26');
        foreach ([[], ['credential' => ''], ['credential' => 12], ['credential' => str_repeat('a', 5000)]] as $body) {
            $res = $this->post('/api/auth/google', $body, $s, '198.51.100.26');
            $this->assertSame(401, $res->status);
        }
    }

    public function testASuccessfulSignInIsAudited(): void
    {
        $this->signInWith($this->google->token());
        $count = $this->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'user.login'")->fetchColumn();
        $this->assertSame(1, (int) $count);
        $registered = $this->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'user.registered'")->fetchColumn();
        $this->assertSame(1, (int) $registered);
    }
}
