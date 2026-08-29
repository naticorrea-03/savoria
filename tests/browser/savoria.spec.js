import { expect, test } from '@playwright/test';

const LOCAL_ORIGIN = 'http://127.0.0.1:8977';

async function monitorPage(page) {
  const diagnostics = {
    console: [],
    pageErrors: [],
    externalRequests: [],
    httpFailures: [],
    requestFailures: [],
    webSockets: [],
  };

  await page.addInitScript(() => {
    const calls = [];
    const toText = (value) => {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    for (const type of ['warn', 'error']) {
      const original = console[type];
      console[type] = (...args) => {
        calls.push({ type, text: args.map(toText).join(' ') });
        return original.apply(console, args);
      };
    }
    Object.defineProperty(window, '__savoriaPageConsoleCalls', { value: calls });
  });

  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== LOCAL_ORIGIN) {
      diagnostics.externalRequests.push(request.url());
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === LOCAL_ORIGIN && response.status() >= 400) {
      diagnostics.httpFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    diagnostics.requestFailures.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
  });
  page.on('websocket', (webSocket) => diagnostics.webSockets.push(webSocket.url()));

  return diagnostics;
}

async function expectClean(page, diagnostics) {
  diagnostics.console = await page.evaluate(() => window.__savoriaPageConsoleCalls ?? []);
  expect(diagnostics.console).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.externalRequests).toEqual([]);
  expect(diagnostics.httpFailures).toEqual([]);
  expect(diagnostics.requestFailures).toEqual([]);
  expect(diagnostics.webSockets).toEqual([]);
}

async function waitForTitle(page) {
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'title');
}

async function openWorldOne(page) {
  await page.goto('/play/');
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
}

async function startOneOne(page) {
  await openWorldOne(page);
  await page.getByRole('button', { name: /1-1 Farfalle Fields/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
}

test('landing reaches chef selection and shows only the World 1 release', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /run the pasta course/i })).toBeVisible();
  await page.getByRole('link', { name: 'Play Savoria' }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('heading', { name: 'Who is cooking?' })).toBeVisible();
  await expect(page.getByText('Every chef shares the same moves. Pick your favorite.')).toBeVisible();
  await expect(page.locator('#char-cards button')).toHaveCount(3);

  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  await expect(page.locator('.world-strip')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'World 1, Pasta Plains' })).toBeVisible();
  await expect(page.locator('[data-action="select-level"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /1-1 Farfalle Fields/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge, locked/ })).toBeDisabled();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: /^Dinnerette/ })).toHaveAttribute('aria-pressed', 'true');
  await expectClean(page, diagnostics);
});

test('1-1 pauses, resumes with Space, and replaces its canvas on restart', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await startOneOne(page);
  const timerBeforePause = await page.locator('#timer-text').textContent();

  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);

  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage')).toBeFocused();
  await expect(page.locator('#game-stage canvas')).toBeVisible();
  await expect.poll(async () => page.locator('#timer-text').textContent()).not.toBe(timerBeforePause);

  const firstCanvas = await page.locator('#game-stage canvas').elementHandle();
  expect(firstCanvas).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart course' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
  expect(await firstCanvas.evaluate((canvas) => canvas.isConnected)).toBe(false);
  await expectClean(page, diagnostics);
});

test('1-1 supports a double jump and collectible basil', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await startOneOne(page);
  const result = await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    const player = session.player;
    player.pos.set(4, 20, 0);
    player.vel.set(0, 0, 0);
    player.grounded = true;

    const jump = () => {
      session.input.press('Space');
      session.simulate(1 / 60);
      session.input.release('Space');
      return player.vel.y;
    };
    const firstJump = jump();
    const doubleJump = jump();
    const thirdAttempt = jump();

    const basil = session.items.find((item) => item.t === 'basil');
    if (!basil) {
      return {
        firstJump,
        doubleJump,
        thirdAttempt,
        airJumpsRemaining: player.airJumpsRemaining,
        hasBasil: false,
      };
    }
    player.pos.copy(basil.sprite.position);
    player.vel.set(0, 0, 0);
    session.simulate(1 / 60);
    const resourcePaths = performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname);
    return {
      firstJump,
      doubleJump,
      thirdAttempt,
      airJumpsRemaining: player.airJumpsRemaining,
      hasBasil: true,
      basilTaken: basil.taken,
      hearts: session.hearts,
      resourcePaths,
    };
  });

  expect(result.firstJump).toBeGreaterThan(0);
  expect(result.doubleJump).toBeGreaterThanOrEqual(result.firstJump - 0.01);
  expect(result.thirdAttempt).toBeLessThan(result.doubleJump);
  expect(result.airJumpsRemaining).toBe(0);
  expect(result.hasBasil).toBe(true);
  expect(result.basilTaken).toBe(true);
  expect(result.hearts).toBe(4);
  expect(result.resourcePaths).toContain('/assets/world1/marinara-puff.png');
  expect(result.resourcePaths).toContain('/assets/world1/golden-pasta-bell.png');
  expect(result.resourcePaths).not.toContain('/assets/sprites/meatball_walker.png');
  expect(result.resourcePaths).not.toContain('/assets/sprites/goal_archway.png');
  await expect(page.locator('#hud-hearts')).toHaveAttribute('aria-label', '4 hearts');
  await expectClean(page, diagnostics);
});

test('production progression unlocks, completes, and resumes 1-2', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await startOneOne(page);
  await page.evaluate(() => {
    // This only uses the approved session getter to position the authored level.
    // The next game frame emits completion through the production coordinator.
    const session = window.__savoriaTest.session;
    session.player.pos.copy(session.goalObject.position);
    session.player.vel.set(0, 0, 0);
  });
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'complete');
  await page.getByRole('button', { name: 'World 1 map' }).click();
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge/ })).toBeEnabled();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  const penneRidge = page.getByRole('button', { name: /1-2 Penne Ridge/ });
  await expect(penneRidge).toBeEnabled();

  await penneRidge.click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#hlp-num')).toHaveText('1-2');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');

  const firstCanvas = await page.locator('#game-stage canvas').elementHandle();
  expect(firstCanvas).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart course' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#hlp-num')).toHaveText('1-2');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
  expect(await firstCanvas.evaluate((canvas) => canvas.isConnected)).toBe(false);

  await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    session.player.pos.copy(session.goalObject.position);
    session.player.vel.set(0, 0, 0);
  });
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'complete');
  await expect(page.getByRole('heading', { name: 'World 1 complete!' })).toBeVisible();
  await page.getByRole('button', { name: 'World 1 map' }).click();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge, 2 of 3 stars/ })).toBeEnabled();
  await expectClean(page, diagnostics);
});

test('390 by 844 shows only the desktop blocker', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play/');
  await expect(page.getByRole('heading', { name: 'Bring a bigger screen.' })).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expectClean(page, diagnostics);
});

test('diagnostics fail a page warning that resembles a Chromium GPU notice', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await page.goto('/play/');
  await waitForTitle(page);
  await page.evaluate(() => console.warn('GPU stall due to ReadPixels from page code'));

  await expect(expectClean(page, diagnostics)).rejects.toThrow('GPU stall due to ReadPixels from page code');
});
