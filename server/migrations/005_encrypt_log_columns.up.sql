-- ip_enc / ua_enc now hold XChaCha20-Poly1305 ciphertext (24-byte nonce + data + 16-byte tag).
ALTER TABLE audit_log
    MODIFY ip_enc VARBINARY(1024) NULL,
    MODIFY ua_enc VARBINARY(2048) NULL;
ALTER TABLE security_log
    MODIFY ip_enc VARBINARY(1024) NULL;
