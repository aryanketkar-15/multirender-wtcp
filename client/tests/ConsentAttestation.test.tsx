import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fixture from './fixtures/php-bundle.json';
import { Consent } from '../src/pages/Consent';
import * as apiModule from '../src/lib/api';
import { jcs, sha256Hex } from '../src/lib/bundle';
import type { BundlePayload } from '../src/lib/bundle';
import { resetClientKeyForTests } from '../src/lib/clientKey';
import * as loader from '../src/lib/loadAttestor';

jest.mock('../src/lib/loadAttestor', () => ({
  ...jest.requireActual('../src/lib/loadAttestor'),
  loadAttestor: jest.fn(),
}));

const ATTESTOR_HASH = 'sha256:' + 'c'.repeat(64);
const NONCE = 'n'.repeat(64);
const evidence = {
  critical_region_digest: 'sha256:' + '1'.repeat(64),
  context_digest: 'sha256:' + '2'.repeat(64),
  env: {
    engine: 'Blink',
    engine_major: '154',
    viewport_bucket: 'large',
    dpr_bucket: '1x',
    forced_colors: false,
    reduced_motion: false,
  },
  attestor_version: '1.0.0',
  region_nodes: 5,
  context_nodes: 6,
};
const fakeModule = { ATTESTOR_VERSION: '1.0.0', attest: jest.fn() };

type Reply = { ok: boolean; status: number; data: Record<string, unknown> };
const attestReplies: Reply[] = [];

async function payload(): Promise<BundlePayload> {
  const bundle = JSON.parse(JSON.stringify(fixture.bundle)) as BundlePayload['bundle'];
  const commitment = {
    v: 'mra/1.0',
    type: 'server_commitment',
    session_id: 'abcdef0123456789',
    bundle_hash: fixture.bundle_hash,
    nonce: NONCE,
    expires_at: '2026-10-03T12:15:00Z',
    attestor_hash: ATTESTOR_HASH,
  };
  return {
    bundle,
    bundle_hash: fixture.bundle_hash,
    commitment,
    commitment_hash: 'sha256:' + (await sha256Hex(jcs(commitment))),
    signature: 'sig',
    nonce: NONCE,
    attestor: {
      url: 'http://attestor.test/a.js',
      version: '1.0.0',
      integrity: 'sha384-x',
      hash: ATTESTOR_HASH,
    },
  };
}

async function setup(prepare?: () => void) {
  resetClientKeyForTests();
  attestReplies.length = 0;
  jest.mocked(loader.loadAttestor).mockClear();
  jest.mocked(loader.loadAttestor).mockResolvedValue(fakeModule);
  fakeModule.attest.mockReset();
  fakeModule.attest.mockResolvedValue(evidence);
  prepare?.();
  const post = jest.spyOn(apiModule.api, 'post').mockImplementation(async (path: string) => {
    if (path !== '/api/attest') return { ok: true, status: 200, data: {} };
    return (
      attestReplies.shift() ?? {
        ok: true,
        status: 201,
        data: { attestation_hash: 'sha256:' + 'e'.repeat(64) },
      }
    );
  });
  jest
    .spyOn(apiModule.api, 'get')
    .mockResolvedValue({ ok: true, status: 200, data: (await payload()) as never });
  render(
    <MemoryRouter>
      <Consent />
    </MemoryRouter>,
  );
  return { post, user: userEvent.setup() };
}

const sent = (post: jest.SpyInstance) =>
  post.mock.calls.filter(([path]) => path === '/api/attest').map(([, body]) => body);

const RECORDED = /was recorded as signed evidence/;

