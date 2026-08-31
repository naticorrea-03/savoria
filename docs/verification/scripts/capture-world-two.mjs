import { chromium } from '@playwright/test';

const origin = process.env.SAVORIA_ORIGIN ?? 'http://127.0.0.1:8977';
const outputRoot = 'docs/verification/screenshots/world-two';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${origin}/play/`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('savoria3d-save-v4', JSON.stringify({
    version: 4,
    unlocked: 4,
    best: { '1-1': 3, '1-2': 3, '2-1': 2 },
    chef: 'dinnerette',
    sound: false,
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Play' }).click();
await page.getByRole('button', { name: /^Dinnerette/ }).click();
await page.screenshot({ path: `${outputRoot}/world-map-1440x900.png` });

async function enterCourse(name) {
  await page.getByRole('button', { name }).click();
  await page.locator('#app[data-screen="playing"]').waitFor();
  await page.locator('#game-stage canvas').waitFor();
  await page.waitForTimeout(250);
}

async function frameAt(kind, output) {
  await page.evaluate((targetKind) => {
    const session = window.__savoriaTest.session;
    const target = targetKind === 'enemy'
      ? session.enemies[0].sprite.position
      : targetKind === 'goal'
        ? session.goalObject.position
        : session.hazards[0].mesh.position;
    const playerPosition = { x: target.x - 4.2, y: target.y + 1.2 };
    session.pause();
    session.player.pos.set(playerPosition.x, playerPosition.y, 0);
    session.player.vel.set(0, 0, 0);
    session.player.grounded = false;
    session.rig.position.set(playerPosition.x, playerPosition.y, 0.2);
    session.updateShadow();
    session.camera.position.set(target.x, target.y + 4.5, 21);
    session.camera.lookAt(target.x, target.y + 2.2, 0);
    session.sceneState.updateBackground?.(
      session.camera.position.x,
      session.camera.position.y,
    );
    session.renderer.render(session.scene, session.camera);
  }, kind);
  await page.waitForTimeout(80);
  await page.screenshot({ path: `${outputRoot}/${output}` });
}

await enterCourse(/2-1 Nori Narrows/);
await page.screenshot({ path: `${outputRoot}/gameplay-2-1-start-1440x900.png` });
await frameAt('enemy', 'gameplay-2-1-enemy-1440x900.png');
await frameAt('hazard', 'gameplay-2-1-hazard-1440x900.png');
await page.evaluate(() => window.__savoriaTest.session.resume());
await page.keyboard.press('Escape');
await page.screenshot({ path: `${outputRoot}/pause-2-1-1440x900.png` });
await page.getByRole('button', { name: 'World map' }).click();

await enterCourse(/2-2 Wasabi Falls/);
await page.screenshot({ path: `${outputRoot}/gameplay-2-2-start-1440x900.png` });
await frameAt('goal', 'gameplay-2-2-goal-1440x900.png');
await page.evaluate(() => {
  const session = window.__savoriaTest.session;
  session.resume();
  session.player.pos.copy(session.goalObject.position);
  session.player.vel.set(0, 0, 0);
});
await page.locator('#app[data-screen="complete"]').waitFor();
await page.screenshot({ path: `${outputRoot}/world-two-complete-1440x900.png` });

await page.getByRole('button', { name: 'World map' }).click();
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  const size = `${viewport.width}x${viewport.height}`;
  await page.setViewportSize(viewport);
  await page.screenshot({ path: `${outputRoot}/world-map-${size}.png` });

  await enterCourse(/2-1 Nori Narrows/);
  await page.screenshot({ path: `${outputRoot}/gameplay-2-1-start-${size}.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'World map' }).click();

  await enterCourse(/2-2 Wasabi Falls/);
  await page.screenshot({ path: `${outputRoot}/gameplay-2-2-start-${size}.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'World map' }).click();
}

await browser.close();
