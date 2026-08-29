const JUMP_CODES = new Set(['Space', 'ArrowUp', 'KeyW']);
const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);
const RUN_CODES = new Set(['ShiftLeft', 'ShiftRight']);
const JUMP_BUFFER_SECONDS = 0.13;

export class InputState {
  constructor({ jumpBufferSeconds = JUMP_BUFFER_SECONDS } = {}) {
    this.jumpBufferSeconds = jumpBufferSeconds;
    this.held = new Set();
    this.jumpBuffer = 0;
  }

  press(code) {
    if (this.held.has(code)) return;
    this.held.add(code);
    if (JUMP_CODES.has(code)) this.jumpBuffer = this.jumpBufferSeconds;
  }

  release(code) {
    this.held.delete(code);
  }

  tick(seconds) {
    this.jumpBuffer = Math.max(0, this.jumpBuffer - Math.max(0, seconds));
  }

  consumeJump() {
    if (this.jumpBuffer <= 0) return false;
    this.jumpBuffer = 0;
    return true;
  }

  get axis() {
    const left = [...LEFT_CODES].some((code) => this.held.has(code));
    const right = [...RIGHT_CODES].some((code) => this.held.has(code));
    return Number(right) - Number(left);
  }

  get running() {
    return [...RUN_CODES].some((code) => this.held.has(code));
  }

  get jumpHeld() {
    return [...JUMP_CODES].some((code) => this.held.has(code));
  }

  clear() {
    this.held.clear();
    this.clearTransient();
  }

  clearTransient() {
    this.jumpBuffer = 0;
  }
}
