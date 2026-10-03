import { Lab, describeBrowser, fixture } from './browser/harness';
import type { Page } from 'playwright';

interface Plain {
  role: string;
  level?: number;
  text?: string;
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  selected?: boolean;
}

const FIXTURES = [
  'cookie-banner',
  'subscription-terms',
  'preticked-newsletter',
  'reject-as-link',
  'terms-with-links',
  'radio-choice',
  'switch-preferences',
  'privacy-modal',
  'loan-terms',
  'minimal',
];

async function extract(page: Page, selector = '#consent-region'): Promise<Plain[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) throw new Error('no region');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return window.MRAttestor.extractNodes(root).map(({ el, ...rest }) => rest);
  }, selector);
}

const trimmed = (nodes: Plain[]) =>
  nodes.map((n) => ({
    ...n,
    text: n.text?.replace(/\s+/g, ' ').trim(),
    name: n.name?.replace(/\s+/g, ' ').trim(),
  }));

describeBrowser('semantic extraction', () => {
  const lab = new Lab();
  beforeAll(() => lab.start());
  afterAll(() => lab.stop());

  async function load(html: string, then: (page: Page) => Promise<void>) {
    const { page, close } = await lab.open(html);
    try {
      await then(page);
    } finally {
      await close();
    }
  }

  it.each(FIXTURES)('extracts the %s fixture without error', async (name) => {
    await load(fixture(`${name}.html`), async (page) => {
      const nodes = await extract(page);
      expect(nodes.length).toBeGreaterThan(0);
      for (const n of nodes) {
        expect([
          'heading',
          'paragraph',
          'text',
          'link',
          'checkbox',
          'radio',
          'switch',
          'button',
        ]).toContain(n.role);
      }
    });
  });

  it('keeps document order (T3.1.1)', async () => {
    await load(fixture('subscription-terms.html'), async (page) => {
      const nodes = trimmed(await extract(page));
      expect(nodes.map((n) => [n.role, n.text ?? n.name])).toEqual([
        ['heading', 'Subscription terms'],
        ['paragraph', 'No automatic renewal will be applied.'],
        ['checkbox', 'I agree to the terms'],
        ['button', 'Reject'],
        ['button', 'Agree'],
      ]);
    });
  });

  it('orders a paragraph before the links inside it', async () => {
    await load(fixture('terms-with-links.html'), async (page) => {
      const nodes = trimmed(await extract(page));
      expect(nodes.map((n) => n.role)).toEqual([
        'paragraph',
        'link',
        'link',
        'checkbox',
        'button',
        'button',
      ]);
      expect(nodes[1].name).toBe('Terms of Service');
      expect(nodes[2].name).toBe('Privacy Policy');
    });
  });

  it('follows reading order for every fixture: no node is repeated', async () => {
    for (const name of FIXTURES) {
      await load(fixture(`${name}.html`), async (page) => {
        const nodes = trimmed(await extract(page));
        const keys = nodes.map((n) => `${n.role}|${n.text ?? n.name}`);
        const singles = keys.filter((k) => !k.startsWith('link|'));
        expect(new Set(singles).size).toBe(singles.length);
      });
    }
  });

  it('excludes non-allowlisted wrappers but keeps their text (T3.1.2)', async () => {
    await load(fixture('privacy-modal.html'), async (page) => {
      const nodes = trimmed(await extract(page));
      expect(nodes.map((n) => n.role)).toEqual(['text', 'text', 'button']);
      expect(nodes.map((n) => n.text ?? n.name)).toEqual([
        'Your privacy matters to us.',
        'We never sell personal data.',
        'OK',
      ]);
    });
  });

  it('captures an unticked checkbox as checked:false (T3.1.3)', async () => {
    await load(fixture('subscription-terms.html'), async (page) => {
      const box = (await extract(page)).find((n) => n.role === 'checkbox');
      expect(box?.checked).toBe(false);
    });
  });

  it('captures a pre-ticked checkbox as checked:true (T3.1.4)', async () => {
    await load(fixture('preticked-newsletter.html'), async (page) => {
      const box = (await extract(page)).find((n) => n.role === 'checkbox');
      expect(box?.checked).toBe(true);
    });
  });

  it('captures a ticked state set after load, not just the attribute', async () => {
    await load(fixture('subscription-terms.html'), async (page) => {
      await page.check('#agree');
      expect((await extract(page)).find((n) => n.role === 'checkbox')?.checked).toBe(true);
    });
  });

  it('skips aria-hidden nodes (T3.1.5)', async () => {
    await load(fixture('privacy-modal.html'), async (page) => {
      const all = JSON.stringify(await extract(page));
      expect(all).not.toContain('LOCK');
      expect(all).not.toContain('decorative');
    });
  });

  it('skips the hidden attribute and hidden inputs', async () => {
    await load(
      '<div id="consent-region"><p hidden>secret</p><input type="hidden" value="x"><p>shown</p></div>',
      async (page) => {
        expect(trimmed(await extract(page)).map((n) => n.text)).toEqual(['shown']);
      },
    );
  });

  it('prefers the aria-label over the visible text (T3.1.6)', async () => {
    await load(fixture('loan-terms.html'), async (page) => {
      const sign = trimmed(await extract(page)).find(
        (n) => n.role === 'button' && n.name === 'Sign the agreement',
      );
      expect(sign).toBeDefined();
      expect(JSON.stringify(await extract(page))).not.toContain('"name":"Go"');
    });
  });

  it('resolves aria-labelledby ahead of aria-label', async () => {
    await load(
      '<div id="consent-region"><span id="a">Named</span><button aria-labelledby="a" aria-label="ignored">x</button></div>',
      async (page) => {
        expect(trimmed(await extract(page)).find((n) => n.role === 'button')?.name).toBe('Named');
      },
    );
  });

  it('names a checkbox from a for= label and from a wrapping label', async () => {
    await load(fixture('terms-with-links.html'), async (page) => {
      const box = trimmed(await extract(page)).find((n) => n.role === 'checkbox');
      expect(box?.name).toBe('I have read both documents');
      expect(box?.required).toBe(true);
    });
  });

  it('does not repeat a control label as a separate text node', async () => {
    await load(fixture('subscription-terms.html'), async (page) => {
      expect((await extract(page)).filter((n) => n.role === 'text')).toEqual([]);
    });
  });

  it('excludes content outside the region (T3.1.7)', async () => {
    await load(
      '<p>outside before</p><div id="consent-region"><p>inside</p></div><button>outside after</button>',
      async (page) => {
        expect(trimmed(await extract(page)).map((n) => n.text)).toEqual(['inside']);
      },
    );
  });

  it('handles an empty region (T3.1.8)', async () => {
    await load('<div id="consent-region"></div>', async (page) => {
      expect(await extract(page)).toEqual([]);
    });
    await load('<div id="consent-region">   <div>  </div></div>', async (page) => {
      expect(await extract(page)).toEqual([]);
    });
  });

  it('captures disabled, switch state and radio state', async () => {
    await load(fixture('loan-terms.html'), async (page) => {
      const decline = (await extract(page)).find((n) => n.name === 'Decline');
      expect(decline?.disabled).toBe(true);
    });
    await load(fixture('switch-preferences.html'), async (page) => {
      const switches = (await extract(page)).filter((n) => n.role === 'switch');
      expect(switches.map((s) => s.checked)).toEqual([true, false]);
    });
    await load(fixture('radio-choice.html'), async (page) => {
      const radios = (await extract(page)).filter((n) => n.role === 'radio');
      expect(radios.map((r) => r.checked)).toEqual([false, true]);
    });
  });

  it('reads a submit input by its value and reports heading levels', async () => {
    await load(fixture('radio-choice.html'), async (page) => {
      expect((await extract(page)).find((n) => n.role === 'button')?.name).toBe('Save choice');
    });
    await load(fixture('loan-terms.html'), async (page) => {
      expect((await extract(page)).filter((n) => n.role === 'heading').map((h) => h.level)).toEqual(
        [1, 3],
      );
    });
  });

  it('treats a link without href as plain text, and ignores selects and scripts', async () => {
    await load(
      '<div id="consent-region"><a>not a link</a><select><option>x</option></select><script>1</script><style>p{}</style></div>',
      async (page) => {
        const nodes = trimmed(await extract(page));
        expect(nodes.map((n) => [n.role, n.text])).toEqual([['text', 'not a link']]);
      },
    );
  });
});
