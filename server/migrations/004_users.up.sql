CREATE TABLE users (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email_enc     VARBINARY(512)  NOT NULL,
    email_bidx    BINARY(32)      NOT NULL,
    name_enc      VARBINARY(512)  NOT NULL,
    password_hash VARCHAR(255)    NOT NULL,
    verified_at   DATETIME(6)     NULL,
    created_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at    DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY uq_users_email_bidx (email_bidx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
