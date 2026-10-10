ALTER TABLE evidence_pack
    DROP FOREIGN KEY fk_pack_attestation,
    DROP INDEX idx_pack_attestation,
    DROP COLUMN attestation_id;
