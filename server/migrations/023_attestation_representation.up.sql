-- The semantic representation that an attestation's critical_region_digest is the SHA-256 of.
-- Stored as the exact RFC 8785 text that was hashed. It is not signed and not trusted: the server
-- refuses to store a representation whose hash differs from the signed digest, and any verifier
-- recomputes that hash. It exists so a verifier can name the node that differs on a mismatch.
-- Plaintext on purpose (D-15): it is the text of the consent notice the user saw, no personal data.
CREATE TABLE mra_attestation_representation (
    attestation_id      BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    representation_json MEDIUMTEXT      NOT NULL,
    created_at          DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_repr_attestation FOREIGN KEY (attestation_id) REFERENCES mra_attestation (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
