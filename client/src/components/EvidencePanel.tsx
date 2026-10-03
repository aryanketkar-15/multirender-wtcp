import { useEffect, useState } from 'react';
import type { AttestorModule, Evidence } from '../lib/loadAttestor';

interface Props {
  attestor: AttestorModule;
  /** Called when the digests cannot be produced; the page then withdraws the consent screen. */
  onFailure: (reason: string) => void;
}

/**
 * Computes both digests over the rendered page, using the independently hosted Attestor Module,
 * and shows them. This is the evidence the next phase will sign.
 */
export function EvidencePanel({ attestor, onFailure }: Props) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  useEffect(() => {
    let cancelled = false;
    attestor
      .attest({ regionSelector: '#consent-region' })
      .then((e) => {
        if (!cancelled) setEvidence(e);
      })
      .catch(() => {
        if (!cancelled) onFailure('The page could not be measured, so no attestation can be made.');
      });
    return () => {
      cancelled = true;
    };
  }, [attestor, onFailure]);

  return (
    <details className="card evidence" data-testid="evidence">
      <summary>Technical evidence</summary>
      {evidence === null ? (
        <p role="status">Measuring the page…</p>
      ) : (
        <dl>
          <dt>Critical region digest</dt>
          <dd>
            <code>{evidence.critical_region_digest}</code>
          </dd>
          <dt>Context digest</dt>
          <dd>
            <code>{evidence.context_digest}</code>
          </dd>
          <dt>Attestor</dt>
          <dd>version {evidence.attestor_version}</dd>
          <dt>Nodes measured</dt>
          <dd>
            {evidence.region_nodes} in the region, {evidence.context_nodes} on the page
          </dd>
        </dl>
      )}
    </details>
  );
}
