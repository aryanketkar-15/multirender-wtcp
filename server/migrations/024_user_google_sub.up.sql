-- Sign in with Google: the account is linked to Google's stable subject identifier ("sub"), kept as an
-- HMAC blind index like the email (the raw value is never stored). Matching on sub, not on email,
-- means a changed or reassigned Google email cannot take over an existing account.
ALTER TABLE users
    ADD COLUMN google_sub_bidx BINARY(32) NULL AFTER email_bidx,
    ADD UNIQUE KEY uq_users_google_sub (google_sub_bidx);
