import { InputState } from '../gameplay/input-state.js';
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
  }) {
    this.sendInput = sendInput;
    this.requestResume = requestResume;
    this.onPresentation = onPresentation;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.inputTarget = inputTarget;
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
  }

  get pendingInputCount() {
    return this.localPrediction?.pendingCount ?? 0;
  }

  get remoteSampleCount() {
    return [...this.remoteInterpolation.values()]
      .reduce((count, remote) => count + remote.sampleCount, 0);
  }

  updateState(view, receivedAt = performance.now()) {
    this.authorityPlaying = view.phase === 'playing';
    if (!this.authorityPlaying) {
      this.input.clear();
      this.inputAccumulator = 0;
      if (
        view.phase === 'paused'
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
        initial: local.position,
        simulate: predictPosition,
      });
    } else {
      this.localPrediction.reconcile(local.position, local.acceptedInputCount, {
        now: receivedAt,
      });
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
    this.input.clear();
    this.inputAccumulator = 0;
    const local = this.lastView?.players.find(({ isLocal }) => isLocal);
    if (local) {
      this.inputOrdinal = local.acceptedInputCount;
      this.localPrediction?.reset(local.position);
    }
    for (const player of this.lastView?.players ?? []) {
      if (player.isLocal) continue;
      this.remoteInterpolation.get(player.sessionId)?.reset(
        player.position,
        this.lastView.authoritativeTick,
        performance.now(),
      );
    }
    this.publish(performance.now());
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
}

function predictPosition(position, controls, seconds) {
  const speed = controls.running ? 10.6 : 7.2;
  return {
    x: position.x + controls.axis * speed * seconds,
    y: position.y,
    z: position.z,
  };
}
