import { InputState } from '../gameplay/input-state.js';
import { applyPlayerInput } from '../gameplay/player-state.js';
import {
  coursePlayerWorld,
  createCourseWorld,
  syncCourseWorld,
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
const INPUT_STEP_SECONDS = 1 / 60;

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
    syncCourseWorld(this.predictionWorld, view.movingPlatforms, view.authoritativeTick);

    if (!this.localPrediction) {
      this.inputOrdinal = local.acceptedInputCount;
      this.localPrediction = new LocalPrediction({
        initial: predictionState(local),
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
      this.localPrediction.reconcile(predictionState(local), local.acceptedInputCount, snapReason
        ? { now: receivedAt, reason: snapReason }
        : { now: receivedAt });
      this.localSnapRevision = Math.max(this.localSnapRevision, local.snapRevision);
    }

    for (const player of view.players) {
      if (player.isLocal) continue;
      let remote = this.remoteInterpolation.get(player.sessionId);
      if (!remote) {
        remote = new RemoteInterpolation();
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
    this.publish(now);
  }

  frame = (now) => {
    if (!this.running) return;
    this.advance(now);
    this.frameHandle = this.requestFrame(this.frame);
  };

  publish(now) {
    if (!this.lastView || !this.localPrediction) return;
    const players = this.lastView.players.map((player) => ({
      ...player,
      position: player.isLocal
        ? this.localPrediction.sample(now)
        : this.remoteInterpolation.get(player.sessionId)?.sample(now) ?? player.position,
    }));
    const local = players.find(({ isLocal }) => isLocal);
    this.presentation = {
      authoritativeTick: this.lastView.authoritativeTick,
      players,
      local,
      cameraTarget: local?.position ?? null,
    };
    this.onPresentation(this.presentation);
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
          initial: predictionState(local),
          simulate: (current, controls, seconds) => predictPlayerMotion(
            current,
            controls,
            seconds,
            this.predictionWorld,
          ),
        });
      } else {
        this.localPrediction.reset(predictionState(local));
      }
      this.localSnapRevision = local.snapRevision;
    }
    for (const player of view.players) {
      if (player.isLocal) continue;
      let remote = this.remoteInterpolation.get(player.sessionId);
      if (!remote) {
        remote = new RemoteInterpolation();
        this.remoteInterpolation.set(player.sessionId, remote);
      }
      remote.reset(player.position, view.authoritativeTick, now);
    }
    this.publish(now);
  }
}

function predictionState(player = {}) {
  const position = player.position ?? player;
  const velocity = player.velocity ?? {};
  return {
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
  const platform = world.movingPlatforms.find(({ id }) => id === state.groundMoverId);
  const carriedX = state.x + (platform?.velocityX ?? 0) * seconds;
  const carriedY = state.y + (platform?.velocityY ?? 0) * seconds;
  const next = applyPlayerInput({
    ...state,
    positionX: carriedX,
    positionY: carriedY,
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
