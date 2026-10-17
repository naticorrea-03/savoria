import net from 'node:net';
import { expect, test } from '@playwright/test';

// Issue #26 in a real room: two browser contexts, both chefs board the
// floating pasta platform on 1-2 (mover-1, 3.5 units of travel) with the
// keyboard and ride it for more than a full period. Each screen records where
// it drew every chef and the platform on every frame. A chef standing still
// on the platform must keep the same drawn offset from it.
//
// Measured 2026-10-17 (offset swing, worst screen, 3 runs):
//   before #38 (1095fb0): local 0.29 to 0.96, remote 0.48 to 0.54 units
//   #38 (6cb4a4d):        local 0.08 to 0.14, remote 0.003 units
//   this fix:             local 0.0001, remote 0.003 units

const SERVER_PORT = 2567;
const MOVER_ID = 'mover-1';
const MOVER_BASE_X = 102.1;
const MOVER_TRAVEL = 3.5;
const PERIOD_MS = 5000;
const MAX_SWING = 0.03;

// Two pages ride at once but only one can be in front. Keep the other page
// drawing at full rate instead of the throttled background rate.
test.use({
  launchOptions: {
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  },
});

// Fixed one-way delay on every TCP chunk in both directions. One delay for
// every chunk keeps the stream in order.
async function startDelayProxy(delayMs) {
  const sockets = new Set();
  const server = net.createServer((client) => {
    const upstream = net.connect(SERVER_PORT, '127.0.0.1');
    sockets.add(client);
    sockets.add(upstream);
    const relay = (from, to) => from.on('data', (chunk) => {
      setTimeout(() => {
        if (!to.destroyed) to.write(chunk);
      }, delayMs);
    });
    relay(client, upstream);
    relay(upstream, client);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', () => setTimeout(close, delayMs + 5));
    upstream.on('close', () => setTimeout(close, delayMs + 5));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

async function startRoomOnCourseTwo(browser, origin) {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  // Set SAVORIA_CPU_THROTTLE=4 to rehearse a slow CI runner locally.
  const throttle = Number(process.env.SAVORIA_CPU_THROTTLE) || 0;
  if (throttle > 1) {
    for (const page of [host, guest]) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }
  }
  const errors = [];
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
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

  await host.goto(`${origin}/play/`);
  await host.getByRole('button', { name: 'Online Co-op' }).click();
  await host.getByLabel('Guest name').fill('Host');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect(host.locator('#app')).toHaveAttribute('data-screen', 'lobby');
  const roomCode = await host.locator('#lobby-room-code').textContent();
  await guest.goto(`${origin}/play/?room=${roomCode}`);
  await expect(guest.locator('#app')).toHaveAttribute('data-screen', 'online');
  await guest.getByLabel('Guest name').fill('Guest');
  await guest.getByRole('button', { name: 'Join room' }).click();
  await host.getByLabel('Course', { exact: true }).selectOption('1-2');
  await expect(guest.getByLabel('Course', { exact: true })).toHaveValue('1-2');
  await host.getByRole('button', { name: 'Ready up' }).click();
  await guest.getByRole('button', { name: 'Ready up' }).click();
  await host.getByRole('button', { name: 'Start course' }).click();
  for (const page of [host, guest]) {
    await expect.poll(() => page.evaluate(() => (
      window.__savoriaTest.multiplayer.courseRenderer()?.playerVisuals.size ?? 0
    ))).toBe(2);
  }
  return { host, guest, hostContext, guestContext, errors };
}

// Wraps the renderer so every drawn frame logs the drawn chefs and platform.
function recordDrawnFrames(page, moverId) {
  return page.evaluate((id) => {
    const multiplayer = window.__savoriaTest.multiplayer;
    const renderer = multiplayer.courseRenderer();
    const index = Number(id.split('-').at(-1));
    const mover = renderer.movingSolids[index];
    const draw = renderer.renderer.render.bind(renderer.renderer);
    window.__drawn = [];
    renderer.renderer.render = (scene, camera) => {
      const row = { t: performance.now(), platformX: mover.mesh.position.x, platformY: mover.mesh.position.y, chefs: {} };
      for (const [sessionId, visual] of renderer.playerVisuals) {
        const server = multiplayer.view.players.find((player) => player.sessionId === sessionId);
        row.chefs[sessionId] = {
          x: visual.rig.position.x,
          y: visual.rig.position.y,
          riding: server?.grounded === true && server?.groundMoverId === id,
        };
      }
      window.__drawn.push(row);
      draw(scene, camera);
    };
  }, moverId);
}

// Waits until the mover sits within [min, max] of its travel (0 left, 1 right).
async function waitForMover(page, min, max) {
  await expect.poll(() => page.evaluate(({ id, base, travel, low, high }) => {
    const platform = window.__savoriaTest.multiplayer.view.movingPlatforms
      .find((candidate) => candidate.id === id);
    const progress = (platform.position.x - base) / travel;
    return progress >= low && progress <= high;
  }, { id: MOVER_ID, base: MOVER_BASE_X, travel: MOVER_TRAVEL, low: min, high: max }), {
    timeout: PERIOD_MS * 2,
    intervals: [20],
  }).toBe(true);
}

// Server-side state of one chef relative to mover-1.
function chefState(page, playerId) {
  return page.evaluate(({ id, mover }) => {
    const view = window.__savoriaTest.multiplayer.view;
    const chef = view.players.find(({ sessionId }) => sessionId === id);
    const platform = view.movingPlatforms.find((candidate) => candidate.id === mover);
    return {
      dx: chef.position.x - platform.position.x,
      y: chef.position.y,
      vx: chef.velocity.x,
      grounded: chef.grounded,
      onMover: chef.grounded && chef.groundMoverId === mover,
      halfWidth: platform.width / 2,
    };
  }, { id: playerId, mover: MOVER_ID });
}

const describeChef = (state) => JSON.stringify({
  dx: Number(state.dx.toFixed(2)),
  y: Number(state.y.toFixed(2)),
  vx: Number(state.vx.toFixed(2)),
  onMover: state.onMover,
});

// Standing still on the platform, at least a chef width from either edge.
const safelyAboard = (state) => state.onMover
  && Math.abs(state.dx) <= state.halfWidth - 0.6
  && Math.abs(state.vx) < 0.05;

// Waits until the server has kept the chef stopped for 300 ms. The server
// keeps the last input it got, so switching pages before the key release
// reaches it would leave the chef walking.
async function waitUntilSettled(page, playerId) {
  let stillSince = null;
  await expect.poll(async () => {
    const state = await chefState(page, playerId);
    const now = Date.now();
    if (Math.abs(state.vx) >= 0.05 || !state.grounded) {
      stillSince = null;
      return false;
    }
    stillSince ??= now;
    return now - stillSince >= 300;
  }, { timeout: 8_000, intervals: [50] }).toBe(true);
}

// Real key events only. Holds the arrow toward the platform just until the
// server has the chef on mover-1, so a late key release on a slow runner still
// leaves almost a platform width of room. Then waits for the chef to stop and
// nudges it toward the middle with short taps. Fails with the chef's state if
// it cannot stand safely aboard.
async function boardWithKeyboard(page, playerId, side) {
  const towardCenter = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  await page.bringToFront();
  await page.locator('#multiplayer-course-stage').focus();
  let state = await chefState(page, playerId);
  if (!state.onMover) {
    await page.keyboard.down(towardCenter);
    try {
      await expect.poll(async () => {
        const now = await chefState(page, playerId);
        return now.onMover || now.y < 3;
      }, { timeout: 6_000, intervals: [16] }).toBe(true);
    } catch {
      // Reported below with the chef's state.
    } finally {
      await page.keyboard.up(towardCenter);
    }
  }
  for (let tap = 0; tap < 12; tap += 1) {
    await waitUntilSettled(page, playerId).catch(() => {});
    state = await chefState(page, playerId);
    if (state.y < 3) throw new Error(`${side} chef fell while boarding: ${describeChef(state)}`);
    if (!state.onMover) break;
    if (safelyAboard(state)) return;
    const nudge = state.dx < 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(nudge);
    await page.waitForTimeout(60);
    await page.keyboard.up(nudge);
  }
  throw new Error(`${side} chef could not board mover-1 with the keyboard: ${describeChef(state)}`);
}

function swingWhileRiding(rows, sessionId) {
  const riding = rows.filter((row) => row.chefs[sessionId]?.riding);
  const offsets = riding.map((row) => row.chefs[sessionId].x - row.platformX);
  return {
    frames: offsets.length,
    spanMs: riding.length ? riding.at(-1).t - riding[0].t : 0,
    swing: offsets.length ? Math.max(...offsets) - Math.min(...offsets) : Infinity,
  };
}

for (const oneWayDelayMs of [0, 40]) {
  test(`both chefs stay glued to the 1-2 floating platform on both screens (${oneWayDelayMs * 2} ms RTT)`, async ({ browser }) => {
    test.setTimeout(120_000);
    const proxy = await startDelayProxy(oneWayDelayMs);
    const game = await startRoomOnCourseTwo(browser, proxy.origin);
    try {
      const ids = await game.host.evaluate(() => {
        const { players } = window.__savoriaTest.multiplayer.view;
        return {
          host: players.find(({ isLocal }) => isLocal).sessionId,
          guest: players.find(({ isLocal }) => !isLocal).sessionId,
        };
      });
      // Drop each chef at one end of the gap the mover shuttles across.
      await game.host.evaluate(({ host, guest }) => {
        const { control } = window.__savoriaTest.multiplayer;
        control({ action: 'collectible', playerId: host, targetId: 'tomato-23' });
        control({ action: 'collectible', playerId: guest, targetId: 'tomato-27' });
      }, ids);
      await expect.poll(() => game.host.evaluate(() => (
        window.__savoriaTest.multiplayer.view.players.every(({ grounded }) => grounded)
      ))).toBe(true);

      await waitForMover(game.host, 0, 0.05);
      await boardWithKeyboard(game.host, ids.host, 'left');
      await waitForMover(game.host, 0.95, 1);
      await boardWithKeyboard(game.guest, ids.guest, 'right');
      for (const [page, id] of [[game.host, ids.host], [game.guest, ids.guest]]) {
        await waitUntilSettled(page, id);
      }

      for (const page of [game.host, game.guest]) await recordDrawnFrames(page, MOVER_ID);
      await game.host.waitForTimeout(PERIOD_MS * 1.3);

      const ride = await game.host.evaluate((mover) => {
        const view = window.__savoriaTest.multiplayer.view;
        const platform = view.movingPlatforms.find(({ id }) => id === mover);
        return view.players.map((player) => ({
          name: player.guestName,
          riding: player.grounded && player.groundMoverId === mover,
          dx: Number((player.position.x - platform.position.x).toFixed(2)),
          y: Number(player.position.y.toFixed(2)),
          lives: player.lives,
        }));
      }, MOVER_ID);
      expect(ride.every(({ riding }) => riding), `both chefs rode the whole period: ${JSON.stringify(ride)}`).toBe(true);

      for (const [screen, page] of [['host', game.host], ['guest', game.guest]]) {
        const rows = await page.evaluate(() => window.__drawn);
        for (const [chef, sessionId] of Object.entries(ids)) {
          const { frames, spanMs, swing } = swingWhileRiding(rows, sessionId);
          // A slow runner draws fewer frames. What matters is samples across
          // a whole period of the platform.
          expect(frames, `${screen} screen drew the ${chef} chef riding`).toBeGreaterThanOrEqual(12);
          expect(spanMs, `${screen} screen covered a full period`).toBeGreaterThanOrEqual(PERIOD_MS);
          expect(swing, `${chef} chef drift on the ${screen} screen`).toBeLessThan(MAX_SWING);
        }
      }
      expect(game.errors).toEqual([]);
    } finally {
      await game.hostContext.close();
      await game.guestContext.close();
      await proxy.close();
    }
  });
}
