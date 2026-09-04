import { chromium } from '@playwright/test';

const origin = process.env.SAVORIA_ORIGIN ?? 'http://127.0.0.1:8977';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${origin}/play/`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Play' }).click();
await page.getByRole('button', { name: /^Hungrio/ }).click();
await page.getByRole('button', { name: /1-1 Farfalle Fields/ }).click();
await page.locator('#app[data-screen="playing"]').waitFor();
await page.locator('#game-stage canvas').waitFor();

async function frameAt(target, output) {
  await page.evaluate((name) => {
    const session = window.__savoriaTest.session;
    const firstGap = session.level.requiredJumps.find((jump) => jump.transfer === 'gap');
    const targets = {
      enemy: session.enemies[0].sprite.position,
      basil: session.items.find((item) => item.t === 'basil').sprite.position,
      goal: session.goalObject.position,
      start: { x: session.level.spawn[0] + 2.5, y: session.level.spawn[1] - 2.35 },
      gap: {
        x: (firstGap.takeoffX + firstGap.landingX) / 2,
        y: firstGap.takeoffY + 1.5,
      },
      sauce: {
        x: session.hazards[0].mesh.position.x,
        y: session.hazards[0].mesh.position.y + 1.5,
      },
    };
    const targetObject = targets[name];
    const playerPosition = name === 'start'
      ? { x: targetObject.x + 3.2, y: 0 }
      : name === 'gap'
        ? { x: targetObject.x, y: targetObject.y + 0.5 }
        : { x: targetObject.x - 3.8, y: targetObject.y };
    session.pause();
    session.power = { type: 'shield', t: 99 };
    session.player.pos.set(playerPosition.x, playerPosition.y, 0);
    session.player.vel.set(0, 0, 0);
    session.player.grounded = name === 'start';
    session.rig.position.set(playerPosition.x, playerPosition.y, 0.2);
    session.updateShadow();
    session.camera.position.set(targetObject.x, targetObject.y + 4, 21);
    session.camera.lookAt(targetObject.x, targetObject.y + 2.2, 0);
    session.sceneState.updateBackground?.(
      session.camera.position.x,
      session.camera.position.y,
    );
    session.renderer.render(session.scene, session.camera);
  }, target);
  await page.waitForTimeout(80);
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
await frameAt(
  'start',
  'docs/verification/screenshots/world-one/fix-spawn-marker-1440x900.png',
);
await frameAt(
  'gap',
  'docs/verification/screenshots/world-one/fix-cliff-shadow-1440x900.png',
);
await frameAt(
  'sauce',
  'docs/verification/screenshots/world-one/fix-marinara-seam-1440x900.png',
);

await browser.close();
