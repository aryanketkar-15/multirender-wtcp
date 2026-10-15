import { useCallback, useEffect, useRef, useState } from 'react';
import { CriticalRegion } from '../components/CriticalRegion';
import type { ConsentAction } from '../components/CriticalRegion';
import { EvidencePanel } from '../components/EvidencePanel';
import { RecordedPanel } from '../components/RecordedPanel';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { createAttestation, submitAttestation } from '../lib/attestation';
import type { SignedAttestation } from '../lib/attestation';
import { verifyBundle } from '../lib/bundle';
import type { BundlePayload } from '../lib/bundle';
import { fingerprint, getClientKey } from '../lib/clientKey';
import { AttestorLoadError, loadAttestor } from '../lib/loadAttestor';
import type { AttestorModule } from '../lib/loadAttestor';

interface Loaded {
  payload: BundlePayload;
  attestor: AttestorModule;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'no-attestor'; reason: string }
  | ({ kind: 'ready' } & Loaded)
  | ({ kind: 'submitting'; action: ConsentAction } & Loaded)
  | ({
      kind: 'recorded';
      action: ConsentAction;
      attestationHash: string;
      logLeafIndex: number | null;
      commitmentLeafIndex: number | null;
      packId?: string | null;
    } & Loaded)
  | ({
      kind: 'failed';
      action: ConsentAction;
      message: string;
      retryable: boolean;
    } & Loaded);

function describe(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'Verify your email address before giving consent.';
  return 'We could not load the consent notice. Please try again.';
}

export function Consent() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const loaded = useRef<Loaded | null>(null);
  const pending = useRef<{
    action: ConsentAction;
    target: string;
    signed: SignedAttestation | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = await getClientKey();
        const registered = await api.post('/api/client-key', {
          fingerprint: await fingerprint(key.publicKey),
        });
        if (!registered.ok) throw registered.status;
        const res = await api.get<BundlePayload>('/api/bundle');
        if (!res.ok) throw res.status;
        const verdict = await verifyBundle(res.data);
        if (cancelled) return;
        // On a mismatch nothing from the bundle is rendered, so no action is possible.
        if (!verdict.ok) {
          setState({ kind: 'refused', reason: verdict.reason });
          return;
        }
        // The attestation module is part of the evidence. Without it, no consent screen is shown:
        // absence of an attestation is a failed consent, never a neutral state.
        const info = res.data.attestor;
        if (!info) {
          setState({
            kind: 'no-attestor',
            reason: 'No attestation module is registered, so this consent cannot be recorded.',
          });
          return;
        }
        const attestor = await loadAttestor(info, String(res.data.commitment.attestor_hash));
        if (cancelled) return;
        loaded.current = { payload: res.data, attestor };
        setState({ kind: 'ready', payload: res.data, attestor });
      } catch (failure) {
        if (cancelled) return;
        if (failure instanceof AttestorLoadError) {
          setState({ kind: 'no-attestor', reason: failure.message });
        } else {
          setState({
            kind: 'error',
            message: describe(typeof failure === 'number' ? failure : 0),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Posts the signed attestation, then moves to recorded or failed. Safe to call again to retry. */
  const deliver = useCallback(async (signed: SignedAttestation, action: ConsentAction) => {
    const ctx = loaded.current;
    if (!ctx) return;
    setState({ kind: 'submitting', action, ...ctx });
    const result = await submitAttestation(signed);
    if (result.ok) {
      setState({
        kind: 'recorded',
        action,
        attestationHash: result.attestationHash,
        logLeafIndex: result.logLeafIndex,
        commitmentLeafIndex: result.commitmentLeafIndex,
        packId: result.packId,
        ...ctx,
      });
    } else {
      setState({
        kind: 'failed',
        action,
        message: result.message,
        retryable: result.retryable,
        ...ctx,
      });
    }
  }, []);

  /**
   * The user acted. The digests are measured now, at the moment of the action, never at page
   * load: a digest taken on load would miss anything done to the page after it rendered.
   */
  const act = useCallback(
    async (action: ConsentAction, target: string) => {
      const ctx = loaded.current;
      if (!ctx) return;
      pending.current = { action, target, signed: null };
      // Start measuring in this same tick, before any state change can touch the page: attest()
      // reads the page synchronously, and it must read what the user was looking at.
      const measuring = ctx.attestor.attest({ regionSelector: '#consent-region' });
      setState({ kind: 'submitting', action, ...ctx });
      try {
        const evidence = await measuring;
        const pair = await getClientKey();
        const signed = await createAttestation({
          commitment: {
            session_id: String(ctx.payload.commitment.session_id),
            nonce: ctx.payload.commitment.nonce,
            attestor_hash: String(ctx.payload.commitment.attestor_hash),
          },
          commitmentHash: ctx.payload.commitment_hash,
          action,
          actionTarget: target,
          evidence,
          pair,
        });
        pending.current = { action, target, signed };
        await deliver(signed, action);
      } catch {
        setState({
          kind: 'failed',
          action,
          message: 'Your choice could not be measured and signed, so nothing was recorded.',
          retryable: true,
          ...ctx,
        });
      }
    },
    [deliver],
  );

  const retry = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    // A signed payload that never reached the server is re-sent unchanged; otherwise start again.
    void (p.signed ? deliver(p.signed, p.action) : act(p.action, p.target));
  }, [act, deliver]);

  const attestationFailed = useCallback((reason: string) => {
    setState({ kind: 'no-attestor', reason });
  }, []);

  const regionState =
    state.kind === 'ready' ||
    state.kind === 'submitting' ||
    state.kind === 'recorded' ||
    state.kind === 'failed'
      ? state
      : null;

  return (
    <Layout>
      <h1>Consent</h1>
      {state.kind === 'loading' ? (
        <div className="empty" role="status">
          <span className="spinner" aria-hidden="true" /> Preparing your consent notice…
        </div>
      ) : null}
      {state.kind === 'error' ? (
        <div className="banner error" role="alert">
          {state.message}
        </div>
      ) : null}
      {state.kind === 'refused' ? (
        <div className="banner error" role="alert">
          <strong>This page was not displayed.</strong> {state.reason} No action is possible.
        </div>
      ) : null}
      {state.kind === 'no-attestor' ? (
        <div className="banner error" role="alert">
          <strong>This page was not displayed.</strong> {state.reason} No consent was recorded and
          no action is possible.
        </div>
      ) : null}
      {regionState ? (
        <>
          <CriticalRegion
            markup={regionState.payload.bundle.markup}
            css={regionState.payload.bundle.css}
            onAction={act}
            locked={regionState.kind !== 'ready'}
          />
          <EvidencePanel attestor={regionState.attestor} onFailure={attestationFailed} />
          {regionState.kind === 'submitting' ? (
            <div className="banner warn" role="status">
              <span className="spinner" aria-hidden="true" /> Recording your choice…
            </div>
          ) : null}
          {regionState.kind === 'recorded' ? (
            <RecordedPanel
              action={regionState.action}
              attestationHash={regionState.attestationHash}
              logLeafIndex={regionState.logLeafIndex}
              commitmentLeafIndex={regionState.commitmentLeafIndex}
              packId={regionState.packId}
            />
          ) : null}
          {regionState.kind === 'failed' ? (
            <div className="banner error" role="alert">
              {regionState.message}{' '}
              {regionState.retryable ? (
                <button type="button" className="btn secondary" onClick={retry}>
                  Try again
                </button>
              ) : (
                <button type="button" className="btn secondary" onClick={() => location.reload()}>
                  Reload
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </Layout>
  );
}
