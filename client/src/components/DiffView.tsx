import type { DiffResult, MismatchedNode } from '../lib/verifierClient';

export interface DiffViewProps {
  diff: DiffResult;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) {
    return 'None';
  }
  if (typeof val === 'boolean') {
    return val ? 'true (checked/active)' : 'false (unchecked/inactive)';
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

function NodeCard({ node }: { node: MismatchedNode }) {
  const fields = Object.entries(node.differences);

  return (
    <div className="diff-node-card" data-testid={`mismatched-node-${node.index}`}>
      <header className="diff-node-header">
        <div className="diff-node-identity">
          <span className="diff-node-index">Node #{node.index}</span>
          <span className="diff-node-role">
            role: <strong>{node.role}</strong>
          </span>
          {node.name && <span className="diff-node-name">name: &ldquo;{node.name}&rdquo;</span>}
        </div>
        <p className="diff-node-summary">{node.summary}</p>
      </header>

      <div className="diff-comparison-table-wrapper">
        <table className="diff-comparison-table">
          <thead>
            <tr>
              <th scope="col" className="col-field">
                Field / Attribute
              </th>
              <th scope="col" className="col-attested">
                Attested by Browser
                <span className="sub-header">(What user signed)</span>
              </th>
              <th scope="col" className="col-recomputed">
                Committed by Server
                <span className="sub-header">(What server renders)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([fieldName, delta]) => {
              const isHighlight =
                fieldName === 'text' ||
                fieldName === 'checked' ||
                fieldName === 'prominence' ||
                fieldName === 'contrast';

              return (
                <tr key={fieldName} className={isHighlight ? 'diff-row-highlight' : 'diff-row'}>
                  <td className="diff-field-cell">
                    <code>{fieldName}</code>
                  </td>
                  <td className="diff-value-attested">
                    <div className="diff-value-box attested">{formatValue(delta.attested)}</div>
                  </td>
                  <td className="diff-value-recomputed">
                    <div className="diff-value-box recomputed">{formatValue(delta.recomputed)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DiffView({ diff }: DiffViewProps) {
  if (!diff || !diff.hasMismatch || diff.mismatchedNodes.length === 0) {
    return null;
  }

  return (
    <section className="diff-view" aria-label="Visual render differences">
      <header className="diff-view-header">
        <h3 className="diff-view-title">
          Side-by-Side Discrepancy Evidence ({diff.mismatchedNodes.length} diverging{' '}
          {diff.mismatchedNodes.length === 1 ? 'element' : 'elements'})
        </h3>
        <p className="diff-view-explanation">
          The table below proves exactly what differed between the page the user signed and the
          bundle the server committed into the log.
        </p>
      </header>

      <div className="diff-nodes-list">
        {diff.mismatchedNodes.map((node) => (
          <NodeCard key={node.index} node={node} />
        ))}
      </div>
    </section>
  );
}
