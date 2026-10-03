/**
 * WCAG 2.1 contrast and effective-background resolution.
 *
 * Background gradients and images cannot be resolved to a single colour, so the effective
 * background is built from background-colour layers only. That is a stated limit of the `contrast`
 * feature, not a silent assumption.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(
    s,
  );
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: alpha(rgb[4]) };
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
    s,
  );
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: alpha(srgb[4]) };
  return canvasColor(s);
}

function alpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
}

/** Any CSS colour syntax the engine understands, resolved through a 1x1 canvas. Browser only. */
function canvasColor(s: string): Rgba | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

/** `top` painted over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The opaque colour behind an element: ancestor background-colours composited over white. */
export function effectiveBackground(el: Element): Rgba {
  const layers: Rgba[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const c = parseColor(getComputedStyle(node).backgroundColor);
    if (c && c.a > 0) layers.push(c);
  }
  let result = WHITE;
  for (let i = layers.length - 1; i >= 0; i--) result = composite(layers[i], result);
  return { ...result, a: 1 };
}

/** Contrast of an element's text colour against its effective background. */
export function elementContrast(el: Element): number {
  const bg = effectiveBackground(el);
  const parsed = parseColor(getComputedStyle(el).color) ?? BLACK;
  // Effective text opacity: the colour's own alpha composited over the background.
  const fg = composite(parsed, bg);
  return contrastRatio({ ...fg, a: 1 }, bg);
}
