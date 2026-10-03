import { existsSync } from 'fs';
import { chromium } from 'playwright';

// CI installs and caches Chromium. Locally the browser may not be installed; skip rather than
// download ~150 MB during `npm test`. CI sets CI=true, where a missing browser is a failure.
const browserInstalled = existsSync(chromium.executablePath());
const maybe = browserInstalled || process.env.CI ? it : it.skip;

describe('playwright', () => {
  maybe(
    'launches Chromium and renders a page',
    async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        await page.setContent('<main><h1>smoke</h1></main>');
        expect(await page.textContent('h1')).toBe('smoke');
      } finally {
        await browser.close();
      }
    },
    30_000,
  );
});
