import { chromium } from '@playwright/test';

const origin = process.env.SAVORIA_ORIGIN ?? 'http://127.0.0.1:8977';
const browser = await chromium.launch({ headless: true });

async function startCourse(page, levelName) {
  await page.goto(`${origin}/play/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Adventure' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await page.getByRole('button', { name: levelName }).click();
  await page.locator('#app[data-screen="playing"]').waitFor();
  await page.locator('#game-stage canvas').waitFor();
  await page.waitForTimeout(600);
}

const titlePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await titlePage.goto(`${origin}/play/`, { waitUntil: 'networkidle' });
await titlePage.screenshot({ path: 'docs/verification/screenshots/title-1440x900.png' });
await titlePage.close();

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
  const page = await browser.newPage({ viewport });
  await startCourse(page, /1-1 Farfalle Fields/);
  await page.screenshot({
    path: `docs/verification/screenshots/level-1-1-${viewport.width}x${viewport.height}.png`,
  });

  await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    session.player.pos.copy(session.goalObject.position);
    session.player.vel.set(0, 0, 0);
  });
  await page.locator('#app[data-screen="complete"]').waitFor();
  await page.getByRole('button', { name: 'World 1 map' }).click();
  await page.getByRole('button', { name: /1-2 Penne Ridge/ }).click();
  await page.locator('#app[data-screen="playing"]').waitFor();
  await page.locator('#game-stage canvas').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `docs/verification/screenshots/level-1-2-${viewport.width}x${viewport.height}.png`,
  });
  await page.close();
}

const blockerPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await blockerPage.goto(`${origin}/play/`, { waitUntil: 'networkidle' });
await blockerPage.screenshot({ path: 'docs/verification/screenshots/desktop-required-390x844.png' });
await blockerPage.close();

await browser.close();
