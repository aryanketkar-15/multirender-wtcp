-- Link evidence packs to their underlying validated attestation.
ALTER TABLE evidence_pack
    ADD COLUMN attestation_id BIGINT UNSIGNED NULL AFTER owner_user_id,
    ADD KEY idx_pack_attestation (attestation_id),
    ADD CONSTRAINT fk_pack_attestation FOREIGN KEY (attestation_id) REFERENCES mra_attestation (id) ON DELETE CASCADE;
