import { chromium } from '@playwright/test';

const origin = process.env.SAVORIA_ORIGIN ?? 'http://127.0.0.1:8977';
const viewports = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

const browser = await chromium.launch({ headless: true });
for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: `docs/verification/screenshots/landing-${viewport.width}x${viewport.height}.png`,
    fullPage: false,
  });
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({
    path: `docs/verification/screenshots/landing-full-page-${viewport.width}x${fullHeight}.png`,
    fullPage: true,
  });
  await page.close();
  process.stdout.write(`Captured ${viewport.width}x${viewport.height} and ${viewport.width}x${fullHeight}\n`);
}
await browser.close();
