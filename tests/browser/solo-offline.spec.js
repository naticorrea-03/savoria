import { expect, test } from '@playwright/test';

test('Python-only server runs Solo Adventure 1-1 without WebSockets or browser diagnostics', async ({ page }) => {
  const diagnostics = [];
  const platformWarnings = [];
  const sockets = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      const text = message.text();
      if (message.type() === 'warning' && text.includes('GL Driver Message')) {
        platformWarnings.push(text);
      } else {
        diagnostics.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  page.on('websocket', (socket) => sockets.push(socket.url()));

  await page.goto('/play/');
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await page.getByRole('button', { name: /^Hungrio/ }).click();
  await page.getByRole('button', { name: /1-1 Farfalle Fields/ }).click();

  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#game-stage canvas')).toHaveCount(1);
  expect(sockets).toEqual([]);
  expect(platformWarnings.every((warning) => warning.includes('GL Driver Message'))).toBe(true);
  expect(diagnostics).toEqual([]);
});
