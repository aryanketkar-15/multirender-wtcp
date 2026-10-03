import { buildSync } from 'esbuild';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import type * as Attestor from '../../src/index';

/** Layout, computed style and hit testing need a real engine; jsdom has none of them. */
export const browserAvailable = existsSync(chromium.executablePath()) || Boolean(process.env.CI);

export type AttestorApi = typeof Attestor;
export const describeBrowser = browserAvailable ? describe : describe.skip;

let bundle: string | null = null;

/** The attestor exactly as shipped, built into a classic script exposing `window.MRAttestor`. */
export function attestorBundle(): string {
  bundle ??= buildSync({
    entryPoints: [join(__dirname, '../../src/index.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'MRAttestor',
    target: 'es2020',
    write: false,
  }).outputFiles[0].text;
  return bundle;
}

export function fixture(name: string): string {
  return readFileSync(join(__dirname, '../fixtures', name), 'utf8');
}

export interface ViewportOptions {
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

export class Lab {
  private browser!: Browser;

  async start(): Promise<void> {
    this.browser = await chromium.launch();
  }

  async stop(): Promise<void> {
    await this.browser.close();
  }

  async context(opts: ViewportOptions = {}): Promise<BrowserContext> {
    return this.browser.newContext({
      viewport: { width: opts.width ?? 1280, height: opts.height ?? 800 },
      deviceScaleFactor: opts.deviceScaleFactor ?? 1,
    });
  }

  /** Opens a page with the attestor injected. Caller closes the returned context. */
  async open(
    html: string,
    opts: ViewportOptions = {},
  ): Promise<{ page: Page; close: () => Promise<void> }> {
    const ctx = await this.context(opts);
    const page = await ctx.newPage();
    await page.setContent(html);
    await page.addScriptTag({ content: attestorBundle() });
    return { page, close: () => ctx.close() };
  }
}

declare global {
  interface Window {
    MRAttestor: AttestorApi;
  }
}
