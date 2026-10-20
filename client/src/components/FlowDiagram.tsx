/**
 * Drawn diagram of the four parties and what passes between them. Original artwork, inline SVG, styled
 * by the design tokens (see .flow-diagram in styles.css). It carries a text alternative that says the
 * same thing as the picture.
 */
const NODES = [
  { y: 16, title: 'Server', note: 'Serves the consent notice' },
  { y: 116, title: 'Your browser', note: 'Shows it and records your choice' },
  { y: 216, title: 'Public log', note: 'Append-only Merkle tree' },
  { y: 316, title: 'Verifier', note: 'Re-renders and compares' },
];

const EDGES = [
  { y: 74, label: 'Signed commitment to the notice, before you act' },
  { y: 174, label: 'Signed digest of what the page showed' },
  { y: 274, label: 'Evidence pack: both records and their proofs' },
];

export function FlowDiagram() {
  return (
    <svg
      className="flow-diagram"
      viewBox="0 0 480 392"
      role="img"
      aria-labelledby="flow-title flow-desc"
      focusable="false"
    >
      <title id="flow-title">How the evidence is produced</title>
      <desc id="flow-desc">
        The server sends a signed commitment to the notice to your browser before you act. Your
        browser sends a signed digest of what the page showed. Both go into a public append-only
        log. A verifier takes the evidence pack, re-renders the notice and compares it with what
        your browser signed.
      </desc>
      {NODES.map((n) => (
        <g key={n.title}>
          <rect className="flow-node" x="0" y={n.y} width="236" height="58" rx="8" />
          <text className="flow-node-title" x="16" y={n.y + 25}>
            {n.title}
          </text>
          <text className="flow-node-note" x="16" y={n.y + 44}>
            {n.note}
          </text>
        </g>
      ))}
      {EDGES.map((e) => (
        <g key={e.label}>
          <line className="flow-edge" x1="118" y1={e.y} x2="118" y2={e.y + 40} />
          <path className="flow-arrow" d={`M112 ${e.y + 33} L118 ${e.y + 42} L124 ${e.y + 33}`} />
          <text className="flow-edge-label" x="138" y={e.y + 24}>
            {e.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
