import { expect, test } from '@playwright/test';

test('landing page launches the game shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Savoria/i })).toBeVisible();
  await page.getByRole('link', { name: /Play Savoria/i }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await expect(page.getByRole('button', { name: /Start Adventure/i })).toBeVisible();
});
