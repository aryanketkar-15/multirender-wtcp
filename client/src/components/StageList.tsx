import type { StageResult } from '../lib/verifierClient';

export interface StageListProps {
  stages: StageResult[];
  passedStages?: number;
  failedStage?: number;
}

const STAGE_NAMES = [
  'Stage 1: Archive Schema and Mandatory Files',
  'Stage 2: Server Ed25519 Commitment Signature',
  'Stage 3: Client ECDSA P-256 Attestation Signature',
  'Stage 4: Client Key Binding (SHA-256 Fingerprint)',
  'Stage 5: Committed Bundle Hash Integrity',
  'Stage 6: Attestation-to-Commitment Causal Binding',
  'Stage 7: Interaction Nonce Freshness Window (≤ 60s)',
  'Stage 8: Merkle Inclusion Proofs & Log Tree Head',
  'Stage 9: Critical Region Selector & Content Policy',
  'Stage 10: Attestor Module Governance Registry',
  'Stage 11: Playwright Headed Re-render & Digest Match',
];

export function StageList({ stages, passedStages = 0, failedStage }: StageListProps) {
  // Map stages by stage index (1-11)
  const stageMap = new Map<number, StageResult>();
  stages.forEach((st) => stageMap.set(st.stage, st));

  const totalStages = Math.max(11, stages.length);
  const items = Array.from({ length: totalStages }, (_, idx) => {
    const stageNum = idx + 1;
    const result = stageMap.get(stageNum);
    const defaultName = STAGE_NAMES[idx] || `Stage ${stageNum}`;

    let status: 'pass' | 'fail' | 'pending';
    if (result) {
      status = result.ok ? 'pass' : 'fail';
    } else if (failedStage && stageNum > failedStage) {
      status = 'pending';
    } else if (stageNum <= passedStages) {
      status = 'pass';
    } else {
      status = 'pending';
    }

    return {
      stageNum,
      name: result?.name || defaultName,
      status,
      message: result?.message,
    };
  });

  return (
    <section className="stage-checklist-section" aria-label="Verification stages">
      <h3 className="stage-checklist-title">Verification Stages Checklist</h3>
      <ol className="stage-checklist">
        {items.map((item) => {
          return (
            <li
              key={item.stageNum}
              className={`stage-item stage-${item.status}`}
              data-testid={`stage-item-${item.stageNum}`}
            >
              <div className="stage-status-icon" aria-hidden="true">
                {item.status === 'pass' && '✓'}
                {item.status === 'fail' && '✗'}
                {item.status === 'pending' && '—'}
              </div>
              <div className="stage-info">
                <span className="stage-name">{item.name}</span>
                <span className="sr-only">Status: {item.status}</span>
                {item.message && item.status === 'fail' && (
                  <p className="stage-failure-message">{item.message}</p>
                )}
              </div>
              <span className={`stage-badge stage-badge-${item.status}`}>
                {item.status === 'pass' && 'Passed'}
                {item.status === 'fail' && 'Failed'}
                {item.status === 'pending' && 'Pending'}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
