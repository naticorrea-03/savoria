import test, { after, afterEach, before } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '@colyseus/testing';
import { CloseCode } from '@colyseus/sdk';
import { RELEASED_LEVELS } from '../../js/levels/index.js';
import {
  ACTION_RATE_LIMIT_PER_SECOND,
  MESSAGE,
  PROTOCOL_VERSION,
  ROOM_NAME,
} from '../../js/multiplayer/protocol.js';
import {
  RECONNECT_HANDSHAKE_SECONDS,
  RECONNECTION_WINDOW_SECONDS,
  SavoriaRoom,
} from '../../server/savoria-room.js';
import { createGameServer } from '../../server/app.js';

const ALL_LEVEL_IDS = RELEASED_LEVELS.map(({ id }) => id);
const TEST_RECONNECTION_SECONDS = 0.5;
const TEST_RECONNECT_HANDSHAKE_SECONDS = 0.1;
let testServer;

before(async () => {
  SavoriaRoom.reconnectionWindowSeconds = TEST_RECONNECTION_SECONDS;
  SavoriaRoom.reconnectHandshakeSeconds = TEST_RECONNECT_HANDSHAKE_SECONDS;
  SavoriaRoom.browserTestControlsEnabled = true;
  testServer = await boot(createGameServer(), 2568);
});

afterEach(async () => {
  await testServer.cleanup();
});

after(async () => {
  SavoriaRoom.reconnectionWindowSeconds = RECONNECTION_WINDOW_SECONDS;
  SavoriaRoom.reconnectHandshakeSeconds = RECONNECT_HANDSHAKE_SECONDS;
  SavoriaRoom.browserTestControlsEnabled = false;
  await testServer.shutdown();
});

test('one process serves health, static files, and private Colyseus rooms', async () => {
  const health = await fetch('http://127.0.0.1:2568/health');
  const home = await fetch('http://127.0.0.1:2568/');
  const testMode = await fetch('http://127.0.0.1:2568/__savoria-test-mode.js');
  const host = await createClient();
  const serverRoom = testServer.getRoomById(host.roomId);

  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Savoria/i);
  assert.equal(testMode.status, 200);
  assert.equal(await testMode.text(), 'globalThis.__SAVORIA_BROWSER_TESTS__ = false;\n');
  assert.match(host.roomId, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(serverRoom.maxClients, 2);
  assert.equal(serverRoom.patchRate, 50);
  assert.equal(serverRoom.metadata.private, true);
  assert.equal(serverRoom.metadata.inviteCode, host.roomId);
  await assert.rejects(
    testServer.sdk.join(ROOM_NAME, joinOptions()),
    /no rooms|not found|matchmake/i,
  );
});

test('room state exposes the complete lobby contract and rejects a third player', async () => {
  const host = await createClient();
  const guest = await joinClient(host.roomId, { characterId: 'chefno' });
  const state = testServer.getRoomById(host.roomId).state;

  assert.equal(state.phase, 'lobby');
  assert.equal(state.protocolVersion, PROTOCOL_VERSION);
  assert.equal(state.hostPlayerId, host.sessionId);
  assert.equal(state.selectedLevelId, '1-1');
  assert.equal(state.timer, 0);
  assert.equal(state.tomatoCount, 0);
  assert.equal(state.authoritativeTick, 0);
  assert.equal(state.players.size, 2);
  assert.ok(state.checkpoint);
  assert.ok(state.goal);
  assert.ok(state.completion);
  assert.ok(state.enemies);
  assert.ok(state.projectiles);
  assert.ok(state.collectibles);
  assert.ok(state.movingPlatforms);
  assert.ok(state.boss);

  await assert.rejects(
    joinClient(host.roomId, { characterId: 'dinnerette' }),
    /full|locked|seat|matchmake/i,
  );
  await guest.leave();
});

test('lobby preserves guest identity while allowing duplicate characters', async () => {
  const host = await createClient({
    characterId: 'fatsio',
    guestName: 'Nati',
    identityId: 'stable-nati',
  });
  const guest = await joinClient(host.roomId, {
    characterId: 'fatsio',
    guestName: 'Alex',
    identityId: 'stable-alex',
  });
  const state = testServer.getRoomById(host.roomId).state;

  assert.equal(state.players.get(host.sessionId).characterId, 'fatsio');
  assert.equal(state.players.get(guest.sessionId).characterId, 'fatsio');
  assert.equal(state.players.get(host.sessionId).guestName, 'Nati');
  assert.equal(state.players.get(guest.sessionId).guestName, 'Alex');
  assert.equal(state.players.get(host.sessionId).identityId, 'stable-nati');
  assert.equal(state.players.get(guest.sessionId).identityId, 'stable-alex');

  await guest.leave();
});

