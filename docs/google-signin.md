# Sign in and sign up with Google

"Continue with Google" appears on the sign-in and sign-up pages **only when the server has a Google client id configured**. Without one, nothing from Google is loaded and no button is shown. Sign in and sign up are one flow: the first time a Google identity is seen the server creates the account (already verified, because Google has verified the address); afterwards it signs in.

## Turning it on

1. In the Google Cloud Console, create an OAuth client of type **Web application** (Google Auth Platform, Clients). Under **Authorized JavaScript origins** add every origin the app is served from: for local development `http://localhost:5173`, `http://127.0.0.1:5173` and `http://localhost`, and your real `https://` origin in production. While the OAuth consent screen is in testing, also add your Google account under **Test users**; otherwise Google refuses the sign-in. Changes can take a few minutes to apply.
2. Put the client id in `server/.env`:

   ```
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

   No client secret is needed: the browser receives a signed ID token from Google and the server verifies it. Restart the PHP server and run `php bin/migrate.php up` once (migration 024 adds the `google_sub_bidx` column).
3. Open `/login` or `/register`. The button appears.

This creates a credential in your own Google Cloud project. It was not created for you and is not in the repository.

## What the server checks (`GoogleIdTokenVerifier`)

- **Signature:** RS256 only, against Google's published keys (`https://www.googleapis.com/oauth2/v3/certs`, cached for an hour, one forced refresh when the key id is unknown, fail closed when no keys are available). A token claiming `alg: none` or an HMAC algorithm is refused before any key is used (algorithm confusion).
- **Issuer** is `accounts.google.com` or `https://accounts.google.com`; **audience** equals *our* client id (a token minted for another app is refused); **expiry** with a 60 s skew allowance; **issued-at** not in the future.
- **Email** present and `email_verified` true; **subject** (`sub`) present.

## Account rules (`GoogleAuthService`)

| Situation | Result |
|---|---|
| Google subject already linked | Sign in to that account. The email in the token is not used to find it, so a changed or reassigned email cannot take it over |
| New Google identity, email not registered | Account created, verified, with an unusable random password |
| Email belongs to a **verified** account | Linked; the account keeps its password |
| Email belongs to an **unverified** account | Claimed: its password is replaced by an unusable one and the account is marked verified. Whoever registered it never proved they own the address (the pre-hijacking attack), so they must not keep a working password |

A Google-created account has no password until the owner uses "Forgot your password", which works because they control the email. Failed attempts are throttled per IP (20 per hour). The endpoint requires the session and CSRF token like every state-changing request, and the session identifier is replaced on sign-in. The Google subject is stored only as an HMAC blind index (`google_sub_bidx`), like the email lookup key; name and email stay encrypted.

## Privacy and security trade-offs

- The sign-in pages load a script from `accounts.google.com`; Google can see that the page was visited. The page says so. The consent page never loads it.
- The application sets **no Content-Security-Policy** today. If one is added, it must allow `https://accounts.google.com/gsi/` for script, frame and connect, and the style source Google's button uses.
- Only name and verified email are used. No Google API access, no refresh token, no Google session is kept.

## What was and was not tested

Tested with Google's part played locally (`tests/Support/GoogleTokenFactory`, an RSA key pair, the matching key set and signed tokens): 17 verifier tests (valid token, tampered payload, `alg: none`, HMAC confusion, wrong audience and issuer, expiry and skew, future `iat`, unverified email, key rotation, malformed input), 12 sign-in tests through the real kernel (creation, repeat sign-in, subject match with a changed email, linking, pre-hijacking, refused tokens create nothing, throttling, CSRF, endpoint absent when unconfigured, audit), and 7 client tests with a fake Google script.

**Checked against the real client id on 2026-10-20:** the server advertises the id and Google's own script loads and draws the button. Google then reported `The given origin is not allowed for the given client ID` for `http://localhost:5173` and `http://127.0.0.1:5173`, which means the authorized origins had not been added to that client yet. This is configuration in the Cloud console, not a code problem.

**Not tested here: a completed round trip with Google.** That needs your client id and a real Google account, and the fetch of Google's live key set was not exercised. Try it once after configuring and treat any failure there as an open item.
