CREATE TABLE consent_settings (
    id               TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    disclosure_text  TEXT             NOT NULL,
    accept_label     VARCHAR(40)      NOT NULL,
    reject_label     VARCHAR(40)      NOT NULL,
    validity_minutes SMALLINT UNSIGNED NOT NULL,
    retention_days   SMALLINT UNSIGNED NOT NULL,
    updated_by       BIGINT UNSIGNED  NULL,
    updated_at       DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO consent_settings (id, disclosure_text, accept_label, reject_label, validity_minutes, retention_days)
VALUES (1, 'We share your usage data with selected partners for advertising and analytics. You can withdraw consent at any time from your account.', 'Accept', 'Reject', 15, 365);