test('create, join, and invalid room codes enforce protocol version 1', async () => {
  await assert.rejects(
    createClient({ protocolVersion: 2 }),
    /protocol/i,
  );

  const host = await createClient();
  await assert.rejects(
    joinClient(host.roomId, { protocolVersion: 2 }),
    /protocol/i,
  );
  await assert.rejects(
    joinClient('ABCDEF'),
    /not found|matchmake|seat/i,
  );
});

test('a mismatched reconnect handshake closes the transport and runs disconnect cleanup', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const token = host.reconnectionToken;
  const playerId = host.sessionId;

  await dropClient(host);
  const reconnected = await testServer.sdk.reconnect(token);
  await reconnected.waitForInitialState();
  const transportClosed = waitForRoomLeave(reconnected);

  assert.equal(serverRoom.state.players.get(playerId).connected, false);
  await assert.rejects(
    reconnected.request(MESSAGE.RECONNECT, { protocolVersion: 2 }),
    /closed|connection/i,
  );
  const [closeCode, closeReason] = await transportClosed;
  await waitUntil(() => serverRoom.state.players.has(playerId) === false);

  assert.equal(closeCode, CloseCode.CONSENTED);
  assert.match(closeReason, /protocol version 1/i);
  assertReconnectCleanup(serverRoom, playerId, guest.sessionId);
});

test('a missing reconnect handshake expires and runs disconnect cleanup', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const token = host.reconnectionToken;
  const playerId = host.sessionId;

  await dropClient(host);
  const reconnected = await testServer.sdk.reconnect(token);
  await reconnected.waitForInitialState();
  const transportClosed = waitForRoomLeave(reconnected);

  assert.equal(serverRoom.state.players.get(playerId).connected, false);
  const [closeCode, closeReason] = await transportClosed;
  await waitUntil(() => serverRoom.state.players.has(playerId) === false);

  assert.equal(closeCode, CloseCode.CONSENTED);
  assert.match(closeReason, /handshake expired/i);
  assertReconnectCleanup(serverRoom, playerId, guest.sessionId);
});

test('ready, course selection, and start enforce payloads, host authority, and unlocks', async () => {
  const host = await createClient({ unlockedLevelIds: ['1-1'] });
  const guest = await joinClient(host.roomId, { characterId: 'chefno' });
  const serverRoom = testServer.getRoomById(host.roomId);

  await assert.rejects(host.request(MESSAGE.READY, { ready: 'yes' }), /invalid/i);
  await assert.rejects(
    host.request(MESSAGE.SELECT_LEVEL, { levelId: '1-2' }),
    /locked/i,
  );
  await assert.rejects(
    guest.request(MESSAGE.SELECT_LEVEL, { levelId: '1-1' }),
    /host/i,
  );
  assert.deepEqual(await host.request(MESSAGE.SELECT_LEVEL, { levelId: '1-1' }), { ok: true });

  await host.request(MESSAGE.READY, { ready: true });
  await assert.rejects(host.request(MESSAGE.START, {}), /ready/i);
  await guest.request(MESSAGE.READY, { ready: true });
  await assert.rejects(guest.request(MESSAGE.START, {}), /host/i);
  assert.deepEqual(await host.request(MESSAGE.START, {}), { ok: true });

  assert.equal(serverRoom.state.phase, 'playing');
  assert.equal(serverRoom.locked, true);
  assert.equal(serverRoom.courseState.players[host.sessionId].characterId, 'fatsio');
  assert.equal(serverRoom.courseState.players[guest.sessionId].characterId, 'chefno');
  assert.equal(serverRoom.state.players.get(host.sessionId).hearts, 3);
  assert.equal(serverRoom.state.players.get(host.sessionId).lives, 4);
  assert.equal(serverRoom.state.players.get(guest.sessionId).hearts, 3);
  assert.equal(serverRoom.state.players.get(guest.sessionId).lives, 4);
  assert.equal(serverRoom.state.timer, 240);
  await assert.rejects(joinClient(host.roomId), /locked|seat|matchmake/i);
  await guest.leave();
});

