# MRA Evidence Pack Specification

**Format Version:** `1.0`  
**Status:** Approved  
**Related Milestones:** Phase 5 (Milestones 5.1, 5.2, 5.3)

---

## 1. Overview and Design Principles

An **Evidence Pack** is a self-contained, tamper-evident ZIP archive that captures the complete cryptographic and visual proof of an online consent transaction. It provides a portable witness that neither the issuing server nor the consenting user can forge or alter retroactively.

### Core Principles

1. **Self-Contained & Offline-Verifiable:**  
   The pack contains all digital artifacts, signatures, Merkle inclusion proofs, and environmental parameters necessary to verify the transaction without making any network calls or contacting the issuing server.
2. **Independent Verifiability:**  
   The verifier requires only one trust anchor out-of-band: the server's Ed25519 public key (from `/.well-known/mra-key` or an independent keystore). It never trusts keys contained within the pack as trust anchors.
3. **Canonical Serialization:**  
   All JSON structures are canonicalized using RFC 8785 (JSON Canonicalization Scheme, JCS). Hashes are SHA-256 in hex format with the prefix `sha256:`.
4. **Append-Only Witness:**  
   Both the server's commitment and the client's attestation are pinned to an RFC 6962 / RFC 9162 Merkle log with cryptographically verifiable inclusion proofs up to a signed tree head (STH).

---

## 2. Archive File Structure

A valid Evidence Pack is a standard ZIP archive containing the following files at the root level:

```
evidence-pack-<pack-id>.zip
├── manifest.json
├── bundle.json
├── commitment.json
├── attestation.json
├── client_pubkey.pem
├── inclusion_proof_commitment.json
├── inclusion_proof_attestation.json
└── signed_tree_head.json
```

---

## 3. Component File Specifications

### 3.1 `manifest.json`

The entry point and index for the evidence pack, specifying schema version, identifiers, component filenames, cryptographic hashes, and Merkle tree state.

```json
{
  "schema_version": "1.0",
  "pack_id": "pack-9f8a3c2b1e0d4f5a",
  "created_at": "2026-10-10 13:30:00.000000",
  "server_key_id": "2026-q4",
  "client_pubkey_fpr": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "hashes": {
    "bundle_hash": "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    "commitment_hash": "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    "attestation_hash": "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    "client_pubkey_fpr": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "tree": {
    "tree_size": 42,
    "root_hash": "sha256:c7be1a902fb8dd4b449d6029ec52d5b42e40a43f9307b42f774360bab504c792",
    "commitment_leaf_index": 40,
    "attestation_leaf_index": 41
  },
  "components": {
    "bundle": "bundle.json",
    "commitment": "commitment.json",
    "attestation": "attestation.json",
    "client_pubkey": "client_pubkey.pem",
    "inclusion_proof_commitment": "inclusion_proof_commitment.json",
    "inclusion_proof_attestation": "inclusion_proof_attestation.json",
    "signed_tree_head": "signed_tree_head.json"
  }
}
```

### 3.2 `bundle.json`

The sealed render bundle containing sanitized markup, stylesheet, the designated critical region selector, and region policy identifier:

```json
{
  "markup": "<div id=\"consent-region\"><h1>Terms of Service</h1><p id=\"disclosure\">By agreeing, you accept our privacy policy.</p><button id=\"btn-agree\">I Agree</button><button id=\"btn-reject\">Reject</button></div>",
  "css": "#consent-region { font-family: sans-serif; padding: 1rem; }",
  "critical_region": "#consent-region",
  "region_policy": "consent/v1"
}
```

*Hash Computation:*  
`bundle_hash = "sha256:" + SHA256(RFC8785_JCS(bundle.json))`

---

### 3.3 `commitment.json`

The server's cryptographic commitment to the bundle, signed with Ed25519 before user interaction:

```json
{
  "record": {
    "v": "mra/1.0",
    "type": "render_bundle_commitment",
    "bundle_id": "bnd_abc123",
    "bundle_hash": "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    "region_policy": "consent/v1",
    "nonce": "d8e8fca2dc0f896fd7cb4cb0031ba249",
    "issued_at": "2026-10-10 13:25:00.000000",
    "expires_at": "2026-10-10 13:40:00.000000",
    "client_pubkey_fpr": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "log_leaf_index": 40,
    "key_id": "2026-q4"
  },
  "signature": "base64url_encoded_ed25519_signature",
  "commitment_hash": "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  "key_id": "2026-q4"
}
```

*Hash Computation:*  
`commitment_hash = "sha256:" + SHA256(RFC8785_JCS(commitment.record))`  
*Signature Verification:*  
`Ed25519_Verify(server_public_key, RFC8785_JCS(commitment.record), commitment.signature)`

---

### 3.4 `attestation.json`

The client's attestation produced at the exact moment of user action by the independently hosted Attestor Module, signed with ECDSA P-256:

