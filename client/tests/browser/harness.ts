import { buildSync } from 'esbuild';
import { existsSync } from 'fs';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import type * as Client from './entry';

/** WebCrypto key persistence needs a real engine; jsdom has no IndexedDB or cloneable keys. */
export const browserAvailable = existsSync(chromium.executablePath()) || Boolean(process.env.CI);
export const describeBrowser = browserAvailable ? describe : describe.skip;

export type ClientApi = typeof Client;

declare global {
  interface Window {
    MRClient: ClientApi;
  }
}

let bundle: string | null = null;

export function clientBundle(): string {
  bundle ??= buildSync({
    entryPoints: [join(__dirname, 'entry.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'MRClient',
    target: 'es2020',
    write: false,
  }).outputFiles[0].text;
  return bundle;
}

/** A real http origin (127.0.0.1 is a secure context) serving a blank page and the client bundle. */
export class Lab {
  private browser!: Browser;
  private server!: Server;
  origin = '';

  async start(): Promise<void> {
    this.browser = await chromium.launch();
    this.server = createServer((req, res) => {
      if (req.url === '/lib.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(clientBundle());
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><body><div id="consent-region"></div></body>');
      }
    });
    await new Promise<void>((ok) => this.server.listen(0, '127.0.0.1', ok));
    this.origin = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await this.browser.close();
    this.server.close();
  }

  async context(): Promise<BrowserContext> {
    return this.browser.newContext();
  }

  async open(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    await page.goto(this.origin + '/');
    await page.addScriptTag({ url: this.origin + '/lib.js' });
    return page;
  }
}
