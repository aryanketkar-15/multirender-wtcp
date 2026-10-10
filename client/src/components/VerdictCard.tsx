import { getVerdictMeta } from '../lib/verdictMeta';
import type { VerificationResult } from '../lib/verifierClient';

export interface VerdictCardProps {
  result: VerificationResult;
}

export function VerdictCard({ result }: VerdictCardProps) {
  const meta = getVerdictMeta(result.verdict);
  const isPositive = result.ok && result.verdict === 'VERIFIED';

  return (
    <article
      className={`verdict-card verdict-${meta.category}`}
      role={isPositive ? 'status' : 'alert'}
      aria-live="polite"
    >
      <header className="verdict-header">
        <span className={`verdict-badge badge-${meta.category}`}>{meta.badgeLabel}</span>
        <span className="verdict-stages-summary">
          {result.passedStages} of {result.stages.length || 11} stages passed
        </span>
      </header>

      <h2 className="verdict-title">{meta.title}</h2>

      <p className="verdict-summary">{meta.summary}</p>

      {meta.legalSignificance && (
        <aside className="verdict-legal" aria-label="Legal significance">
          <strong>Impact:</strong> {meta.legalSignificance}
        </aside>
      )}

      {/* Cryptographic and Technical details behind a disclosure */}
      <details className="verdict-disclosure">
        <summary className="disclosure-toggle">
          <span>Technical & Cryptographic Details</span>
        </summary>
        <div className="disclosure-body">
          <dl className="technical-grid">
            <dt>Verdict Code:</dt>
            <dd>
              <code data-testid="raw-verdict-code">{result.verdict}</code>
            </dd>

            <dt>Status:</dt>
            <dd>{result.ok ? 'Valid / Pass' : 'Failed / Discrepancy'}</dd>

            {result.failedStage && (
              <>
                <dt>Failed Stage:</dt>
                <dd>Stage {result.failedStage}</dd>
              </>
            )}

            <dt>Diagnostic Message:</dt>
            <dd>{result.message || 'Verification completed.'}</dd>

            {result.recomputedDigests && (
              <>
                <dt>Recomputed Region Digest:</dt>
                <dd>
                  <code>{result.recomputedDigests.critical_region_digest}</code>
                </dd>
                <dt>Recomputed Context Digest:</dt>
                <dd>
                  <code>{result.recomputedDigests.context_digest}</code>
                </dd>
              </>
            )}
          </dl>
        </div>
      </details>
    </article>
  );
}
