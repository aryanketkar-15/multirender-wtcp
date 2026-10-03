import adversarial from './fixtures/adversarial-strings.json';
import { normalise } from '../src/normalise';

describe('normalise', () => {
  it('strips zero-width characters (T3.2.1)', () => {
    expect(normalise('re\u200Bject')).toBe('reject');
  });

  it('folds case (T3.2.2)', () => {
    expect(normalise('REJECT')).toBe(normalise('reject'));
  });

  it('collapses whitespace (T3.2.3)', () => {
    expect(normalise('no   automatic\n\trenewal')).toBe('no automatic renewal');
  });

  it('applies NFKC (T3.2.4)', () => {
    expect(normalise('\uFF52\uFF45\uFF4A\uFF45\uFF43\uFF54 \uFF11\uFF12\uFF13')).toBe('reject 123');
  });

  it('strips soft hyphens (T3.2.5)', () => {
    expect(normalise('re\u00ADject')).toBe('reject');
  });

  it('strips bidi controls (T3.2.6)', () => {
    expect(normalise('\u202Etcejer\u202C')).toBe('tcejer');
    expect(normalise('a\u2066b\u2069c\u200Fd\u200Ee')).toBe('abcde');
  });

  it('keeps semantic differences distinct (T3.2.7)', () => {
    expect(normalise('no automatic renewal')).not.toBe(normalise('automatic renewal'));
  });

  it('handles empty and whitespace-only input without throwing (T3.2.9)', () => {
    expect(normalise('')).toBe('');
    expect(normalise('   ')).toBe('');
  });

  describe('adversarial set (T3.2 verification: every string reaches its intended form)', () => {
    it.each(adversarial.map((a) => [a.note, a.input, a.expected]))(
      '%s',
      (_note, input, expected) => {
        expect(normalise(input)).toBe(expected);
      },
    );
  });

  it('is deterministic: 100 repetitions give one output per input (T3.2.8)', () => {
    for (const { input } of adversarial) {
      const outputs = new Set<string>();
      for (let i = 0; i < 100; i++) outputs.add(normalise(input));
      expect(outputs.size).toBe(1);
    }
  });

  it('is idempotent', () => {
    for (const { input } of adversarial) {
      const once = normalise(input);
      expect(normalise(once)).toBe(once);
    }
  });

  describe('semantic differences never collide', () => {
    const pairs: Array<[string, string]> = [
      ['no automatic renewal', 'automatic renewal'],
      ['Reject all', 'Accept all'],
      ['do not share my data', 'share my data'],
      ['2% fee', '20% fee'],
      ['opt in', 'opt out'],
      ['I agree', 'I do not agree'],
      ['free for 30 days', 'free for 3 days'],
      ['cancel anytime', 'cancel any time later'],
    ];
    it.each(pairs)('%s != %s', (a, b) => {
      expect(normalise(a)).not.toBe(normalise(b));
    });
  });

  it('documents a deliberate limit: cross-script confusables stay distinct (the digest then differs)', () => {
    expect(normalise('\u0430ccept')).not.toBe(normalise('accept')); // Cyrillic a
  });

  it('order matters, which is why it is fixed: strip-before-NFKC would differ for a decomposable invisible', () => {
    // U+2024 ONE DOT LEADER is NFKC-compatible with "."; folding happens after, so both orders agree here,
    // but a fullwidth capital only folds correctly because NFKC runs before case folding.
    expect(normalise('\uFF21\uFF22')).toBe('ab');
  });
});
