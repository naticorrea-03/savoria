import {
  CloseCode,
  ErrorCode,
  Room,
  ServerError,
} from '@colyseus/core';
import {
  createCourseSimulation,
  createCourseSnapshot,
  stepCourseSimulation,
} from '../js/gameplay/course-simulation.js';
import { RELEASED_LEVELS, buildReleasedLevel } from '../js/levels/index.js';
import {
  ACTION_RATE_LIMIT_PER_SECOND,
  hasExactKeys,
  INPUT_RATE_LIMIT_PER_SECOND,
  isValidInput,
  MAX_MESSAGES_PER_SECOND,
  MESSAGE,
  PROTOCOL_VERSION,
} from '../js/multiplayer/protocol.js';
import { releaseRoomCode, reserveRoomCode } from './room-code.js';
import {
  applySimulationSnapshot,
  createLobbyPlayer,
  createLobbyState,
  resetCourseState,
} from './state.js';

export const RECONNECTION_WINDOW_SECONDS = 60;
export const RECONNECT_HANDSHAKE_SECONDS = 5;
export const SIMULATION_HZ = 60;
export const PATCH_HZ = 20;

const DEFAULT_LEVEL_ID = RELEASED_LEVELS[0].id;
const CHARACTER_IDS = new Set(['fatsio', 'dinnerette', 'chefno']);
const RELEASED_LEVEL_BY_ID = new Map(RELEASED_LEVELS.map((level) => [level.id, level]));
const NEUTRAL_INPUT = Object.freeze({
  axis: 0,
  running: false,
  jumpPressed: false,
  jumpHeld: false,
});

export class SavoriaRoom extends Room {
  static reconnectionWindowSeconds = RECONNECTION_WINDOW_SECONDS;
  static reconnectHandshakeSeconds = RECONNECT_HANDSHAKE_SECONDS;
  static browserTestControlsEnabled = process.env.SAVORIA_BROWSER_TESTS === '1';

  courseState = null;
  latestInputs = new Map();
  campaignUnlocks = new Map();
  pendingReconnects = new Map();
  messageWindows = new Map();
  reservationOwnerId = '';

  async onCreate(options) {
    assertProtocol(options?.protocolVersion);
    validateJoinOptions(options);

    this.maxClients = 2;
    this.maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
    this.patchRate = 1000 / PATCH_HZ;
    this.reservationOwnerId = this.roomId;
    this.roomId = await reserveRoomCode(this.presence, this.reservationOwnerId);
    this.state = createLobbyState(PROTOCOL_VERSION, DEFAULT_LEVEL_ID);

    await this.setMatchmaking({
      private: true,
      unlisted: true,
      maxClients: 2,
      metadata: {
        inviteCode: this.roomId,
        private: true,
        protocolVersion: PROTOCOL_VERSION,
      },
    });

    this.registerMessages();
    this.setFixedTimestep(({ dt }) => this.stepAuthoritativeSimulation(dt), SIMULATION_HZ);
  }

  onAuth(_client, options) {
    assertProtocol(options?.protocolVersion);
    if (this.state.phase !== 'lobby') {
      throw applicationError('New players cannot join after play begins');
    }
    return validateJoinOptions(options);
  }

  onJoin(client, options) {
    const normalized = client.auth ?? validateJoinOptions(options);
    const player = createLobbyPlayer(
      client.sessionId,
      normalized.characterId,
      normalized.guestName,
      normalized.identityId || client.sessionId,
    );
    this.state.players.set(client.sessionId, player);
    this.campaignUnlocks.set(client.sessionId, normalized.unlockedLevelIds);
    this.latestInputs.set(client.sessionId, { ...NEUTRAL_INPUT });
    if (!this.state.hostPlayerId) this.state.hostPlayerId = client.sessionId;
  }

  onDrop(client) {
    this.clearPendingReconnect(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.latestInputs.set(client.sessionId, { ...NEUTRAL_INPUT });
    if (this.courseState && this.state.phase === 'playing') {
      this.state.phase = 'paused';
      this.state.pauseReason = 'disconnect';
    }
    this.allowReconnection(client, this.constructor.reconnectionWindowSeconds);
  }

  onReconnect(client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) throw applicationError('Player is no longer part of this room');
    this.clearPendingReconnect(client.sessionId);
    const deadline = this.clock.setTimeout(
      () => this.closePendingReconnect(client.sessionId),
      this.constructor.reconnectHandshakeSeconds * 1000,
    );
    this.pendingReconnects.set(client.sessionId, { client, deadline });
    this.latestInputs.set(client.sessionId, { ...NEUTRAL_INPUT });
  }

