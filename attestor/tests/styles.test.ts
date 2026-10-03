import { Lab, describeBrowser } from './browser/harness';
import type { ViewportOptions } from './browser/harness';
import type { Page } from 'playwright';

const SHELL = (body: string, css = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;font:16px/1.4 sans-serif;color:#000;background:#fff}
    #consent-region{position:relative;width:600px;padding:20px}
    ${css}
  </style></head><body>${body}</body></html>`;

describeBrowser('style, visibility and occlusion measured in a real engine', () => {
  const lab = new Lab();
  beforeAll(() => lab.start());
  afterAll(() => lab.stop());

  async function measure<T>(
    html: string,
    fn: (page: Page) => Promise<T>,
    vp: ViewportOptions = {},
  ) {
    const { page, close } = await lab.open(html, vp);
    try {
      return await fn(page);
    } finally {
      await close();
    }
  }

  const style = (page: Page, sel: string) =>
    page.evaluate((s) => {
      const el = document.querySelector(s)!;
      const base = window.MRAttestor.baseFontSize(document.querySelector('#consent-region')!);
      return window.MRAttestor.measureStyle(el, base);
    }, sel);

  const visible = (page: Page, sel: string) =>
    page.evaluate((s) => window.MRAttestor.isVisible(document.querySelector(s)!), sel);

  const occlusion = (page: Page, sel: string, role = 'button') =>
    page.evaluate(
      ([s, r]) => window.MRAttestor.measureOcclusion(document.querySelector(s)!, r as 'button'),
      [sel, role],
    );

  describe('size', () => {
    it('uses the region font size as its base', async () => {
      await measure(SHELL('<div id="consent-region"><p id="a">x</p></div>'), async (page) => {
        expect((await style(page, '#a')).size).toBe('base');
      });
    });

    it('keeps 14.4px and 14.66px in one bucket (T3.3.2)', async () => {
      const html = SHELL(
        '<div id="consent-region"><p id="a" style="font-size:14.4px">x</p><p id="b" style="font-size:14.66px">y</p></div>',
      );
      await measure(html, async (page) => {
        expect((await style(page, '#a')).size).toBe((await style(page, '#b')).size);
      });
    });

    it('moves a disclosure shrunk from 16px to 6px from base to tiny (T3.3.3)', async () => {
      const html = SHELL(
        '<div id="consent-region"><p id="a">x</p><p id="b" style="font-size:6px">y</p></div>',
      );
      await measure(html, async (page) => {
        expect((await style(page, '#a')).size).toBe('base');
        expect((await style(page, '#b')).size).toBe('tiny');
      });
    });

    it.each([
      ['9.5px', 'tiny'],
      ['9.6px', 'smaller'],
      ['13.5px', 'smaller'],
      ['13.7px', 'base'],
      ['19.1px', 'base'],
      ['19.3px', 'larger'],
      ['25.5px', 'larger'],
      ['25.7px', 'huge'],
    ])('font-size %s lands in %s (both sides of every threshold)', async (px, expected) => {
      await measure(
        SHELL(`<div id="consent-region"><p id="a" style="font-size:${px}">x</p></div>`),
        async (page) => {
          expect((await style(page, '#a')).size).toBe(expected);
        },
      );
    });

    it('treats 1rem and 16px identically', async () => {
      const html = SHELL(
        '<div id="consent-region"><p id="a" style="font-size:1rem">x</p><p id="b" style="font-size:16px">y</p></div>',
      );
      await measure(html, async (page) => {
        expect(await style(page, '#a')).toEqual(await style(page, '#b'));
      });
    });
  });

  describe('weight', () => {
    it.each([
      [300, 'light'],
      [399, 'light'],
      [400, 'normal'],
      [500, 'normal'],
      [600, 'bold'],
      [700, 'bold'],
    ])('font-weight %i -> %s', async (w, expected) => {
      await measure(
        SHELL(`<div id="consent-region"><p id="a" style="font-weight:${w}">x</p></div>`),
        async (page) => {
          expect((await style(page, '#a')).weight).toBe(expected);
        },
      );
    });
  });

  describe('contrast', () => {
    it('detects grey-on-grey reject text (T3.3.5)', async () => {
      const html = SHELL(
        '<div id="consent-region" style="background:#ddd"><button id="r" style="color:#ccc;background:transparent;border:0">Reject</button></div>',
      );
      await measure(html, async (page) => {
        expect((await style(page, '#r')).contrast).toBe('low');
      });
    });

    it('rates black on white high', async () => {
      await measure(SHELL('<div id="consent-region"><p id="a">x</p></div>'), async (page) => {
        expect((await style(page, '#a')).contrast).toBe('high');
      });
    });

    it('resolves a transparent element against its coloured ancestor (T3.3.10)', async () => {
      const html = SHELL(
        '<div id="consent-region" style="background:#222"><div style="background:transparent"><p id="a" style="color:#333;background:transparent">dark on dark</p></div></div>',
      );
      await measure(html, async (page) => {
        // against white #333 would be high; against the real #222 ancestor it is low
        expect((await style(page, '#a')).contrast).toBe('low');
      });
    });

    it('composites a translucent background over its parent', async () => {
      const html = SHELL(
        '<div id="consent-region" style="background:#fff"><div style="background:rgba(0,0,0,0.9)"><p id="a" style="color:#fff">light on near-black</p></div></div>',
      );
      await measure(html, async (page) => {
        expect((await style(page, '#a')).contrast).toBe('high');
      });
    });

    it('applies the text colour alpha', async () => {
      const html = SHELL(
        '<div id="consent-region"><p id="a" style="color:rgba(0,0,0,0.12)">faint</p></div>',
      );
      await measure(html, async (page) => {
        expect((await style(page, '#a')).contrast).toBe('low');
      });
    });

    it('understands modern colour syntaxes through the canvas fallback', async () => {
      const html = SHELL(
        '<div id="consent-region"><p id="a" style="color:oklch(0.2 0 0)">x</p></div>',
      );
      await measure(html, async (page) => {
        expect((await style(page, '#a')).contrast).toBe('high');
      });
    });
  });

  describe('prominence', () => {
    const buttons = (aw: number, ah: number, rw: number, rh: number, extra = '') =>
      SHELL(
        `<div id="consent-region"><button id="a" style="width:${aw}px;height:${ah}px;padding:0">Accept</button>
         <button id="r" style="width:${rw}px;height:${rh}px;padding:0">Reject</button>${extra}</div>`,
      );
    const prominence = (page: Page) =>
      page.evaluate(() => {
        const els = [...document.querySelectorAll('button')];
        const map = window.MRAttestor.prominenceOf(els);
        return Object.fromEntries(els.map((e) => [e.id, map.get(e)]));
      });

    it('calls equal-sized buttons equal', async () => {
      await measure(buttons(120, 44, 120, 44), async (page) => {
        expect(await prominence(page)).toEqual({ a: 'equal', r: 'equal' });
      });
    });

    it('detects a reject button at a third of the accept area (T3.3.6)', async () => {
      await measure(buttons(150, 60, 50, 60), async (page) => {
        expect(await prominence(page)).toEqual({ a: 'dominant', r: 'suppressed' });
      });
    });

    it('sits on the boundary correctly: 0.59 suppressed, 0.6 equal, 1.6 dominant', async () => {
      await measure(buttons(100, 100, 59, 100), async (page) => {
        expect((await prominence(page)).r).toBe('suppressed');
      });
      await measure(buttons(100, 100, 60, 100), async (page) => {
        expect((await prominence(page)).r).toBe('equal');
      });
      await measure(buttons(100, 100, 160, 100), async (page) => {
        expect((await prominence(page)).r).toBe('dominant');
      });
    });

    it('treats a lone button as equal and ignores a hidden sibling', async () => {
      await measure(
        buttons(100, 40, 100, 40, '<button id="h" style="display:none">Hidden</button>'),
        async (page) => {
          const p = await prominence(page);
          expect(p.a).toBe('equal');
          expect(p.h).toBe('suppressed'); // zero area
        },
      );
    });

    it('uses the median of the other buttons', async () => {
      const html = SHELL(
        `<div id="consent-region">
          <button id="a" style="width:100px;height:40px;padding:0">A</button>
          <button id="b" style="width:100px;height:40px;padding:0">B</button>
          <button id="c" style="width:300px;height:40px;padding:0">C</button></div>`,
      );
      await measure(html, async (page) => {
        const p = await prominence(page);
        expect(p.c).toBe('dominant'); // 12000 / median(4000, 4000)
        // a is judged against median(4000, 12000) = 8000, so 0.5: suppressed. A very large sibling makes the
        // smaller ones read as suppressed; this is the intended meaning, and a calibration note for Phase 6.
        expect(p.a).toBe('suppressed');
      });
    });
  });

  describe('visible', () => {
    const cases: Array<[string, string, boolean]> = [
      ['plain', '', true],
      ['display none', 'display:none', false],
      ['visibility hidden', 'visibility:hidden', false],
      ['opacity 0.05 (T3.3.9)', 'opacity:0.05', false],
      ['opacity 0.09', 'opacity:0.09', false],
      ['opacity 0.1', 'opacity:0.1', true],
      ['opacity 0.5', 'opacity:0.5', true],
      ['zero size', 'width:0;height:0;padding:0;border:0', false],
      ['off-canvas left', 'position:absolute;left:-9999px', false],
      ['off-canvas top', 'position:absolute;top:-9999px', false],
    ];
    it.each(cases)('%s -> visible=%s', async (_name, css, expected) => {
      await measure(
        SHELL(`<div id="consent-region"><button id="a" style="${css}">Reject</button></div>`),
        async (page) => {
          expect(await visible(page, '#a')).toBe(expected);
        },
      );
    });

    it('multiplies opacity down the ancestor chain', async () => {
      const html = SHELL(
        '<div id="consent-region"><div style="opacity:0.3"><div style="opacity:0.3"><button id="a">x</button></div></div></div>',
      );
      await measure(html, async (page) => {
        expect(await visible(page, '#a')).toBe(false); // 0.09
      });
    });

    it('is false when an ancestor is display:none', async () => {
      await measure(
        SHELL(
          '<div id="consent-region"><div style="display:none"><button id="a">x</button></div></div>',
        ),
        async (page) => {
          expect(await visible(page, '#a')).toBe(false);
        },
      );
    });

    it('is false when an overflow-hidden ancestor clips it away', async () => {
      const html = SHELL(
        '<div id="consent-region"><div style="width:100px;height:20px;overflow:hidden;position:relative"><button id="a" style="position:absolute;top:100px">x</button></div></div>',
      );
      await measure(html, async (page) => {
        expect(await visible(page, '#a')).toBe(false);
      });
    });

    it('treats below-the-fold content as visible at any window size', async () => {
      const html = SHELL(
        '<div style="height:3000px"></div><div id="consent-region"><button id="a">x</button></div>',
      );
      await measure(html, async (page) => {
        expect(await visible(page, '#a')).toBe(true);
      });
    });
  });

  describe('occlusion', () => {
    const overlay = (css: string) =>
      SHELL(
        `<div id="consent-region"><button id="r" style="position:absolute;left:20px;top:20px;width:100px;height:40px;padding:0">Reject</button>
         <div id="cover" style="position:absolute;${css}"></div></div>`,
      );

    it('is clear when nothing overlaps', async () => {
      await measure(overlay('display:none'), async (page) => {
        expect(await occlusion(page, '#r')).toBe('clear');
      });
    });

    it('is blocked when an overlay covers the control (T3.3.7)', async () => {
      await measure(
        overlay('left:0;top:0;width:200px;height:100px;background:#fff'),
        async (page) => {
          expect(await occlusion(page, '#r')).toBe('blocked');
        },
      );
    });

    it('is partial when 40% is covered (T3.3.8)', async () => {
      // covers x from 20px to 60px of a 100px-wide button: the two points at 25% are covered
      await measure(
        overlay('left:0;top:0;width:60px;height:100px;background:#fff'),
        async (page) => {
          expect(await occlusion(page, '#r')).toBe('partial');
        },
      );
    });

    it('is partial when 20% is covered (one point), blocked at 80% (four points)', async () => {
      // only the (25%, 25%) point lies inside a small corner box
      await measure(
        overlay('left:0;top:0;width:60px;height:35px;background:#fff'),
        async (page) => {
          expect(await occlusion(page, '#r')).toBe('partial');
        },
      );
      // everything except the bottom-right quadrant: 4 of the 5 sample points are covered
      await measure(
        overlay(
          'left:0;top:0;width:200px;height:100px;background:#fff;clip-path:polygon(0 0,100% 0,100% 45px,90px 45px,90px 100%,0 100%)',
        ),
        async (page) => {
          expect(await occlusion(page, '#r')).toBe('blocked');
        },
      );
    });

    it('does not count the control own children or its label', async () => {
      const html = SHELL(
        '<div id="consent-region"><button id="a"><span style="display:block;width:100px;height:40px">label</span></button></div>',
      );
      await measure(html, async (page) => {
        expect(await occlusion(page, '#a')).toBe('clear');
      });
    });

    it('treats a control with pointer-events:none as blocked by its ancestor', async () => {
      const html = SHELL(
        '<div id="consent-region"><button id="a" style="pointer-events:none;width:100px;height:40px">x</button></div>',
      );
      await measure(html, async (page) => {
        expect(await occlusion(page, '#a')).toBe('blocked');
      });
    });

    it('is not fooled by a text container whose ancestor is hit', async () => {
      await measure(
        SHELL('<div id="consent-region"><div id="t">some text in a container</div></div>'),
        async (page) => {
          expect(await occlusion(page, '#t', 'text')).toBe('clear');
        },
      );
    });

    it('does not count points outside the viewport', async () => {
      const html = SHELL(
        '<div style="height:3000px"></div><div id="consent-region"><button id="a">x</button></div>',
      );
      await measure(html, async (page) => {
        expect(await occlusion(page, '#a')).toBe('clear');
      });
    });
  });

  describe('zoom and device pixel ratio do not move buckets (T3.3.11)', () => {
    const html = SHELL(
      `<div id="consent-region">
        <p id="p">A disclosure paragraph.</p>
        <p id="s" style="font-size:9px;color:#999">Small grey print.</p>
        <button id="a" style="width:140px;height:48px;padding:0">Accept</button>
        <button id="r" style="width:60px;height:30px;padding:0;font-weight:300">Reject</button></div>`,
    );
    const snapshot = (page: Page) =>
      page.evaluate(() => {
        const root = document.querySelector('#consent-region')!;
        const base = window.MRAttestor.baseFontSize(root);
        const buttons = [...document.querySelectorAll('button')];
        const prom = window.MRAttestor.prominenceOf(buttons);
        const out: Record<string, unknown> = {};
        for (const sel of ['#p', '#s', '#a', '#r']) {
          const el = document.querySelector(sel)!;
          out[sel] = {
            ...window.MRAttestor.measureStyle(el, base),
            visible: window.MRAttestor.isVisible(el),
            occlusion: window.MRAttestor.measureOcclusion(el, 'button'),
            prominence: prom.get(el),
          };
        }
        return out;
      });

    it('gives identical buckets at 100% and 150% zoom', async () => {
      // Browser zoom shrinks the layout viewport and raises the device pixel ratio together.
      const at100 = await measure(html, snapshot, {
        width: 1200,
        height: 800,
        deviceScaleFactor: 1,
      });
      const at150 = await measure(html, snapshot, {
        width: 800,
        height: 533,
        deviceScaleFactor: 1.5,
      });
      expect(at150).toEqual(at100);
    });

    it('gives identical buckets at device pixel ratio 1, 2 and 3', async () => {
      const dpr1 = await measure(html, snapshot, { deviceScaleFactor: 1 });
      expect(await measure(html, snapshot, { deviceScaleFactor: 2 })).toEqual(dpr1);
      expect(await measure(html, snapshot, { deviceScaleFactor: 3 })).toEqual(dpr1);
    });

    it('gives identical buckets at wide and narrow windows when layout is fixed-size', async () => {
      const wide = await measure(html, snapshot, { width: 1920, height: 1080 });
      expect(await measure(html, snapshot, { width: 1280, height: 720 })).toEqual(wide);
    });
  });
});
