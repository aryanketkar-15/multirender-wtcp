-- The registry of Attestor Module builds this system recognises. Rows are never deleted: evidence
-- that references a version must stay verifiable, so retirement is a status change.
CREATE TABLE attestor_registry (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version      VARCHAR(32)     NOT NULL,
    hash         CHAR(71)        NOT NULL,
    integrity    VARCHAR(100)    NOT NULL,
    file_name    VARCHAR(100)    NOT NULL,
    status       VARCHAR(16)     NOT NULL DEFAULT 'active',
    published_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_attestor_hash (hash),
    UNIQUE KEY uq_attestor_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
