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

function getFieldLabel(field: string): { title: string; hint: string } {
  switch (field) {
    case 'text':
      return { title: 'Rendered Text', hint: 'The exact disclosure copy displayed on the screen' };
    case 'checked':
      return { title: 'Checkbox State', hint: 'Whether the consent box was ticked' };
    case 'prominence':
      return { title: 'Visual Prominence', hint: 'Relative button area ratio (detects size bias)' };
    case 'contrast':
      return { title: 'Color Contrast', hint: 'WCAG luminance contrast against background' };
    case 'occluded':
      return { title: 'Overlay Occlusion', hint: 'Point sampling check for deceptive overlays' };
    case 'bounds':
      return { title: 'Element Bounds', hint: 'Bounding box dimensions on screen' };
    default:
      return { title: field, hint: '' };
  }
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

      <div
        className="diff-comparison-table-wrapper"
        tabIndex={0}
        role="region"
        aria-label="Side-by-side comparison, scrollable"
      >
        <table className="diff-comparison-table">
          <thead>
            <tr>
              <th scope="col" className="col-field">
                Field / Semantic Property
              </th>
              <th scope="col" className="col-attested">
                Attested by Browser
                <span className="sub-header">(What the user actually saw & signed)</span>
              </th>
              <th scope="col" className="col-recomputed">
                Committed by Server
                <span className="sub-header">(What the server logged in Merkle tree)</span>
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
              const labelInfo = getFieldLabel(fieldName);

              return (
                <tr key={fieldName} className={isHighlight ? 'diff-row-highlight' : 'diff-row'}>
                  <td className="diff-field-cell">
                    <strong>{labelInfo.title}</strong>
                    {labelInfo.hint && <span className="diff-field-hint">{labelInfo.hint}</span>}
                    <code>{fieldName}</code>
                  </td>
                  <td className="diff-value-attested" data-label="Attested by browser">
                    <div className="diff-value-box attested">{formatValue(delta.attested)}</div>
                  </td>
                  <td className="diff-value-recomputed" data-label="Committed by server">
                    <div className="diff-value-box recomputed">{formatValue(delta.recomputed)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="diff-node-footer">
        <div className="diff-explainer-banner">
          <strong>Non-expert summary:</strong> The browser attestation captures what was physically
          visible on the user's screen at the moment of consent. The recomputed render reproduces
          the server's committed bundle. The difference above shows that the page differed from the
          committed notice when the user acted. It does not show who changed it or why.
        </div>
      </footer>
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
          The table below shows what differed between the page the user signed and the bundle the
          server committed to the log.
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
