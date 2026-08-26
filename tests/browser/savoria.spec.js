import { expect, test } from '@playwright/test';

function monitorPage(page) {
  const diagnostics = {
    console: [],
    pageErrors: [],
    externalRequests: [],
  };

  page.on('console', (message) => {
    // Chromium emits this GPU-process diagnostic while WebGL reads pixels.
    // It is not emitted by page code, so retain strict checks for every other
    // application warning and error.
    const chromiumGpuDiagnostic = message.text().includes('GPU stall due to ReadPixels');
    if (
      ['warning', 'error'].includes(message.type())
      && !chromiumGpuDiagnostic
    ) {
      diagnostics.console.push(message.text());
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.hostname !== '127.0.0.1') {
      diagnostics.externalRequests.push(request.url());
    }
  });

  return diagnostics;
}

function expectClean(diagnostics) {
  expect(diagnostics.console).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
  expect(diagnostics.externalRequests).toEqual([]);
}

async function openWorldOne(page) {
  await page.goto('/play/');
  await page.getByRole('button', { name: 'Start Adventure' }).click();
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
  const diagnostics = monitorPage(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /run the pasta course/i })).toBeVisible();
  await page.getByRole('link', { name: 'Play Savoria' }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await page.getByRole('button', { name: 'Start Adventure' }).click();
  await expect(page.getByRole('heading', { name: 'Choose your chef' })).toBeVisible();
  await expect(page.locator('#char-cards button')).toHaveCount(3);

  await page.getByRole('button', { name: /^Dinnerette/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  await expect(page.locator('.world-strip')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'World 1, Pasta Plains' })).toBeVisible();
  await expect(page.locator('[data-action="select-level"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /1-1 Farfalle Fields/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge, locked/ })).toBeDisabled();

  await page.reload();
  await page.getByRole('button', { name: 'Start Adventure' }).click();
  await expect(page.getByRole('button', { name: /^Dinnerette/ })).toHaveAttribute('aria-pressed', 'true');
  expectClean(diagnostics);
});

test('1-1 pauses, resumes with Space, and replaces its canvas on restart', async ({ page }) => {
  const diagnostics = monitorPage(page);

  await startOneOne(page);
  await expect.poll(() => page.evaluate(() => window.__savoriaTest.session?.running)).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'paused');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);

  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect.poll(() => page.evaluate(() => window.__savoriaTest.session?.running)).toBe(true);

  const firstCanvas = await page.locator('#game-stage canvas').elementHandle();
  expect(firstCanvas).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart course' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
  expect(await firstCanvas.evaluate((canvas) => canvas.isConnected)).toBe(false);
  expectClean(diagnostics);
});

test('completion unlocks 1-2 and keeps that progress after reload', async ({ page }) => {
  const diagnostics = monitorPage(page);

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
  await page.getByRole('button', { name: 'Start Adventure' }).click();
  await page.getByRole('button', { name: /^Fatsio/ }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'world');
  await expect(page.getByRole('button', { name: /1-2 Penne Ridge/ })).toBeEnabled();
  expectClean(diagnostics);
});

test('390 by 844 shows only the desktop blocker', async ({ page }) => {
  const diagnostics = monitorPage(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play/');
  await expect(page.getByRole('heading', { name: 'Bring a bigger screen.' })).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  expectClean(diagnostics);
});
