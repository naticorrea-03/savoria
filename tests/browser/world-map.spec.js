import { expect, test } from '@playwright/test';

const SAVE_KEY = 'savoria3d-save-v4';
const MEMORY_KEY = 'savoria3d-cinematics-v1';

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function seed(page, save, memory) {
  await page.goto('/play/');
  await page.evaluate(([saveKey, memoryKey, saveValue, memoryValue]) => {
    localStorage.clear();
    if (saveValue) localStorage.setItem(saveKey, JSON.stringify(saveValue));
    if (memoryValue) localStorage.setItem(memoryKey, JSON.stringify(memoryValue));
  }, [SAVE_KEY, MEMORY_KEY, save, memory]);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'title');
}

const mapState = (page) => page.evaluate(() => ({ ...window.__savoriaTest.map, view: window.__savoriaTest.map.view }));
const chefAt = (page) => page.evaluate(() => window.__savoriaTest.map.chefAt);
const cinematic = (page) => page.evaluate(() => window.__savoriaTest.map.cinematic);

test('world map: intro, unlock reveal, walking chef, and a staged course clear', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, null, null);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Hungrio/ }).click();
  await expect(page.locator('#map-screen')).toHaveAttribute('data-map-view', 'select');

  // First visit plays the world intro; any key ends it at once.
  await page.getByRole('button', { name: /^World 1, Pasta Plains/ }).click();
  await expect(page.locator('.cine-world-intro')).toBeVisible();
  expect(await cinematic(page)).toBe('world-intro');
  await page.keyboard.press('KeyK');
  expect(await cinematic(page)).toBeNull();
  await expect(page.locator('.cine-world-intro')).toHaveCount(0);
  await expect(page.locator('#map-screen')).toHaveAttribute('data-map-view', 'map');
  // The skip key did not leak into the map (Escape-like keys would leave it).
  expect(await chefAt(page)).toBe(0);
  await expect(page.locator('.ow-node.is-here')).toHaveAttribute('data-level-id', '1-1');
  await expect(page.locator('.ow-node.is-locked')).toHaveCount(
    await page.evaluate(() => window.__savoriaTest.releasedLevels.filter(({ world }) => world === 1).length - 1),
  );

  // A locked neighbor refuses the walk.
  await page.keyboard.press('ArrowRight');
  expect(await chefAt(page)).toBe(0);

  // Returning with 1-2 newly open plays a reveal, then the chef walks there.
  await seed(page, { version: 4, unlocked: 2, best: { '1-1': 3 }, chef: 'dinnerette', sound: false },
    { worlds: [1], worldCards: [1], courses: ['1-1'] });
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await page.getByRole('button', { name: /^World 1, Pasta Plains/ }).click();
  await expect.poll(() => cinematic(page)).toBe('course-unlock');
  await expect(page.locator('.ow-node[data-level-id="1-2"]')).toHaveClass(/is-sealed|is-unsealed/);
  await expect.poll(() => chefAt(page), { timeout: 4000 }).toBe(1);
  await expect.poll(() => mapState(page).then(({ walking }) => walking)).toBe(false);
  await expect(page.locator('.ow-node[data-level-id="1-1"] .ow-node-stars i.is-earned')).toHaveCount(3);
  const memory = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), MEMORY_KEY);
  expect(memory.courses).toContain('1-2');

  // Arrow keys walk the chef along the road with a visible hop.
  const chef = page.locator('.ow-chef');
  const before = await chef.boundingBox();
  await page.keyboard.press('ArrowLeft');
  expect(await mapState(page).then(({ walking }) => walking)).toBe(true);
  const lifts = [];
  for (let sample = 0; sample < 8; sample += 1) {
    lifts.push(await page.locator('.ow-chef-body').evaluate((body) => (
      new DOMMatrixReadOnly(getComputedStyle(body).transform).m42
    )));
    await page.waitForTimeout(40);
  }
  expect(Math.min(...lifts)).toBeLessThan(-4);
  await expect.poll(() => chefAt(page)).toBe(0);
  const after = await chef.boundingBox();
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(100);
  await expect(page.locator('.ow-info')).toContainText('Farfalle Fields');

  // Escape goes back to world select; the save is untouched by any of this.
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-screen')).toHaveAttribute('data-map-view', 'select');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
  expect(saved.unlocked).toBe(2);
  expect(saved.best).toEqual({ '1-1': 3 });

  // Enter opens the focused world, Enter on the chef's node enters the course.
  await page.getByRole('button', { name: /^World 1, Pasta Plains/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#map-screen')).toHaveAttribute('data-map-view', 'map');
  await expect(page.locator('.ow-node.is-here')).toBeFocused();
  const started = Date.now();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  expect(Date.now() - started).toBeLessThan(3000);
  await expect(page.locator('.cine-course-card')).toBeVisible();
  await expect(page.locator('.cine-course-card')).toContainText('Farfalle Fields');

  // Goal: the world celebrates first, the card waits, any key skips ahead.
  // Hold the beat open so a slow CI machine can't let it finish before the
  // checks below run; the skip key still has to end it.
  await page.evaluate(async () => {
    (await import('/js/ui/cinematics.js')).TIMING.goalBeatMs = 60_000;
  });
  await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    session.player.pos.copy(session.goalObject.position);
    session.player.vel.set(0, 0, 0);
  });
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'complete');
  await expect(page.locator('#app')).toHaveAttribute('data-goal-beat', '');
  await expect(page.locator('.cine-goal')).toBeVisible();
  await expect(page.locator('#complete-overlay')).not.toHaveClass(/is-revealed/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#complete-overlay')).toHaveClass(/is-revealed/);
  // The skip key never pressed the focused World map button.
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'complete');
  await expect(page.locator('#complete-stars .star')).toHaveCount(3);

  await page.getByRole('button', { name: 'World map' }).click();
  await expect(page.locator('#map-screen')).toHaveAttribute('data-map-view', 'map');
  await expect(page.locator('.ow-node.is-here')).toHaveAttribute('data-level-id', '1-1');
  expect(errors).toEqual([]);
});

test('reduced motion swaps map movement for quick fades', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { version: 4, unlocked: 2, best: { '1-1': 1 }, chef: 'chefno', sound: false },
    { worlds: [1], worldCards: [1], courses: ['1-1', '1-2'] });
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Chefno/ }).click();
  await page.getByRole('button', { name: /^World 1, Pasta Plains/ }).click();
  await expect(page.locator('#map-screen')).toHaveAttribute('data-map-view', 'map');
  const from = await chefAt(page);
  await page.keyboard.press(from === 0 ? 'ArrowRight' : 'ArrowLeft');
  await expect.poll(() => chefAt(page), { timeout: 600 }).toBe(from === 0 ? 1 : 0);
  // No hop: the body never lifts off the node.
  const lift = await page.locator('.ow-chef-body').evaluate((body) => (
    new DOMMatrixReadOnly(getComputedStyle(body).transform).m42
  ));
  expect(lift).toBe(0);
  await expect(page.locator('.cine-confetti')).toHaveCount(0);
});
