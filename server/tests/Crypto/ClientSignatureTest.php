<?php

declare(strict_types=1);

namespace Mra\Tests\Crypto;

use Mra\Crypto\ClientKeyVerifier;
use Mra\Crypto\EcdsaSignature;
use Mra\Crypto\Signer;
use Mra\Tests\Support\ClientSimulator;
use PHPUnit\Framework\TestCase;

final class ClientSignatureTest extends TestCase
{
    public function testP1363AndDerRoundTripIncludingHighBitAndLeadingZeroIntegers(): void
    {
        $cases = [
            str_repeat("\x01", 64),
            str_repeat("\xff", 64),
            str_repeat("\x00", 31) . "\x01" . str_repeat("\x00", 31) . "\x01",
            "\x80" . str_repeat("\x11", 31) . "\x7f" . str_repeat("\x22", 31),
        ];
        foreach ($cases as $raw) {
            $der = EcdsaSignature::p1363ToDer($raw);
            $this->assertNotNull($der);
            $this->assertSame(bin2hex($raw), bin2hex((string) EcdsaSignature::derToP1363($der)));
        }
    }

    public function testWrongLengthsAndGarbageAreRefused(): void
    {
        $this->assertNull(EcdsaSignature::p1363ToDer('short'));
        $this->assertNull(EcdsaSignature::p1363ToDer(str_repeat('x', 65)));
        $this->assertNull(EcdsaSignature::derToP1363('garbage'));
        $this->assertNull(EcdsaSignature::derToP1363("\x30\x02\x01\x00"));
    }

    public function testASignatureMadeLikeWebCryptoVerifies(): void
    {
        $client = ClientSimulator::create();
        $attestation = ['hello' => 'world'];
        $signature = $client->sign($attestation);
        $this->assertSame(86, strlen($signature), '64 bytes as unpadded base64url');
        $this->assertTrue(ClientKeyVerifier::verify(\Mra\Crypto\Jcs::encode($attestation), $signature, $client->publicPem));
    }

    public function testAlteredMessageSignatureOrKeyFails(): void
    {
        $client = ClientSimulator::create();
        $other = ClientSimulator::create();
        $message = \Mra\Crypto\Jcs::encode(['a' => 1]);
        $sig = $client->sign(['a' => 1]);
        $this->assertFalse(ClientKeyVerifier::verify($message . ' ', $sig, $client->publicPem));
        $this->assertFalse(ClientKeyVerifier::verify($message, $sig, $other->publicPem));
        $flipped = Signer::b64(substr((string) Signer::unb64($sig), 0, 63) . "\x00");
        $this->assertFalse(ClientKeyVerifier::verify($message, $flipped, $client->publicPem));
        $this->assertFalse(ClientKeyVerifier::verify($message, '!!!', $client->publicPem));
    }

    public function testFingerprintIsTheSha256OfTheDerEncoding(): void
    {
        $client = ClientSimulator::create();
        $body = preg_replace('/-----[A-Z ]+-----|\s/', '', $client->publicPem);
        $this->assertSame('sha256:' . hash('sha256', (string) base64_decode((string) $body)), $client->fingerprint);
    }

    public function testMalformedPemHasNoFingerprintAndNeverVerifies(): void
    {
        foreach (['', 'nope', "-----BEGIN PUBLIC KEY-----\n!!!\n-----END PUBLIC KEY-----"] as $pem) {
            $this->assertNull(ClientKeyVerifier::fingerprint($pem));
            $this->assertFalse(ClientKeyVerifier::verify('m', str_repeat('A', 86), $pem));
        }
    }

    public function testOnlyP256KeysAreAccepted(): void
    {
        $this->assertTrue(ClientKeyVerifier::isP256(ClientSimulator::create()->publicPem));
        $conf = getenv('OPENSSL_CONF');
        $opts = $conf ? ['config' => $conf] : [];
        $p384 = openssl_pkey_new($opts + ['curve_name' => 'secp384r1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $rsa = openssl_pkey_new($opts + ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        $this->assertNotFalse($p384);
        $this->assertNotFalse($rsa);
        $this->assertFalse(ClientKeyVerifier::isP256((string) openssl_pkey_get_details($p384)['key']));
        $this->assertFalse(ClientKeyVerifier::isP256((string) openssl_pkey_get_details($rsa)['key']));
    }
}
