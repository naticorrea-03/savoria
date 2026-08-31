import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE, PROTOCOL_VERSION, ROOM_NAME } from '../../js/multiplayer/protocol.js';
import {
  MultiplayerClient,
  multiplayerEndpoint,
  toLobbyView,
} from '../../js/multiplayer/client.js';

function signal() {
  const listeners = [];
  const subscribe = (listener) => {
    listeners.push(listener);
    return () => {};
  };
  subscribe.emit = (...args) => listeners.forEach((listener) => listener(...args));
  return subscribe;
}

function fakeRoom() {
  return {
    roomId: 'ABC234',
    sessionId: 'session-host',
    state: { phase: 'lobby', hostPlayerId: 'session-host', players: new Map() },
    onStateChange: signal(),
    onDrop: signal(),
    onReconnect: signal(),
    onLeave: signal(),
    reconnection: { minUptime: 5_000 },
    sent: [],
    send(type, payload) { this.sent.push([type, payload]); },
    async leave() {},
  };
}

test('online SDK is lazy and create sends protocol and local identity', async () => {
  const room = fakeRoom();
  const calls = [];
  let loads = 0;
  class Client {
    constructor(endpoint) { calls.push(['endpoint', endpoint]); }
    async create(name, options) {
      calls.push(['create', name, options]);
      return room;
    }
  }
  const client = new MultiplayerClient({
    endpoint: 'ws://127.0.0.1:2567',
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => { loads += 1; return { Client }; },
  });

  assert.equal(loads, 0);
  await client.createRoom({ characterId: 'fatsio', unlockedLevelIds: ['1-1'] });

  assert.equal(loads, 1);
  assert.equal(room.reconnection.minUptime, 0);
  assert.deepEqual(calls, [
    ['endpoint', 'ws://127.0.0.1:2567'],
    ['create', ROOM_NAME, {
      protocolVersion: PROTOCOL_VERSION,
      characterId: 'fatsio',
      unlockedLevelIds: ['1-1'],
      guestName: 'Nati',
      identityId: 'stable-player',
    }],
  ]);
});

test('join validates invite codes before loading the SDK', async () => {
  let loads = 0;
  const client = new MultiplayerClient({
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => { loads += 1; return { Client: class {} }; },
  });

  await assert.rejects(client.joinRoom('ABC10O', {
    characterId: 'fatsio',
    unlockedLevelIds: ['1-1'],
  }), /six-character room code/i);
  assert.equal(loads, 0);
});

test('reconnect clears netcode state and completes protocol handshake', async () => {
  const room = fakeRoom();
  const resets = [];
  class Client {
    async joinById() { return room; }
  }
  const client = new MultiplayerClient({
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => ({ Client }),
    resetNetcode: (phase) => resets.push(phase),
  });
  await client.joinRoom('ABC234', {
    characterId: 'chefno',
    unlockedLevelIds: ['1-1'],
  });

  room.onDrop.emit();
  room.onReconnect.emit();
  client.resume();

  assert.deepEqual(resets, ['drop', 'reconnect']);
  assert.deepEqual(room.sent.slice(-2), [
    [MESSAGE.RECONNECT, { protocolVersion: 1 }],
    [MESSAGE.RESUME, {}],
  ]);
});

test('client sends only the exact multiplayer input contract', async () => {
  const room = fakeRoom();
  class Client {
    async create() { return room; }
  }
  const client = new MultiplayerClient({
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => ({ Client }),
  });
  await client.createRoom({ characterId: 'fatsio', unlockedLevelIds: ['1-1'] });

  assert.throws(() => client.sendInput({
    axis: 1,
    running: false,
    jumpPressed: false,
    jumpHeld: false,
    sequence: 9,
  }), /invalid multiplayer input/i);
  client.sendInput({
    axis: -1,
    running: true,
    jumpPressed: true,
    jumpHeld: false,
  });

  assert.deepEqual(room.sent, [[MESSAGE.INPUT, {
    axis: -1,
    running: true,
    jumpPressed: true,
    jumpHeld: false,
  }]]);
});

test('failed reconnection exposes expired-room recovery', async () => {
  const room = fakeRoom();
  const statuses = [];
  class Client {
    async joinById() { return room; }
  }
  const client = new MultiplayerClient({
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => ({ Client }),
    onStatus: (status) => statuses.push(status),
  });
  await client.joinRoom('ABC234', {
    characterId: 'chefno',
    unlockedLevelIds: ['1-1'],
  });

  room.onLeave.emit(4003, 'Room no longer exists');

  assert.deepEqual(statuses.at(-1), {
    kind: 'expired',
    message: 'That room expired. Create a new room or enter another code.',
  });
});

test('unexpected consent-code closure exposes expired-room recovery', async () => {
  const room = fakeRoom();
  const statuses = [];
  class Client {
    async joinById() { return room; }
  }
  const client = new MultiplayerClient({
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => ({ Client }),
    onStatus: (status) => statuses.push(status),
  });
  await client.joinRoom('ABC234', {
    characterId: 'chefno',
    unlockedLevelIds: ['1-1'],
  });

  room.onLeave.emit(4000, 'Reconnect handshake expired');

  assert.equal(client.room, null);
  assert.equal(statuses.at(-1).kind, 'expired');
});

test('intentional local leave ignores its consent-code closure', async () => {
  const room = fakeRoom();
  const statuses = [];
  room.leave = async function leave() {
    setTimeout(() => this.onLeave.emit(4000, 'consented'), 0);
  };
  class Client {
    async joinById() { return room; }
  }
  const client = new MultiplayerClient({
    identity: { playerId: 'stable-player', guestName: 'Nati' },
    loadSdk: async () => ({ Client }),
    onStatus: (status) => statuses.push(status),
  });
  await client.joinRoom('ABC234', {
    characterId: 'chefno',
    unlockedLevelIds: ['1-1'],
  });

  await client.leave();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(statuses, []);
});

test('lobby view keeps duplicate chefs distinct and camera anchored locally', () => {
  const state = {
    phase: 'lobby',
    authoritativeTick: 42,
    hostPlayerId: 'session-host',
    selectedLevelId: '1-1',
    players: new Map([
      ['session-host', {
        playerId: 'session-host',
        identityId: 'same-player',
        guestName: 'Nati',
        characterId: 'fatsio',
        ready: true,
        connected: true,
        positionX: 3,
        positionY: 4,
        positionZ: 0,
        acceptedInputCount: 7,
      }],
      ['session-guest', {
        playerId: 'session-guest',
        identityId: 'other-player',
        guestName: 'Alex',
        characterId: 'fatsio',
        ready: false,
        connected: true,
        positionX: 30,
        positionY: 5,
        positionZ: 0,
        acceptedInputCount: 3,
      }],
    ]),
  };

  const view = toLobbyView(state, 'session-host');

  assert.equal(view.players[0].characterId, view.players[1].characterId);
  assert.notEqual(view.players[0].color, view.players[1].color);
  assert.deepEqual(view.cameraTarget, { x: 3, y: 4, z: 0 });
  assert.equal(view.authoritativeTick, 42);
  assert.equal(view.players[0].acceptedInputCount, 7);
  assert.equal(view.isHost, true);
  assert.equal(view.canStart, false);
});

test('same-origin multiplayer endpoint follows page security', () => {
  assert.equal(multiplayerEndpoint({ protocol: 'http:', host: 'localhost:2567' }), 'ws://localhost:2567');
  assert.equal(multiplayerEndpoint({ protocol: 'https:', host: 'savoria.example' }), 'wss://savoria.example');
});