describe('attestation signed at the moment of action (T4.2)', () => {
  afterEach(() => jest.restoreAllMocks());

  async function acceptOnce() {
    const ctx = await setup();
    await ctx.user.click(await screen.findByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    return ctx;
  }

  it('posts a signed attestation on accept, bound to the commitment hash (T4.2.1, T4.2.3)', async () => {
    const { post } = await acceptOnce();
    await screen.findByText(RECORDED);
    const [body] = sent(post);
    expect(body.attestation).toMatchObject({
      v: 'mra/1.0',
      type: 'client_attestation',
      action: 'accept',
      action_target: 'btn-agree',
      attestor_hash: ATTESTOR_HASH,
      session_id: 'abcdef0123456789',
    });
    expect(body.attestation.commitment_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(body.attestation).not.toHaveProperty('bundle_hash');
    expect(body.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
  });

  it('posts action reject when Reject is clicked (T4.2.2)', async () => {
    const { post, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    await screen.findByText(RECORDED);
    expect(sent(post)[0].attestation).toMatchObject({
      action: 'reject',
      action_target: 'btn-reject',
    });
  });

  it('includes both digests, the recorded environment and the issued nonce (T4.2.5, T4.2.7)', async () => {
    const { post } = await acceptOnce();
    await screen.findByText(RECORDED);
    const a = sent(post)[0].attestation;
    expect(a.critical_region_digest).toBe(evidence.critical_region_digest);
    expect(a.context_digest).toBe(evidence.context_digest);
    expect(a.nonce).toBe(NONCE);
    expect(a.env).toEqual(evidence.env);
  });

  it('measures at the moment of the action, not at page load (T4.2.4)', async () => {
    const changed = {
      ...evidence,
      critical_region_digest: 'sha256:' + '9'.repeat(64),
      context_digest: 'sha256:' + '8'.repeat(64),
    };
    const ctx = await setup(() => {
      fakeModule.attest.mockReset();
      fakeModule.attest.mockResolvedValueOnce(evidence).mockResolvedValue(changed);
    });
    await screen.findByText(evidence.critical_region_digest);
    await ctx.user.click(screen.getByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    await screen.findByText(RECORDED);
    expect(fakeModule.attest).toHaveBeenCalledTimes(2);
    const a = sent(ctx.post)[0].attestation;
    expect(a.critical_region_digest).toBe(changed.critical_region_digest);
    expect(a.context_digest).toBe(changed.context_digest);
  });

  it('measures the page as the user saw it, before the controls are locked (found in milestone 6.3)', async () => {
    // Regression: the digest was once taken after the client had disabled every control, so a
    // re-render of the committed bundle (which still has them enabled) could never match it.
    const seen: Record<string, boolean> = {};
    const ctx = await setup(() => {
      fakeModule.attest.mockImplementation(async () => {
        seen.boxTicked = (screen.getByRole('checkbox') as HTMLInputElement).checked;
        seen.boxEnabled = !(screen.getByRole('checkbox') as HTMLInputElement).disabled;
        seen.acceptEnabled = !(screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement)
          .disabled;
        seen.rejectEnabled = !(screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement)
          .disabled;
        return evidence;
      });
    });
    await ctx.user.click(await screen.findByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    await screen.findByText(RECORDED);
    expect(seen).toEqual({
      boxTicked: true,
      boxEnabled: true,
      acceptEnabled: true,
      rejectEnabled: true,
    });
  });

  it('signs so that the signature verifies against the carried public key (T4.2.6)', async () => {
    const { post } = await acceptOnce();
    await screen.findByText(RECORDED);
    const { attestation, signature } = sent(post)[0];
    const body = String(attestation.client_pubkey).replace(/-----[A-Z ]+-----|\s/g, '');
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'spki',
      der,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const raw = Uint8Array.from(
      atob(String(signature).replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const verify = (text: string) =>
      crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        raw,
        new TextEncoder().encode(text),
      );
    expect(await verify(jcs(attestation))).toBe(true);
    expect(await verify(jcs({ ...attestation, action: 'reject' }))).toBe(false);
  });

  it('sends exactly one attestation on a double click', async () => {
    const ctx = await setup();
    await ctx.user.click(await screen.findByRole('checkbox'));
    await ctx.user.dblClick(screen.getByRole('button', { name: 'Accept' }));
    await screen.findByText(RECORDED);
    expect(sent(ctx.post)).toHaveLength(1);
  });

  it('shows a clear error and offers a retry on network failure, then resends the same payload (T4.2.8)', async () => {
    const ctx = await setup(() => {
      attestReplies.push({ ok: false, status: 0, data: {} });
    });
    await ctx.user.click(await screen.findByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was recorded');
    await ctx.user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(RECORDED);
    const [first, second] = sent(ctx.post);
    expect(second).toEqual(first);
    expect(fakeModule.attest).toHaveBeenCalledTimes(2); // load plus action; a retry does not re-measure
  });

  it('treats a server error as retryable too', async () => {
    const ctx = await setup(() => {
      attestReplies.push({ ok: false, status: 503, data: {} });
    });
    await ctx.user.click(await screen.findByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was recorded');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers only a reload for a refusal, never a retry', async () => {
    const ctx = await setup(() => {
      attestReplies.push({ ok: false, status: 409, data: { error: 'REPLAY_DETECTED' } });
    });
    await ctx.user.click(await screen.findByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been recorded');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('records nothing if the page cannot be measured and signed', async () => {
    const ctx = await setup();
    await screen.findByText(/We share your usage data/);
    fakeModule.attest.mockRejectedValueOnce(new Error('layout failed'));
    await ctx.user.click(screen.getByRole('checkbox'));
    await ctx.user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be measured and signed');
    expect(sent(ctx.post)).toHaveLength(0);
  });

  it('locks the controls while and after recording', async () => {
    const ctx = await acceptOnce();
    await screen.findByText(RECORDED);
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(sent(ctx.post)).toHaveLength(1);
  });
});
