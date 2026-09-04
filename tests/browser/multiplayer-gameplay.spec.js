import { expect, test } from '@playwright/test';

const ORIGIN = process.env.SAVORIA_GAMEPLAY_ORIGIN ?? 'http://127.0.0.1:2567';

async function focusCourse(page) {
  await page.bringToFront();
  const stage = page.locator('#multiplayer-course-stage');
  await stage.focus();
  await expect(stage).toBeFocused();
}

async function startTwoPlayerCourse(browser, { levelId = '1-1' } = {}) {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  }
  if (levelId !== '1-1') {
    await host.addInitScript(() => {
      localStorage.setItem('savoria3d-save-v4', JSON.stringify({
        version: 4,
        unlocked: 4,
        best: { '1-1': 3 },
        chef: 'fatsio',
        sound: false,
      }));
    });
  }

  await host.goto(`${ORIGIN}/play/`);
  await host.getByRole('button', { name: 'Online Co-op' }).click();
  await host.getByLabel('Guest name').fill('Host');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
  const roomCode = await host.locator('#lobby-room-code').textContent();

  await guest.goto(`${ORIGIN}/play/?room=${roomCode}`);
  await expect(guest.locator('#app')).toHaveAttribute('data-screen', 'online');
  await guest.getByLabel('Guest name').fill('Guest');
  await guest.getByRole('button', { name: 'Join room' }).click();
  if (levelId !== '1-1') {
    await host.getByLabel('Course', { exact: true }).selectOption(levelId);
    await expect(guest.getByLabel('Course', { exact: true })).toHaveValue(levelId);
  }
  await host.getByRole('button', { name: 'Ready up' }).click();
  await guest.getByRole('button', { name: 'Ready up' }).click();
  await expect(host.getByRole('button', { name: 'Start course' })).toBeEnabled();
  await host.getByRole('button', { name: 'Start course' }).click();
  await expect(host.locator('#app')).toHaveAttribute('data-screen', 'online-course');
  await expect(guest.locator('#app')).toHaveAttribute('data-screen', 'online-course');
  await expect.poll(() => host.evaluate(() => (
    window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal)?.grounded
  ))).toBe(true);

  return { host, guest, hostContext, guestContext, errors };
}

test('real keyboard input moves and visibly jumps the local chef', async ({ browser }) => {
  const game = await startTwoPlayerCourse(browser);
  try {
    const start = await game.host.evaluate(() => {
      const multiplayer = window.__savoriaTest.multiplayer;
      const local = multiplayer.view.players.find(({ isLocal }) => isLocal);
      return {
        authorityX: local.position.x,
        authorityY: local.position.y,
        presentationY: multiplayer.presentation.local.position.y,
      };
    });

    await focusCourse(game.host);
    await game.host.keyboard.down('ArrowRight');
    try {
      await expect.poll(() => game.host.evaluate(() => (
        window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal).position.x
      ))).toBeGreaterThan(start.authorityX + 0.15);
    } finally {
      await game.host.keyboard.up('ArrowRight');
    }
    await expect.poll(() => game.guest.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => !isLocal).position.x
    ))).toBeGreaterThan(start.authorityX + 0.15);

    const acceptedBeforeJump = await game.host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal)
        .acceptedInputCount
    ));
    await game.host.keyboard.down('Space');
    try {
      await Promise.all([
        expect.poll(() => game.host.evaluate(() => (
          window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal)
            .acceptedInputCount
        ))).toBeGreaterThan(acceptedBeforeJump),
        expect.poll(() => game.host.evaluate(() => (
          window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal).position.y
        ))).toBeGreaterThan(start.authorityY + 0.5),
        expect.poll(() => game.host.evaluate(() => (
          window.__savoriaTest.multiplayer.presentation.local.position.y
        ))).toBeGreaterThan(start.presentationY + 0.5),
        expect.poll(() => game.guest.evaluate(() => (
          window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => !isLocal).position.y
        ))).toBeGreaterThan(start.authorityY + 0.5),
      ]);
    } finally {
      await game.host.keyboard.up('Space');
    }
    expect(game.errors).toEqual([]);
  } finally {
    await game.hostContext.close();
    await game.guestContext.close();
  }
});

test('real keyboard play can board and stand on the first floating pasta platform', async ({ browser }) => {
  const game = await startTwoPlayerCourse(browser, { levelId: '1-2' });
  try {
    const localId = await game.host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal).sessionId
    ));
    await game.host.evaluate((playerId) => {
      window.__savoriaTest.multiplayer.control({
        action: 'moving-platform',
        playerId,
        targetId: 'mover-0',
      });
    }, localId);
    await expect.poll(() => game.host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal).groundMoverId
    ))).toBe('mover-0');

    const startX = await game.host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => isLocal).position.x
    ));
    await focusCourse(game.host);
    await game.host.keyboard.down('ArrowRight');
    try {
      await expect.poll(() => game.host.evaluate((initialX) => {
        const view = window.__savoriaTest.multiplayer.view;
        const local = view.players.find(({ isLocal }) => isLocal);
        const platform = view.movingPlatforms.find(({ id }) => id === 'mover-0');
        const standingOnPlatform = Math.abs(
          local.position.y - (platform.position.y + platform.height / 2),
        ) < 0.06;
        return local.position.x > initialX + 0.02
          && local.groundMoverId === 'mover-0'
          && standingOnPlatform;
      }, startX)).toBe(true);
    } finally {
      await game.host.keyboard.up('ArrowRight');
    }
    expect(game.errors).toEqual([]);
  } finally {
    await game.hostContext.close();
    await game.guestContext.close();
  }
});
