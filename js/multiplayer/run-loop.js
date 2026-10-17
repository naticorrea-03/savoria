import { InputState } from '../gameplay/input-state.js';
import { applyPlayerInput } from '../gameplay/player-state.js';
import {
  COURSE_TICKS_PER_SECOND,
  coursePlayerWorld,
  createCourseWorld,
  moverPositionAt,
  poseMover,
} from '../gameplay/course-world.js';
import {
  LocalPrediction,
  RemoteInterpolation,
} from './netcode.js';

const INPUT_CODES = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'KeyA',
  'KeyD',
  'KeyW',
  'ShiftLeft',
  'ShiftRight',
  'Space',
]);
const INPUT_STEP_SECONDS = 1 / COURSE_TICKS_PER_SECOND;
const REMOTE_EXTRAPOLATION_MS = 80;

export class MultiplayerRunLoop {
  constructor({
    sendInput,
    requestResume = () => {},
    onPresentation = () => {},
    requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame = (handle) => globalThis.cancelAnimationFrame(handle),
    inputTarget = globalThis,
    level = null,
  }) {
    this.sendInput = sendInput;
    this.requestResume = requestResume;
    this.onPresentation = onPresentation;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.inputTarget = inputTarget;
    this.predictionWorld = createCourseWorld(level ?? {});
    this.input = new InputState();
    this.localPrediction = null;
    this.remoteInterpolation = new Map();
    this.lastView = null;
    this.lastAuthoritativeTick = -1;
    this.inputOrdinal = 0;
    this.previousFrame = null;
    this.running = false;
    this.frameHandle = 0;
    this.presentation = null;
    this.authorityPlaying = false;
    this.inputAccumulator = 0;
    this.resumeRequested = false;
    this.localSnapRevision = null;
  }

  get pendingInputCount() {
    return this.localPrediction?.pendingCount ?? 0;
  }

  get remoteSampleCount() {
    return [...this.remoteInterpolation.values()]
      .reduce((count, remote) => count + remote.sampleCount, 0);
  }

  updateState(view, receivedAt = performance.now()) {
    if (view.authoritativeTick < this.lastAuthoritativeTick) return false;
    this.authorityPlaying = view.phase === 'playing';
    if (!this.authorityPlaying) {
      this.lastView = view;
      this.lastAuthoritativeTick = view.authoritativeTick;
      this.snapToAuthority(view, receivedAt);
      if (
        view.phase === 'paused'
        && view.pauseReason === 'disconnect'
        && view.isHost
        && view.players.length === 2
        && view.players.every(({ connected }) => connected)
        && !this.resumeRequested
      ) {
        this.resumeRequested = true;
        this.requestResume();
      }
      return false;
    }
    this.resumeRequested = false;
    if (view.authoritativeTick <= this.lastAuthoritativeTick) return false;
    this.lastView = view;
    this.lastAuthoritativeTick = view.authoritativeTick;
    const local = view.players.find(({ isLocal }) => isLocal);
    if (!local) return false;

    if (!this.localPrediction) {
      this.inputOrdinal = local.acceptedInputCount;
      this.localPrediction = new LocalPrediction({
        initial: predictionState(local, view.authoritativeTick),
        simulate: (current, controls, seconds) => predictPlayerMotion(
          current,
          controls,
          seconds,
          this.predictionWorld,
        ),
      });
      this.localSnapRevision = local.snapRevision;
    } else {
      const snapReason = local.snapRevision > this.localSnapRevision
        ? local.snapReason
        : undefined;
      this.localPrediction.reconcile(predictionState(local, view.authoritativeTick), local.acceptedInputCount, snapReason
        ? { now: receivedAt, reason: snapReason }
        : { now: receivedAt });
      this.localSnapRevision = Math.max(this.localSnapRevision, local.snapRevision);
    }

    for (const player of view.players) {
      if (player.isLocal) continue;
      let remote = this.remoteInterpolation.get(player.sessionId);
      if (!remote) {
        remote = new RemoteInterpolation({ extrapolateMs: REMOTE_EXTRAPOLATION_MS });
        this.remoteInterpolation.set(player.sessionId, remote);
      }
      remote.push(player.position, view.authoritativeTick, receivedAt);
    }
    this.publish(receivedAt);
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.previousFrame = null;
    this.attachInput();
    this.frameHandle = this.requestFrame(this.frame);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = 0;
    this.detachInput();
    this.input.clear();
    this.inputAccumulator = 0;
  }

  reset() {
    if (!this.lastView) return;
    this.authorityPlaying = false;
    this.resumeRequested = false;
    this.lastAuthoritativeTick = -1;
    this.localSnapRevision = null;
    this.snapToAuthority(this.lastView, performance.now());
  }

