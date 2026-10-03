-- Nonces and fingerprints are public evidence values (D-15): plaintext.
CREATE TABLE mra_nonce (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nonce             CHAR(64)        NOT NULL,
    session_id        CHAR(64)        NOT NULL,
    user_id           BIGINT UNSIGNED NOT NULL,
    client_pubkey_fpr CHAR(71)        NOT NULL,
    bundle_id         VARCHAR(64)     NOT NULL,
    issued_at         DATETIME(6)     NOT NULL,
    expires_at        DATETIME(6)     NOT NULL,
    consumed_at       DATETIME(6)     NULL,
    UNIQUE KEY uq_nonce (nonce),
    KEY idx_nonce_session (session_id),
    CONSTRAINT fk_nonce_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