test('valid input drives the authoritative 60 Hz simulation and malformed input is rejected', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const startX = serverRoom.state.players.get(host.sessionId).positionX;

  await assert.rejects(
    host.request(MESSAGE.INPUT, {
      axis: 1,
      running: true,
      jumpPressed: false,
      jumpHeld: false,
      extra: true,
    }),
    /invalid/i,
  );
  await assert.rejects(
    host.request(MESSAGE.INPUT, {
      axis: 0.5,
      running: true,
      jumpPressed: false,
      jumpHeld: false,
    }),
    /invalid/i,
  );
  assert.deepEqual(await host.request(MESSAGE.INPUT, {
    axis: 1,
    running: true,
    jumpPressed: false,
    jumpHeld: false,
  }), { ok: true });
  assert.equal(serverRoom.state.players.get(host.sessionId).acceptedInputCount, 1);

  const firstTick = serverRoom.courseState.tick;
  await serverRoom.waitForNextTimestep();
  await serverRoom.waitForNextTimestep();
  assert.ok(serverRoom.courseState.tick >= firstTick + 2);
  assert.equal(serverRoom.state.authoritativeTick, serverRoom.courseState.tick);
  assert.ok(serverRoom.state.players.get(host.sessionId).positionX > startX);
  await guest.leave();
});

test('accepted input acknowledgement is ordered without changing the four-field payload', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const payload = {
    axis: 1,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
  };

  await host.request(MESSAGE.INPUT, payload);
  await host.request(MESSAGE.INPUT, { ...payload, axis: -1 });

  const player = serverRoom.state.players.get(host.sessionId);
  assert.equal(player.acceptedInputCount, 2);
  assert.deepEqual(Object.keys(payload).sort(), ['axis', 'jumpHeld', 'jumpPressed', 'running']);
  await guest.leave();
});

test('pause and resume freeze and restart the shared timer', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  await serverRoom.waitForNextTimestep();

  await assert.rejects(guest.request(MESSAGE.PAUSE, {}), /host/i);
  assert.equal(serverRoom.state.phase, 'playing');
  await host.request(MESSAGE.PAUSE, {});
  const pausedTimer = serverRoom.state.timer;
  await serverRoom.waitForNextTimestep();
  await serverRoom.waitForNextTimestep();
  assert.equal(serverRoom.state.phase, 'paused');
  assert.equal(serverRoom.state.timer, pausedTimer);
  const acceptedBeforePause = serverRoom.state.players.get(host.sessionId).acceptedInputCount;
  assert.deepEqual(await host.request(MESSAGE.INPUT, {
    axis: 1,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
  }), { ok: false });
  assert.equal(
    serverRoom.state.players.get(host.sessionId).acceptedInputCount,
    acceptedBeforePause,
  );

  await host.request(MESSAGE.RESUME, {});
  await serverRoom.waitForNextTimestep();
  assert.equal(serverRoom.state.phase, 'playing');
  assert.ok(serverRoom.state.timer < pausedTimer);
  await guest.leave();
});

test('only the host can resume the globally paused course', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();

  await host.request(MESSAGE.PAUSE, {});
  await assert.rejects(guest.request(MESSAGE.RESUME, {}), /host/i);
  assert.equal(serverRoom.state.phase, 'paused');
  assert.deepEqual(await host.request(MESSAGE.RESUME, {}), { ok: true });
  assert.equal(serverRoom.state.phase, 'playing');
});

