import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../../js/core/fixed-step-loop.js';

test('a slow frame runs capped fixed simulations', () => {
  const loop = new FixedStepLoop({ step: 1 / 60, maxSteps: 5 });
  let simulations = 0;
  loop.advance(0.2, () => simulations++, () => {});
  assert.equal(simulations, 5);
});

test('the approved 60 Hz step and five-step cap cannot be changed', () => {
  const loop = new FixedStepLoop({ step: 1, maxSteps: 1 });
  const steps = [];
  loop.advance(0.2, (dt) => steps.push(dt), () => {});

  assert.equal(steps.length, 5);
  assert.ok(steps.every((dt) => dt === 1 / 60));
});

test('each simulation receives the fixed 60 Hz step and render runs once', () => {
  const loop = new FixedStepLoop();
  const steps = [];
  let renders = 0;
  const simulations = loop.advance(2 / 60, (dt) => steps.push(dt), () => renders++);

  assert.equal(simulations, 2);
  assert.deepEqual(steps, [1 / 60, 1 / 60]);
  assert.equal(renders, 1);
});

test('excess catch-up time is discarded after a capped frame', () => {
  const loop = new FixedStepLoop();
  loop.advance(0.2, () => {}, () => {});
  let simulations = 0;
  loop.advance(0, () => simulations++, () => {});
  assert.equal(simulations, 0);
});
