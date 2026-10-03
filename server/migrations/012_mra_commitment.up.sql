-- Commitments are signed public evidence (D-15): stored in plaintext, recomputable by a verifier.
CREATE TABLE mra_commitment (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id      CHAR(64)        NOT NULL,
    bundle_id       VARCHAR(64)     NOT NULL,
    commitment_hash CHAR(71)        NOT NULL,
    commitment_blob TEXT            NOT NULL,
    signature       VARCHAR(100)    NOT NULL,
    key_id          VARCHAR(32)     NOT NULL,
    issued_at       DATETIME(6)     NOT NULL,
    expires_at      DATETIME(6)     NOT NULL,
    log_leaf_index  BIGINT UNSIGNED NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_commitment_hash (commitment_hash),
    KEY idx_commitment_bundle (bundle_id),
    KEY idx_commitment_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
