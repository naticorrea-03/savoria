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
    return Number(this.#anyHeld(RIGHT_CODES)) - Number(this.#anyHeld(LEFT_CODES));
  }

  get running() {
    return this.#anyHeld(RUN_CODES);
  }

  get jumpHeld() {
    return this.#anyHeld(JUMP_CODES);
  }

  #anyHeld(codes) {
    for (const code of codes) {
      if (this.held.has(code)) return true;
    }
    return false;
  }

  clear() {
    this.held.clear();
    this.clearTransient();
  }

  clearTransient() {
    this.jumpBuffer = 0;
  }
}
