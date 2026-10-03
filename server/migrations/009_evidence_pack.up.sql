-- Ownership stub for evidence packs. The pack contents arrive in a later phase; the
-- authorization boundary (a user reaches only their own packs) is established now.
CREATE TABLE evidence_pack (
    id            VARCHAR(40)     NOT NULL PRIMARY KEY,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    created_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_pack_owner (owner_user_id),
    CONSTRAINT fk_pack_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
