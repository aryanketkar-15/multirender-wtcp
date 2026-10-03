import { Lab, describeBrowser, fixture } from './browser/harness';
import type { Representation } from '../src/representation';

describeBrowser('semantic representation (srd/1.0)', () => {
  const lab = new Lab();
  beforeAll(() => lab.start());
  afterAll(() => lab.stop());

  async function represent(name: string): Promise<Representation> {
    const { page, close } = await lab.open(fixture(name));
    try {
      return await page.evaluate(() =>
        window.MRAttestor.buildRepresentation(
          document.querySelector('#consent-region')!,
          'consent/v1',
        ),
      );
    } finally {
      await close();
    }
  }

  it('matches the design document example for the subscription fixture', async () => {
    const rep = await represent('subscription-terms.html');
    expect(rep.v).toBe('srd/1.0');
    expect(rep.policy).toBe('consent/v1');
    expect(rep.nodes).toEqual([
      {
        i: 0,
        role: 'heading',
        level: 2,
        text: 'subscription terms',
        visible: true,
        occlusion: 'clear',
        style: { size: 'larger', weight: 'bold', contrast: 'high' },
      },
      {
        i: 1,
        role: 'paragraph',
        text: 'no automatic renewal will be applied.',
        visible: true,
        occlusion: 'clear',
        style: { size: 'base', weight: 'normal', contrast: 'high' },
      },
      {
        i: 2,
        role: 'checkbox',
        name: 'i agree to the terms',
        checked: false,
        required: false,
        disabled: false,
        visible: true,
        occlusion: 'clear',
      },
      {
        i: 3,
        role: 'button',
        name: 'reject',
        disabled: false,
        visible: true,
        occlusion: 'clear',
        style: { size: 'base', weight: 'normal', contrast: 'high', prominence: 'equal' },
      },
      {
        i: 4,
        role: 'button',
        name: 'agree',
        disabled: false,
        visible: true,
        occlusion: 'clear',
        style: { size: 'base', weight: 'normal', contrast: 'high', prominence: 'equal' },
      },
    ]);
  });

  it('contains only normalised text and bucket names, never raw pixel values', async () => {
    for (const name of ['cookie-banner.html', 'loan-terms.html', 'terms-with-links.html']) {
      const json = JSON.stringify(await represent(name));
      expect(json).not.toMatch(/\d+(\.\d+)?px/);
      expect(json).not.toMatch(/rgb\(/);
      expect(json).not.toMatch(/[A-Z]{3,}/); // text is case folded
    }
  });

  it('numbers nodes consecutively after dropping empty ones', async () => {
    const { page, close } = await lab.open(
      '<div id="consent-region"><p>&#8203;</p><p>Real text</p><button>OK</button></div>',
    );
    try {
      const rep = await page.evaluate(() =>
        window.MRAttestor.buildRepresentation(document.querySelector('#consent-region')!, 'x'),
      );
      expect(rep.nodes.map((n) => n.i)).toEqual([0, 1]);
      expect(rep.nodes[0].text).toBe('real text');
    } finally {
      await close();
    }
  });

  it('flags a hidden reject option and a pre-ticked box', async () => {
    const hidden = await represent('minimal.html');
    expect(hidden.nodes.every((n) => n.visible)).toBe(true);
    const ticked = await represent('preticked-newsletter.html');
    expect(ticked.nodes.find((n) => n.role === 'checkbox')?.checked).toBe(true);
  });

  it('exposes no environment inside the representation', async () => {
    const json = JSON.stringify(await represent('minimal.html'));
    for (const word of ['viewport', 'dpr', 'engine', 'forced_colors']) {
      expect(json).not.toContain(word);
    }
  });
});
