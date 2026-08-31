import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const ONLINE_ORIGIN = 'http://127.0.0.1:2567';
const PRODUCTION_ORIGIN = 'http://127.0.0.1:8978';

test('production mode excludes browser test mutation hooks', async ({ page }) => {
  await page.goto(`${PRODUCTION_ORIGIN}/play/`);
  const hooks = await page.evaluate(() => {
    const multiplayer = window.__savoriaTest.multiplayer;
    return {
      control: typeof multiplayer.control,
      drop: typeof multiplayer.drop,
      reconnect: typeof multiplayer.reconnect,
    };
  });
  expect(hooks).toEqual({
    control: 'undefined',
    drop: 'undefined',
    reconnect: 'undefined',
  });
});

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
  const consoleErrors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
  }
  await host.addInitScript(() => {
    localStorage.setItem('savoria3d-save-v4', JSON.stringify({
      version: 4,
      unlocked: 4,
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

    await hostCourse.selectOption('2-1');
    await expect(guestCourse).toHaveValue('2-1');

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
      await expect(page.locator('canvas[data-multiplayer-course]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => (
        window.__savoriaTest.multiplayer.renderedPlayerCount
      ))).toBe(2);
      const markerBoxes = await page.locator('[data-multiplayer-player]').evaluateAll((markers) => (
        markers.map((marker) => {
          const box = marker.getBoundingClientRect();
          return { left: Math.round(box.left), width: Math.round(box.width) };
        })
      ));
      expect(Math.abs(markerBoxes[0].left - markerBoxes[1].left)).toBeGreaterThanOrEqual(60);
    }

    const ids = await host.evaluate(() => {
      const view = window.__savoriaTest.multiplayer.view;
      return {
        hostId: view.players.find(({ isLocal }) => isLocal).sessionId,
        guestId: view.players.find(({ isLocal }) => !isLocal).sessionId,
        tomatoId: view.collectibles.find(({ kind, takenBy }) => kind === 'tomato' && !takenBy).id,
        basilId: view.collectibles.find(({ type, takenBy }) => type === 'basil' && !takenBy).id,
        speedId: view.collectibles.find(({ type, takenBy }) => type === 'speed' && !takenBy).id,
      };
    });
    await host.evaluate(({ hostId, tomatoId }) => {
      window.__savoriaTest.multiplayer.control({
        action: 'collectible', playerId: hostId, targetId: tomatoId,
      });
    }, ids);
    await expect.poll(() => guest.evaluate((tomatoId) => (
      window.__savoriaTest.multiplayer.view.collectibles.find(({ id }) => id === tomatoId).takenBy
    ), ids.tomatoId)).toBe(ids.hostId);
    const sharedTomatoes = await host.evaluate(() => window.__savoriaTest.multiplayer.view.tomatoCount);
    await expect.poll(() => guest.evaluate(() => (
      window.__savoriaTest.multiplayer.view.tomatoCount
    ))).toBe(sharedTomatoes);

    await host.evaluate(({ guestId }) => {
      window.__savoriaTest.multiplayer.control({
        action: 'health', playerId: guestId, hearts: 2, lives: 4,
      });
    }, ids);
    await expect.poll(() => host.evaluate((guestId) => (
      window.__savoriaTest.multiplayer.view.players.find(({ sessionId }) => sessionId === guestId).hearts
    ), ids.guestId)).toBe(2);
    await host.evaluate(({ guestId, basilId }) => {
      window.__savoriaTest.multiplayer.control({
        action: 'collectible', playerId: guestId, targetId: basilId,
      });
    }, ids);
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate((guestId) => (
        window.__savoriaTest.multiplayer.view.players.find(({ sessionId }) => sessionId === guestId).hearts
      ), ids.guestId)).toBe(3);
      expect(await page.evaluate((hostId) => (
        window.__savoriaTest.multiplayer.view.players.find(({ sessionId }) => sessionId === hostId).hearts
      ), ids.hostId)).toBe(3);
    }
    await host.evaluate(({ guestId, speedId }) => {
      window.__savoriaTest.multiplayer.control({
        action: 'collectible', playerId: guestId, targetId: speedId,
      });
    }, ids);
    await expect.poll(() => host.evaluate((guestId) => (
      window.__savoriaTest.multiplayer.view.players.find(({ sessionId }) => sessionId === guestId).power?.type
    ), ids.guestId)).toBe('speed');

    await host.evaluate(({ hostId }) => {
      window.__savoriaTest.multiplayer.control({ action: 'checkpoint', playerId: hostId });
    }, ids);
    await expect.poll(() => guest.evaluate(() => (
      window.__savoriaTest.multiplayer.view.checkpoint.active
    ))).toBe(true);
    const checkpointX = await host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.checkpoint.position.x
    ));
    await host.evaluate(({ guestId }) => {
      window.__savoriaTest.multiplayer.control({
        action: 'health', playerId: guestId, hearts: 1, lives: 4,
      });
      window.__savoriaTest.multiplayer.control({ action: 'hazard', playerId: guestId });
    }, ids);
    await expect.poll(() => host.evaluate((guestId) => {
      const player = window.__savoriaTest.multiplayer.view.players
        .find(({ sessionId }) => sessionId === guestId);
      return { hearts: player.hearts, lives: player.lives, x: player.position.x };
    }, ids.guestId)).toEqual({ hearts: 3, lives: 3, x: checkpointX });
    expect(await host.evaluate((hostId) => (
      window.__savoriaTest.multiplayer.view.players.find(({ sessionId }) => sessionId === hostId).lives
    ), ids.hostId)).toBe(4);

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
    await Promise.all([
      host.screenshot({
        path: 'docs/verification/screenshots/online-coop-host-1440x900.png',
        animations: 'disabled',
      }),
      guest.screenshot({
        path: 'docs/verification/screenshots/online-coop-guest-1440x900.png',
        animations: 'disabled',
      }),
    ]);

    await host.keyboard.down('ArrowRight');
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.pendingInputCount
    ))).toBeGreaterThan(0);
    const beforeReconnect = await guest.evaluate(() => {
      const view = window.__savoriaTest.multiplayer.view;
      const local = view.players.find(({ isLocal }) => isLocal);
      return {
        characterId: local.characterId,
        hearts: local.hearts,
        lives: local.lives,
        powerType: local.power?.type,
        checkpointActive: view.checkpoint.active,
        reachedGoal: local.reachedGoal,
      };
    });
    await guest.evaluate(() => window.__savoriaTest.multiplayer.drop());
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.phase
    )), { timeout: 15_000 }).toBe('paused');
    await host.keyboard.up('ArrowRight');
    await expect(host.locator('#multiplayer-course-status')).toContainText(
      'Waiting for the other chef to reconnect',
    );
    expect(await host.evaluate(() => window.__savoriaTest.multiplayer.pendingInputCount)).toBe(0);
    expect(await host.evaluate(() => {
      const { view, presentation } = window.__savoriaTest.multiplayer;
      const authoritative = view.players.find(({ isLocal }) => isLocal).position;
      return presentation.local.position.x === authoritative.x
        && presentation.local.position.y === authoritative.y
        && presentation.local.position.z === authoritative.z;
    })).toBe(true);

    await guest.evaluate(() => window.__savoriaTest.multiplayer.reconnect());
    expect(await host.evaluate(() => (
      window.__savoriaTest.multiplayer.phaseHistory.includes('paused')
    ))).toBe(true);
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.every(({ connected }) => connected)
    )), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.autoResumeRequestCount
    )), { timeout: 15_000 }).toBe(1);
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate(() => (
        window.__savoriaTest.multiplayer.view.phase
      )), { timeout: 15_000 }).toBe('playing');
      expect(await page.evaluate(() => (
        window.__savoriaTest.multiplayer.authorityPlaying
      ))).toBe(true);
    }
    expect(await guest.evaluate(() => (
      window.__savoriaTest.multiplayer.autoResumeRequestCount
    ))).toBe(0);
    await expect.poll(() => guest.evaluate(() => (
      window.__savoriaTest.multiplayer.netcodeResetCount
    ))).toBeGreaterThanOrEqual(1);
    expect(await guest.evaluate(() => {
      const view = window.__savoriaTest.multiplayer.view;
      const local = view.players.find(({ isLocal }) => isLocal);
      return {
        characterId: local.characterId,
        hearts: local.hearts,
        lives: local.lives,
        powerType: local.power?.type,
        checkpointActive: view.checkpoint.active,
        reachedGoal: local.reachedGoal,
      };
    })).toEqual(beforeReconnect);

    const resumedAccepted = await host.evaluate(() => (
      window.__savoriaTest.multiplayer.presentation.local.acceptedInputCount
    ));
    await host.keyboard.down('ArrowLeft');
    await expect.poll(() => host.evaluate(() => (
      window.__savoriaTest.multiplayer.presentation.local.acceptedInputCount
    ))).toBeGreaterThan(resumedAccepted);
    await host.keyboard.up('ArrowLeft');

    await host.keyboard.press('Escape');
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate(() => (
        window.__savoriaTest.multiplayer.view.phase
      ))).toBe('paused');
    }
    await expect(host.locator('#multiplayer-course-status')).toContainText('Course paused');
    await expect(guest.locator('#multiplayer-course-status')).toContainText('host paused');
    await host.keyboard.press('Escape');
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate(() => (
        window.__savoriaTest.multiplayer.view.phase
      ))).toBe('playing');
    }

    await host.evaluate(({ hostId }) => {
      window.__savoriaTest.multiplayer.control({ action: 'goal', playerId: hostId });
    }, ids);
    await expect.poll(() => guest.evaluate((hostId) => (
      window.__savoriaTest.multiplayer.view.players.find(({ sessionId }) => sessionId === hostId).safe
    ), ids.hostId)).toBe(true);
    expect(await guest.evaluate(() => window.__savoriaTest.multiplayer.view.phase)).toBe('playing');
    await host.evaluate(({ guestId }) => {
      window.__savoriaTest.multiplayer.control({ action: 'goal', playerId: guestId });
    }, ids);
    for (const page of [host, guest]) {
      await expect(page.locator('#complete-overlay')).toBeVisible();
      await expect.poll(() => page.evaluate(() => (
        window.__savoriaTest.multiplayer.completionCount
      ))).toBe(1);
      const saved = await page.evaluate(() => JSON.parse(
        localStorage.getItem('savoria3d-save-v4'),
      ));
      expect(saved.best['2-1']).toBeGreaterThanOrEqual(1);
      expect(saved.unlocked).toBe(4);
    }
    expect(consoleErrors).toEqual([]);
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

