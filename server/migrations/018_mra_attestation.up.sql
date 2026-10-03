-- Validated client attestations: signed evidence, stored in plaintext (D-15) so a verifier holding
-- none of our keys can recompute every hash. One attestation per commitment.
CREATE TABLE mra_attestation (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    attestation_hash  CHAR(71)        NOT NULL,
    commitment_hash   CHAR(71)        NOT NULL,
    user_id           BIGINT UNSIGNED NOT NULL,
    action            VARCHAR(8)      NOT NULL,
    attestation_blob  TEXT            NOT NULL,
    signature         VARCHAR(100)    NOT NULL,
    client_pubkey_fpr CHAR(71)        NOT NULL,
    log_leaf_index    BIGINT UNSIGNED NULL,
    created_at        DATETIME(6)     NOT NULL,
    UNIQUE KEY uq_attestation_hash (attestation_hash),
    UNIQUE KEY uq_attestation_commitment (commitment_hash),
    KEY idx_attestation_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