test('authoritative completion exposes shared progress once after both chefs reach the goal', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const goal = serverRoom.courseState.goal.position;
  const hostPlayer = serverRoom.courseState.players[host.sessionId];
  const guestPlayer = serverRoom.courseState.players[guest.sessionId];
  Object.assign(hostPlayer, { positionX: goal[0], positionY: goal[1], hearts: 2 });
  Object.assign(guestPlayer, { positionX: goal[0], positionY: goal[1], hearts: 3 });
  serverRoom.courseState.tomatoCount = Math.ceil(
    serverRoom.courseState.collectibles.filter(({ kind }) => kind === 'tomato').length * 0.6,
  );

  serverRoom.stepAuthoritativeSimulation(1 / 60);
  const completedTick = serverRoom.state.authoritativeTick;

  assert.equal(serverRoom.state.phase, 'completed');
  assert.equal(serverRoom.state.goal.reachedPlayerIds.length, 2);
  assert.equal(serverRoom.state.players.get(host.sessionId).safe, true);
  assert.equal(serverRoom.state.players.get(guest.sessionId).safe, true);
  assert.equal(serverRoom.state.completion.present, true);
  assert.equal(serverRoom.state.completion.levelId, '1-1');
  assert.equal(serverRoom.state.completion.stars, 3);

  serverRoom.stepAuthoritativeSimulation(1);
  assert.equal(serverRoom.state.authoritativeTick, completedTick);
  assert.equal(serverRoom.state.completion.present, true);
  assert.deepEqual(await host.request(MESSAGE.INPUT, {
    axis: 0,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
  }), { ok: false });
});

test('either chef losing the final life publishes one team failure', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const player = serverRoom.courseState.players[guest.sessionId];
  player.hearts = 1;
  player.lives = 1;
  player.positionY = serverRoom.courseState.level.killY - 1;

  serverRoom.stepAuthoritativeSimulation(1 / 60);

  assert.equal(serverRoom.state.phase, 'failed');
  assert.equal(serverRoom.state.failureReason, 'lives');
  assert.equal(serverRoom.state.failedPlayerId, guest.sessionId);
  assert.equal(serverRoom.state.players.get(guest.sessionId).active, false);
  assert.equal(serverRoom.state.players.get(host.sessionId).active, true);
});

test('browser controls drive real authoritative pickups, checkpoints, respawns, and goals', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  const tomato = serverRoom.courseState.collectibles.find(({ kind }) => kind === 'tomato');
  const basil = serverRoom.courseState.collectibles.find(({ type }) => type === 'basil');

  assert.deepEqual(await host.request('test-control', {
    action: 'health', playerId: guest.sessionId, hearts: 2, lives: 4,
  }), { ok: true });
  assert.deepEqual(await host.request('test-control', {
    action: 'collectible', playerId: host.sessionId, targetId: tomato.id,
  }), { ok: true });
  assert.deepEqual(await host.request('test-control', {
    action: 'collectible', playerId: guest.sessionId, targetId: basil.id,
  }), { ok: true });
  await waitUntil(() => tomato.takenBy === host.sessionId && basil.takenBy === guest.sessionId);
  assert.ok(serverRoom.courseState.tomatoCount >= 1);
  assert.equal(serverRoom.courseState.players[guest.sessionId].hearts, 3);

  await host.request('test-control', { action: 'checkpoint', playerId: host.sessionId });
  await waitUntil(() => serverRoom.courseState.checkpoint.active);
  await host.request('test-control', {
    action: 'health', playerId: guest.sessionId, hearts: 1, lives: 4,
  });
  await host.request('test-control', { action: 'hazard', playerId: guest.sessionId });
  await waitUntil(() => serverRoom.courseState.players[guest.sessionId].lives === 3);
  assert.equal(serverRoom.courseState.players[guest.sessionId].positionX, 56.1);
  assert.equal(serverRoom.courseState.players[host.sessionId].lives, 4);

  await host.request('test-control', { action: 'goal', playerId: host.sessionId });
  await waitUntil(() => serverRoom.courseState.players[host.sessionId].safe);
  assert.equal(serverRoom.state.phase, 'playing');
  await host.request('test-control', { action: 'goal', playerId: guest.sessionId });
  await waitUntil(() => serverRoom.state.phase === 'completed');
  assert.equal(serverRoom.state.completion.present, true);
});

test('alternating action types share one per-client rate limit', async () => {
  const host = await createClient();
  for (let index = 0; index < ACTION_RATE_LIMIT_PER_SECOND; index += 1) {
    if (index % 2 === 0) {
      await host.request(MESSAGE.READY, { ready: true });
    } else {
      await host.request(MESSAGE.SELECT_LEVEL, { levelId: '1-1' });
    }
  }
  await assert.rejects(
    host.request(MESSAGE.READY, { ready: true }),
    /rate limit/i,
  );
});

