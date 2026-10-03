// Full-stack check in a real browser against the real servers and database.
//
//   node e2e/full-stack.cjs
//
// Needs: MariaDB/MySQL up with the dev schema migrated, `php` on PATH, `npm ci` run in client/ and
// attestor/, the attestor built (attestor/dist) and registered (php server/bin/register_attestor.php).
// It starts the PHP API (8080), the attestor host (8090) and the Vite dev server (5173) itself.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'client/node_modules/playwright'));

const API = 'http://127.0.0.1:8080';
const APP = 'http://127.0.0.1:5173';
const OUTBOX = path.join(ROOT, 'server/var/outbox');
const email = `e2e${Date.now()}@example.com`;
const password = 'correct horse 9 battery';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

// --- An independent (JavaScript) verifier for the evidence log: RFC 9162 inclusion proofs and the
// --- Ed25519 signature on the tree head. Shares no code with the PHP that produced them.
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const sha = (b) => crypto.createHash('sha256').update(b).digest();
const nodeHash = (l, r) => sha(Buffer.concat([Buffer.from([1]), l, r]));
function verifyInclusion(proof, rootHex) {
  let fn = proof.leaf_index;
  let sn = proof.tree_size - 1;
  let r = Buffer.from(proof.leaf_hash, 'hex');
  for (const hex of proof.path) {
    const p = Buffer.from(hex, 'hex');
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      r = nodeHash(p, r);
      if ((fn & 1) === 0)
        while ((fn & 1) === 0 && fn !== 0) {
          fn >>= 1;
          sn >>= 1;
        }
    } else {
      r = nodeHash(r, p);
    }
    fn >>= 1;
    sn >>= 1;
  }
  return sn === 0 && r.toString('hex') === rootHex;
}
const jcsText = (v) =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? '[' + v.map(jcsText).join(',') + ']'
      : '{' +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + jcsText(v[k]))
          .join(',') +
        '}';
function verifyHeadSignature(record, signature, publicKeyHex) {
  const x = Buffer.from(publicKeyHex, 'hex').toString('base64url');
  const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
  return crypto.verify(null, Buffer.from(jcsText(record)), key, Buffer.from(signature, 'base64url'));
}

