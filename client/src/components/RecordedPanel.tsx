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

  return (
    <div className="banner ok" role="status">
      Your choice (<strong>{action}</strong>) was recorded as signed evidence.
      <br />
      <small>
        Reference: <code>{attestationHash}</code>
      </small>
      {logLeafIndex !== null ? (
        <p>
          <small>
            Logged as entry {logLeafIndex}
            {commitmentLeafIndex !== null
              ? `, after the server’s own commitment (entry ${commitmentLeafIndex}).`
              : '.'}
          </small>
        </p>
      ) : null}
      <div className="links">
        {logLeafIndex !== null ? (
          <button
            type="button"
            className="btn secondary"
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
            className="btn secondary"
          >
            Download evidence pack (.zip)
          </a>
        ) : (
          <a href="/packs" className="btn secondary">
            My evidence packs
          </a>
        )}
        <a href="/verifier" className="btn secondary">
          Verify in Verifier →
        </a>
        <button type="button" className="btn secondary" onClick={() => location.reload()}>
          Start over
        </button>
      </div>
      {check && check !== 'running' ? (
        <div role="status" aria-live="polite">
          <p>
            <strong>{check.ok ? 'Verified in the log.' : 'Could not verify.'}</strong>{' '}
            {check.message ?? ''}
          </p>
          <ul>
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
