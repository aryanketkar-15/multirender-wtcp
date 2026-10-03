-- Bundles are cryptographic material (D-15): stored in plaintext so a verifier holding none of our
-- keys can recompute the hash from canonical_blob.
CREATE TABLE mra_bundle (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bundle_id      VARCHAR(64)     NOT NULL,
    canonical_blob MEDIUMBLOB      NOT NULL,
    bundle_hash    CHAR(71)        NOT NULL,
    region_policy  VARCHAR(40)     NOT NULL,
    created_at     DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_bundle_id (bundle_id),
    KEY idx_bundle_hash (bundle_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
