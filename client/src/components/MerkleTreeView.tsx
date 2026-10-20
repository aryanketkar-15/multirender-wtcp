import type { LogCheck } from '../lib/logProof';

type TreeData = NonNullable<LogCheck['tree']>;

const BOX_W = 116;
const BOX_H = 40;
const ROW = 66;
const SPREAD = 64;

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

interface Placed {
  key: string;
  x: number;
  y: number;
  kind: 'root' | 'computed' | 'sibling' | 'leaf';
  hash: string;
}

/** Lays the audit path out from the root down; the log's sibling sits opposite the recomputed node. */
function layout(tree: TreeData): { nodes: Placed[]; edges: Array<[Placed, Placed]> } {
  const { steps, leaf } = tree.walk;
  const nodes: Placed[] = [];
  const edges: Array<[Placed, Placed]> = [];
  let parent: Placed = { key: 'root', x: 0, y: 0, kind: 'root', hash: tree.walk.root };
  nodes.push(parent);
  for (let k = steps.length - 1; k >= 0; k--) {
    const y = (steps.length - k) * ROW;
    const siblingLeft = steps[k].side === 'left';
    const sibling: Placed = {
      key: `s${k}`,
      x: parent.x + (siblingLeft ? -SPREAD : SPREAD),
      y,
      kind: 'sibling',
      hash: steps[k].sibling,
    };
    const below: Placed =
      k === 0
        ? {
            key: 'leaf',
            x: parent.x + (siblingLeft ? SPREAD : -SPREAD),
            y,
            kind: 'leaf',
            hash: leaf,
          }
        : {
            key: `c${k}`,
            x: parent.x + (siblingLeft ? SPREAD : -SPREAD),
            y,
            kind: 'computed',
            hash: steps[k - 1].hash,
          };
    nodes.push(sibling, below);
    edges.push([parent, sibling], [parent, below]);
    parent = below;
  }
  return { nodes, edges };
}

const LABEL: Record<Placed['kind'], string> = {
  root: 'root',
  computed: 'computed',
  sibling: 'from the log',
  leaf: 'your record',
};

/**
 * The inclusion proof, drawn. The bottom box is the user's record; each grey box is a hash the log
 * supplied; each coloured box is what the browser computed from the pair below it. The top box is
 * compared with the root the server signed.
 */
export function MerkleTreeView({ tree }: { tree: TreeData }) {
  const { nodes, edges } = layout(tree);
  const matches = tree.walk.complete && tree.walk.root === tree.signedRoot;
  const xs = nodes.map((n) => n.x);
  const minX = Math.min(...xs) - BOX_W / 2 - 8;
  const maxX = Math.max(...xs) + BOX_W / 2 + 8;
  const height = Math.max(...nodes.map((n) => n.y)) + BOX_H + 12;

  return (
    <figure className="merkle-view">
      <svg
        viewBox={`${minX} -6 ${maxX - minX} ${height}`}
        role="img"
        aria-label={`Merkle tree path from entry ${tree.leafIndex} to the root of a log of ${tree.treeSize} entries`}
      >
        {edges.map(([a, b]) => (
          <line
            key={`${a.key}-${b.key}`}
            x1={a.x}
            y1={a.y + BOX_H}
            x2={b.x}
            y2={b.y}
            className="merkle-edge"
          />
        ))}
        {nodes.map((n) => (
          <g
            key={n.key}
            transform={`translate(${n.x - BOX_W / 2} ${n.y})`}
            className={`merkle-node ${n.kind}`}
          >
            <rect width={BOX_W} height={BOX_H} rx="6" />
            <text x={BOX_W / 2} y="15" textAnchor="middle" className="merkle-node-label">
              {LABEL[n.kind]}
            </text>
            <text x={BOX_W / 2} y="31" textAnchor="middle" className="merkle-node-hash">
              {short(n.hash)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <strong>
          {matches
            ? 'The path ends at the signed root.'
            : 'The path does not reach the signed root.'}
        </strong>{' '}
        Your record is entry {tree.leafIndex} of {tree.treeSize}. The browser combined it with{' '}
        {tree.walk.steps.length} hash{tree.walk.steps.length === 1 ? '' : 'es'} from the log and got{' '}
        <code>{short(tree.walk.root)}</code>, {matches ? 'which equals' : 'which differs from'} the
        root the server signed (<code>{short(tree.signedRoot)}</code>).
      </figcaption>
      <ol className="sr-only">
        {tree.walk.steps.map((s, i) => (
          <li key={s.sibling + i}>
            Step {i + 1}: combined with a sibling hash from the log, giving {short(s.hash)}.
          </li>
        ))}
      </ol>
    </figure>
  );
}