  async onLeave(client) {
    const hadPlayer = this.state.players.has(client.sessionId);
    this.clearPendingReconnect(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.campaignUnlocks.delete(client.sessionId);
    this.latestInputs.delete(client.sessionId);
    this.messageWindows.delete(client.sessionId);

    if (hadPlayer && this.courseState && ['playing', 'paused'].includes(this.state.phase)) {
      await this.cancelCourseToLobby();
    }
    if (this.state.hostPlayerId === client.sessionId) {
      this.state.hostPlayerId = firstConnectedPlayerId(this.state.players);
      this.resetUnauthorizedHostSelection();
    }
    for (const player of this.state.players.values()) player.ready = false;
  }

  async onDispose() {
    if (!this.roomId || !this.reservationOwnerId) return;
    await releaseRoomCode(this.presence, this.roomId, this.reservationOwnerId);
  }

  registerMessages() {
    this.onMessage(MESSAGE.READY, (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      if (!hasExactKeys(payload, ['ready']) || typeof payload.ready !== 'boolean') {
        throw applicationError('Invalid ready message');
      }
      if (this.state.phase !== 'lobby') throw applicationError('Ready is only valid in the lobby');
      const player = this.requirePlayer(client.sessionId);
      player.ready = payload.ready;
      return { ok: true };
    });

    this.onMessage(MESSAGE.SELECT_LEVEL, (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      if (!hasExactKeys(payload, ['levelId']) || typeof payload.levelId !== 'string') {
        throw applicationError('Invalid course selection message');
      }
      if (this.state.phase !== 'lobby') throw applicationError('Course selection is closed');
      if (client.sessionId !== this.state.hostPlayerId) {
        throw applicationError('Only the host can select a course');
      }
      if (!RELEASED_LEVEL_BY_ID.has(payload.levelId)) {
        throw applicationError('Unknown released course');
      }
      if (!this.campaignUnlocks.get(client.sessionId)?.has(payload.levelId)) {
        throw applicationError('That course is locked in the host campaign');
      }
      this.state.selectedLevelId = payload.levelId;
      for (const player of this.state.players.values()) player.ready = false;
      return { ok: true };
    });

    this.onMessage(MESSAGE.START, async (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      assertEmptyPayload(payload, 'start');
      if (this.state.phase !== 'lobby') throw applicationError('Course already started');
      if (client.sessionId !== this.state.hostPlayerId) {
        throw applicationError('Only the host can start');
      }
      if (!this.campaignUnlocks.get(client.sessionId)?.has(this.state.selectedLevelId)) {
        throw applicationError('The selected course is locked in the host campaign');
      }
      const players = [...this.state.players.values()];
      if (players.length !== 2 || players.some((player) => !player.ready || !player.connected)) {
        throw applicationError('Both players must be connected and ready');
      }
      await this.startCourse();
      return { ok: true };
    });

    this.onMessage(MESSAGE.INPUT, (client, payload) => {
      this.consumeMessage(client.sessionId, 'input', INPUT_RATE_LIMIT_PER_SECOND);
      if (!isValidInput(payload)) throw applicationError('Invalid input message');
      this.requirePlayer(client.sessionId);
      if (this.state.phase !== 'playing') return { ok: false };
      const player = this.state.players.get(client.sessionId);
      this.latestInputs.set(client.sessionId, { ...payload });
      player.acceptedInputCount += 1;
      return { ok: true };
    });

    this.onMessage(MESSAGE.PAUSE, (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      assertEmptyPayload(payload, 'pause');
      this.requirePlayer(client.sessionId);
      if (client.sessionId !== this.state.hostPlayerId) {
        throw applicationError('Only the host can pause');
      }
      if (this.state.phase !== 'playing') throw applicationError('Pause requires active play');
      this.state.phase = 'paused';
      this.state.pauseReason = 'host';
      return { ok: true };
    });

    this.onMessage(MESSAGE.RESUME, (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      assertEmptyPayload(payload, 'resume');
      this.requirePlayer(client.sessionId);
      if (client.sessionId !== this.state.hostPlayerId) {
        throw applicationError('Only the host can resume');
      }
      if (this.state.phase !== 'paused' || !this.courseState) {
        throw applicationError('Resume requires a paused course');
      }
      if ([...this.state.players.values()].some((player) => !player.connected)) {
        throw applicationError('Every player must reconnect before resuming');
      }
      this.state.phase = 'playing';
      this.state.pauseReason = '';
      this.courseState.phase = 'playing';
      return { ok: true };
    });

    this.onMessage(MESSAGE.RECONNECT, (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      if (!this.pendingReconnects.has(client.sessionId)) {
        throw applicationError('Reconnect handshake is not pending');
      }
      if (!hasExactKeys(payload, ['protocolVersion'])) {
        this.closePendingReconnect(client.sessionId, 'Invalid reconnect message');
        return;
      }
      if (payload.protocolVersion !== PROTOCOL_VERSION) {
        this.closePendingReconnect(
          client.sessionId,
          `Protocol version ${PROTOCOL_VERSION} is required`,
        );
        return;
      }
      const player = this.state.players.get(client.sessionId);
      if (!player) throw applicationError('Player is no longer part of this room');
      player.connected = true;
      this.clearPendingReconnect(client.sessionId);
      this.latestInputs.set(client.sessionId, { ...NEUTRAL_INPUT });
      return { ok: true };
    });

    this.onMessage(MESSAGE.LEAVE, (client, payload) => {
      this.consumeMessage(client.sessionId, 'action', ACTION_RATE_LIMIT_PER_SECOND);
      assertEmptyPayload(payload, 'leave');
      client.leave(CloseCode.CONSENTED);
      return { ok: true };
    });

    if (this.constructor.browserTestControlsEnabled) {
      this.onMessage(MESSAGE.TEST_CONTROL, (client, payload) => (
        this.applyBrowserTestControl(client, payload)
      ));
    }
  }

  applyBrowserTestControl(client, payload) {
    if (client.sessionId !== this.state.hostPlayerId) {
      throw applicationError('Only the host can control browser tests');
    }
    if (!this.courseState || this.state.phase !== 'playing') {
      throw applicationError('Browser test control requires active play');
    }
    const playerId = payload?.playerId;
    const player = this.courseState.players[playerId];
    if (!player) throw applicationError('Unknown browser test player');

    if (payload.action === 'health') {
      if (!hasExactKeys(payload, ['action', 'playerId', 'hearts', 'lives'])
        || !Number.isInteger(payload.hearts)
        || payload.hearts < 1
        || payload.hearts > 5
        || !Number.isInteger(payload.lives)
        || payload.lives < 1
        || payload.lives > 4) {
        throw applicationError('Invalid browser health control');
      }
      player.hearts = payload.hearts;
      player.lives = payload.lives;
      player.active = true;
      player.invulnerabilitySeconds = 0;
      return { ok: true };
    }

    if (payload.action === 'collectible') {
      if (!hasExactKeys(payload, ['action', 'playerId', 'targetId'])) {
        throw applicationError('Invalid browser collectible control');
      }
      const collectible = this.courseState.collectibles.find(({ id }) => id === payload.targetId);
      if (!collectible || collectible.takenBy) {
        throw applicationError('Unknown available browser collectible');
      }
      snapPlayer(player, collectible.position);
      this.latestInputs.set(playerId, { ...NEUTRAL_INPUT });
      return { ok: true };
    }

    if (!hasExactKeys(payload, ['action', 'playerId'])) {
      throw applicationError('Invalid browser test control');
    }
    if (payload.action === 'checkpoint' && this.courseState.checkpoint) {
      snapPlayer(player, this.courseState.checkpoint.position);
    } else if (payload.action === 'hazard' && this.courseState.hazards[0]) {
      snapPlayer(player, this.courseState.hazards[0].position);
    } else if (payload.action === 'goal' && this.courseState.goal) {
      snapPlayer(player, this.courseState.goal.position);
    } else {
      throw applicationError('Unavailable browser test control');
    }
    this.latestInputs.set(playerId, { ...NEUTRAL_INPUT });
    return { ok: true };
  }

  async startCourse() {
    const definition = RELEASED_LEVEL_BY_ID.get(this.state.selectedLevelId);
    const level = buildReleasedLevel(definition);
    const players = [...this.state.players.values()].map((player) => ({
      playerId: player.playerId,
      characterId: player.characterId,
    }));
    this.courseState = createCourseSimulation({
      level,
      seed: `room-${this.roomId}`,
      players,
    });
    for (const player of this.state.players.values()) player.acceptedInputCount = 0;
    this.state.phase = 'playing';
    this.state.pauseReason = '';
    applySimulationSnapshot(this.state, createCourseSnapshot(this.courseState));
    await this.lock();
  }

  stepAuthoritativeSimulation(seconds) {
    if (!this.courseState || this.state.phase !== 'playing') return;
    stepCourseSimulation(this.courseState, Object.fromEntries(this.latestInputs), seconds);
    applySimulationSnapshot(this.state, createCourseSnapshot(this.courseState));
    this.state.phase = this.courseState.phase;
    for (const [playerId, input] of this.latestInputs) {
      if (input.jumpPressed) this.latestInputs.set(playerId, { ...input, jumpPressed: false });
    }
  }

  async cancelCourseToLobby() {
    this.courseState = null;
    this.state.phase = 'lobby';
    this.state.pauseReason = '';
    resetCourseState(this.state);
    await this.unlock();
  }

  resetUnauthorizedHostSelection() {
    const hostUnlocks = this.campaignUnlocks.get(this.state.hostPlayerId);
    if (!hostUnlocks || hostUnlocks.has(this.state.selectedLevelId)) return;
    this.state.selectedLevelId = RELEASED_LEVELS.find(({ id }) => hostUnlocks.has(id))?.id
      ?? DEFAULT_LEVEL_ID;
  }

  clearPendingReconnect(sessionId) {
    const pending = this.pendingReconnects.get(sessionId);
    if (!pending) return;
    pending.deadline.clear();
    this.pendingReconnects.delete(sessionId);
  }

  closePendingReconnect(sessionId, reason = 'Reconnect handshake expired') {
    const pending = this.pendingReconnects.get(sessionId);
    if (!pending) return;
    this.clearPendingReconnect(sessionId);
    pending.client.leave(CloseCode.CONSENTED, reason);
  }

  consumeMessage(sessionId, bucket, limit) {
    const now = Date.now();
    const cutoff = now - 1000;
    let byType = this.messageWindows.get(sessionId);
    if (!byType) {
      byType = new Map();
      this.messageWindows.set(sessionId, byType);
    }
    const recent = (byType.get(bucket) ?? []).filter((time) => time > cutoff);
    if (recent.length >= limit) throw applicationError('Message rate limit exceeded');
    recent.push(now);
    byType.set(bucket, recent);
  }

  requirePlayer(sessionId) {
    const player = this.state.players.get(sessionId);
    if (!player || !player.connected) throw applicationError('Player is not connected');
    return player;
  }
}

function validateJoinOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw applicationError('Invalid join options');
  }
  const characterId = options.characterId;
  if (!CHARACTER_IDS.has(characterId)) throw applicationError('Invalid character');
  if (!Array.isArray(options.unlockedLevelIds)) {
    throw applicationError('Invalid campaign unlocks');
  }
  const unlockedLevelIds = new Set();
  for (const levelId of options.unlockedLevelIds) {
    if (typeof levelId !== 'string' || !RELEASED_LEVEL_BY_ID.has(levelId)) {
      throw applicationError('Invalid campaign unlocks');
    }
    unlockedLevelIds.add(levelId);
  }
  if (!unlockedLevelIds.has(DEFAULT_LEVEL_ID)) {
    throw applicationError('The first course must be unlocked');
  }
  const guestName = normalizeGuestName(options.guestName);
  const identityId = normalizeIdentityId(options.identityId);
  return { characterId, guestName, identityId, unlockedLevelIds };
}