test('two browser contexts enter every released course through the production lobby', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const consoleErrors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
  }
  await host.addInitScript(() => {
    localStorage.setItem('savoria3d-save-v4', JSON.stringify({
      version: 4,
      unlocked: 4,
      best: { '1-1': 3, '1-2': 3, '2-1': 3 },
      chef: 'fatsio',
      sound: false,
    }));
  });

  try {
    for (const levelId of ['1-1', '1-2', '2-1', '2-2']) {
      await host.goto(`${ONLINE_ORIGIN}/play/`);
      await host.getByRole('button', { name: 'Online Co-op' }).click();
      await host.getByRole('button', { name: 'Create room' }).click();
      await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
      const roomCode = await host.locator('#lobby-room-code').textContent();

      await guest.goto(`${ONLINE_ORIGIN}/play/?room=${roomCode}`);
      await guest.getByRole('button', { name: 'Join room' }).click();
      await expect(guest.locator('#app')).toHaveAttribute('data-screen', 'lobby');
      await host.getByLabel('Course', { exact: true }).selectOption(levelId);
      await expect(guest.getByLabel('Course', { exact: true })).toHaveValue(levelId);
      await host.getByRole('button', { name: 'Ready up' }).click();
      await guest.getByRole('button', { name: 'Ready up' }).click();
      await expect(host.getByRole('button', { name: 'Start course' })).toBeEnabled();
      await host.getByRole('button', { name: 'Start course' }).click();

      for (const page of [host, guest]) {
        await expect(page.locator('#app')).toHaveAttribute('data-screen', 'online-course');
        await expect(page.locator('#multiplayer-course-title')).toContainText(levelId);
        await expect(page.locator('canvas[data-multiplayer-course]')).toBeVisible();
        await expect(page.locator('#multiplayer-course-stage')).toBeFocused();
        expect(await page.evaluate(() => (
          window.__savoriaTest.multiplayer.view.selectedLevelId
        ))).toBe(levelId);
      }

      const playerIds = await host.evaluate(() => (
        window.__savoriaTest.multiplayer.view.players.map(({ sessionId }) => sessionId)
      ));
      await host.evaluate((playerId) => {
        window.__savoriaTest.multiplayer.control({ action: 'goal', playerId });
      }, playerIds[0]);
      await host.evaluate((playerId) => {
        window.__savoriaTest.multiplayer.control({ action: 'goal', playerId });
      }, playerIds[1]);
      for (const page of [host, guest]) {
        await expect(page.locator('#complete-overlay')).toBeVisible();
        await expect.poll(() => page.evaluate(() => (
          window.__savoriaTest.multiplayer.completionCount
        ))).toBe(1);
      }
    }
    expect(consoleErrors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('forced standalone server shutdown returns both browser contexts to expired-room recovery', async ({ browser }) => {
  const standalone = await startStandaloneServer();
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const diagnostics = [];
  const reconnectFailures = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => {
      if (!['warning', 'error'].includes(message.type())) return;
      const text = message.text();
      if (message.type() === 'error'
        && text.includes(`ws://${new URL(standalone.origin).host}/`)
        && text.includes('net::ERR_CONNECTION_REFUSED')) {
        reconnectFailures.push(label);
        return;
      }
      diagnostics.push(`${label}: ${message.type()}: ${text}`);
    });
    page.on('pageerror', (error) => diagnostics.push(`${label}: pageerror: ${error.message}`));
  }

  try {
    await host.goto(`${standalone.origin}/play/`);
    await host.getByRole('button', { name: 'Online Co-op' }).click();
    await host.getByRole('button', { name: 'Create room' }).click();
    await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
    const roomCode = await host.locator('#lobby-room-code').textContent();
    await guest.goto(`${standalone.origin}/play/?room=${roomCode}`);
    await guest.getByLabel('Guest name').fill('Shutdown guest');
    await guest.getByRole('button', { name: 'Join room' }).click();

    for (const page of [host, guest]) {
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'lobby');
      await expect(page.locator('.lobby-player')).toHaveCount(2);
    }
    expect(await host.locator('#lobby-room-code').textContent()).toBe(roomCode);
    expect(await guest.locator('#lobby-room-code').textContent()).toBe(roomCode);

    standalone.child.kill('SIGKILL');
    const [, signal] = await standalone.exit;
    expect(signal).toBe('SIGKILL');
    for (const page of [host, guest]) {
      await expect(page.locator('#app')).toHaveAttribute('data-screen', 'online');
      await expect(page.getByRole('status')).toContainText('That room expired');
      await expect(page.getByRole('button', { name: 'Create room' })).toBeEnabled();
    }
    assertReconnectAttempts(reconnectFailures);
    expect(diagnostics).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
    if (standalone.child.exitCode === null) standalone.child.kill('SIGKILL');
    await Promise.race([
      standalone.exit,
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
  }
});

test('guest Escape leaves without pausing, then either chef can fail the recovered team', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const consoleErrors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.message}`));
  }

  try {
    await host.goto(`${ONLINE_ORIGIN}/play/`);
    await host.getByRole('button', { name: 'Online Co-op' }).click();
    await host.getByRole('button', { name: 'Create room' }).click();
    await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
    const roomCode = await host.locator('#lobby-room-code').textContent();
    expect(roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    await guest.goto(`${ONLINE_ORIGIN}/play/?room=${roomCode}`);
    await guest.getByRole('button', { name: 'Join room' }).click();
    await host.getByRole('button', { name: 'Ready up' }).click();
    await guest.getByRole('button', { name: 'Ready up' }).click();
    await host.getByRole('button', { name: 'Start course' }).click();
    for (const page of [host, guest]) {
      await expect(page.locator('canvas[data-multiplayer-course]')).toBeVisible();
    }

    await guest.keyboard.press('Escape');
    await expect(guest.locator('#app')).toHaveAttribute('data-screen', 'online');
    await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
    expect(await host.evaluate(() => window.__savoriaTest.multiplayer.view.phase)).toBe('lobby');
    expect(await host.evaluate(() => (
      window.__savoriaTest.multiplayer.phaseHistory.at(-1)
    ))).toBe('lobby');

    await guest.getByRole('button', { name: 'Join room' }).click();
    await expect(host.locator('.lobby-player')).toHaveCount(2);
    await host.getByRole('button', { name: 'Ready up' }).click();
    await guest.getByRole('button', { name: 'Ready up' }).click();
    await host.getByRole('button', { name: 'Start course' }).click();
    for (const page of [host, guest]) {
      await expect(page.locator('canvas[data-multiplayer-course]')).toBeVisible();
    }

    const guestId = await host.evaluate(() => (
      window.__savoriaTest.multiplayer.view.players.find(({ isLocal }) => !isLocal).sessionId
    ));
    await host.evaluate((playerId) => {
      window.__savoriaTest.multiplayer.control({
        action: 'health', playerId, hearts: 1, lives: 1,
      });
      window.__savoriaTest.multiplayer.control({ action: 'hazard', playerId });
    }, guestId);

    for (const page of [host, guest]) {
      await expect(page.locator('#error-screen')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'The kitchen is closed' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => (
        window.__savoriaTest.multiplayer.failureCount
      ))).toBe(1);
    }
    expect(consoleErrors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

async function startStandaloneServer() {
  const child = spawn(process.execPath, ['tests/browser/standalone-server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, SAVORIA_BROWSER_TESTS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk.toString()));
  const origin = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(
      `Standalone server did not report a port: ${errors.join('').trim()}`,
    )), 10_000);
    child.stdout.on('data', (chunk) => {
      const match = chunk.toString().match(/SAVORIA_TEST_ORIGIN=(http:\/\/127\.0\.0\.1:\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    exit.then(([code, signal]) => {
      clearTimeout(timeout);
      reject(new Error(`Standalone server exited before ready (${code ?? signal}): ${errors.join('').trim()}`));
    });
  });
  return { child, exit, origin };
}

function assertReconnectAttempts(failures) {
  expect(failures.filter((label) => label === 'host')).toHaveLength(6);
  expect(failures.filter((label) => label === 'guest')).toHaveLength(6);
}
