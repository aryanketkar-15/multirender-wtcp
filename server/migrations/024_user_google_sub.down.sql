ALTER TABLE users
    DROP INDEX uq_users_google_sub,
    DROP COLUMN google_sub_bidx;
