/** Node-signature diff shared by the stability and sensitivity harnesses. */
const PRIORITY = ['STRUCTURE', 'VISIBILITY', 'OCCLUSION', 'STYLE_SIZE', 'STYLE_WEIGHT', 'STYLE_CONTRAST', 'STYLE_PROMINENCE', 'ROLE', 'TEXT', 'STATE'];
const FIELDS = ['role', 'visible', 'occlusion', 'text', 'level', 'size', 'weight', 'contrast', 'prominence', 'state'];
const FIELD_CODE = { role: 'ROLE', visible: 'VISIBILITY', occlusion: 'OCCLUSION', text: 'TEXT', level: 'STATE', size: 'STYLE_SIZE', weight: 'STYLE_WEIGHT', contrast: 'STYLE_CONTRAST', prominence: 'STYLE_PROMINENCE', state: 'STATE' };

/** Which features differ between two node-signature lists. */
function diffCause(a, b) {
  if (a.length !== b.length) return { primary: 'STRUCTURE', all: ['STRUCTURE'], detail: `${a.length} vs ${b.length} nodes` };
  const codes = new Set();
  let detail = '';
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const x = a[i].split('|');
    const y = b[i].split('|');
    for (let k = 0; k < FIELDS.length; k++) {
      if (x[k] !== y[k]) {
        codes.add(FIELD_CODE[FIELDS[k]]);
        if (!detail) detail = `node ${i} ${FIELDS[k]}: ${String(x[k]).slice(0, 40)} -> ${String(y[k]).slice(0, 40)} (${x[0]})`;
      }
    }
  }
  const all = PRIORITY.filter((c) => codes.has(c));
  return { primary: all[0] || 'UNCLASSIFIED', all, detail };
}

module.exports = { diffCause, PRIORITY, FIELDS, FIELD_CODE };
