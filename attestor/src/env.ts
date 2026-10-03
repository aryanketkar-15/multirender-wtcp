export interface EnvVector {
  engine: 'Blink' | 'Gecko' | 'WebKit' | 'Unknown';
  engine_major: string;
  viewport_bucket: 'small' | 'medium' | 'large';
  dpr_bucket: '1x' | '2x' | '3x';
  forced_colors: boolean;
  reduced_motion: boolean;
}

/**
 * The rendering environment, recorded beside the digest so a verifier can replay under a matched
 * profile. It is never digested: digesting viewport or pixel ratio would turn every device
 * difference into a mismatch (decision D-08).
 */
export function collectEnv(win: Window = window): EnvVector {
  const ua = win.navigator.userAgent;
  let engine: EnvVector['engine'] = 'Unknown';
  let major = '0';
  const pick = (re: RegExp, e: EnvVector['engine']) => {
    const m = re.exec(ua);
    if (m && engine === 'Unknown') {
      engine = e;
      major = m[1];
    }
  };
  pick(/(?:Chrome|Chromium|CriOS|Edg|OPR)\/(\d+)/, 'Blink');
  pick(/(?:Firefox|FxiOS)\/(\d+)/, 'Gecko');
  pick(/Version\/(\d+)[\d.]* .*Safari/, 'WebKit');

  const w = win.innerWidth;
  const dpr = win.devicePixelRatio || 1;
  const media = (q: string) => (win.matchMedia ? win.matchMedia(q).matches : false);
  return {
    engine,
    engine_major: major,
    viewport_bucket: w < 600 ? 'small' : w < 1100 ? 'medium' : 'large',
    dpr_bucket: dpr < 1.5 ? '1x' : dpr < 2.5 ? '2x' : '3x',
    forced_colors: media('(forced-colors: active)'),
    reduced_motion: media('(prefers-reduced-motion: reduce)'),
  };
}
