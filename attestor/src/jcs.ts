/**
 * RFC 8785 JSON Canonicalization Scheme, TypeScript port.
 *
 * It must agree byte for byte with the PHP implementation (server/src/Crypto/Jcs.php): otherwise
 * the verifier reports mismatches that are implementation artefacts rather than attacks. Both are
 * tested against the shared vectors in tests/fixtures/jcs-vectors.json.
 *
 * JavaScript's own number and string serialisation already follow the RFC (ECMAScript
 * Number::toString; minimal escapes with lower-case hex), so the work here is member ordering and
 * the refusal of values JSON cannot represent.
 */
export function jcs(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value))
        throw new Error('NaN and Infinity cannot be represented in JSON');
      return JSON.stringify(value === 0 ? 0 : value); // -0 serialises as 0
    case 'string':
      return stringify(value);
    case 'object':
      break;
    default:
      throw new Error(`unsupported type: ${typeof value}`);
  }
  if (Array.isArray(value))
    return '[' + value.map((v) => jcs(v === undefined ? null : v)).join(',') + ']';
  const record = value as Record<string, unknown>;
  // The default sort compares UTF-16 code units, which is the order RFC 8785 requires.
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => stringify(k) + ':' + jcs(record[k])).join(',') + '}';
}

function stringify(s: string): string {
  // JSON.stringify escapes lone surrogates; RFC 8785 inputs are valid Unicode, so refuse them.
  if (!isWellFormed(s)) throw new Error('string is not valid Unicode');
  return JSON.stringify(s);
}

function isWellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}
