CREATE TABLE security_log (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(80)     NOT NULL,
    actor_id   BIGINT UNSIGNED NULL,
    detail     TEXT            NULL,
    ip_enc     VARBINARY(512)  NULL,
    severity   VARCHAR(16)     NOT NULL,
    created_at DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_security_created (created_at),
    KEY idx_security_event (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
