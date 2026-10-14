import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { canonicalJson } from './checks/jcs';
import { computeLeafHash, nodeHash } from './checks/merkle';
import { publicKeyFingerprint, sha256Prefixed } from './checks/crypto';

export interface GeneratedFixtures {
  serverPublicKeyHex: string;
  honestPackZip: Buffer;
  fixtures: Record<string, Buffer>;
}

export function generateAllFixtures(): GeneratedFixtures {
  // 1. Generate Ed25519 Server Keypair
  const serverPair = crypto.generateKeyPairSync('ed25519');
  const serverJwk = serverPair.publicKey.export({ format: 'jwk' });
  const serverPublicKeyHex = Buffer.from(serverJwk.x!, 'base64url').toString('hex');

  // 2. Generate ECDSA P-256 Client Keypair
  const clientPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const clientPubkeyPem = clientPair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
  const clientPubkeyFpr = publicKeyFingerprint(clientPubkeyPem)!;

  // 3. Bundle
  const bundle = {
    bundle_id: 'bundle_fixture_1',
    version: '1.0',
    region_policy: 'consent/v1',
    critical_region: '#consent-dialog',
    markup:
      '<div id="consent-dialog"><p>We request your consent to process analytics data according to our privacy policy.</p><button id="btn-agree">I Agree</button><button id="btn-reject">Reject</button></div>',
    css: '#consent-dialog { margin: 20px; } #btn-agree { color: blue; } #btn-reject { color: gray; }',
  };
  const bundleHash = sha256Prefixed(canonicalJson(bundle));

  // 4. Commitment
  const commitmentRecord = {
    v: 'mra/1.0',
    type: 'commitment',
    bundle_id: 'bundle_fixture_1',
    bundle_hash: bundleHash,
    client_pubkey_fpr: clientPubkeyFpr,
    nonce: 'd8e8fca2dc0f896fd7cb4cb0031ba249',
    ts: '2026-10-10T13:00:00Z',
    valid_until: '2026-10-10T14:00:00Z',
    key_id: 'k1',
    log_leaf_index: 0,
  };
  const commitmentSig = crypto
    .sign(null, Buffer.from(canonicalJson(commitmentRecord), 'utf8'), serverPair.privateKey)
    .toString('base64url');
  const commitmentHash = sha256Prefixed(canonicalJson(commitmentRecord));

  // 5. Attestation
  const attestationRecord = {
    v: 'mra/1.0',
    commitment_hash: commitmentHash,
    action: 'accept',
    action_target: 'btn-agree',
    env: {
      engine: 'Blink',
      engine_major: 130,
      viewport_bucket: 'medium',
      dpr_bucket: '1x',
      forced_colors: false,
      reduced_motion: false,
    },
    attestor_hash: 'sha256:f805f3642219c751e5e76699bb096aeb63ce5946e20a32748121bebb3cb2949a',
    nonce: 'd8e8fca2dc0f896fd7cb4cb0031ba249',
    client_ts: '2026-10-10T13:05:00Z',
    client_pubkey: clientPubkeyPem,
  };
  const attestationSig = crypto
    .sign('sha256', Buffer.from(canonicalJson(attestationRecord), 'utf8'), {
      key: clientPair.privateKey,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  const attestationHash = sha256Prefixed(canonicalJson(attestationRecord));

  // 6. Merkle Leaves & Tree Head
  const commitmentLeafRecord = {
    v: 'mra/1.0',
    kind: 'commitment',
    ref_hash: commitmentHash,
    commitment: commitmentRecord,
    signature: commitmentSig,
  };
  const commitmentLeafHash = computeLeafHash(canonicalJson(commitmentLeafRecord));

  const attestationLeafRecord = {
    v: 'mra/1.0',
    kind: 'attestation',
    ref_hash: attestationHash,
    record: attestationRecord,
    signature: attestationSig,
  };
  const attestationLeafHash = computeLeafHash(canonicalJson(attestationLeafRecord));

  const rootBuf = nodeHash(
    Buffer.from(commitmentLeafHash, 'hex'),
    Buffer.from(attestationLeafHash, 'hex'),
  );
  const rootHex = rootBuf.toString('hex');
  const rootHashPrefixed = `sha256:${rootHex}`;

  const sthRecord = {
    v: 'mra/1.0',
    type: 'signed_tree_head',
    tree_size: 2,
    root_hash: rootHashPrefixed,
    timestamp: '2026-10-10T13:06:00Z',
    key_id: 'k1',
  };
  const sthSig = crypto
    .sign(null, Buffer.from(canonicalJson(sthRecord), 'utf8'), serverPair.privateKey)
    .toString('base64url');

  const inclusionProofCommitment = {
    leaf_index: 0,
    tree_size: 2,
    leaf_hash: commitmentLeafHash,
    path: [attestationLeafHash],
    leaf_record: commitmentLeafRecord,
  };

  const inclusionProofAttestation = {
    leaf_index: 1,
    tree_size: 2,
    leaf_hash: attestationLeafHash,
    path: [commitmentLeafHash],
    leaf_record: attestationLeafRecord,
  };

  const manifest = {
    schema_version: '1.0',
    pack_id: 'pack_fixture_1',
    created_at: '2026-10-10T13:06:00Z',
    server_key_id: 'k1',
    client_pubkey_fpr: clientPubkeyFpr,
    hashes: {
      bundle_hash: bundleHash,
      commitment_hash: commitmentHash,
      attestation_hash: attestationHash,
      client_pubkey_fpr: clientPubkeyFpr,
    },
    tree: {
      tree_size: 2,
      root_hash: rootHashPrefixed,
      commitment_leaf_index: 0,
      attestation_leaf_index: 1,
    },
    components: {
      bundle: 'bundle.json',
      commitment: 'commitment.json',
      attestation: 'attestation.json',
      client_pubkey: 'client_pubkey.pem',
      inclusion_proof_commitment: 'inclusion_proof_commitment.json',
      inclusion_proof_attestation: 'inclusion_proof_attestation.json',
      signed_tree_head: 'signed_tree_head.json',
    },
  };

  function buildZip(files: Record<string, string>): Buffer {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files)) {
      zip.addFile(name, Buffer.from(content, 'utf8'));
    }
    return zip.toBuffer();
  }

  const baseFiles: Record<string, string> = {
    'manifest.json': JSON.stringify(manifest, null, 2),
    'bundle.json': JSON.stringify(bundle, null, 2),
    'commitment.json': JSON.stringify(
      {
        record: commitmentRecord,
        signature: commitmentSig,
        commitment_hash: commitmentHash,
        key_id: 'k1',
      },
      null,
      2,
    ),
    'attestation.json': JSON.stringify(
      {
        record: attestationRecord,
        signature: attestationSig,
        attestation_hash: attestationHash,
      },
      null,
      2,
    ),
    'client_pubkey.pem': clientPubkeyPem,
    'inclusion_proof_commitment.json': JSON.stringify(inclusionProofCommitment, null, 2),
    'inclusion_proof_attestation.json': JSON.stringify(inclusionProofAttestation, null, 2),
    'signed_tree_head.json': JSON.stringify({ record: sthRecord, signature: sthSig }, null, 2),
  };

  const honestPackZip = buildZip(baseFiles);

  // Generate Fixtures for all failure paths:
  const fixtures: Record<string, Buffer> = {
    honest_pack: honestPackZip,

    // T5.2.2: Malformed ZIP (corrupt bytes)
    malformed: Buffer.from('NOT A VALID ZIP ARCHIVE HEADER CORRUPTED DATA 12345'),

    // T5.2.3: Bad server signature
    bad_server_signature: buildZip({
      ...baseFiles,
      'commitment.json': JSON.stringify(
        {
          record: commitmentRecord,
          signature: 'corrupted_server_signature_base64url_invalid',
          commitment_hash: commitmentHash,
          key_id: 'k1',
        },
        null,
        2,
      ),
    }),

    // T5.2.4: Edited pack (attestation text altered after signing)
    edited_attestation: buildZip({
      ...baseFiles,
      'attestation.json': JSON.stringify(
        {
          record: { ...attestationRecord, action: 'reject', action_target: 'btn-reject' },
          signature: attestationSig, // original signature over "accept"
          attestation_hash: attestationHash,
        },
        null,
        2,
      ),
    }),

    // T5.2.5: Fingerprint mismatch (key binding invalid)
    fingerprint_mismatch: buildZip({
      ...baseFiles,
      'commitment.json': JSON.stringify(
        {
          record: {
            ...commitmentRecord,
            client_pubkey_fpr:
              'sha256:0000000000000000000000000000000000000000000000000000000000000000',
          },
          signature: crypto
            .sign(
              null,
              Buffer.from(
                canonicalJson({
                  ...commitmentRecord,
                  client_pubkey_fpr:
                    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
                }),
                'utf8',
              ),
              serverPair.privateKey,
            )
            .toString('base64url'),
          commitment_hash: commitmentHash,
          key_id: 'k1',
        },
        null,
        2,
      ),
    }),

    // T5.2.6: Tampered bundle (bundle markup altered)
    tampered_bundle: buildZip({
      ...baseFiles,
      'bundle.json': JSON.stringify(
        {
          ...bundle,
          markup:
            '<div id="consent-dialog"><p>Malicious terms silently swapped!</p><button id="btn-agree">Agree</button></div>',
        },
        null,
        2,
      ),
    }),

    // T5.2.7: Commitment binding broken
    commitment_binding_broken: buildZip({
      ...baseFiles,
      'attestation.json': (() => {
        const alteredAttRecord = {
          ...attestationRecord,
          commitment_hash:
            'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        };
        const alteredAttSig = crypto
          .sign('sha256', Buffer.from(canonicalJson(alteredAttRecord), 'utf8'), {
            key: clientPair.privateKey,
            dsaEncoding: 'ieee-p1363',
          })
          .toString('base64url');
        return JSON.stringify(
          {
            record: alteredAttRecord,
            signature: alteredAttSig,
            attestation_hash: sha256Prefixed(canonicalJson(alteredAttRecord)),
          },
          null,
          2,
        );
      })(),
    }),

    // T5.2.8: Expired window (attestation after valid_until)
    expired_window: buildZip({
      ...baseFiles,
      'attestation.json': (() => {
        const expiredAttRecord = {
          ...attestationRecord,
          client_ts: '2026-10-10T15:30:00Z', // after 14:00:00Z valid_until
        };
        const expiredAttSig = crypto
          .sign('sha256', Buffer.from(canonicalJson(expiredAttRecord), 'utf8'), {
            key: clientPair.privateKey,
            dsaEncoding: 'ieee-p1363',
          })
          .toString('base64url');
        return JSON.stringify(
          {
            record: expiredAttRecord,
            signature: expiredAttSig,
            attestation_hash: sha256Prefixed(canonicalJson(expiredAttRecord)),
          },
          null,
          2,
        );
      })(),
    }),

    // T5.2.9: Bad Merkle proof
    bad_merkle_proof: buildZip({
      ...baseFiles,
      'inclusion_proof_commitment.json': JSON.stringify(
        {
          ...inclusionProofCommitment,
          path: ['ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'],
        },
        null,
        2,
      ),
    }),

    // T5.2.10: Leaf order inverted (j < i)
    leaf_order_inverted: buildZip({
      ...baseFiles,
      'inclusion_proof_commitment.json': JSON.stringify(
        {
          ...inclusionProofCommitment,
          leaf_index: 1, // commitment index placed at 1
        },
        null,
        2,
      ),
      'inclusion_proof_attestation.json': JSON.stringify(
        {
          ...inclusionProofAttestation,
          leaf_index: 0, // attestation index placed at 0 (j < i)
        },
        null,
        2,
      ),
    }),

    // T5.2.11: Region policy violation (missing reject button in bundle)
    region_policy_violation: (() => {
      const badBundle = {
        ...bundle,
        markup:
          '<div id="consent-dialog"><p>Agree or leave.</p><button id="btn-agree">I Agree</button></div>',
      };
      const badBundleHash = sha256Prefixed(canonicalJson(badBundle));
      const badCommRecord = {
        ...commitmentRecord,
        bundle_hash: badBundleHash,
      };
      const badCommSig = crypto
        .sign(null, Buffer.from(canonicalJson(badCommRecord), 'utf8'), serverPair.privateKey)
        .toString('base64url');
      const badCommHash = sha256Prefixed(canonicalJson(badCommRecord));
      const badAttRecord = {
        ...attestationRecord,
        commitment_hash: badCommHash,
      };
      const badAttSig = crypto
        .sign('sha256', Buffer.from(canonicalJson(badAttRecord), 'utf8'), {
          key: clientPair.privateKey,
          dsaEncoding: 'ieee-p1363',
        })
        .toString('base64url');

      return buildZip({
        ...baseFiles,
        'bundle.json': JSON.stringify(badBundle, null, 2),
        'commitment.json': JSON.stringify(
          {
            record: badCommRecord,
            signature: badCommSig,
            commitment_hash: badCommHash,
            key_id: 'k1',
          },
          null,
          2,
        ),
        'attestation.json': JSON.stringify(
          {
            record: badAttRecord,
            signature: badAttSig,
            attestation_hash: sha256Prefixed(canonicalJson(badAttRecord)),
          },
          null,
          2,
        ),
      });
    })(),

    // T5.2.12: Unknown attestor
    unknown_attestor: (() => {
      const unknownAttRecord = {
        ...attestationRecord,
        attestor_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      };
      const unknownAttSig = crypto
        .sign('sha256', Buffer.from(canonicalJson(unknownAttRecord), 'utf8'), {
          key: clientPair.privateKey,
          dsaEncoding: 'ieee-p1363',
        })
        .toString('base64url');
      return buildZip({
        ...baseFiles,
        'attestation.json': JSON.stringify(
          {
            record: unknownAttRecord,
            signature: unknownAttSig,
            attestation_hash: sha256Prefixed(canonicalJson(unknownAttRecord)),
          },
          null,
          2,
        ),
      });
    })(),
  };

  return {
    serverPublicKeyHex,
    honestPackZip,
    fixtures,
  };
}
