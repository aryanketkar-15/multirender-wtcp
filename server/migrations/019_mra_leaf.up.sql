-- The evidence log (RFC 6962 style). Append-only: the application account is granted INSERT and
-- SELECT only, so the property holds in the database, not just in application code.
CREATE TABLE mra_leaf (
    idx         BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    leaf_hash   BINARY(32)      NOT NULL,
    kind        VARCHAR(16)     NOT NULL,
    ref_hash    CHAR(71)        NOT NULL,
    record_json MEDIUMTEXT      NOT NULL,
    created_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_leaf_ref (kind, ref_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
