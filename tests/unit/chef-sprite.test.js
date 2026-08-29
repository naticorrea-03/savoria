import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chefFrameState,
  chefSpriteConfig,
} from '../../js/core/chef-sprite.js';

test('running advances through the full sprite sheet at the configured frame rate', () => {
  const config = chefSpriteConfig('dinnerette');
  const first = chefFrameState(config, {
    elapsed: 0,
    speed: 8.6,
    grounded: true,
    facing: 1,
  });
  const second = chefFrameState(config, {
    elapsed: 0.042,
    speed: 8.6,
    grounded: true,
    facing: 1,
  });

  assert.deepEqual(first, {
    frame: 0,
    offsetX: 0,
    offsetY: 0.8,
    repeatX: 0.2,
  });
  assert.deepEqual(second, {
    frame: 1,
    offsetX: 0.2,
    offsetY: 0.8,
    repeatX: 0.2,
  });
});

test('idle chefs hold a stable pose instead of cycling', () => {
  const config = chefSpriteConfig('fatsio');
  const state = chefFrameState(config, {
    elapsed: 9,
    speed: 0,
    grounded: true,
    facing: 1,
  });

  assert.equal(state.frame, 0);
});

test('left-facing chefs mirror the current frame inside its cell', () => {
  const config = chefSpriteConfig('chefno');
  const state = chefFrameState(config, {
    elapsed: 0,
    speed: 8.6,
    grounded: true,
    facing: -1,
  });

  assert.deepEqual(state, {
    frame: 0,
    offsetX: 0.2,
    offsetY: 0.8,
    repeatX: -0.2,
  });
});

test('the animation loops cleanly after frame 25', () => {
  const config = chefSpriteConfig('dinnerette');
  const state = chefFrameState(config, {
    elapsed: 25 / 24,
    speed: 8.6,
    grounded: true,
    facing: 1,
  });

  assert.equal(state.frame, 0);
});
