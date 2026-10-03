CREATE TABLE user_otp (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    code_hash  VARCHAR(255)    NOT NULL,
    expires_at DATETIME(6)     NOT NULL,
    attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME(6)     NOT NULL,
    KEY idx_otp_user (user_id),
    CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
