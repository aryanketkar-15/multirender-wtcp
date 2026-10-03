CREATE TABLE audit_log (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_id    BIGINT UNSIGNED NULL,
    action      VARCHAR(80)     NOT NULL,
    target_type VARCHAR(40)     NULL,
    target_id   VARCHAR(64)     NULL,
    outcome     VARCHAR(16)     NOT NULL,
    detail      TEXT            NULL,
    ip_enc      VARBINARY(512)  NULL,
    ua_enc      VARBINARY(1024) NULL,
    created_at  DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_audit_created (created_at),
    KEY idx_audit_actor (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
