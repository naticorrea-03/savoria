import {
  MESSAGE,
  PROTOCOL_VERSION,
  ROOM_NAME,
  isValidInput,
} from './protocol.js';
import { playerMarkerColor } from './identity.js';
import { normalizeRoomCode } from './invite.js';

export class MultiplayerClient {
  constructor({
    endpoint = multiplayerEndpoint(globalThis.location),
    identity,
    loadSdk = loadVendoredSdk,
    onState = () => {},
    onStatus = () => {},
    resetNetcode = () => {},
  }) {
    this.endpoint = endpoint;
    this.identity = identity;
    this.loadSdk = loadSdk;
    this.onState = onState;
    this.onStatus = onStatus;
    this.resetNetcode = resetNetcode;
    this.sdkClient = null;
    this.room = null;
    this.intentionalLeaves = new WeakSet();
  }

  async createRoom(options) {
    const client = await this.getSdkClient();
    return this.bindRoom(await client.create(ROOM_NAME, this.joinOptions(options)));
  }

  async joinRoom(code, options) {
    const normalized = normalizeRoomCode(code);
    if (!normalized) throw new Error('Enter a valid six-character room code');
    const client = await this.getSdkClient();
    return this.bindRoom(await client.joinById(normalized, this.joinOptions(options)));
  }

  setReady(ready) {
    this.room?.send(MESSAGE.READY, { ready });
  }

  selectLevel(levelId) {
    this.room?.send(MESSAGE.SELECT_LEVEL, { levelId });
  }

  start() {
    this.room?.send(MESSAGE.START, {});
  }

  resume() {
    this.room?.send(MESSAGE.RESUME, {});
  }

  pause() {
    this.room?.send(MESSAGE.PAUSE, {});
  }

  sendInput(input) {
    if (!isValidInput(input)) throw new Error('Invalid multiplayer input');
    this.room?.send(MESSAGE.INPUT, input);
  }

  testControl(payload) {
    this.room?.send(MESSAGE.TEST_CONTROL, payload);
  }

  dropForTest() {
    if (!this.room) return;
    this.testReconnectToken = this.room.reconnectionToken;
    this.room.reconnection.enabled = false;
    this.room.connection?.close(4001);
  }

  async reconnectForTest() {
    if (!this.testReconnectToken || !this.sdkClient) {
      throw new Error('No browser test reconnection is pending');
    }
    const room = await this.sdkClient.reconnect(this.testReconnectToken);
    await room.waitForInitialState?.();
    this.testReconnectToken = null;
    this.bindRoom(room);
    this.resetNetcode('reconnect');
    room.send(MESSAGE.RECONNECT, { protocolVersion: PROTOCOL_VERSION });
    this.onStatus({ kind: 'connected', message: 'Back in the room.' });
  }

  async leave() {
    const room = this.room;
    if (!room) return;
    this.intentionalLeaves.add(room);
    this.room = null;
    await room.leave(true);
  }

  get sessionId() {
    return this.room?.sessionId ?? null;
  }

  get roomCode() {
    return this.room?.roomId ?? null;
  }

  joinOptions({ characterId, unlockedLevelIds }) {
    return {
      protocolVersion: PROTOCOL_VERSION,
      characterId,
      unlockedLevelIds: [...unlockedLevelIds],
      guestName: this.identity.guestName,
      identityId: this.identity.playerId,
    };
  }

  async getSdkClient() {
    if (this.sdkClient) return this.sdkClient;
    const { Client } = await this.loadSdk();
    this.sdkClient = new Client(this.endpoint);
    return this.sdkClient;
  }

  bindRoom(room) {
    this.room = room;
    if (room.reconnection) room.reconnection.minUptime = 0;
    room.onStateChange((state) => this.onState(toLobbyView(state, room.sessionId)));
    room.onDrop(() => {
      this.resetNetcode('drop');
      this.onStatus({ kind: 'reconnecting', message: 'Connection lost. Rejoining the kitchen…' });
    });
    room.onReconnect(() => {
      this.resetNetcode('reconnect');
      room.send(MESSAGE.RECONNECT, { protocolVersion: PROTOCOL_VERSION });
      this.onStatus({ kind: 'connected', message: 'Back in the room.' });
    });
    room.onLeave(() => {
      const intentional = this.intentionalLeaves.delete(room);
      this.room = null;
      if (intentional) return;
      this.onStatus({
        kind: 'expired',
        message: 'That room expired. Create a new room or enter another code.',
      });
    });
    if (room.state) this.onState(toLobbyView(room.state, room.sessionId));
    return room;
  }
}

export async function loadVendoredSdk() {
  await import('../../vendor/colyseus.js');
  const Client = globalThis.Colyseus?.Client;
  if (!Client) throw new Error('The multiplayer client could not load');
  return { Client };
}