```json
{
  "record": {
    "v": "mra/1.0",
    "type": "client_render_attestation",
    "session_id": "sess_0123456789abcdef",
    "commitment_hash": "sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    "critical_region_digest": "sha256:4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    "context_digest": "sha256:ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
    "action": "accept",
    "action_target": "#btn-agree",
    "env": {
      "engine": "Blink",
      "engine_major": 130,
      "viewport_bucket": "medium",
      "dpr_bucket": "1x",
      "forced_colors": false,
      "reduced_motion": false
    },
    "attestor_hash": "sha256:f805f3642219c751e5e76699bb096aeb63ce5946e20a32748121bebb3cb2949a",
    "nonce": "d8e8fca2dc0f896fd7cb4cb0031ba249",
    "client_ts": "2026-10-10T13:28:10.123Z",
    "client_pubkey": "-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----"
  },
  "signature": "base64url_encoded_ecdsa_p256_ieee_p1363_signature",
  "attestation_hash": "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
}
```

*Hash Computation:*  
`attestation_hash = "sha256:" + SHA256(RFC8785_JCS(attestation.record))`  
*Signature Verification:*  
`ECDSA_P256_Verify(attestation.record.client_pubkey, RFC8785_JCS(attestation.record), attestation.signature)`

---

### 3.5 `client_pubkey.pem`

The SubjectPublicKeyInfo (SPKI) PEM encoded ECDSA P-256 public key generated by the browser's WebCrypto subsystem.

---

### 3.6 `inclusion_proof_commitment.json` & `inclusion_proof_attestation.json`

RFC 6962 inclusion proofs verifying that the commitment leaf and attestation leaf were appended to the log in strict sequence:

```json
{
  "leaf_index": 40,
  "tree_size": 42,
  "leaf_hash": "3a886a111b22...",
  "path": [
    "e9d2f83a45c6...",
    "78bc41df6901..."
  ],
  "leaf_record": {
    "v": "mra/1.0",
    "kind": "commitment",
    "ref_hash": "sha256:1a2b3c4d5e6f...",
    "commitment": { ... },
    "signature": "..."
  }
}
```

*Inclusion Verification:*  
`RFC6962_VerifyInclusion(leaf_index, tree_size, leaf_hash, path, STH.root_hash)`

---

### 3.7 `signed_tree_head.json`

The RFC 6962 tree head signed by the server's Ed25519 key:

```json
{
  "record": {
    "v": "mra/1.0",
    "type": "signed_tree_head",
    "tree_size": 42,
    "root_hash": "sha256:c7be1a902fb8dd4b449d6029ec52d5b42e40a43f9307b42f774360bab504c792",
    "timestamp": "2026-10-10T13:28:15Z",
    "key_id": "2026-q4"
  },
  "signature": "base64url_encoded_ed25519_signature"
}
```

---

## 4. Verification Algorithm (Independent Verifier)

The independent verifier executes the following stages sequentially (cheap checks first, expensive headless browser re-render last):

| Stage | Name | Description | Failure Code |
|---|---|---|---|
| **1** | Schema & Unpack | Parse archive and validate `manifest.json` schema version `1.0`. All required files present. | `MALFORMED_PACK` |
| **2** | Server Signature | Verify Ed25519 signature on `commitment.record` using trusted server public key. | `SERVER_SIGNATURE_INVALID` |
| **3** | Client Signature | Verify ECDSA P-256 signature on `attestation.record` using `client_pubkey.pem`. | `CLIENT_SIGNATURE_INVALID` |
| **4** | Key Binding | Verify `SHA-256(DER(client_pubkey))` matches `commitment.record.client_pubkey_fpr`. | `KEY_BINDING_INVALID` |
| **5** | Bundle Hash | Verify `SHA-256(JCS(bundle.json))` matches `commitment.record.bundle_hash`. | `BUNDLE_TAMPERED` |
| **6** | Commitment Binding | Verify `attestation.record.commitment_hash` matches `SHA-256(JCS(commitment.record))`. | `COMMITMENT_BINDING_INVALID` |
| **7** | Nonce & Timestamps | Verify nonces match and `attestation.client_ts` is within commitment validity window. | `REPLAY_DETECTED` |
| **8** | Merkle Inclusion | Verify both inclusion proofs against `STH.root_hash` and assert `idx_commitment < idx_attestation`. Verify Ed25519 signature on `STH`. | `MERKLE_PROOF_INVALID` |
| **9** | Region Policy | Verify bundle markup and CSS satisfy `consent/v1` rules (disclosure text, valid actions). | `REGION_POLICY_VIOLATION` |
| **10** | Attestor Registry | Verify `attestor_hash` matches a registered and verified build of the Attestor Module. | `ATTESTOR_UNRECOGNISED` |
| **11** | Semantic Re-Render | Headless browser re-renders `bundle.json` using recorded `env` profile. Compare extracted critical region digest against `attestation.record.critical_region_digest`. | `DIGEST_MISMATCH` |

If all 11 stages pass, the verifier issues a positive verdict: **`VERIFIED`**.