test('disconnect pauses immediately and reconnect restores the same player state', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  await host.request(MESSAGE.INPUT, {
    axis: 1,
    running: true,
    jumpPressed: false,
    jumpHeld: false,
  });
  await serverRoom.waitForNextTimestep();
  const token = host.reconnectionToken;
  const playerId = host.sessionId;
  const positionX = serverRoom.state.players.get(playerId).positionX;

  await dropClient(host);
  await waitUntil(() => serverRoom.state.players.get(playerId)?.connected === false);
  const pausedTimer = serverRoom.state.timer;
  await serverRoom.waitForNextTimestep();
  assert.equal(serverRoom.state.phase, 'paused');
  assert.equal(serverRoom.state.timer, pausedTimer);

  const reconnected = await testServer.sdk.reconnect(token);
  await reconnected.waitForInitialState();
  assert.equal(reconnected.sessionId, playerId);
  assert.equal(serverRoom.state.players.get(playerId).connected, false);
  await reconnected.request(MESSAGE.RECONNECT, { protocolVersion: PROTOCOL_VERSION });
  assert.equal(serverRoom.state.players.get(playerId).connected, true);
  assert.equal(serverRoom.state.players.get(playerId).positionX, positionX);
  assert.equal(serverRoom.state.phase, 'paused');
  await reconnected.request(MESSAGE.RESUME, {});
  assert.equal(serverRoom.state.phase, 'playing');
  await new Promise((resolve) => {
    setTimeout(resolve, TEST_RECONNECT_HANDSHAKE_SECONDS * 1000 + 25);
  });
  assert.equal(reconnected.connection.isOpen, true);
  assert.equal(serverRoom.state.players.get(playerId).connected, true);
});

test('reconnection expiry cancels play, returns the survivor to lobby, and promotes them', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();
  await dropClient(host);
  await waitUntil(() => serverRoom.state.players.get(host.sessionId)?.connected === false);
  await waitUntil(() => serverRoom.state.phase === 'lobby', 2500);

  assert.equal(serverRoom.state.players.has(host.sessionId), false);
  assert.equal(serverRoom.state.players.has(guest.sessionId), true);
  assert.equal(serverRoom.state.hostPlayerId, guest.sessionId);
  assert.equal(serverRoom.state.players.get(guest.sessionId).ready, false);
  assert.equal(serverRoom.courseState, null);
  assert.equal(serverRoom.state.timer, 0);
});

test('leave message promotes a lobby host and an empty expired room disposes', async () => {
  const host = await createClient();
  const guest = await joinClient(host.roomId, { characterId: 'chefno' });
  const serverRoom = testServer.getRoomById(host.roomId);

  host.send(MESSAGE.LEAVE, {});
  await waitUntil(() => serverRoom.state.players.has(host.sessionId) === false);
  assert.equal(serverRoom.state.hostPlayerId, guest.sessionId);

  const solo = await createClient();
  const soloRoomId = solo.roomId;
  await dropClient(solo);
  await waitUntil(() => testServer.getRoomById(soloRoomId) === undefined, 2500);
  assert.equal(testServer.getRoomById(soloRoomId), undefined);
});

test('a guest leaving active play returns the connected host to the lobby', async () => {
  const { host, guest, serverRoom } = await createStartedRoom();

  guest.send(MESSAGE.LEAVE, {});
  await waitUntil(() => serverRoom.state.players.has(guest.sessionId) === false);
  await waitUntil(() => serverRoom.state.phase === 'lobby');

  assert.equal(serverRoom.state.players.has(host.sessionId), true);
  assert.equal(serverRoom.state.hostPlayerId, host.sessionId);
  assert.equal(serverRoom.courseState, null);
  assert.equal(host.connection.isOpen, true);
  assert.deepEqual(await host.request(MESSAGE.INPUT, {
    axis: 0,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
  }), { ok: false });
});

test('host promotion resets a selected course the survivor has not unlocked', async () => {
  const host = await createClient();
  const guest = await joinClient(host.roomId, {
    characterId: 'chefno',
    unlockedLevelIds: ['1-1'],
  });
  const serverRoom = testServer.getRoomById(host.roomId);
  await host.request(MESSAGE.SELECT_LEVEL, { levelId: '1-2' });

  host.send(MESSAGE.LEAVE, {});
  await waitUntil(() => serverRoom.state.hostPlayerId === guest.sessionId);

  assert.equal(serverRoom.state.selectedLevelId, '1-1');
  assert.equal(serverRoom.state.players.has(host.sessionId), false);
});

