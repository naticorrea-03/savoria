import test from 'node:test';
import assert from 'node:assert/strict';
import { InputState } from '../../js/gameplay/input-state.js';

test('jump input stays buffered for 130 milliseconds', () => {
  const input = new InputState();
  input.press('Space');
  input.tick(0.12);
  assert.equal(input.consumeJump(), true);
});

test('movement axis and Shift state reflect held keys', () => {
  const input = new InputState();
  input.press('KeyD');
  input.press('ShiftLeft');
  assert.equal(input.axis, 1);
  assert.equal(input.running, true);

  input.press('KeyA');
  assert.equal(input.axis, 0);
  input.release('KeyD');
  assert.equal(input.axis, -1);
});

test('clear removes held input and buffered jumps', () => {
  const input = new InputState();
  input.press('ArrowRight');
  input.press('Space');
  input.clear();

  assert.equal(input.axis, 0);
  assert.equal(input.running, false);
  assert.equal(input.consumeJump(), false);
});

test('expired jump input cannot be consumed', () => {
  const input = new InputState();
  input.press('Space');
  input.tick(0.13);
  assert.equal(input.consumeJump(), false);
});
