<?php

declare(strict_types=1);

namespace Mra\Tests\Service;

use Mra\Service\GoogleIdTokenVerifier;
use Mra\Service\GoogleTokenException;
use Mra\Tests\Support\FakeClock;
use Mra\Tests\Support\GoogleTokenFactory;
use PHPUnit\Framework\TestCase;

/** Sign in with Google: what the server must accept and, above all, what it must refuse. */
final class GoogleIdTokenVerifierTest extends TestCase
{
    private FakeClock $clock;
    private GoogleTokenFactory $google;

    protected function setUp(): void
    {
        $this->clock = new FakeClock();
        $this->google = new GoogleTokenFactory($this->clock);
    }

    private function assertRefused(string $reason, string $token, ?GoogleIdTokenVerifier $verifier = null): void
    {
        try {
            ($verifier ?? $this->google->verifier())->verify($token);
            $this->fail("The token should have been refused ({$reason}).");
        } catch (GoogleTokenException $e) {
            $this->assertSame($reason, $e->getMessage());
        }
    }

    public function testAValidTokenYieldsSubjectEmailAndName(): void
    {
        $claims = $this->google->verifier()->verify($this->google->token());
        $this->assertSame(['sub' => '110169484474386276334', 'email' => 'asha@example.com', 'name' => 'Asha Verma'], $claims);
    }

    public function testTheNameFallsBackToTheEmailLocalPart(): void
    {
        $claims = $this->google->verifier()->verify($this->google->token(['name' => null]));
        $this->assertSame('asha', $claims['name']);
    }

    public function testBothGoogleIssuerSpellingsAreAccepted(): void
    {
        $this->assertSame('x', $this->google->verifier()->verify($this->google->token(['iss' => 'accounts.google.com', 'sub' => 'x']))['sub']);
    }

    public function testATokenSignedByAnotherKeyIsRefused(): void
    {
        $other = new GoogleTokenFactory($this->clock); // same kid, different key
        $this->assertRefused('signature', $other->token());
    }

    public function testATamperedPayloadIsRefused(): void
    {
        [$h, $p, $s] = explode('.', $this->google->token());
        $claims = json_decode(base64_decode(strtr($p, '-_', '+/')), true);
        $claims['email'] = 'victim@example.com';
        $forged = rtrim(strtr(base64_encode(json_encode($claims)), '+/', '-_'), '=');
        $this->assertRefused('signature', "{$h}.{$forged}.{$s}");
    }

    public function testAlgorithmNoneIsRefused(): void
    {
        $this->assertRefused('algorithm', $this->google->unsignedToken());
    }

    public function testHmacAlgorithmConfusionIsRefused(): void
    {
        // The classic attack: sign with HS256 using the PUBLIC key as the secret and hope the server
        // verifies with whatever the header names.
        $this->assertRefused('algorithm', $this->google->hmacConfusionToken());
    }

    public function testAnUnknownKeyIdIsRefusedAfterOneRefresh(): void
    {
        $refreshes = [];
        $verifier = $this->google->verifier(function (bool $refresh) use (&$refreshes): array {
            $refreshes[] = $refresh;
            return ['keys' => []];
        });
        $this->assertRefused('unknown_key', $this->google->token(), $verifier);
        $this->assertSame([false, true], $refreshes, 'one cached lookup, one forced refresh, then it stops');
    }

    public function testAKeyRotatedInAfterTheCacheWasFilledIsFoundOnRefresh(): void
    {
        $verifier = $this->google->verifier(fn (bool $refresh): array => $refresh ? $this->google->jwks() : ['keys' => []]);
        $this->assertSame('asha@example.com', $verifier->verify($this->google->token())['email']);
    }

    public function testATokenForAnotherApplicationIsRefused(): void
    {
        $this->assertRefused('audience', $this->google->token(['aud' => 'someone-elses-client.apps.googleusercontent.com']));
    }

    public function testAWrongIssuerIsRefused(): void
    {
        $this->assertRefused('issuer', $this->google->token(['iss' => 'https://evil.example.com']));
    }

    public function testAnExpiredTokenIsRefusedButClockSkewWithinAMinuteIsTolerated(): void
    {
        $now = $this->clock->now()->getTimestamp();
        $this->assertRefused('expired', $this->google->token(['exp' => $now - 120]));
        $this->assertSame('asha@example.com', $this->google->verifier()->verify($this->google->token(['exp' => $now - 30]))['email']);
    }

    public function testATokenIssuedInTheFarFutureIsRefused(): void
    {
        $this->assertRefused('issued_in_future', $this->google->token(['iat' => $this->clock->now()->getTimestamp() + 3600]));
    }

    public function testAnUnverifiedGoogleEmailIsRefused(): void
    {
        $this->assertRefused('email_unverified', $this->google->token(['email_verified' => false]));
        $this->assertRefused('email_unverified', $this->google->token(['email_verified' => null]));
    }

    public function testAMissingOrMalformedEmailOrSubjectIsRefused(): void
    {
        $this->assertRefused('email', $this->google->token(['email' => null]));
        $this->assertRefused('email', $this->google->token(['email' => 'not-an-email']));
        $this->assertRefused('subject', $this->google->token(['sub' => '']));
        $this->assertRefused('subject', $this->google->token(['sub' => null]));
    }

    public function testMalformedInputIsRefusedWithoutAnError(): void
    {
        foreach (['', 'abc', 'a.b', 'a.b.c.d', str_repeat('a', 5000), '!!!.???.***'] as $junk) {
            $this->assertRefusedAny($junk);
        }
    }

    private function assertRefusedAny(string $token): void
    {
        $this->expectNotToPerformAssertions();
        try {
            $this->google->verifier()->verify($token);
            $this->fail('A malformed token was accepted.');
        } catch (GoogleTokenException) {
            // expected
        }
    }

    public function testTheKeyConversionMatchesOpenSsl(): void
    {
        $jwk = $this->google->jwks()['keys'][0];
        $pem = GoogleIdTokenVerifier::pemFromRsaJwk($jwk['n'], $jwk['e']);
        $details = openssl_pkey_get_details(openssl_pkey_get_public($pem));
        $this->assertSame(2048, $details['bits']);
        $this->assertSame(rtrim(strtr(base64_encode($details['rsa']['n']), '+/', '-_'), '='), $jwk['n']);
    }
}
