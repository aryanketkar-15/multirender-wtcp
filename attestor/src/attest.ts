import { collectEnv } from './env';
import type { EnvVector } from './env';
import { buildRepresentation } from './representation';
import type { Representation } from './representation';
import { DigestWorker } from './workerClient';

/** Set by the build from package.json. */
declare const __ATTESTOR_VERSION__: string | undefined;
export const ATTESTOR_VERSION: string =
  typeof __ATTESTOR_VERSION__ === 'undefined' ? '0.0.0-source' : __ATTESTOR_VERSION__;

export const REGION_POLICY = 'consent/v1';
export const CONTEXT_POLICY = 'viewport/v1';

export interface AttestOptions {
  /** CSS selector of the declared critical region. */
  regionSelector: string;
  regionPolicy?: string;
}

export interface Evidence {
  critical_region_digest: string;
  context_digest: string;
  env: EnvVector;
  attestor_version: string;
  /**
   * The exact representation that `critical_region_digest` is the SHA-256 of (RFC 8785 canonical
   * text). It is not signed itself and does not need to be: anyone can recompute the hash and
   * compare it with the signed digest, so a copy that does not match is detectably not the one
   * attested. It lets a verifier name the node that differs when a re-render does not match.
   */
  region_representation: Representation;
  /** Node counts, for diagnostics and the cost measurements. Not part of any digest. */
  region_nodes: number;
  context_nodes: number;
}

export interface Representations {
  region: Representation;
  context: Representation;
}

/** Measures the page. Needs the DOM and layout, so it runs on the main thread. */
export function measure(doc: Document, opts: AttestOptions): Representations {
  const region = doc.querySelector(opts.regionSelector);
  if (!region) throw new Error(`critical region not found: ${opts.regionSelector}`);
  return {
    region: buildRepresentation(region, opts.regionPolicy ?? REGION_POLICY),
    // The whole visible page: catches overlays and injected content outside the declared region.
    context: buildRepresentation(doc.body, CONTEXT_POLICY),
  };
}

let shared: DigestWorker | null = null;

/**
 * Produces both digests. Measurement happens on the main thread; canonicalisation and hashing run
 * in a Web Worker. Pass a worker to reuse one; otherwise a shared one is created on first use.
 */
export async function attest(opts: AttestOptions, worker?: DigestWorker): Promise<Evidence> {
  const reps = measure(document, opts);
  const w = worker ?? (shared ??= new DigestWorker());
  const [region, context] = await Promise.all([w.digest(reps.region), w.digest(reps.context)]);
  return {
    critical_region_digest: region.digest,
    context_digest: context.digest,
    env: collectEnv(),
    attestor_version: ATTESTOR_VERSION,
    region_representation: reps.region,
    region_nodes: reps.region.nodes.length,
    context_nodes: reps.context.nodes.length,
  };
}
