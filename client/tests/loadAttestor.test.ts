import { sha256Hex } from '../src/lib/bundle';
import {
  AttestorLoadError,
  loadAttestor,
  resetAttestorCacheForTests,
} from '../src/lib/loadAttestor';
import type { AttestorInfo } from '../src/lib/loadAttestor';

const MODULE_TEXT = 'console.log("pretend attestor");';

async function info(overrides: Partial<AttestorInfo> = {}): Promise<AttestorInfo> {
  return {
    url: 'http://attestor.test/mra-attestor-1.0.0.js',
    version: '1.0.0',
    integrity: 'sha384-' + 'A'.repeat(64),
    hash: 'sha256:' + (await sha256Hex(MODULE_TEXT)),
    ...overrides,
  };
}

/** jsdom does not fetch scripts, so the test plays the browser: it decides how the load ends. */
function browserBehaviour(
  outcome: 'load' | 'error' | 'hang',
  defineModule = true,
  version = '1.0.0',
) {
  const original = document.head.appendChild.bind(document.head);
  jest.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && outcome !== 'hang') {
      setTimeout(() => {
        if (outcome === 'load') {
          if (defineModule) {
            window.MRAttestor = { ATTESTOR_VERSION: version, attest: jest.fn() };
          }
          node.onload?.(new Event('load'));
        } else {
          node.onerror?.(new Event('error'));
        }
      }, 0);
      return node;
    }
    return original(node);
  });
}

function serve(text: string, ok = true) {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ ok, text: async () => text }) as unknown as typeof fetch;
}

describe('loadAttestor (fails closed)', () => {
  beforeEach(() => {
    resetAttestorCacheForTests();
    delete window.MRAttestor;
  });
  afterEach(() => jest.restoreAllMocks());

  it('loads the genuine module under SRI: cross-origin, anonymous, integrity pinned', async () => {
    browserBehaviour('load');
    serve(MODULE_TEXT);
    const i = await info();
    const mod = await loadAttestor(i, i.hash);
    expect(mod.ATTESTOR_VERSION).toBe('1.0.0');
    const script =
      document.head.querySelector('script') ??
      (document.head.appendChild as jest.Mock).mock.calls[0][0];
    expect(script.integrity).toBe(i.integrity);
    expect(script.crossOrigin).toBe('anonymous');
    expect(script.src).toBe(i.url);
  });

  it('asks fetch to enforce the same integrity value when it re-hashes the bytes', async () => {
    browserBehaviour('load');
    serve(MODULE_TEXT);
    const i = await info();
    await loadAttestor(i, i.hash);
    expect(global.fetch).toHaveBeenCalledWith(
      i.url,
      expect.objectContaining({ integrity: i.integrity, mode: 'cors' }),
    );
  });

  it('rejects when the browser refuses the script (unreachable host or failed SRI)', async () => {
    browserBehaviour('error');
    const i = await info();
    await expect(loadAttestor(i, i.hash)).rejects.toThrow(AttestorLoadError);
    await expect(loadAttestor(i, i.hash)).rejects.toThrow(
      /could not be loaded, or failed its integrity/,
    );
    expect(window.MRAttestor).toBeUndefined();
  });

  it('rejects when the offered module is not the one the server committed to', async () => {
    browserBehaviour('load');
    const i = await info();
    await expect(loadAttestor(i, 'sha256:' + '0'.repeat(64))).rejects.toThrow(
      /differs from the one the server committed/,
    );
    expect(document.head.appendChild).not.toHaveBeenCalled(); // nothing is even fetched
  });

  it('rejects a module that loads but exposes nothing', async () => {
    browserBehaviour('load', false);
    const i = await info();
    await expect(loadAttestor(i, i.hash)).rejects.toThrow(/did not start/);
  });

  it('rejects a module reporting the wrong version', async () => {
    browserBehaviour('load', true, '9.9.9');
    serve(MODULE_TEXT);
    const i = await info();
    await expect(loadAttestor(i, i.hash)).rejects.toThrow(/unexpected version/);
  });

  it('rejects when the bytes do not hash to the registered value', async () => {
    browserBehaviour('load');
    serve('different bytes');
    const i = await info();
    await expect(loadAttestor(i, i.hash)).rejects.toThrow(/does not match its registered hash/);
  });

  it('rejects when the bytes cannot be re-read', async () => {
    browserBehaviour('load');
    serve(MODULE_TEXT, false);
    const i = await info();
    await expect(loadAttestor(i, i.hash)).rejects.toThrow(/could not be verified/);
  });

  it('gives up if the host never answers', async () => {
    jest.useFakeTimers();
    browserBehaviour('hang');
    const i = await info();
    const pending = loadAttestor(i, i.hash);
    const assertion = expect(pending).rejects.toThrow(/took too long/);
    await jest.advanceTimersByTimeAsync(10_001);
    await assertion;
    jest.useRealTimers();
  });

  it('verifies once per page: a second call reuses the checked module', async () => {
    browserBehaviour('load');
    serve(MODULE_TEXT);
    const i = await info();
    const first = await loadAttestor(i, i.hash);
    const second = await loadAttestor(i, i.hash);
    expect(second).toBe(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