  press(code) {
    if (INPUT_CODES.has(code)) this.input.press(code);
  }

  release(code) {
    this.input.release(code);
  }

  advance(now) {
    if (this.previousFrame === null) {
      this.previousFrame = now;
      this.publish(now);
      return;
    }
    const seconds = Math.min(0.05, Math.max(0, (now - this.previousFrame) / 1000));
    this.previousFrame = now;
    if (!this.authorityPlaying || !this.localPrediction || !this.lastView || seconds === 0) {
      this.publish(now);
      return;
    }
    this.inputAccumulator += seconds;
    let acceptJump = true;
    while (this.inputAccumulator + Number.EPSILON >= INPUT_STEP_SECONDS) {
      const controls = {
        axis: this.input.axis,
        running: this.input.running,
        jumpPressed: acceptJump && this.input.consumeJump(),
        jumpHeld: this.input.jumpHeld,
      };
      this.inputOrdinal += 1;
      this.localPrediction.applyInput(
        this.inputOrdinal,
        controls,
        INPUT_STEP_SECONDS,
        now,
      );
      this.sendInput(controls);
      this.input.tick(INPUT_STEP_SECONDS);
      this.inputAccumulator -= INPUT_STEP_SECONDS;
      acceptJump = false;
    }
    this.localPrediction.setRenderAlpha(this.inputAccumulator / INPUT_STEP_SECONDS);
    this.publish(now);
  }

  frame = (now) => {
    if (!this.running) return;
    this.advance(now);
    this.frameHandle = this.requestFrame(this.frame);
  };

  publish(now) {
    if (!this.lastView || !this.localPrediction) return;
    const localTick = this.renderTick();
    const platforms = platformPositionsAtTick(this.predictionWorld, localTick);
    const players = this.lastView.players.map((player) => ({
      ...player,
      position: player.isLocal
        ? this.localPrediction.sample(now)
        : this.remotePosition(player, now, platforms),
    }));
    const local = players.find(({ isLocal }) => isLocal);
    this.presentation = {
      authoritativeTick: this.lastView.authoritativeTick,
      players,
      local,
      movingPlatforms: platforms,
      cameraTarget: local?.position ?? null,
    };
    this.onPresentation(this.presentation);
  }

  // The tick the local player is drawn at. Platforms use the same clock so a
  // rider and the platform under them always agree on screen.
  renderTick() {
    const predicted = this.localPrediction?.predicted;
    if (!predicted || !this.authorityPlaying) return this.lastView?.authoritativeTick ?? 0;
    const tick = Number(predicted.tick) || 0;
    return tick - 1 + this.localPrediction.renderAlpha;
  }

  // Remote players are drawn about 100 ms in the past, but the platform they
  // stand on is drawn at the local tick. Keep their offset from the platform
  // fixed, so a remote rider moves with the platform instead of sliding on it.
  remotePosition(player, now, platforms) {
    const remote = this.remoteInterpolation.get(player.sessionId);
    const sampled = remote?.sampleWithTick(now);
    if (!sampled) return player.position;
    const platform = this.predictionWorld.movingPlatforms.find(
      ({ id }) => id === player.groundMoverId,
    );
    if (!platform || player.grounded !== true) return sampled.value;
    const then = moverPositionAt(platform, sampled.tick / COURSE_TICKS_PER_SECOND);
    const current = platforms.find(({ id }) => id === platform.id)?.position;
    if (!current) return sampled.value;
    return {
      ...sampled.value,
      x: sampled.value.x + current.x - then[0],
      y: sampled.value.y + current.y - then[1],
    };
  }

  attachInput() {
    this.onKeyDown = (event) => {
      if (!INPUT_CODES.has(event.code)) return;
      const interactive = event.target?.closest?.('button, a, input, select, textarea');
      if (interactive) return;
      event.preventDefault?.();
      if (!event.repeat) this.press(event.code);
    };
    this.onKeyUp = (event) => this.release(event.code);
    this.onBlur = () => this.input.clear();
    this.inputTarget.addEventListener?.('keydown', this.onKeyDown);
    this.inputTarget.addEventListener?.('keyup', this.onKeyUp);
    this.inputTarget.addEventListener?.('blur', this.onBlur);
  }

  detachInput() {
    this.inputTarget.removeEventListener?.('keydown', this.onKeyDown);
    this.inputTarget.removeEventListener?.('keyup', this.onKeyUp);
    this.inputTarget.removeEventListener?.('blur', this.onBlur);
  }

