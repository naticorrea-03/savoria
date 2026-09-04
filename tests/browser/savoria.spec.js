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
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
}

async function startOneOne(page) {
  await openWorldOne(page);
  await page.getByRole('button', { name: /1-1 Farfalle Fields/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
}

test('home opens the game directly and shows every planned world', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await page.goto('/');
  await expect(page).toHaveURL(/\/play\/$/);
  await waitForTitle(page);
  await expect(page.getByRole('region', { name: 'Chef party' })).toBeVisible();
  await expect(page.locator('.title-chef')).toHaveCount(3);
  await expect(page.getByRole('complementary', { name: 'Adventure board' })).toBeVisible();
  await expect(page.locator('.title-world-card')).toHaveCount(6);
  await expect(page.locator('.title-world-card.unreleased.locked')).toHaveCount(4);
  await expect(page.getByText('Taco Territory')).toBeVisible();
  await expect(page.getByText('Curry Cliffs')).toBeVisible();
  await expect(page.getByText('Dumpling Dynasty')).toBeVisible();
  await expect(page.getByText('Dessert Dome')).toBeVisible();
  await expect(page.locator('.title-stat').first()).toContainText('0/12');
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await expect(page.getByRole('heading', { name: 'Who is cooking?' })).toBeVisible();
  await expect(page.getByText('Every chef shares the same moves. Pick your favorite.')).toBeVisible();
  await expect(page.locator('#char-cards button')).toHaveCount(3);

  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  await expect(page.locator('.world-strip')).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'World 1, Pasta Plains' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'World 2, Sushi Shores' })).toBeVisible();
  await expect(page.locator('[data-action="select-level"]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: /1-1 Farfalle Fields/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge, locked/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /2-1 Nori Narrows, locked/ })).toBeDisabled();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await expect(page.getByRole('button', { name: /^Dinnerette/ })).toHaveAttribute('aria-pressed', 'true');
  await expectClean(page, diagnostics);
});

test('1-1 pauses, resumes with Space, and replaces its canvas on restart', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await startOneOne(page);

  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__savoriaTest.session?.running)).toBe(false);

  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage')).toBeFocused();
  await expect(page.locator('#game-stage canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__savoriaTest.session?.running)).toBe(true);

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
  expect(result.resourcePaths).toContain('/assets/world1/chef-spawn-marker.png');
  expect(result.resourcePaths).not.toContain('/assets/sprites/meatball_walker.png');
  expect(result.resourcePaths).not.toContain('/assets/sprites/goal_archway.png');
  expect(result.resourcePaths).not.toContain('/assets/sprites/start_signpost.png');
  await expect(page.locator('#hud-hearts')).toHaveAttribute('aria-label', '4 hearts');
  await expectClean(page, diagnostics);
});

test('1-1 hides off-surface shadows and renders seamless sauce with cliff trim', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await startOneOne(page);
  const result = await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    const gap = session.level.requiredJumps.find((jump) => jump.transfer === 'gap');
    session.player.pos.set(gap.takeoffX + 0.1, gap.takeoffY + 2, 0);
    session.updateShadow();

    const canvas = session.hazards[0].tex.image;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const left = context.getImageData(0, 0, 1, canvas.height).data;
    const right = context.getImageData(canvas.width - 1, 0, 1, canvas.height).data;
    const maxAlpha = (pixels) => {
      let maximum = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        maximum = Math.max(maximum, pixels[index]);
      }
      return maximum;
    };
    let cliffEdges = 0;
    session.scene.traverse((object) => {
      if (object.name === 'pasta-plains-cliff-edge') cliffEdges += 1;
    });

    return {
      shadowVisible: session.blob.visible,
      sauceLeftAlpha: maxAlpha(left),
      sauceRightAlpha: maxAlpha(right),
      cliffEdges,
    };
  });

  expect(result.shadowVisible).toBe(false);
  expect(result.sauceLeftAlpha).toBeGreaterThan(200);
  expect(result.sauceRightAlpha).toBeGreaterThan(200);
  expect(result.cliffEdges).toBeGreaterThan(0);
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
  await page.getByRole('button', { name: 'World map' }).click();
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge/ })).toBeEnabled();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
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
  await page.getByRole('button', { name: 'World map' }).click();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge, 2 of 3 stars/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /2-1 Nori Narrows/ })).toBeEnabled();
  await expectClean(page, diagnostics);
});

test('Sushi Shores loads themed art, unlocks 2-2, completes, and resumes', async ({ page }) => {
  const diagnostics = await monitorPage(page);

  await page.goto('/play/');
  await page.evaluate(() => {
    localStorage.setItem('savoria3d-save-v4', JSON.stringify({
      version: 4,
      unlocked: 3,
      best: { '1-1': 3, '1-2': 3 },
      chef: 'dinnerette',
      sound: false,
    }));
  });
  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await page.evaluate(() => performance.clearResourceTimings());

  await page.getByRole('button', { name: /2-1 Nori Narrows/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#hlp-world')).toHaveText('SUSHI SHORES');
  await expect(page.locator('#hlp-num')).toHaveText('2-1');
  const themedFrame = await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    const paths = performance.getEntriesByType('resource')
      .map((entry) => new URL(entry.name).pathname);
    return {
      paths,
      enemyPath: session.level.theme.visuals.sprites.meatball,
      hazardPath: session.level.theme.visuals.hazard.surface,
      doorPath: session.level.theme.visuals.sprites.door,
    };
  });
  expect(themedFrame.paths).toContain('/assets/world2/background-far.png');
  expect(themedFrame.paths).toContain('/assets/world2/rice-nori-ground.png');
  expect(themedFrame.paths).toContain('/assets/world2/wasabi-imp.png');
  expect(themedFrame.paths).toContain('/assets/world2/golden-sushi-lantern.png');
  expect(themedFrame.paths).toContain('/assets/world2/bonus-sushi-portal.png');
  expect(themedFrame.paths).not.toContain('/assets/world1/lasagna-cliff-edge.png');
  expect(themedFrame.enemyPath).toBe('assets/world2/wasabi-imp.png');
  expect(themedFrame.hazardPath).toBe('assets/world2/soy-sauce-surface.png');
  expect(themedFrame.doorPath).toBe('assets/world2/bonus-sushi-portal.png');

  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    session.player.pos.copy(session.goalObject.position);
    session.player.vel.set(0, 0, 0);
  });
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'complete');
  await page.getByRole('button', { name: 'World map' }).click();
  await expect(page.getByRole('button', { name: /2-2 Wasabi Falls/ })).toBeEnabled();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await page.getByRole('button', { name: /2-2 Wasabi Falls/ }).click();
  await expect(page.locator('#hlp-num')).toHaveText('2-2');
  await page.evaluate(() => {
    const session = window.__savoriaTest.session;
    session.player.pos.copy(session.goalObject.position);
    session.player.vel.set(0, 0, 0);
  });
  await expect(page.getByRole('heading', { name: 'World 2 complete!' })).toBeVisible();
  await page.getByRole('button', { name: 'World map' }).click();

  await page.reload();
  await waitForTitle(page);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await expect(page.getByRole('button', { name: /2-2 Wasabi Falls, 2 of 3 stars/ })).toBeEnabled();
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
