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
  await page.close();
  process.stdout.write(`Captured ${viewport.width}x${viewport.height}\n`);
}
await browser.close();
