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
      const row = { platformX: mover.mesh.position.x, platformY: mover.mesh.position.y, chefs: {} };
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

// Holds an arrow key until the server has this chef standing on the mover a
// little past its near edge, then lets go. Real key events only.
async function boardWithKeyboard(page, playerId, side) {
  const key = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
  await page.bringToFront();
  const stage = page.locator('#multiplayer-course-stage');
  await stage.focus();
  await page.keyboard.down(key);
  try {
    await expect.poll(() => page.evaluate(({ id, mover, fromLeft }) => {
      const view = window.__savoriaTest.multiplayer.view;
      const chef = view.players.find(({ sessionId }) => sessionId === id);
      const platform = view.movingPlatforms.find((candidate) => candidate.id === mover);
      const target = platform.position.x + (fromLeft ? -0.6 : 0.6);
      const reached = fromLeft ? chef.position.x >= target : chef.position.x <= target;
      return chef.grounded && chef.groundMoverId === mover && reached;
    }, { id: playerId, mover: MOVER_ID, fromLeft: side === 'left' }), {
      timeout: 10_000,
      intervals: [16],
    }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
}

function swingWhileRiding(rows, sessionId) {
  const offsets = rows
    .map((row) => ({ row, chef: row.chefs[sessionId] }))
    .filter(({ chef }) => chef?.riding)
    .map(({ row, chef }) => chef.x - row.platformX);
  return {
    frames: offsets.length,
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
      await game.host.waitForTimeout(1000);

      for (const page of [game.host, game.guest]) await recordDrawnFrames(page, MOVER_ID);
      await game.host.waitForTimeout(PERIOD_MS * 1.3);

      const riding = await game.host.evaluate((mover) => (
        window.__savoriaTest.multiplayer.view.players
          .every(({ grounded, groundMoverId }) => grounded && groundMoverId === mover)
      ), MOVER_ID);
      expect(riding, 'both chefs rode the whole period').toBe(true);

      for (const [screen, page] of [['host', game.host], ['guest', game.guest]]) {
        const rows = await page.evaluate(() => window.__drawn);
        for (const [chef, sessionId] of Object.entries(ids)) {
          const { frames, swing } = swingWhileRiding(rows, sessionId);
          expect(frames, `${screen} screen drew the ${chef} chef riding`).toBeGreaterThan(30);
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