export function multiplayerEndpoint(location) {
  const protocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location?.host || '127.0.0.1:2567'}`;
}

export function toLobbyView(state, localSessionId) {
  const players = [];
  state?.players?.forEach?.((player, sessionId) => {
    players.push({
      sessionId,
      playerId: player.playerId,
      identityId: player.identityId || player.playerId,
      guestName: player.guestName || 'Guest Chef',
      characterId: player.characterId,
      ready: player.ready === true,
      connected: player.connected !== false,
      acceptedInputCount: Number(player.acceptedInputCount) || 0,
      isLocal: sessionId === localSessionId,
      color: playerMarkerColor(player.identityId || player.playerId),
      position: {
        x: Number(player.positionX) || 0,
        y: Number(player.positionY) || 0,
        z: Number(player.positionZ) || 0,
      },
      velocity: {
        x: Number(player.velocityX) || 0,
        y: Number(player.velocityY) || 0,
        z: Number(player.velocityZ) || 0,
      },
      grounded: player.grounded === true,
      hearts: Number(player.hearts) || 0,
      lives: Number(player.lives) || 0,
      invulnerabilitySeconds: Number(player.invulnerabilitySeconds) || 0,
      active: player.active !== false,
      safe: player.safe === true,
      reachedGoal: player.reachedGoal === true,
      power: player.powerType
        ? { type: player.powerType, seconds: Number(player.powerSeconds) || 0 }
        : null,
    });
  });
  players.sort((left, right) => {
    if (left.sessionId === state.hostPlayerId) return -1;
    if (right.sessionId === state.hostPlayerId) return 1;
    return left.sessionId.localeCompare(right.sessionId);
  });
  const usedColors = new Set();
  for (const player of players) {
    let offset = 0;
    while (usedColors.has(player.color)) {
      offset += 1;
      player.color = playerMarkerColor(player.identityId, offset);
    }
    usedColors.add(player.color);
  }
  const localPlayer = players.find(({ isLocal }) => isLocal);
  return {
    phase: state?.phase ?? 'lobby',
    pauseReason: state?.pauseReason ?? '',
    failureReason: state?.failureReason || null,
    failedPlayerId: state?.failedPlayerId || null,
    authoritativeTick: Number(state?.authoritativeTick) || 0,
    timer: Number(state?.timer) || 0,
    tomatoCount: Number(state?.tomatoCount) || 0,
    selectedLevelId: state?.selectedLevelId ?? '1-1',
    hostPlayerId: state?.hostPlayerId ?? '',
    isHost: state?.hostPlayerId === localSessionId,
    players,
    canStart: players.length === 2
      && players.every((player) => player.ready && player.connected),
    cameraTarget: localPlayer?.position ?? null,
    checkpoint: state?.checkpoint?.present ? {
      active: state.checkpoint.active === true,
      activatedBy: state.checkpoint.activatedBy || null,
      position: positionFrom(state.checkpoint),
    } : null,
    goal: state?.goal?.present ? {
      position: positionFrom(state.goal),
      reachedPlayerIds: Array.from(state.goal.reachedPlayerIds ?? []),
    } : null,
    completion: state?.completion?.present ? {
      levelId: state.completion.levelId,
      tomatoCount: Number(state.completion.tomatoCount) || 0,
      totalTomatoes: Number(state.completion.totalTomatoes) || 0,
      elapsed: Number(state.completion.elapsed) || 0,
      stars: Number(state.completion.stars) || 0,
    } : null,
    enemies: Array.from(state?.enemies ?? [], (enemy) => ({
      id: enemy.id,
      type: enemy.type,
      position: positionFrom(enemy),
      dead: enemy.dead === true,
    })),
    projectiles: Array.from(state?.projectiles ?? [], (projectile) => ({
      id: projectile.id,
      targetPlayerId: projectile.targetPlayerId || null,
      position: positionFrom(projectile),
      velocity: {
        x: Number(projectile.velocityX) || 0,
        y: Number(projectile.velocityY) || 0,
        z: Number(projectile.velocityZ) || 0,
      },
      life: Number(projectile.life) || 0,
    })),
    collectibles: Array.from(state?.collectibles ?? [], (collectible) => ({
      id: collectible.id,
      kind: collectible.kind,
      type: collectible.itemType || null,
      position: positionFrom(collectible),
      takenBy: collectible.takenBy || null,
    })),
    movingPlatforms: Array.from(state?.movingPlatforms ?? [], (platform) => ({
      id: platform.id,
      position: positionFrom(platform),
      width: Number(platform.width) || 0,
      height: Number(platform.height) || 0,
      depth: Number(platform.depth) || 0,
    })),
    boss: state?.boss?.present ? {
      position: positionFrom(state.boss),
      hp: Number(state.boss.hp) || 0,
      maxHp: Number(state.boss.maxHp) || 0,
      mode: state.boss.mode,
      awake: state.boss.awake === true,
      targetPlayerId: state.boss.targetPlayerId || null,
    } : null,
  };
}

function positionFrom(value) {
  return {
    x: Number(value?.positionX) || 0,
    y: Number(value?.positionY) || 0,
    z: Number(value?.positionZ) || 0,
  };
}
