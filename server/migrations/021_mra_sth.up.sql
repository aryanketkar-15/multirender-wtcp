-- Signed tree heads, and the record of where each was published. Both are append-only.
CREATE TABLE mra_sth (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tree_size   BIGINT UNSIGNED NOT NULL,
    root_hash   BINARY(32)      NOT NULL,
    key_id      VARCHAR(32)     NOT NULL,
    signature   VARCHAR(100)    NOT NULL,
    record_json TEXT            NOT NULL,
    signed_at   DATETIME(6)     NOT NULL,
    UNIQUE KEY uq_sth_size (tree_size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mra_sth_publication (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    sth_id       BIGINT UNSIGNED NOT NULL,
    target       VARCHAR(100)    NOT NULL,
    reference    VARCHAR(200)    NOT NULL,
    published_at DATETIME(6)     NOT NULL,
    KEY idx_publication_sth (sth_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
