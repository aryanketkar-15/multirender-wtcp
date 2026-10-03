<?php

declare(strict_types=1);

namespace Mra\Crypto;

/**
 * Verifies the browser's ECDSA P-256 signatures. The public key arrives inside the attestation as
 * PEM; its SPKI fingerprint is compared with the one registered for the session, so a signature by
 * any other key is useless even though it verifies mathematically.
 */
final class ClientKeyVerifier
{
    /** `sha256:` plus the hex digest of the DER SubjectPublicKeyInfo, or null for unusable PEM. */
    public static function fingerprint(string $pem): ?string
    {
        if (preg_match('/^-----BEGIN PUBLIC KEY-----\s*([A-Za-z0-9+\/=\s]+?)\s*-----END PUBLIC KEY-----\s*$/', $pem, $m) !== 1) {
            return null;
        }
        $der = base64_decode(preg_replace('/\s+/', '', $m[1]) ?? '', true);
        return $der === false || $der === '' ? null : 'sha256:' . hash('sha256', $der);
    }

    /** True only for a well-formed EC key on the prime256v1 (P-256) curve. */
    public static function isP256(string $pem): bool
    {
        $key = @openssl_pkey_get_public($pem);
        if ($key === false) {
            return false;
        }
        $details = openssl_pkey_get_details($key);
        return is_array($details)
            && ($details['type'] ?? null) === OPENSSL_KEYTYPE_EC
            && ($details['ec']['curve_name'] ?? null) === 'prime256v1';
    }

    /** @param string $signature unpadded base64url of the 64-byte P1363 signature */
    public static function verify(string $message, string $signature, string $pem): bool
    {
        if (!self::isP256($pem)) {
            return false;
        }
        $raw = Signer::unb64($signature);
        $der = $raw === null ? null : EcdsaSignature::p1363ToDer($raw);
        if ($der === null) {
            return false;
        }
        return openssl_verify($message, $der, $pem, OPENSSL_ALGO_SHA256) === 1;
    }
}
