CREATE TABLE sessions (
    id           CHAR(64)        NOT NULL PRIMARY KEY,
    user_id      BIGINT UNSIGNED NULL,
    csrf_token   CHAR(64)        NOT NULL,
    created_at   DATETIME(6)     NOT NULL,
    last_seen_at DATETIME(6)     NOT NULL,
    KEY idx_sessions_user (user_id),
    KEY idx_sessions_seen (last_seen_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
