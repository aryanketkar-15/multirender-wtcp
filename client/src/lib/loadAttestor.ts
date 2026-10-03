import { sha256Hex } from './bundle';

/**
 * Loads the Attestor Module from its independent host, under Subresource Integrity, and fails
 * closed. The module computes the digest the client signs, so the code that produces it must not
 * come from the party being tested (decision D-03). If anything about the load is wrong there is
 * no fallback to code served by the consent server: no module, no attestation.
 */
export interface AttestorInfo {
  url: string;
  version: string;
  /** `sha384-...`, placed in the script tag's integrity attribute */
  integrity: string;
  /** `sha256:...`, the attestor_hash the server committed to */
  hash: string;
}

export interface Evidence {
  critical_region_digest: string;
  context_digest: string;
  env: Record<string, unknown>;
  attestor_version: string;
  region_nodes: number;
  context_nodes: number;
}

export interface AttestorModule {
  ATTESTOR_VERSION: string;
  attest(opts: { regionSelector: string }): Promise<Evidence>;
}

declare global {
  interface Window {
    MRAttestor?: AttestorModule;
  }
}

export class AttestorLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttestorLoadError';
  }
}

const TIMEOUT_MS = 10_000;
/** Modules already verified in this page, by hash. */
const verified = new Map<string, AttestorModule>();

export function resetAttestorCacheForTests(): void {
  verified.clear();
}

function injectScript(info: AttestorInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = info.url;
    script.integrity = info.integrity;
    script.crossOrigin = 'anonymous';
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      reject(new AttestorLoadError('The attestation module took too long to load.'));
    }, TIMEOUT_MS);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(
        new AttestorLoadError(
          'The attestation module could not be loaded, or failed its integrity check.',
        ),
      );
    };
    document.head.appendChild(script);
  });
}

/**
 * @param committedHash the `attestor_hash` inside the server's signed commitment; the module that
 *   runs must be exactly that build.
 */
export async function loadAttestor(
  info: AttestorInfo,
  committedHash: string,
): Promise<AttestorModule> {
  if (info.hash !== committedHash) {
    throw new AttestorLoadError('The module offered differs from the one the server committed to.');
  }
  const cached = verified.get(info.hash);
  if (cached) return cached;

  await injectScript(info);

  const mod = window.MRAttestor;
  if (!mod || typeof mod.attest !== 'function') {
    throw new AttestorLoadError('The attestation module loaded but did not start.');
  }
  if (mod.ATTESTOR_VERSION !== info.version) {
    throw new AttestorLoadError('The attestation module reports an unexpected version.');
  }

  // SRI already guarantees the bytes match the integrity value. Hash them again independently so
  // that what this page attests as "the attestor that ran" is the build the commitment names.
  try {
    const res = await fetch(info.url, {
      mode: 'cors',
      cache: 'force-cache',
      integrity: info.integrity,
    });
    if (!res.ok) throw new Error('status');
    const actual = 'sha256:' + (await sha256Hex(await res.text()));
    if (actual !== info.hash) {
      throw new AttestorLoadError('The attestation module does not match its registered hash.');
    }
  } catch (e) {
    if (e instanceof AttestorLoadError) throw e;
    throw new AttestorLoadError('The attestation module could not be verified.');
  }

  verified.set(info.hash, mod);
  return mod;
}