test('ten simultaneous full rooms stay private, progress independently, and dispose cleanly', async () => {
  const hosts = await Promise.all(
    Array.from({ length: 10 }, () => createClient()),
  );
  const roomIds = hosts.map(({ roomId }) => roomId);
  const guests = await Promise.all(hosts.map((host, index) => joinClient(host.roomId, {
    characterId: index % 2 === 0 ? 'chefno' : 'dinnerette',
  })));
  const serverRooms = roomIds.map((roomId) => testServer.getRoomById(roomId));

  assert.equal(new Set(roomIds).size, 10);
  assert.ok(roomIds.every((roomId) => /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(roomId)));
  assert.ok(serverRooms.every((room) => room.state.players.size === 2));
  await Promise.all(hosts.map((host) => assert.rejects(
    joinClient(host.roomId, { characterId: 'fatsio' }),
    /full|locked|seat|matchmake/i,
  )));

  await Promise.all(hosts.map((host, index) => host.request(MESSAGE.SELECT_LEVEL, {
    levelId: ALL_LEVEL_IDS[index % ALL_LEVEL_IDS.length],
  })));
  await Promise.all([...hosts, ...guests].map((client) => client.request(MESSAGE.READY, { ready: true })));
  await Promise.all(hosts.map((host) => host.request(MESSAGE.START, {})));

  assert.deepEqual(
    serverRooms.map((room) => room.state.selectedLevelId),
    hosts.map((_, index) => ALL_LEVEL_IDS[index % ALL_LEVEL_IDS.length]),
  );
  assert.ok(serverRooms.every((room) => room.state.phase === 'playing' && room.courseState));
  assert.equal(new Set(serverRooms.map((room) => room.courseState)).size, 10);
  await hosts[0].request(MESSAGE.INPUT, {
    axis: 1,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
  });
  await serverRooms[0].waitForNextTimestep();
  assert.equal(serverRooms[0].state.players.get(hosts[0].sessionId).acceptedInputCount, 1);
  assert.ok(serverRooms.slice(1).every((room, index) => (
    room.state.players.get(hosts[index + 1].sessionId).acceptedInputCount === 0
  )));

  await Promise.all(guests.map((guest) => guest.leave()));
  await Promise.all(serverRooms.map((room) => waitUntil(() => room.state.players.size === 1)));
  await Promise.all(hosts.map((host) => host.leave()));
  await Promise.all(roomIds.map((roomId) => waitUntil(() => testServer.getRoomById(roomId) === undefined)));
});

async function createStartedRoom() {
  const host = await createClient();
  const guest = await joinClient(host.roomId, { characterId: 'chefno' });
  await host.request(MESSAGE.READY, { ready: true });
  await guest.request(MESSAGE.READY, { ready: true });
  await host.request(MESSAGE.START, {});
  return { host, guest, serverRoom: testServer.getRoomById(host.roomId) };
}

async function createClient(overrides = {}) {
  const room = await testServer.sdk.create(ROOM_NAME, joinOptions(overrides));
  await room.waitForInitialState();
  return room;
}

async function joinClient(roomId, overrides = {}) {
  const room = await testServer.sdk.joinById(roomId, joinOptions(overrides));
  await room.waitForInitialState();
  return room;
}

function joinOptions(overrides = {}) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    characterId: 'fatsio',
    unlockedLevelIds: ALL_LEVEL_IDS,
    ...overrides,
  };
}

async function dropClient(room) {
  room.reconnection.enabled = false;
  const dropped = new Promise((resolve) => room.onDrop.once(resolve));
  room.connection.close(CloseCode.MAY_TRY_RECONNECT);
  await dropped;
}

function assertReconnectCleanup(serverRoom, departedPlayerId, survivorPlayerId) {
  assert.equal(serverRoom.state.players.has(departedPlayerId), false);
  assert.equal(serverRoom.state.players.has(survivorPlayerId), true);
  assert.equal(serverRoom.state.hostPlayerId, survivorPlayerId);
  assert.equal(serverRoom.state.players.get(survivorPlayerId).ready, false);
  assert.equal(serverRoom.state.phase, 'lobby');
  assert.equal(serverRoom.courseState, null);
  assert.equal(serverRoom.state.timer, 0);
}

function waitForRoomLeave(room) {
  return new Promise((resolve) => {
    room.onLeave.once((code, reason) => resolve([code, reason]));
  });
}

async function waitUntil(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for server state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