  snapToAuthority(view, now) {
    this.input.clear();
    this.inputAccumulator = 0;
    this.previousFrame = null;
    const local = view.players.find(({ isLocal }) => isLocal);
    if (local) {
      this.inputOrdinal = local.acceptedInputCount;
      if (!this.localPrediction) {
        this.localPrediction = new LocalPrediction({
          initial: predictionState(local, view.authoritativeTick),
          simulate: (current, controls, seconds) => predictPlayerMotion(
            current,
            controls,
            seconds,
            this.predictionWorld,
          ),
        });
      } else {
        this.localPrediction.reset(predictionState(local, view.authoritativeTick));
      }
      this.localSnapRevision = local.snapRevision;
    }
    for (const player of view.players) {
      if (player.isLocal) continue;
      let remote = this.remoteInterpolation.get(player.sessionId);
      if (!remote) {
        remote = new RemoteInterpolation({ extrapolateMs: REMOTE_EXTRAPOLATION_MS });
        this.remoteInterpolation.set(player.sessionId, remote);
      }
      remote.reset(player.position, view.authoritativeTick, now);
    }
    this.publish(now);
  }
}

function predictionState(player = {}, tick = player.tick) {
  const position = player.position ?? player;
  const velocity = player.velocity ?? {};
  return {
    tick: Number(tick) || 0,
    x: Number(position.x) || 0,
    y: Number(position.y) || 0,
    z: Number(position.z) || 0,
    velocityX: Number(player.velocityX ?? velocity.x) || 0,
    velocityY: Number(player.velocityY ?? velocity.y) || 0,
    velocityZ: Number(player.velocityZ ?? velocity.z) || 0,
    width: Number(player.width) || 0.8,
    height: Number(player.height) || 1.55,
    depth: Number(player.depth) || 0.8,
    grounded: player.grounded === true,
    coyote: Number(player.coyote) || 0,
    jumpBuffer: Number(player.jumpBuffer) || 0,
    airJumpsRemaining: Number.isInteger(player.airJumpsRemaining)
      ? player.airJumpsRemaining
      : 1,
    facing: Number(player.facing) || 1,
    groundMoverId: player.groundMoverId || null,
    power: player.power ? { ...player.power } : null,
  };
}

function predictPlayerMotion(state, controls, seconds, world) {
  const fromTick = Number(state.tick) || 0;
  const toTick = fromTick + 1;
  const carry = advancePlatforms(world, state, fromTick, toTick);
  const next = applyPlayerInput({
    ...state,
    positionX: state.x + carry[0],
    positionY: state.y + carry[1],
    positionZ: state.z,
  }, controls, coursePlayerWorld(world, state), seconds);
  next.groundMoverId = findGroundMoverId(next, world);
  return predictionState({
    ...next,
    position: {
      x: next.positionX,
      y: next.positionY,
      z: next.positionZ,
    },
  }, toTick);
}

// Mirrors the server's updateMovingPlatforms: riders are found against the
// platform where it stood on the previous tick, then carried by exactly the
// distance the platform moves this tick. Platforms are then posed at the new
// tick so collisions use the same geometry the server will use.
function advancePlatforms(world, state, fromTick, toTick) {
  const carry = [0, 0];
  let carried = false;
  for (const platform of world.movingPlatforms) {
    const before = moverPositionAt(platform, fromTick / COURSE_TICKS_PER_SECOND);
    const after = moverPositionAt(platform, toTick / COURSE_TICKS_PER_SECOND);
    if (!carried && isRiding(state, platform, before)) {
      carry[0] = after[0] - before[0];
      carry[1] = after[1] - before[1];
      carried = true;
    }
    poseMover(platform, after);
  }
  return carry;
}

function isRiding(state, platform, position) {
  const halfWidth = platform.width / 2;
  const top = position[1] + platform.height / 2;
  return state.x > position[0] - halfWidth - state.width / 2
    && state.x < position[0] + halfWidth + state.width / 2
    && Math.abs(state.y - top) < 0.06
    && state.velocityY <= 0.01;
}

export function platformPositionsAtTick(world, tick) {
  return world.movingPlatforms.map((platform) => {
    const [x, y, z] = moverPositionAt(platform, tick / COURSE_TICKS_PER_SECOND);
    return {
      id: platform.id,
      position: { x, y, z },
      width: platform.width,
      height: platform.height,
      depth: platform.depth,
    };
  });
}

function findGroundMoverId(player, world) {
  if (!player.grounded) return null;
  return world.solids.find(({ aabb, movingPlatformId }) => (
    movingPlatformId
    && player.positionX > aabb.minX - player.width / 2
    && player.positionX < aabb.maxX + player.width / 2
    && Math.abs(player.positionY - aabb.maxY) < 0.06
  ))?.movingPlatformId ?? null;
}
