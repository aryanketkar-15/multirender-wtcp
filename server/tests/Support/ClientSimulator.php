<?php

declare(strict_types=1);

namespace Mra\Tests\Support;

use Mra\Crypto\ClientKeyVerifier;
use Mra\Crypto\EcdsaSignature;
use Mra\Crypto\Jcs;
use Mra\Crypto\Signer;

/**
 * Plays the browser's part with OpenSSL: an ECDSA P-256 key, and attestations signed in the same
 * IEEE P1363 encoding WebCrypto produces. Lets the server's validation be exercised exactly as a
 * crafted request outside any browser would exercise it.
 */
final class ClientSimulator
{
    public readonly string $publicPem;
    public readonly string $fingerprint;
    /** @var \OpenSSLAsymmetricKey */
    private $key;

    private function __construct()
    {
        $opts = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
        $conf = getenv('OPENSSL_CONF');
        if (is_string($conf) && $conf !== '') {
            $opts['config'] = $conf;
        }
        $key = openssl_pkey_new($opts);
        if ($key === false) {
            throw new \RuntimeException('OpenSSL could not create an EC key: ' . openssl_error_string());
        }
        $this->key = $key;
        $this->publicPem = (string) openssl_pkey_get_details($key)['key'];
        $this->fingerprint = (string) ClientKeyVerifier::fingerprint($this->publicPem);
    }

    public static function create(): self
    {
        return new self();
    }

    /** @param array<string,mixed> $attestation */
    public function sign(array $attestation): string
    {
        openssl_sign(Jcs::encode($attestation), $der, $this->key, OPENSSL_ALGO_SHA256);
        return Signer::b64((string) EcdsaSignature::derToP1363($der));
    }

    /**
     * An attestation answering the bundle response of GET /api/bundle.
     *
     * @param array<string,mixed> $bundleResponse
     * @param array<string,mixed> $override
     * @return array<string,mixed>
     */
    public function attestation(array $bundleResponse, string $action = 'accept', array $override = []): array
    {
        $c = $bundleResponse['commitment'];
        return $override + [
            'v' => 'mra/1.0',
            'type' => 'client_attestation',
            'session_id' => $c['session_id'],
            'commitment_hash' => $bundleResponse['commitment_hash'],
            'critical_region_digest' => 'sha256:' . hash('sha256', 'region-' . $action),
            'context_digest' => 'sha256:' . hash('sha256', 'context'),
            'action' => $action,
            'action_target' => $action === 'accept' ? 'btn-agree' : 'btn-reject',
            'env' => [
                'engine' => 'Blink',
                'engine_major' => '154',
                'viewport_bucket' => 'large',
                'dpr_bucket' => '1x',
                'forced_colors' => false,
                'reduced_motion' => false,
            ],
            'attestor_hash' => $c['attestor_hash'],
            'nonce' => $c['nonce'],
            'client_ts' => gmdate('Y-m-d\TH:i:s\Z'),
            'client_pubkey' => $this->publicPem,
        ];
    }

    /**
     * @param array<string,mixed> $bundleResponse
     * @param array<string,mixed> $override
     * @return array{attestation:array<string,mixed>,signature:string}
     */
    public function body(array $bundleResponse, string $action = 'accept', array $override = []): array
    {
        $attestation = $this->attestation($bundleResponse, $action, $override);
        return ['attestation' => $attestation, 'signature' => $this->sign($attestation)];
    }
}
