import { useState } from 'react';
import { checkRecordInLog } from '../lib/logProof';
import type { LogCheck } from '../lib/logProof';

interface Props {
  action: string;
  attestationHash: string;
  logLeafIndex: number | null;
  commitmentLeafIndex: number | null;
  packId?: string | null;
}

/** What happens after consent is recorded: the reference, a log check anyone can run, and a restart. */
export function RecordedPanel({
  action,
  attestationHash,
  logLeafIndex,
  commitmentLeafIndex,
  packId,
}: Props) {
  const [check, setCheck] = useState<LogCheck | 'running' | null>(null);

  async function run() {
    if (logLeafIndex === null) return;
    setCheck('running');
    try {
      setCheck(await checkRecordInLog(logLeafIndex, attestationHash));
    } catch {
      setCheck({ ok: false, steps: [], message: 'The check could not be completed.' });
    }
  }

  const targetPack = packId || 'honest_pack.zip';

  return (
    <div className="card recorded-panel" role="status">
      <div className="recorded-header">
        <span className="badge badge-success">Attestation Confirmed</span>
        <p className="recorded-summary">
          Your choice (<strong>{action}</strong>) was recorded as signed evidence.
        </p>
      </div>

      <div className="recorded-meta">
        <div className="recorded-meta-row">
          <span className="recorded-meta-label">Reference:</span>
          <code className="recorded-meta-hash">{attestationHash}</code>
        </div>
        {logLeafIndex !== null ? (
          <p className="recorded-log-position">
            Logged as entry {logLeafIndex}
            {commitmentLeafIndex !== null
              ? `, after the server’s own commitment (entry ${commitmentLeafIndex}).`
              : '.'}
          </p>
        ) : null}
      </div>

      <div className="recorded-actions">
        {logLeafIndex !== null ? (
          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={run}
            disabled={check === 'running'}
          >
            {check === 'running' ? 'Checking…' : 'Check this record in the log'}
          </button>
        ) : null}
        {packId ? (
          <a
            href={`/api/pack/${packId}/download`}
            download={`evidence-pack-${packId}.zip`}
            className="btn secondary btn-sm"
          >
            Download evidence pack (.zip)
          </a>
        ) : (
          <a href="/packs" className="btn secondary btn-sm">
            My evidence packs
          </a>
        )}
        <a
          href={`/verifier?pack=${encodeURIComponent(targetPack)}`}
          className="btn primary btn-sm"
          id="btn-verify-in-verifier"
        >
          Verify in Verifier →
        </a>
        <button type="button" className="btn secondary btn-sm" onClick={() => location.reload()}>
          Start over
        </button>
      </div>

      {check && check !== 'running' ? (
        <div className="recorded-check-results" role="status" aria-live="polite">
          <p>
            <strong>{check.ok ? 'Verified in the log.' : 'Could not verify.'}</strong>{' '}
            {check.message ?? ''}
          </p>
          <ul className="recorded-check-steps">
            {check.steps.map((s) => (
              <li key={s.label}>
                {s.ok ? '✓' : '✗'} {s.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
