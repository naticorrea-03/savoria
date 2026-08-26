import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../../js/core/game-session.js';
import { DEFAULT_MOTION } from '../../js/gameplay/player-motion.js';
import {
  RELEASED_LEVELS,
  buildReleasedLevel,
} from '../../js/levels/index.js';
import {
  analyzeRequiredJumps,
  measureJumpCapabilities,
} from '../helpers/motion-simulation.js';

const TUTORIAL_COPY = [
  'Move',
  'Jump',
  'Hold Shift to run',
  'Stomp from above',
];

test('every World 1 required jump has a half-unit landing margin', () => {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    assert.ok(level.requiredJumps.length > 0);
    const report = analyzeRequiredJumps(level, capabilities);
    assert.deepEqual(report.unreachable, []);
  }
});

test('World 1 teaches walking jumps before run-assisted jumps', () => {
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    const walkingJumps = level.requiredJumps.filter((jump) => !jump.requiresRun);
    const runningJumps = level.requiredJumps.filter((jump) => jump.requiresRun);
    assert.ok(walkingJumps.length > 0);
    assert.ok(runningJumps.length > 0);
    assert.ok(
      Math.min(...runningJumps.map((jump) => jump.takeoffX))
        > Math.min(...walkingJumps.map((jump) => jump.takeoffX)),
    );
  }
});

test('each course teaches movement before its first enemy', () => {
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    const firstEnemyX = Math.min(...level.enemies.map((enemy) => enemy.p[0]));
    for (const tutorialId of ['move', 'jump']) {
      const tutorial = level.tutorials.find(({ id }) => id === tutorialId);
      assert.ok(tutorial.x < firstEnemyX);
    }
  }
});

test('Penne Ridge requires running only after the run tutorial marker', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const runTutorialX = level.tutorials.find((tutorial) => tutorial.id === 'run').x;
  const requiredRunJumps = level.requiredJumps.filter((jump) => jump.requiresRun);
  assert.ok(requiredRunJumps.length > 0);
  assert.ok(requiredRunJumps.every((jump) => jump.takeoffX > runTutorialX));
});

test('Penne Ridge gives the timed run a clear runway', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const runTutorialX = level.tutorials.find((tutorial) => tutorial.id === 'run').x;
  const firstRunJumpX = level.requiredJumps.find((jump) => jump.requiresRun).takeoffX;
  const blockers = level.boxes.filter((box) => {
    const [centerX, , , width, , , kind] = box;
    const overlapsRunway = centerX + width / 2 > runTutorialX
      && centerX - width / 2 < firstRunJumpX;
    return overlapsRunway && !['ground', 'ground2'].includes(kind);
  });
  assert.deepEqual(blockers, []);
});

test('Penne Ridge demonstrates a moving platform before using one over sauce', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const safeMover = level.movers.find((mover) => mover.safe);
  const sauceMover = level.movers.find((mover) => mover.hazard);
  assert.ok(safeMover);
  assert.ok(sauceMover);
  assert.ok(safeMover.sourceX < sauceMover.sourceX);
});

test('Penne Ridge checkpoint precedes its longest combined sequence', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const checkpointX = level.checkpoint[0];
  const beforeCheckpoint = level.requiredJumps.filter(
    (jump) => jump.takeoffX < checkpointX,
  );
  const afterCheckpoint = level.requiredJumps.filter(
    (jump) => jump.takeoffX > checkpointX,
  );
  assert.ok(afterCheckpoint.length > beforeCheckpoint.length);
  assert.ok(level.goal[0] - checkpointX > checkpointX - level.spawn[0]);
});

test('each course has one exact prompt for every relevant World 1 control', () => {
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    assert.deepEqual(
      level.tutorials.map((tutorial) => tutorial.text).sort(),
      [...TUTORIAL_COPY].sort(),
    );
  }
});

test('tutorial prompts emit once per course when crossed', () => {
  const messages = [];
  const session = {
    player: { pos: { x: 999 } },
    level: {
      tutorials: TUTORIAL_COPY.map((text, index) => ({
        id: String(index),
        text,
        x: index,
      })),
    },
    shownTutorials: new Set(),
    emit(event, message) {
      if (event === 'msg') messages.push(message);
    },
  };

  GameSession.prototype.updateTutorials.call(session);
  GameSession.prototype.updateTutorials.call(session);

  assert.deepEqual(messages, TUTORIAL_COPY);
});
