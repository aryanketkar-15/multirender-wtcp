'use strict';

/**
 * Dev Backend Server for MRA Studio.
 * Runs on port 8080 to provide full authentication, session management,
 * demo credentials, and consent flow endpoints for the React frontend.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const ROOT = path.join(__dirname, '..');

// Load exact authentic bundle & commitment from honest_pack.zip for mathematical precision
const AdmZip = require(path.join(ROOT, 'verifier', 'node_modules', 'adm-zip'));
const honestZip = new AdmZip(path.join(ROOT, 'client', 'public', 'fixtures', 'honest_pack.zip'));
const authenticBundle = JSON.parse(honestZip.readAsText('bundle.json'));
const authenticCommitment = JSON.parse(honestZip.readAsText('commitment.json'));

// Demo credentials
const DEMO_USERS = [
  {
    id: 1,
    email: 'demo@vit.edu',
    password: 'DemoPassword123!',
    name: 'Demo User',
    verified: true,
    admin: false,
  },
  {
    id: 2,
    email: 'admin@vit.edu',
    password: 'AdminPassword123!',
    name: 'Prof. Rahul Diwate (Admin)',
    verified: true,
    admin: true,
  },
  {
    id: 3,
    email: 'cragrawal25022006@gmail.com',
    password: 'DemoPassword123!',
    name: 'Chetan Agrawal',
    verified: true,
    admin: false,
  },
];

const USERS_FILE = path.join(ROOT, 'server', 'var', 'dev-users.json');

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        // Ensure default DEMO_USERS exist
        for (const demo of DEMO_USERS) {
          if (!data.some((u) => u.email.toLowerCase() === demo.email.toLowerCase())) {
            data.push(demo);
          }
        }
        return data;
      }
    }
  } catch (e) {
    console.warn('[mra-dev-backend] Could not read dev-users.json:', e.message);
  }
  return [...DEMO_USERS];
}

function saveUsers(users) {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('[mra-dev-backend] Could not write dev-users.json:', e.message);
  }
}

function generateOutboxFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const rand = Math.random().toString(16).slice(2, 10);
  return `${dateStr}-${rand}.txt`;
}

function sendOtpEmail(email, code) {
  try {
    const outboxDir = path.join(ROOT, 'server', 'var', 'outbox');
    if (!fs.existsSync(outboxDir)) fs.mkdirSync(outboxDir, { recursive: true });
    const filename = generateOutboxFilename();
    const content = `To: ${email}\nSubject: Your MRA verification code\n\nYour verification code is ${code}.\nIt expires in 10 minutes. If you did not ask for it, ignore this message.\n`;
    fs.writeFileSync(path.join(outboxDir, filename), content, 'utf8');
    console.log(`[mra-dev-backend] Wrote verification OTP code ${code} for ${email} to server/var/outbox/${filename}`);
    return filename;
  } catch (err) {
    console.error('[mra-dev-backend] Failed to write OTP to outbox:', err.message);
    return null;
  }
}

// In-memory state with disk persistence
let currentSession = null;
const registeredUsers = loadUsers();
saveUsers(registeredUsers);
const userClientKeys = new Map();
const pendingOtps = new Map();

// Sample packs for /api/pack matching EvidencePackItem interface
const mockPacks = [
  {
    id: 'pack-d3a3fd08eefea796079918ab7f1b6446',
    owner_user_id: 1,
    attestation_id: 1,
    action: 'accept',
    attestation_hash: 'sha256:8b0bf0298af1b5cd55d14df1753a533530c90f9176516f6e63205f99ed3a3199',
    commitment_hash: 'sha256:ea9c694f0abd72702b7f8b028efb27277c4d94aa28160e43c3f1ffb934b916a6',
    created_at: '2026-10-15 06:18:58',
  },
];

// Admin consent settings
let consentSettings = {
  disclosure_text:
    'We share your usage data with selected partners for advertising and analytics. You can withdraw consent at any time from your account.',
  accept_label: 'Accept',
  reject_label: 'Reject',
  validity_minutes: 15,
  retention_days: 365,
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
    });
    res.end();
    return;
  }

  // 1. Session check: GET /api/session
  if (req.method === 'GET' && pathname === '/api/session') {
    sendJson(res, 200, {
      authenticated: !!currentSession,
      user: currentSession,
      csrf_token: 'mra-csrf-valid-token-vit-2026',
    });
    return;
  }

  // 2. Login: POST /api/login
  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    // Refresh from disk to ensure any newly added accounts are loaded
    const currentUsers = loadUsers();
    let user = currentUsers.find((u) => u.email.toLowerCase() === email);

    if (!user || user.password !== password) {
      sendJson(res, 401, { error: 'invalid_credentials' });
      return;
    }

    // Auto-verify user upon valid credentials and persist
    user.verified = true;
    saveUsers(currentUsers);

    currentSession = {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: true,
      admin: !!user.admin,
    };

    sendJson(res, 200, {
      authenticated: true,
      user: currentSession,
      csrf_token: 'mra-csrf-valid-token-vit-2026',
    });
    return;
  }

  // 3. Register: POST /api/register
  if (req.method === 'POST' && pathname === '/api/register') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();

    const currentUsers = loadUsers();
    if (currentUsers.some((u) => u.email.toLowerCase() === email)) {
      sendJson(res, 409, { error: 'account_exists' });
      return;
    }

    const otpCode = '123456';
    pendingOtps.set(email, otpCode);

    // Immediately generate and write OTP file to server/var/outbox
    sendOtpEmail(email, otpCode);

    const newUser = {
      id: currentUsers.length + 1,
      email,
      password: String(body.password || ''),
      name: String(body.name || 'New User'),
      verified: true, // Activated for seamless login and instant access
      admin: false,
    };
    currentUsers.push(newUser);
    saveUsers(currentUsers);
    registeredUsers.length = 0;
    registeredUsers.push(...currentUsers);

    sendJson(res, 201, { status: 'created', email, code: otpCode });
    return;
  }

  // 4. Request OTP: POST /api/otp/request
  if (req.method === 'POST' && pathname === '/api/otp/request') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const otpCode = '123456';
    pendingOtps.set(email, otpCode);

    // Write outgoing email to server/var/outbox
    sendOtpEmail(email, otpCode);

    sendJson(res, 202, { status: 'code_sent', code: otpCode, hint: 'Demo OTP is 123456' });
    return;
  }

  // 5. Verify OTP: POST /api/otp/verify
  if (req.method === 'POST' && pathname === '/api/otp/verify') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();

    const expected = pendingOtps.get(email) || '123456';
    if (code === expected || code === '123456') {
      const currentUsers = loadUsers();
      const user = currentUsers.find((u) => u.email.toLowerCase() === email);
      if (user) {
        user.verified = true;
        saveUsers(currentUsers);
        currentSession = {
          id: user.id,
          email: user.email,
          name: user.name,
          verified: true,
          admin: !!user.admin,
        };
      }
      sendJson(res, 200, { authenticated: true, user: currentSession });
      return;
    }

    sendJson(res, 422, { error: 'invalid_otp' });
    return;
  }

  // 6. Logout: POST /api/logout
  if (req.method === 'POST' && pathname === '/api/logout') {
    currentSession = null;
    sendJson(res, 200, { ok: true, status: 'logged_out' });
    return;
  }

  // 7. Client Key Registration: POST /api/client-key
  if (req.method === 'POST' && pathname === '/api/client-key') {
    const body = await readBody(req);
    if (currentSession) {
      userClientKeys.set(currentSession.id, body.fingerprint);
    }
    sendJson(res, 200, { ok: true, registered: true });
    return;
  }

  // 8. Well-Known MRA Key: GET /.well-known/mra-key
  if (req.method === 'GET' && pathname === '/.well-known/mra-key') {
    sendJson(res, 200, {
      keys: [
        {
          key_id: 'k1',
          public_key: 'e9438cea6680595ef8c6c93214b670101dcc5fe9559729005e92c41e184a193a',
          status: 'current',
        },
      ],
    });
    return;
  }

  // 9. Bundle for Consent: GET /api/bundle
  if (req.method === 'GET' && pathname === '/api/bundle') {
    sendJson(res, 200, {
      bundle: authenticBundle,
      bundle_hash: authenticCommitment.record.bundle_hash,
      commitment: authenticCommitment.record,
      commitment_hash: authenticCommitment.commitment_hash,
      signature: authenticCommitment.signature,
      nonce: authenticCommitment.record.nonce,
      attestor: {
        url: 'http://127.0.0.1:8090/mra-attestor-1.1.0.js',
        version: '1.1.0',
        integrity: 'sha384-AUZ0cI/sCH+VO7dG6hRBQPI2KrfscD2o5dRcPoimFufiLqfIMb309p1Up2K0HQiz',
        hash: authenticCommitment.record.attestor_hash,
        sha384: 'sha384-AUZ0cI/sCH+VO7dG6hRBQPI2KrfscD2o5dRcPoimFufiLqfIMb309p1Up2K0HQiz',
        sha256: authenticCommitment.record.attestor_hash,
      },
    });
    return;
  }

  // 10. Record Attestation: POST /api/attest
  if (req.method === 'POST' && pathname === '/api/attest') {
    const body = await readBody(req);
    const newPackId = 'pack-' + Date.now().toString(16);
    const crypto = require('crypto');
    let attHash = 'sha256:8b0bf0298af1b5cd55d14df1753a533530c90f9176516f6e63205f99ed3a3199';
    if (body.attestation) {
      try {
        attHash = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(body.attestation)).digest('hex');
      } catch (e) {}
    }
    const userAction = (body.attestation && body.attestation.action) || body.action || 'accept';
    mockPacks.unshift({
      id: newPackId,
      owner_user_id: currentSession ? currentSession.id : 1,
      attestation_id: mockPacks.length + 1,
      action: userAction,
      attestation_hash: attHash,
      commitment_hash: authenticCommitment.commitment_hash,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
    });
    sendJson(res, 201, {
      ok: true,
      pack_id: newPackId,
      attestation_hash: attHash,
      log_leaf_index: 17,
      commitment_leaf_index: 16,
      status: 'attested_and_logged',
    });
    return;
  }

  // 11. My Packs: GET /api/pack
  if (req.method === 'GET' && pathname === '/api/pack') {
    sendJson(res, 200, { packs: mockPacks });
    return;
  }

  // 12. Download Evidence Pack: GET /api/pack/:id/download
  if (req.method === 'GET' && pathname.includes('/download')) {
    const zipPath = path.join(ROOT, 'demo-evidence-packs', 'honest_pack.zip');
    if (fs.existsSync(zipPath)) {
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'attachment; filename="evidence_pack.zip"',
      });
      fs.createReadStream(zipPath).pipe(res);
      return;
    }
  }

  // 13. Admin Consent Settings: GET /api/admin/consent
  if (req.method === 'GET' && pathname === '/api/admin/consent') {
    if (!currentSession || !currentSession.admin) {
      sendJson(res, 403, { error: 'admin_required' });
      return;
    }
    sendJson(res, 200, { settings: consentSettings });
    return;
  }

  // 14. Admin Consent Settings Update: POST /api/admin/consent
  if (req.method === 'POST' && pathname === '/api/admin/consent') {
    if (!currentSession || !currentSession.admin) {
      sendJson(res, 403, { error: 'admin_required' });
      return;
    }
    const body = await readBody(req);
    consentSettings = {
      ...consentSettings,
      disclosure_text: body.disclosure_text || consentSettings.disclosure_text,
      accept_label: body.accept_label || consentSettings.accept_label,
      reject_label: body.reject_label || consentSettings.reject_label,
      validity_minutes: Number(body.validity_minutes) || consentSettings.validity_minutes,
      retention_days: Number(body.retention_days) || consentSettings.retention_days,
    };
    sendJson(res, 200, { ok: true, settings: consentSettings });
    return;
  }

  // Fallthrough 404
  sendJson(res, 404, { error: 'not_found', path: pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mra-dev-backend] API server listening on http://127.0.0.1:${PORT}`);
});
