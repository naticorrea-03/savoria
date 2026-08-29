import { chromium } from '@playwright/test';

const origin = process.env.SAVORIA_ORIGIN ?? 'http://127.0.0.1:8977';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${origin}/play/`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Play' }).click();
await page.getByRole('button', { name: /^Fatsio/ }).click();
await page.getByRole('button', { name: /1-1 Farfalle Fields/ }).click();
await page.locator('#app[data-screen="playing"]').waitFor();
await page.locator('#game-stage canvas').waitFor();

async function frameAt(target, output) {
  await page.evaluate((name) => {
    const session = window.__savoriaTest.session;
    const targetObject = name === 'enemy'
      ? session.enemies[0].sprite.position
      : name === 'basil'
        ? session.items.find((item) => item.t === 'basil').sprite.position
        : session.goalObject.position;
    session.power = { type: 'shield', t: 99 };
    session.player.pos.set(targetObject.x - 4.2, targetObject.y, 0);
    session.player.vel.set(0, 0, 0);
    session.player.grounded = false;
  }, target);
  await page.waitForTimeout(250);
  await page.screenshot({ path: output });
}

await frameAt(
  'enemy',
  'docs/verification/screenshots/world-one/fix-marinara-puff-1440x900.png',
);
await frameAt(
  'basil',
  'docs/verification/screenshots/world-one/fix-basil-pickup-1440x900.png',
);
await frameAt(
  'goal',
  'docs/verification/screenshots/world-one/fix-golden-pasta-bell-1440x900.png',
);

await browser.close();
