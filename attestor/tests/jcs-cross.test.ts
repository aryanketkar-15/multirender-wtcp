import vectors from './fixtures/jcs-vectors.json';
import { jcs } from '../src/jcs';

/**
 * The same vectors are run by the PHP suite (server/tests/Crypto/JcsVectorsTest.php). Both
 * implementations must reproduce the expected canonical text byte for byte, so they agree with
 * each other (T3.4.2).
 */
describe('RFC 8785 canonicalisation (TypeScript)', () => {
  it.each(vectors.map((v) => [v.name, v.json, v.canonical]))('%s', (_name, json, canonical) => {
    expect(jcs(JSON.parse(json))).toBe(canonical);
  });

  it('is independent of insertion order', () => {
    expect(jcs({ b: 1, a: { d: 1, c: 2 } })).toBe(jcs({ a: { c: 2, d: 1 }, b: 1 }));
  });

  it('drops undefined members like JSON does and nulls undefined array items', () => {
    expect(jcs({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(jcs([undefined, 1])).toBe('[null,1]');
  });

  it('refuses values JSON cannot represent', () => {
    expect(() => jcs(NaN)).toThrow();
    expect(() => jcs(Infinity)).toThrow();
    expect(() => jcs(() => 1)).toThrow();
    expect(() => jcs('\ud800')).toThrow(); // lone surrogate
    expect(() => jcs({ ['\udc00']: 1 })).toThrow();
  });

  it('serialises negative zero as 0', () => {
    expect(jcs(-0)).toBe('0');
  });
});