const children = [];
function start(cmd, args, cwd, label) {
  const p = spawn(cmd, args, { cwd, shell: process.platform === 'win32', stdio: 'ignore' });
  children.push(p);
  p.on('error', (e) => console.log(`${label} failed to start: ${e.message}`));
}
async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not start: ' + url);
}
async function post(p, body) {
  const r = await fetch(API + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.status;
}

(async () => {
  // MRA_PHP: the php binary (default `php`); MRA_PHP_FLAGS: extra flags such as "-d extension=sodium".
  const phpFlags = (process.env.MRA_PHP_FLAGS || '').split(' ').filter(Boolean);
  start(
    process.env.MRA_PHP || 'php',
    [...phpFlags, '-S', '127.0.0.1:8080', '-t', 'public', 'dev-router.php'],
    path.join(ROOT, 'server'),
    'php',
  );
  start('node', ['scripts/serve.cjs', '8090'], path.join(ROOT, 'attestor'), 'attestor host');
  start('npx', ['vite', '--port', '5173', '--host', '127.0.0.1'], path.join(ROOT, 'client'), 'vite');
  await Promise.all([
    waitFor(API + '/.well-known/mra-key'),
    waitFor('http://127.0.0.1:8090/manifest.json'),
    waitFor(APP + '/'),
  ]);

  check(
    'register',
    (await post('/api/register', {
      name: 'E2E User',
      email,
      password,
      password_confirm: password,
      accept_terms: true,
    })) === 201,
  );
  await post('/api/otp/request', { email });
  await new Promise((r) => setTimeout(r, 800));
  const mail = fs.readdirSync(OUTBOX).sort().pop();
  const code = fs.readFileSync(path.join(OUTBOX, mail), 'utf8').match(/\b(\d{6})\b/)[1];
  check('verify email by OTP', (await post('/api/otp/verify', { email, code })) === 200);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const posted = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/api/attest')) posted.push(JSON.parse(r.postData()));
  });
  const replies = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/api/attest'))
      replies.push({ status: r.status(), body: await r.json().catch(() => ({})) });
  });

  await page.goto(APP + '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(APP + '/');

  await page.goto(APP + '/consent');
  await page.locator('#consent-region').waitFor({ timeout: 15000 });
  await page.locator('details.evidence summary').click();
  await page
    .getByText(/^sha256:[a-f0-9]{64}$/)
    .first()
    .waitFor({ timeout: 15000 });
  const [loadRegion, loadContext] = await page.locator('details.evidence code').allTextContents();
  check(
    'attestor loaded cross-origin and produced digests at page load',
    /^sha256:/.test(loadRegion) && /^sha256:/.test(loadContext),
  );

  // The attack T4.2.4 describes: change the rendered page after load, before the user acts.
  await page.evaluate(() => {
    const p = document.querySelector('#disclosure');
    p.textContent = 'We will never share your data with anyone.';
  });
  await page.locator('#agree').check();
  await page.locator('#btn-agree').click();
  await page.getByText(/was recorded as signed evidence/).waitFor({ timeout: 15000 });

  check('exactly one attestation posted', posted.length === 1);
  const a = posted[0].attestation;
  check(
    'server accepted it (201): signature, key binding, nonce, window, policy all passed',
    replies[0].status === 201,
    replies[0].body.attestation_hash || '',
  );
  check(
    'digest at action time differs from the digest at page load',
    a.critical_region_digest !== loadRegion,
    `${a.critical_region_digest.slice(0, 18)}... vs ${loadRegion.slice(0, 18)}...`,
  );
  check(
    'attestation binds the commitment hash, not the bare bundle hash',
    a.commitment_hash && !('bundle_hash' in a),
  );
  check(
    'attestation carries both digests, nonce and the attestor hash',
    a.context_digest && a.nonce.length === 64 && /^sha256:/.test(a.attestor_hash),
  );
  check(
    'environment is recorded',
    a.env.engine === 'Blink' && ['small', 'medium', 'large'].includes(a.env.viewport_bucket),
    JSON.stringify(a.env),
  );

  // The log: two leaves, in order, provable by an independent verifier.
  check(
    'attestation response names both log leaves',
    typeof replies[0].body.log_leaf_index === 'number',
    JSON.stringify([replies[0].body.commitment_leaf_index, replies[0].body.log_leaf_index]),
  );
  check(
    'commitment leaf precedes attestation leaf',
    replies[0].body.commitment_leaf_index < replies[0].body.log_leaf_index,
  );
  const phpFlags2 = (process.env.MRA_PHP_FLAGS || '').split(' ').filter(Boolean);
  const signed = spawnSync(process.env.MRA_PHP || 'php', [...phpFlags2, 'bin/sign_sth.php'], {
    cwd: path.join(ROOT, 'server'),
    encoding: 'utf8',
    shell: false,
  });
  check('a tree head was signed', signed.status === 0, (signed.stdout || signed.stderr || '').trim());
  const keyDoc = await (await fetch(API + '/.well-known/mra-key')).json();
  const head = await (await fetch(API + '/api/log/head')).json();
  check(
    'tree head signature verifies in node:crypto (Ed25519)',
    verifyHeadSignature(head.record, head.signature, keyDoc.keys[0].public_key),
  );
  for (const [label, index] of [
    ['commitment', replies[0].body.commitment_leaf_index],
    ['attestation', replies[0].body.log_leaf_index],
  ]) {
    const res = await (await fetch(API + '/api/log/proof/' + index)).json();
    const sameSize = res.proof.tree_size === head.record.tree_size;
    check(
      label + ' leaf: inclusion proof verifies in JavaScript against the signed root',
      sameSize && verifyInclusion(res.proof, head.record.root_hash.slice(7)),
      'path of ' + res.proof.path.length,
    );
    const recomputed = sha(Buffer.concat([Buffer.from([0]), Buffer.from(jcsText(res.leaf.record))])).toString(
      'hex',
    );
    check(
      label + ' leaf: JavaScript recomputes the same leaf hash from the logged record',
      recomputed === res.proof.leaf_hash,
    );
  }

  // Replay: the same signed attestation again.
  const csrf = await page.evaluate(async () => (await (await fetch('/api/session')).json()).csrf_token);
  const replay = await page.evaluate(
    async ([body, token]) => {
      const r = await fetch('/api/attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify(body),
      });
      return { status: r.status, code: (await r.json()).error };
    },
    [posted[0], csrf],
  );
  check(
    'replaying the same attestation is refused',
    replay.status === 409 && replay.code === 'REPLAY_DETECTED',
    JSON.stringify(replay),
  );

  // A forged attestation: alter a digest after signing.
  const forged = JSON.parse(JSON.stringify(posted[0]));
  forged.attestation.context_digest = 'sha256:' + '0'.repeat(64);
  const forgedReply = await page.evaluate(
    async ([body, token]) => {
      const r = await fetch('/api/attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify(body),
      });
      return { status: r.status, code: (await r.json()).error };
    },
    [forged, csrf],
  );
  check(
    'an attestation altered after signing is refused',
    forgedReply.status === 401 && forgedReply.code === 'CLIENT_SIGNATURE_INVALID',
    JSON.stringify(forgedReply),
  );

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('E2E User'));
  const keysAfterLogout = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('mra-client', 1);
        r.onsuccess = () => {
          const tx = r.result.transaction('keys');
          const c = tx.objectStore('keys').count();
          c.onsuccess = () => res(c.result);
        };
        r.onerror = () => res(-1);
      }),
  );
  check(
    'the signing key is gone from IndexedDB after logout',
    keysAfterLogout === 0,
    'keys stored: ' + keysAfterLogout,
  );

  await browser.close();
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  children.forEach((c) => c.kill());
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('E2E FAILED', e);
  children.forEach((c) => c.kill());
  process.exit(1);
});
