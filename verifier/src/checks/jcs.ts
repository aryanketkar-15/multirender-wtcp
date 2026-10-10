/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 * Deterministic JSON stringification matching PHP Jcs::encode and WebCrypto.
 */

export function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('NaN and Infinity are not valid in JSON');
    }
    // ECMAScript Number::toString
    return String(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Sort keys by UTF-16 code unit values
    const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k]));
    return '{' + parts.join(',') + '}';
  }
  throw new Error(`Unsupported type for canonical JSON: ${typeof value}`);
}
