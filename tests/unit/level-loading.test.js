import test from 'node:test';
import assert from 'node:assert/strict';
import { createActiveProgressReporter } from '../../js/ui/level-loading.js';

test('stale progress callbacks cannot update the HUD', () => {
  let activeStartId = 2;
  const updates = [];
  const staleProgress = createActiveProgressReporter(
    1,
    () => activeStartId,
    (progress) => updates.push(progress),
  );
  const activeProgress = createActiveProgressReporter(
    2,
    () => activeStartId,
    (progress) => updates.push(progress),
  );

  staleProgress(3, 4);
  activeProgress(1, 4);
  activeStartId = 3;
  activeProgress(4, 4);

  assert.deepEqual(updates, [0.25]);
});