function normalizeGuestName(value) {
  if (value === undefined) return 'Guest Chef';
  if (typeof value !== 'string') throw applicationError('Invalid guest name');
  const name = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  if (!name) throw applicationError('Invalid guest name');
  return name;
}

function normalizeIdentityId(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string'
    || value.length < 8
    || value.length > 64
    || !/^[A-Za-z0-9-]+$/.test(value)) {
    throw applicationError('Invalid player identity');
  }
  return value;
}

function assertProtocol(version) {
  if (version !== PROTOCOL_VERSION) {
    throw applicationError(`Protocol version ${PROTOCOL_VERSION} is required`);
  }
}

function assertEmptyPayload(payload, messageType) {
  if (!hasExactKeys(payload, [])) throw applicationError(`Invalid ${messageType} message`);
}

function firstConnectedPlayerId(players) {
  return [...players.values()]
    .filter((player) => player.connected)
    .map((player) => player.playerId)
    .sort()[0] ?? '';
}

function snapPlayer(player, position) {
  player.positionX = position[0];
  player.positionY = position[1];
  player.positionZ = position[2];
  player.velocityX = 0;
  player.velocityY = 0;
  player.velocityZ = 0;
  player.grounded = false;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.groundMoverId = null;
  player.invulnerabilitySeconds = 0;
}

function applicationError(message) {
  return new ServerError(ErrorCode.APPLICATION_ERROR, message);
}
