import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASED_LEVELS, RELEASED_WORLDS } from '../../js/levels/index.js';
import { initialUiState, reduceUiState } from '../../js/ui/ui-state.js';
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  WORLD_ANCHORS,
  coverTransform,
  createMemory,
  parseMemory,
  pendingCourseReveals,
  pendingWorldReveals,
  pointAtDistance,
  pointOnSegment,
  seedMemory,
  segmentLengthTable,
  worldMapLayout,
} from '../../js/ui/world-map-layout.js';

const save = (unlocked, best = {}) => ({ ...initialUiState().save, unlocked, best });

test('every released world gets one map node per registry course, joined end to end', () => {
  for (const world of RELEASED_WORLDS) {
    const count = RELEASED_LEVELS.filter((level) => level.world === world.n).length;
    const layout = worldMapLayout(count, world.n);
    assert.equal(layout.nodes.length, count);
    assert.equal(layout.segments.length, count + 1);
    layout.nodes.forEach((node, index) => {
      assert.deepEqual(layout.segments[index].curve[3], node);
      assert.deepEqual(layout.segments[index + 1].curve[0], node);
    });
    assert.deepEqual(layout.segments.at(-1).curve[3], layout.gate);
  }
});

test('generated layouts handle any course count inside the 900 by 620 safe area', () => {
  const view = coverTransform(900, 620);
  for (let count = 1; count <= 7; count += 1) {
    const layout = worldMapLayout(count, 9);
    for (const point of [layout.start, ...layout.nodes, layout.gate]) {
      const x = point.x * view.scale + view.x;
      const y = point.y * view.scale + view.y;
      assert.ok(x > 40 && x < 860, `x ${x} for ${count} nodes`);
      assert.ok(y > 90 && y < 580, `y ${y} for ${count} nodes`);
    }
  }
});

test('hand-placed anchors only apply when the course count matches', () => {
  const anchored = worldMapLayout(WORLD_ANCHORS[1].count, 1);
  assert.equal(anchored.anchored, true);
  assert.deepEqual(anchored.nodes, WORLD_ANCHORS[1].nodes);
  const grown = worldMapLayout(WORLD_ANCHORS[1].count + 1, 1);
  assert.equal(grown.anchored, false);
  assert.equal(grown.nodes.length, WORLD_ANCHORS[1].count + 1);
});

test('arc-length walking reaches both ends and moves forward', () => {
  const { segments } = worldMapLayout(3, 2);
  const curve = segments[1].curve;
  const table = segmentLengthTable(curve);
  assert.deepEqual(pointAtDistance(curve, table, 0), pointOnSegment(curve, 0));
  const end = pointAtDistance(curve, table, 1);
  assert.ok(Math.abs(end.x - curve[3].x) < 1e-6 && Math.abs(end.y - curve[3].y) < 1e-6);
  let previous = -Infinity;
  for (let step = 0; step <= 10; step += 1) {
    const point = pointAtDistance(curve, table, step / 10);
    assert.ok(point.x >= previous - 1e-6);
    previous = point.x;
  }
});

test('cover transform fills the viewport and centers the stage', () => {
  const view = coverTransform(1440, 900);
  assert.ok(STAGE_WIDTH * view.scale >= 1440 - 1e-6);
  assert.ok(STAGE_HEIGHT * view.scale >= 900 - 1e-6);
  assert.ok(Math.abs(view.x * 2 + STAGE_WIDTH * view.scale - 1440) < 1e-6);
});

test('cinematic memory seeds from older saves and ignores junk', () => {
  assert.deepEqual(seedMemory(save(1), RELEASED_LEVELS), createMemory());
  const seeded = seedMemory(save(3, { '1-1': 3, '1-2': 2 }), RELEASED_LEVELS);
  assert.deepEqual(seeded.courses, RELEASED_LEVELS.slice(0, 3).map(({ id }) => id));
  assert.deepEqual(seeded.worlds, [1, 2]);
  assert.deepEqual(seeded.worldCards, [1, 2]);
  assert.equal(parseMemory('{not json'), null);
  assert.deepEqual(parseMemory('{"worlds":[1,"x"],"courses":["1-1",4]}'), {
    worlds: [1],
    worldCards: [],
    courses: ['1-1'],
  });
});

test('reveals list only newly opened courses and worlds', () => {
  const memory = { worlds: [1], worldCards: [1], courses: ['1-1'] };
  assert.deepEqual(pendingCourseReveals(memory, save(2, { '1-1': 1 }), RELEASED_LEVELS, 1), ['1-2']);
  assert.deepEqual(pendingCourseReveals(memory, save(2, { '1-1': 1 }), RELEASED_LEVELS, 2), []);
  assert.deepEqual(pendingWorldReveals(memory, save(3), RELEASED_LEVELS, RELEASED_WORLDS), [2]);
  assert.deepEqual(pendingWorldReveals(memory, save(1), RELEASED_LEVELS, RELEASED_WORLDS), []);
});

test('the world screen opens world select first, then a world map', () => {
  let state = reduceUiState(initialUiState(), { type: 'START' });
  state = reduceUiState(state, { type: 'CHOOSE_CHARACTER', characterId: 'fatsio' });
  assert.equal(state.screen, 'world');
  assert.equal(state.mapWorld, null);

  assert.equal(reduceUiState(state, { type: 'OPEN_WORLD', world: 2 }), state, 'locked world stays shut');
  state = reduceUiState(state, { type: 'OPEN_WORLD', world: 1 });
  assert.equal(state.mapWorld, 1);
  state = reduceUiState(state, { type: 'BACK_TO_WORLDS' });
  assert.equal(state.mapWorld, null);
  assert.equal(state.screen, 'world');
});

test('after a course the map returns to its world, or to world select when a world opens', () => {
  let state = initialUiState({ save: save(1) });
  state = { ...state, screen: 'world' };
  state = reduceUiState(state, { type: 'OPEN_WORLD', world: 1 });
  state = reduceUiState(state, { type: 'SELECT_LEVEL', levelId: '1-1', levelIndex: 0 });
  state = reduceUiState(state, { type: 'COURSE_COMPLETE', levelId: '1-1', stars: 2, stats: {} });
  const back = reduceUiState(state, { type: 'CONTINUE' });
  assert.equal(back.screen, 'world');
  assert.equal(back.mapWorld, 1);

  const lastIndex = RELEASED_LEVELS.findLastIndex(({ world }) => world === 1);
  const last = RELEASED_LEVELS[lastIndex];
  let finale = { ...initialUiState({ save: save(lastIndex + 1) }), screen: 'world' };
  finale = reduceUiState(finale, { type: 'SELECT_LEVEL', levelId: last.id, levelIndex: lastIndex });
  finale = reduceUiState(finale, { type: 'COURSE_COMPLETE', levelId: last.id, stars: 3, stats: {} });
  assert.equal(finale.completion.worldComplete, true);
  assert.equal(reduceUiState(finale, { type: 'CONTINUE' }).mapWorld, null);
  assert.equal(reduceUiState(finale, { type: 'QUIT_TO_WORLD' }).mapWorld, 1);
});
