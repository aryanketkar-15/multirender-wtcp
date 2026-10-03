import { render, screen, waitFor } from '@testing-library/react';
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
const evidence = {
  critical_region_digest: 'sha256:' + '1'.repeat(64),
  context_digest: 'sha256:' + '2'.repeat(64),
  env: {},
  attestor_version: '1.0.0',
  region_nodes: 5,
  context_nodes: 6,
};
const fakeModule = {
  ATTESTOR_VERSION: '1.0.0',
  attest: jest.fn().mockResolvedValue(evidence),
};

async function goodPayload(): Promise<BundlePayload> {
  const bundle = JSON.parse(JSON.stringify(fixture.bundle)) as BundlePayload['bundle'];
  const commitment = {
    v: 'mra/1.0',
    type: 'server_commitment',
    bundle_hash: fixture.bundle_hash,
    nonce: 'n'.repeat(64),
    expires_at: '2026-10-03T12:15:00Z',
    attestor_hash: ATTESTOR_HASH,
  };
  return {
    bundle,
    bundle_hash: fixture.bundle_hash,
    commitment,
    commitment_hash: 'sha256:' + (await sha256Hex(jcs(commitment))),
    signature: 'sig',
    nonce: commitment.nonce,
    attestor: {
      url: 'http://attestor.test/mra-attestor-1.0.0.js',
      version: '1.0.0',
      integrity: 'sha384-x',
      hash: ATTESTOR_HASH,
    },
  };
}

async function setup(payload?: BundlePayload, bundleStatus = 200, prepare?: () => void) {
  resetClientKeyForTests();
  jest.mocked(loader.loadAttestor).mockClear();
  jest.mocked(loader.loadAttestor).mockResolvedValue(fakeModule);
  fakeModule.attest.mockResolvedValue(evidence);
  prepare?.();
  const post = jest
    .spyOn(apiModule.api, 'post')
    .mockResolvedValue({ ok: true, status: 200, data: {} });
  const body = payload ?? (await goodPayload());
  jest.spyOn(apiModule.api, 'get').mockResolvedValue({
    ok: bundleStatus === 200,
    status: bundleStatus,
    data: body as never,
  });
  render(
    <MemoryRouter>
      <Consent />
    </MemoryRouter>,
  );
  return { post, user: userEvent.setup() };
}

describe('Consent page', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the critical region with the committed text', async () => {
    await setup();
    expect(await screen.findByText(/We share your usage data with our partners/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('registers the browser key fingerprint before asking for the bundle', async () => {
    const { post } = await setup();
    await screen.findByText(/We share your usage data/);
    expect(post).toHaveBeenCalledWith('/api/client-key', {
      fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it('shows a loading state first', async () => {
    await setup();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing');
    await screen.findByText(/We share your usage data/);
  });

  it('refuses to render a tampered bundle and offers no action', async () => {
    const p = await goodPayload();
    p.bundle.markup = p.bundle.markup.replace('advertising', 'advertisinG');
    await setup(p);
    expect(await screen.findByRole('alert')).toHaveTextContent('This page was not displayed');
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.queryByText(/We share your usage data/)).not.toBeInTheDocument();
  });

  it('never ticks the consent box by default', async () => {
    await setup();
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
  });

  it('keeps Accept disabled until the box is ticked', async () => {
    const { user } = await setup();
    const accept = await screen.findByRole('button', { name: 'Accept' });
    expect(accept).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(accept).toBeEnabled();
    await user.click(screen.getByRole('checkbox'));
    expect(accept).toBeDisabled();
  });

  it('records exactly one action on a double click', async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole('checkbox'));
    const accept = screen.getByRole('button', { name: 'Accept' });
    await user.dblClick(accept);
    const status = await screen.findByText(/was captured on this device/);
    expect(status).toHaveTextContent('accept');
    expect(screen.getAllByText(/was captured on this device/)).toHaveLength(1);
    expect(accept).toBeDisabled();
  });

  it('captures a rejection without needing the box ticked', async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText(/was captured on this device/)).toHaveTextContent('reject');
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it('is fully operable from the keyboard', async () => {
    const { user } = await setup();
    await screen.findByRole('checkbox');
    await user.tab(); // header brand link
    let guard = 0;
    while (document.activeElement?.id !== 'agree' && guard++ < 10) await user.tab();
    expect(document.activeElement).toHaveAttribute('id', 'agree');
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox')).toBeChecked();
    await user.tab();
    expect(document.activeElement).toHaveAttribute('id', 'btn-agree');
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/was captured on this device/)).toHaveTextContent('accept');
  });

  it('keeps every focusable control reachable in a sensible order', async () => {
    await setup();
    await screen.findByRole('checkbox');
    const ids = [
      ...document.querySelectorAll<HTMLElement>('#consent-region input, #consent-region button'),
    ]
      .filter((e) => !(e as HTMLButtonElement).disabled || e.id === 'btn-agree')
      .map((e) => e.id);
    expect(ids).toEqual(['agree', 'btn-agree', 'btn-reject']);
  });

  it.each([
    [401, /session has ended/i],
    [403, /verify your email/i],
    [500, /could not load/i],
  ])('shows an error state when the bundle request fails with %i', async (status, pattern) => {
    await setup(undefined, status);
    expect(await screen.findByRole('alert')).toHaveTextContent(pattern);
  });

  describe('the attestation module is part of the evidence (T3.5.3, T3.5.8)', () => {
    it('shows both digests produced by the loaded module', async () => {
      await setup();
      await screen.findByText(/We share your usage data/);
      expect(await screen.findByText(evidence.critical_region_digest)).toBeInTheDocument();
      expect(screen.getByText(evidence.context_digest)).toBeInTheDocument();
      expect(fakeModule.attest).toHaveBeenCalledWith({ regionSelector: '#consent-region' });
    });

    it('loads the module the server named, checked against the commitment', async () => {
      await setup();
      await screen.findByText(/We share your usage data/);
      expect(loader.loadAttestor).toHaveBeenCalledWith(
        expect.objectContaining({ hash: ATTESTOR_HASH, version: '1.0.0' }),
        ATTESTOR_HASH,
      );
    });

    function expectNoConsentScreen() {
      expect(screen.getByRole('alert')).toHaveTextContent('No consent was recorded');
      expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
      expect(screen.queryByText(/We share your usage data/)).not.toBeInTheDocument();
    }

    it('shows an error and no actions when the module fails to load, with no fallback', async () => {
      await setup(undefined, 200, () =>
        jest
          .mocked(loader.loadAttestor)
          .mockRejectedValue(new loader.AttestorLoadError('Host unreachable.')),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('Host unreachable.');
      expectNoConsentScreen();
    });

    it('shows no consent screen when no attestor is registered', async () => {
      const p = await goodPayload();
      p.attestor = null;
      await setup(p);
      await screen.findByRole('alert');
      expectNoConsentScreen();
      expect(loader.loadAttestor).not.toHaveBeenCalled();
    });

    it('withdraws the consent screen if the page cannot be measured', async () => {
      await setup(undefined, 200, () =>
        fakeModule.attest.mockRejectedValue(new Error('layout failed')),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('could not be measured');
      expectNoConsentScreen();
    });
  });

  it('shows an error state when the client key cannot be registered', async () => {
    resetClientKeyForTests();
    jest.spyOn(apiModule.api, 'post').mockResolvedValue({ ok: false, status: 0, data: {} });
    render(
      <MemoryRouter>
        <Consent />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i));
  });
});
