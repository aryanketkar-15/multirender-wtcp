CREATE TABLE throttle_event (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bucket     VARCHAR(48)     NOT NULL,
    subject    BINARY(32)      NOT NULL,
    created_at DATETIME(6)     NOT NULL,
    KEY idx_throttle_lookup (bucket, subject, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
