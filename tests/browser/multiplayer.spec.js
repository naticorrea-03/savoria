import { expect, test } from '@playwright/test';

const ONLINE_ORIGIN = 'http://127.0.0.1:2567';

test('invite links open accessible online controls while solo stays network-free', async ({ page }) => {
  const sockets = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));

  await page.goto('/play/?room=abc234');

  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'online');
  await expect(page.getByRole('heading', { name: 'Online Co-op' })).toBeVisible();
  await expect(page.getByLabel('Guest name')).toBeVisible();
  await expect(page.getByLabel('Your chef')).toBeVisible();
  await expect(page.getByLabel('Private room code')).toHaveValue('ABC234');
  await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join room' })).toBeVisible();

  const firstIdentity = await page.evaluate(() => window.__savoriaTest.multiplayer.identity);
  await page.reload();
  const secondIdentity = await page.evaluate(() => window.__savoriaTest.multiplayer.identity);
  expect(secondIdentity).toEqual(firstIdentity);
  expect(Object.keys(secondIdentity).sort()).toEqual(['guestName', 'playerId']);

  await page.getByRole('button', { name: 'Back to home' }).click();
  const actionLineCounts = await page.locator('.title-actions button').evaluateAll((buttons) => (
    buttons.map((button) => {
      const range = document.createRange();
      range.selectNodeContents(button.firstChild);
      return range.getClientRects().length;
    })
  ));
  expect(actionLineCounts).toEqual([1, 1]);
  await page.getByRole('button', { name: 'Solo Adventure' }).click();
  await expect(page.getByRole('heading', { name: 'Who is cooking?' })).toBeVisible();
  const multiplayerSdkLoads = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => new URL(entry.name).pathname)
    .filter((pathname) => pathname.includes('colyseus')));
  expect(multiplayerSdkLoads).toEqual([]);
  expect(sockets).toEqual([]);
});

test('two clients share an invite lobby with independent names and duplicate chefs', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await host.addInitScript(() => {
    localStorage.setItem('savoria3d-save-v4', JSON.stringify({
      version: 4,
      unlocked: 2,
      best: { '1-1': 3 },
      chef: 'fatsio',
      sound: false,
    }));
  });

  try {
    await host.goto(`${ONLINE_ORIGIN}/play/`);
    await host.getByRole('button', { name: 'Online Co-op' }).click();
    await host.getByLabel('Guest name').fill('Nati');
    await host.getByLabel('Your chef').selectOption('fatsio');
    await host.getByRole('button', { name: 'Create room' }).click();
    await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
    const roomCode = await host.locator('#lobby-room-code').textContent();
    expect(roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    await expect(host).toHaveURL(new RegExp(`/play/\\?room=${roomCode}$`));

    await guest.goto(`${ONLINE_ORIGIN}/play/?room=${roomCode}`);
    await guest.getByLabel('Guest name').fill('Alex');
    await guest.getByLabel('Your chef').selectOption('fatsio');
    await guest.getByRole('button', { name: 'Join room' }).click();

    for (const page of [host, guest]) {
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'lobby');
      await expect(page.locator('.lobby-player')).toHaveCount(2);
      await expect(page.locator('#lobby-players').getByText('Nati', { exact: true })).toBeVisible();
      await expect(page.locator('#lobby-players').getByText('Alex', { exact: true })).toBeVisible();
      await expect(page.locator('.lobby-player[data-character-id="fatsio"]')).toHaveCount(2);
    }

    const colors = await host.locator('.lobby-player').evaluateAll((players) => (
      players.map((player) => getComputedStyle(player).getPropertyValue('--player-color').trim())
    ));
    expect(new Set(colors).size).toBe(2);
    const hostCourse = host.getByLabel('Course', { exact: true });
    const guestCourse = guest.getByLabel('Course', { exact: true });
    await expect(hostCourse).toBeEnabled();
    await expect(guestCourse).toBeDisabled();
    await expect(host.getByRole('button', { name: 'Start course' })).toBeDisabled();
    const controlTops = await host.locator('#lobby-course, #lobby-ready, #lobby-start')
      .evaluateAll((controls) => controls.map((control) => Math.round(control.getBoundingClientRect().top)));
    expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(2);

    await hostCourse.selectOption('1-2');
    await expect(guestCourse).toHaveValue('1-2');

    await host.getByRole('button', { name: 'Ready up' }).click();
    await guest.getByRole('button', { name: 'Ready up' }).click();
    await expect(host.getByRole('button', { name: 'Start course' })).toBeEnabled();
    await expect(guest.getByRole('button', { name: 'Start course' })).toBeHidden();

    const cameraTargets = await Promise.all([host, guest].map((page) => page.evaluate(() => (
      window.__savoriaTest.multiplayer.view.cameraTarget
    ))));
    expect(cameraTargets[0]).not.toBeNull();
    expect(cameraTargets[1]).not.toBeNull();

    await host.getByRole('button', { name: 'Start course' }).click();
    for (const page of [host, guest]) {
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'online-course');
      await expect(page.locator('[data-multiplayer-player]')).toHaveCount(2);
      await expect(page.locator('#multiplayer-course-players').getByText('Nati', { exact: true })).toBeVisible();
      await expect(page.locator('#multiplayer-course-players').getByText('Alex', { exact: true })).toBeVisible();
      await expect(page.locator('#multiplayer-course-stage')).toBeFocused();
      const markerBoxes = await page.locator('[data-multiplayer-player]').evaluateAll((markers) => (
        markers.map((marker) => {
          const box = marker.getBoundingClientRect();
          return { left: Math.round(box.left), width: Math.round(box.width) };
        })
      ));
      expect(Math.abs(markerBoxes[0].left - markerBoxes[1].left)).toBeGreaterThanOrEqual(60);
    }

    const initialX = await host.evaluate(() => (
      window.__savoriaTest.multiplayer.presentation.local.position.x
    ));
    await host.keyboard.down('ArrowRight');
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.presentation.local.acceptedInputCount
    ))).toBeGreaterThan(0);
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.presentation.local.position.x
    ))).toBeGreaterThan(initialX);
    await host.keyboard.up('ArrowRight');

    for (const page of [host, guest]) {
      expect(await page.evaluate(() => {
        const { cameraTarget, local } = window.__savoriaTest.multiplayer.presentation;
        return cameraTarget.x === local.position.x
          && cameraTarget.y === local.position.y
          && cameraTarget.z === local.position.z;
      })).toBe(true);
    }

    await guestContext.setOffline(true);
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.phase
    ))).toBe('paused');
    await expect(host.locator('#multiplayer-course-status')).toContainText(
      'Waiting for the other chef to reconnect',
    );
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('an expired invite returns to room recovery controls', async ({ page }) => {
  await page.goto(`${ONLINE_ORIGIN}/play/?room=ABC234`);
  await page.getByRole('button', { name: 'Join room' }).click();

  await expect(page.getByRole('status')).toContainText('That room expired');
  await expect(page.getByRole('button', { name: 'Create room' })).toBeEnabled();
  await expect(page.getByLabel('Private room code')).toHaveValue('ABC234');
});
