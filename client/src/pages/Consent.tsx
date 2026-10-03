import { useCallback, useEffect, useState } from 'react';
import { CriticalRegion } from '../components/CriticalRegion';
import type { ConsentAction } from '../components/CriticalRegion';
import { EvidencePanel } from '../components/EvidencePanel';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { verifyBundle } from '../lib/bundle';
import type { BundlePayload } from '../lib/bundle';
import { fingerprint, getClientKey } from '../lib/clientKey';
import { AttestorLoadError, loadAttestor } from '../lib/loadAttestor';
import type { AttestorModule } from '../lib/loadAttestor';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'no-attestor'; reason: string }
  | { kind: 'ready'; payload: BundlePayload; attestor: AttestorModule }
  | { kind: 'done'; payload: BundlePayload; attestor: AttestorModule; action: ConsentAction };

function describe(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'Verify your email address before giving consent.';
  return 'We could not load the consent notice. Please try again.';
}

export function Consent() {
  const [state, setState] = useState<State>({ kind: 'loading' });

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
        if (!cancelled) setState({ kind: 'ready', payload: res.data, attestor });
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

  const record = useCallback((action: ConsentAction) => {
    setState((s) => (s.kind === 'ready' ? { ...s, kind: 'done', action } : s));
  }, []);

  const attestationFailed = useCallback((reason: string) => {
    setState({ kind: 'no-attestor', reason });
  }, []);

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
      {state.kind === 'ready' || state.kind === 'done' ? (
        <>
          <CriticalRegion
            markup={state.payload.bundle.markup}
            css={state.payload.bundle.css}
            onAction={record}
            locked={state.kind === 'done'}
          />
          <EvidencePanel attestor={state.attestor} onFailure={attestationFailed} />
          {state.kind === 'done' ? (
            <div className="banner ok" role="status">
              Your choice (<strong>{state.action}</strong>) was captured on this device. Signing it
              as evidence is added in the next build phase.
            </div>
          ) : null}
        </>
      ) : null}
    </Layout>
  );
}
