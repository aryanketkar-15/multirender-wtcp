import {
  THRESHOLDS,
  contrastBucket,
  median,
  occlusionBucket,
  prominenceBucket,
  sizeBucket,
  weightBucket,
} from '../src/buckets';
import { composite, contrastRatio, luminance, parseColor } from '../src/contrast';
import { samplePoints } from '../src/occlusion';

/** Each feature is checked at both sides of every threshold (verification checklist, 3.3). */
describe('threshold boundaries', () => {
  it.each([
    [0.5999, 'tiny'],
    [0.6, 'smaller'],
    [0.8499, 'smaller'],
    [0.85, 'base'],
    [1.0, 'base'],
    [1.1999, 'base'],
    [1.2, 'larger'],
    [1.5999, 'larger'],
    [1.6, 'huge'],
    [3, 'huge'],
    [0, 'tiny'],
  ])('size ratio %f -> %s (T3.3.1)', (ratio, bucket) => {
    expect(sizeBucket(ratio)).toBe(bucket);
  });

  it.each([
    [100, 'light'],
    [399, 'light'],
    [400, 'normal'],
    [599, 'normal'],
    [600, 'bold'],
    [900, 'bold'],
  ])('weight %i -> %s', (w, bucket) => {
    expect(weightBucket(w)).toBe(bucket);
  });

  it.each([
    [1, 'low'],
    [2.999, 'low'],
    [3.0, 'medium'],
    [4.499, 'medium'],
    [4.5, 'high'],
    [21, 'high'],
  ])('contrast %f -> %s', (r, bucket) => {
    expect(contrastBucket(r)).toBe(bucket);
  });

  it.each([
    [0, 'suppressed'],
    [0.5999, 'suppressed'],
    [0.6, 'equal'],
    [1.0, 'equal'],
    [1.5999, 'equal'],
    [1.6, 'dominant'],
    [4, 'dominant'],
  ])('prominence ratio %f -> %s', (r, bucket) => {
    expect(prominenceBucket(r)).toBe(bucket);
  });

  it.each([
    [0, 'clear'],
    [0.1999, 'clear'],
    [0.2, 'partial'],
    [0.4, 'partial'],
    [0.6, 'partial'],
    [0.7999, 'partial'],
    [0.8, 'blocked'],
    [1, 'blocked'],
  ])('occlusion fraction %f -> %s', (f, bucket) => {
    expect(occlusionBucket(f)).toBe(bucket);
  });

  it('five sample points yield the intended fractions', () => {
    // 0/5 clear, 1/5 = 0.2 partial, 4/5 = 0.8 blocked: the thresholds were chosen with five points in mind
    expect(['clear', 'partial', 'partial', 'partial', 'blocked', 'blocked']).toEqual(
      [0, 1, 2, 3, 4, 5].map((n) => occlusionBucket(n / 5)),
    );
  });

  it('keeps the documented threshold constants', () => {
    expect(THRESHOLDS.size).toEqual([0.6, 0.85, 1.2, 1.6]);
    expect(THRESHOLDS.weight).toEqual([400, 600]);
    expect(THRESHOLDS.contrast).toEqual([3.0, 4.5]);
    expect(THRESHOLDS.prominence).toEqual([0.6, 1.6]);
    expect(THRESHOLDS.occlusion).toEqual([0.2, 0.8]);
    expect(THRESHOLDS.opacity).toBe(0.1);
  });
});

describe('minor variation stays in its bucket', () => {
  it('14.4px and 14.66px against a 16px base are the same bucket (T3.3.2)', () => {
    expect(sizeBucket(14.4 / 16)).toBe(sizeBucket(14.66 / 16));
    expect(sizeBucket(14.4 / 16)).toBe('base');
  });

  it('a large shrink changes the bucket (T3.3.3)', () => {
    expect(sizeBucket(16 / 16)).toBe('base');
    expect(sizeBucket(6 / 16)).toBe('tiny');
  });
});

describe('contrast against WCAG 2.1 reference values (T3.3.4)', () => {
  const rgb = (hex: string) => parseColor(hex.length === 7 ? hexToRgb(hex) : hex)!;
  function hexToRgb(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
  }

  it('black on white is 21:1 and identical colours are 1:1', () => {
    expect(contrastRatio(rgb('#000000'), rgb('#ffffff'))).toBeCloseTo(21, 5);
    expect(contrastRatio(rgb('#777777'), rgb('#777777'))).toBeCloseTo(1, 5);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio(rgb('#123456'), rgb('#fedcba'))).toBeCloseTo(
      contrastRatio(rgb('#fedcba'), rgb('#123456')),
      10,
    );
  });

  it('matches published ratios for grey on white', () => {
    expect(contrastRatio(rgb('#767676'), rgb('#ffffff'))).toBeCloseTo(4.54, 2); // smallest grey passing AA
    expect(contrastRatio(rgb('#777777'), rgb('#ffffff'))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(rgb('#949494'), rgb('#ffffff'))).toBeCloseTo(3.03, 2);
  });

  it('the AA edge #767676 is high and #777777 is medium', () => {
    expect(contrastBucket(contrastRatio(rgb('#767676'), rgb('#ffffff')))).toBe('high');
    expect(contrastBucket(contrastRatio(rgb('#777777'), rgb('#ffffff')))).toBe('medium');
  });

  it('grey on grey is low (T3.3.5)', () => {
    expect(contrastBucket(contrastRatio(rgb('#cccccc'), rgb('#dddddd')))).toBe('low');
  });

  it('computes relative luminance', () => {
    expect(luminance(rgb('#000000'))).toBe(0);
    expect(luminance(rgb('#ffffff'))).toBeCloseTo(1, 10);
  });
});

describe('colour parsing and compositing', () => {
  it.each([
    ['rgb(10, 20, 30)', { r: 10, g: 20, b: 30, a: 1 }],
    ['rgba(10, 20, 30, 0.5)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['rgb(10 20 30 / 25%)', { r: 10, g: 20, b: 30, a: 0.25 }],
    ['color(srgb 1 0 0)', { r: 255, g: 0, b: 0, a: 1 }],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
  ])('parses %s', (text, expected) => {
    expect(parseColor(text)).toEqual(expected);
  });

  it('composites half-transparent black over white to mid grey', () => {
    const out = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(out.r).toBeCloseTo(127.5, 5);
    expect(out.a).toBe(1);
  });
});

describe('helpers', () => {
  it('computes medians', () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([1, 9, 5])).toBe(5);
    expect(median([1, 3, 5, 9])).toBe(4);
  });

  it('places five sample points: centre and four quarter points', () => {
    const pts = samplePoints({ left: 100, top: 200, width: 80, height: 40 });
    expect(pts).toEqual([
      { x: 140, y: 220 },
      { x: 120, y: 210 },
      { x: 160, y: 210 },
      { x: 120, y: 230 },
      { x: 160, y: 230 },
    ]);
  });
});
