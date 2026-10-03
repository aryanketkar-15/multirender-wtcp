ALTER TABLE sessions ADD COLUMN client_pubkey_fpr CHAR(71) NULL AFTER csrf_token;
