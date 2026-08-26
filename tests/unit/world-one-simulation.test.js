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
    assert.ok(report.analyzed.every((jump) => jump.landingMargin >= 0.5));
  }
});

test('compiled transfers cover every mandatory World 1 jump boundary', () => {
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    for (const [sourceIndex, [kind, size, opts = {}]] of definition.segs.entries()) {
      let expected = 0;
      if (kind === 'gap') expected = opts.mover ? 2 : 1;
      if (kind === 'steps') expected = size;
      if (kind === 'river') expected = Math.max(1, Math.round(size / 5)) + 1;
      if (kind === 'pillars') expected = size + 1;
      if (expected === 0) continue;
      assert.equal(
        level.requiredJumps.filter((jump) => jump.sourceIndex === sourceIndex).length,
        expected,
        `${definition.id} segment ${sourceIndex} ${kind}`,
      );
    }
  }
});

test('every fixed landing maps to an authored collision surface', () => {
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    for (const jump of level.requiredJumps) {
      if (jump.landingX === null) continue;
      const sampleX = jump.landingX + 0.05;
      const landing = level.boxes.find((box) => {
        const [centerX, centerY, , width, height] = box;
        return sampleX >= centerX - width / 2
          && sampleX <= centerX + width / 2
          && Math.abs(centerY + height / 2 - jump.landingY) < 0.01;
      });
      assert.ok(landing, `${definition.id} ${jump.id} has no landing surface`);
    }
  }
});

test('Penne Ridge includes the final pillar-to-ground transfer', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const pillarSource = RELEASED_LEVELS[1].segs.findIndex(
    ([kind]) => kind === 'pillars',
  );
  const transfers = level.requiredJumps.filter(
    (jump) => jump.sourceIndex === pillarSource,
  );
  assert.equal(transfers.at(-1).transfer, 'exit');
  assert.equal(transfers.at(-1).landingX, 130.6);
});

test('vertical rise mutations fail the deterministic jump trajectory', () => {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const step = level.requiredJumps.find((jump) => jump.kind === 'steps');
  const mutated = {
    ...level,
    requiredJumps: level.requiredJumps.map((jump) => (
      jump.id === step.id ? { ...jump, rise: 3.5 } : jump
    )),
  };
  const report = analyzeRequiredJumps(mutated, capabilities);
  assert.equal(report.unreachable.some((jump) => jump.id === step.id), true);
});

test('unsafe mover phases fail with actual width, range, and period', () => {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  const level = buildReleasedLevel(RELEASED_LEVELS[1]);
  const board = level.requiredJumps.find(
    (jump) => jump.movingPlatform && jump.hazard && jump.transfer === 'board',
  );
  const mutatedBoard = {
    ...board,
    mover: { ...board.mover, travel: board.mover.travel + 8 },
  };
  const mutated = {
    ...level,
    requiredJumps: level.requiredJumps.map((jump) => (
      jump.id === board.id ? mutatedBoard : jump
    )),
  };
  const report = analyzeRequiredJumps(mutated, capabilities);
  const failure = report.unreachable.find((jump) => jump.id === board.id);
  assert.ok(failure);
  assert.ok(Number.isFinite(failure.worstPhase));

  const invalidTiming = {
    ...mutated,
    requiredJumps: mutated.requiredJumps.map((jump) => (
      jump.id === board.id
        ? { ...board, mover: { ...board.mover, period: 0 } }
        : jump
    )),
  };
  assert.equal(
    analyzeRequiredJumps(invalidTiming, capabilities).unreachable
      .some((jump) => jump.id === board.id),
    true,
  );
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

function createTutorialSession(level) {
  const messages = [];
  return {
    messages,
    player: {
      pos: {
        x: -1,
        y: 0,
        set(x, y) { this.x = x; this.y = y; },
      },
      vel: { set() {} },
      grounded: true,
      coyote: 0,
      groundMover: null,
    },
    level,
    shownTutorials: new Set(),
    passedCheckpoint: false,
    input: { clearTransient() {} },
    invuln: 0,
    emit(event, message) {
      if (event === 'msg') messages.push(message);
    },
  };
}

function crossTutorialsSequentially(session) {
  for (const tutorial of session.level.tutorials) {
    session.player.pos.x = tutorial.x - 0.01;
    GameSession.prototype.updateTutorials.call(session);
    session.player.pos.x = tutorial.x;
    GameSession.prototype.updateTutorials.call(session);
    GameSession.prototype.updateTutorials.call(session);
  }
}

test('jump prompts emit on safe ground before takeoff', () => {
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    const session = createTutorialSession(level);
    const jump = level.tutorials.find((tutorial) => tutorial.id === 'jump');
    const firstTransfer = level.requiredJumps[0];

    session.player.pos.x = jump.x;
    GameSession.prototype.updateTutorials.call(session);

    assert.equal(session.messages.at(-1), 'Jump');
    assert.ok(jump.x <= firstTransfer.takeoffX - 4);
    assert.ok(level.boxes.some((box) => {
      const [centerX, , , width, , , kind] = box;
      return ['ground', 'ground2'].includes(kind)
        && jump.x >= centerX - width / 2
        && jump.x < centerX + width / 2;
    }));
  }
});

test('tutorials cross sequentially, suppress duplicates, and persist through respawn', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[0]);
  const session = createTutorialSession(level);
  const beforeCheckpoint = level.tutorials.filter(
    (tutorial) => tutorial.x < level.checkpoint[0],
  );
  const afterCheckpoint = level.tutorials.filter(
    (tutorial) => tutorial.x > level.checkpoint[0],
  );

  for (const tutorial of beforeCheckpoint) {
    session.player.pos.x = tutorial.x;
    GameSession.prototype.updateTutorials.call(session);
    GameSession.prototype.updateTutorials.call(session);
  }
  session.passedCheckpoint = true;
  GameSession.prototype.respawn.call(session);
  GameSession.prototype.updateTutorials.call(session);
  for (const tutorial of afterCheckpoint) {
    session.player.pos.x = tutorial.x;
    GameSession.prototype.updateTutorials.call(session);
  }

  assert.deepEqual(session.messages, level.tutorials.map(({ text }) => text));
  assert.equal(session.shownTutorials.size, level.tutorials.length);
});

test('a fresh course session emits the tutorial sequence again', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS[0]);
  const first = createTutorialSession(level);
  const second = createTutorialSession(level);
  crossTutorialsSequentially(first);
  crossTutorialsSequentially(second);
  assert.deepEqual(first.messages, level.tutorials.map(({ text }) => text));
  assert.deepEqual(second.messages, first.messages);
});
