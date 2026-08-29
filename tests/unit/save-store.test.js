import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreshSave, parseSave, recordCompletion } from '../../js/ui/save-store.js';

test('invalid JSON becomes a recoverable fresh save', () => {
  const result = parseSave('{bad');
  assert.equal(result.recovered, true);
  assert.deepEqual(result.save, createFreshSave());
});

test('v2 progress migrates into the current schema', () => {
  const result = parseSave(JSON.stringify({ unlocked: 2, best: { '1-1': 3 } }));
  assert.equal(result.recovered, false);
  assert.equal(result.save.version, 3);
  assert.equal(result.save.unlocked, 2);
  assert.equal(result.save.best['1-1'], 3);
});

test('completion updates a copy and never unlocks past World 1', () => {
  const original = createFreshSave();
  const updated = recordCompletion(original, '1-1', 2, 2);
  assert.equal(updated.best['1-1'], 2);
  assert.equal(updated.unlocked, 2);
  assert.deepEqual(original, createFreshSave());
});

test('completion rejects experimental level IDs', () => {
  const original = createFreshSave();
  const updated = recordCompletion(original, '2-1', 3, 2);
  assert.deepEqual(updated, original);
  assert.notEqual(updated, original);
});

test('completion clamps integer star totals to the released range', () => {
  const maxed = recordCompletion(createFreshSave(), '1-1', 5, 2);
  const zeroed = recordCompletion(maxed, '1-2', -1, 2);
  assert.equal(maxed.best['1-1'], 3);
  assert.equal(zeroed.best['1-2'], 0);
});

test('completion rejects noninteger star totals', () => {
  const original = recordCompletion(createFreshSave(), '1-1', 2, 2);
  const updated = recordCompletion(original, '1-1', 2.5, 2);
  assert.deepEqual(updated, original);
  assert.notEqual(updated, original);
});
