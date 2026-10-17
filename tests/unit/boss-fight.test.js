import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_LINES,
  BOSS_PHASES,
  bossArenaBounds,
  bossPhaseFor,
  createBossFight,
  stepBossFight,
} from '../../js/gameplay/boss-fight.js';
import { updateBoss } from '../../js/gameplay/boss.js';
import * as gameplay from '../../js/gameplay/course-simulation.js';
import { coursePlayerWorld } from '../../js/gameplay/course-world.js';
import { applyPlayerInput } from '../../js/gameplay/player-state.js';
import { GameSession } from '../../js/core/game-session.js';
import { compileLevel } from '../../js/levels/compiler.js';
import { THEMES } from '../../js/levels/themes.js';
import { RELEASED_LEVELS, buildReleasedLevel } from '../../js/levels/index.js';

const STEP = 1 / 60;
const DEFINITION = { p: [30, 2, 0], hp: 6, arena: [23, 0, 0, 38, 10] };

function fighter(overrides = {}) {
  return { id: 'p1', x: 10, y: 0, vy: 0, width: 0.8, height: 1.55, ...overrides };
}

function runUntil(fight, predicate, fighters = [fighter()], maxSteps = 6000) {
  const modes = [];
  for (let step = 0; step < maxSteps; step += 1) {
    if (predicate(fight)) return modes;
    stepBossFight(fight, typeof fighters === 'function' ? fighters(fight) : fighters, STEP);
    if (modes.at(-1)?.mode !== fight.mode) modes.push({ mode: fight.mode, attack: fight.attack, duration: fight.duration });
  }
  throw new Error(`fight never reached the expected state, last mode ${fight.mode}`);
}

// Parks the fight in its dizzy window, then stomps it from above.
function stompOnce(fight) {
  runUntil(fight, (state) => state.mode === 'tired', [fighter({ x: 4 })]);
  return stepBossFight(fight, [fighter({ x: fight.positionX, y: fight.positionY + 1.2, vy: -6 })], STEP);
}

function sameSideFighter(fight) {
  const bounds = bossArenaBounds(fight);
  // Stand in the wall pocket on the side away from him, out of every reach
  // except shockwaves and spores.
  return fighter({ x: fight.positionX > bounds.centerX ? bounds.centerX - 19.5 : bounds.centerX + 19.5, y: 5 });
}

test('Don Funghi sleeps until a chef steps into the arena, then plays a harmless intro', () => {
  const fight = createBossFight(DEFINITION);
  stepBossFight(fight, [fighter({ x: 2 })], STEP);
  assert.equal(fight.mode, 'sleep');

  stepBossFight(fight, [fighter({ x: 8 })], STEP);
  assert.equal(fight.mode, 'intro');
  assert.equal(fight.line, 'intro');
  assert.equal(fight.lineRevision, 1);

  const contacts = stepBossFight(fight, [fighter({ x: fight.positionX, y: 0.5 })], STEP);
  assert.deepEqual(contacts, [], 'touching him during the intro does nothing');
});

test('every attack is telegraphed by a wind-up of at least 0.65 s', () => {
  const fight = createBossFight(DEFINITION);
  stepBossFight(fight, [fighter({ x: 8 })], STEP);
  const modes = runUntil(
    fight,
    (state) => state.phase === 3 && state.attackIndex >= 4 && state.mode === 'idle',
    (state) => {
      // Land a stomp on dizzy windows until phase 3, so the fight walks
      // every attack in every phase.
      if (state.hp > 2 && state.mode === 'tired' && state.timer < state.duration - 0.5) {
        return [fighter({ x: state.positionX, y: state.positionY + 1.2, vy: -6 })];
      }
      return [sameSideFighter(state)];
    },
    40_000,
  );
  const attacks = new Set(['charge', 'leap', 'taunt']);
  let seen = 0;
  for (let index = 0; index < modes.length; index += 1) {
    if (!attacks.has(modes[index].mode)) continue;
    seen += 1;
    assert.equal(modes[index - 1].mode, 'windup', `${modes[index].mode} without a wind-up`);
    assert.ok(modes[index - 1].duration >= 0.65);
  }
  assert.ok(seen >= 5);
  assert.deepEqual(
    [...new Set(modes.map(({ attack }) => attack).filter(Boolean))].sort(),
    ['charge', 'slam', 'spores'],
  );
});

test('pressure rises each phase but the dizzy window stays fair', () => {
  for (let index = 1; index < BOSS_PHASES.length; index += 1) {
    const before = BOSS_PHASES[index - 1];
    const after = BOSS_PHASES[index];
    assert.ok(after.windup < before.windup);
    assert.ok(after.idle < before.idle);
    assert.ok(after.chargeSpeed > before.chargeSpeed);
    assert.ok(after.pattern.length > before.pattern.length);
  }
  for (const phase of BOSS_PHASES) {
    assert.ok(phase.tired >= 1.8);
    assert.ok(phase.windup >= 0.65);
  }
  const fight = createBossFight(DEFINITION);
  assert.deepEqual([6, 5, 4, 3, 2, 1].map((hp) => bossPhaseFor(fight, hp)), [1, 1, 2, 2, 3, 3]);
});

test('a stomp only lands in the dizzy window; his cap bounces you otherwise', () => {
  const fight = createBossFight(DEFINITION);
  runUntil(fight, (state) => state.mode === 'idle', [fighter({ x: 8 })]);
  const bounce = stepBossFight(fight, [fighter({ x: fight.positionX, y: fight.positionY + 1.2, vy: -6 })], STEP);
  assert.deepEqual(bounce, [{ id: 'p1', kind: 'bounce', velocityY: 11 }]);
  assert.equal(fight.hp, 6);

  const stomp = stompOnce(fight);
  assert.deepEqual(stomp, [{ id: 'p1', kind: 'stomp', velocityY: 13 }]);
  assert.equal(fight.hp, 5);
  assert.equal(fight.mode, 'hurt');
  assert.equal(fight.hitRevision, 1);
  assert.equal(fight.line, 'hit1');

  const during = stepBossFight(fight, [fighter({ x: fight.positionX, y: fight.positionY })], STEP);
  assert.deepEqual(during, [], 'no damage either way while he is staggered');
});

test('touching him outside the dizzy window hurts and knocks the chef away', () => {
  const fight = createBossFight(DEFINITION);
  runUntil(fight, (state) => state.mode === 'charge', [fighter({ x: 8 })]);
  const contacts = stepBossFight(fight, [fighter({ x: fight.positionX - 1.5, y: 0.2 })], STEP);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].kind, 'hurt');
  assert.equal(contacts[0].knockbackX, -5.5);
  assert.equal(contacts[0].velocityY, 6);

  const shielded = stepBossFight(fight, [fighter({ x: fight.positionX - 1.5, y: 0.2, shielded: true })], STEP);
  assert.deepEqual(shielded, []);
});

test('phases change on schedule with his lines, and six stomps beat him', () => {
  const fight = createBossFight(DEFINITION);
  const lines = [];
  const phases = [];
  let lastLine = 0;
  const record = () => {
    if (fight.lineRevision !== lastLine) {
      lastLine = fight.lineRevision;
      lines.push(fight.line);
    }
  };
  stepBossFight(fight, [fighter({ x: 8 })], STEP);
  record();
  for (let hit = 0; hit < 6; hit += 1) {
    runUntil(fight, (state) => state.mode === 'tired', (state) => [sameSideFighter(state)], 40_000);
    stepBossFight(fight, [fighter({ x: fight.positionX, y: fight.positionY + 1.2, vy: -6 })], STEP);
    record();
    if (fight.mode === 'hurt') {
      runUntil(fight, (state) => state.mode !== 'hurt', (state) => [sameSideFighter(state)]);
      record();
    }
    phases.push(fight.phase);
  }
  assert.deepEqual(phases, [1, 2, 2, 3, 3, 3]);
  assert.deepEqual(lines, ['intro', 'hit1', 'phase2', 'hit2', 'phase3', 'defeat']);
  assert.equal(fight.mode, 'defeated');
  for (const line of Object.values(BOSS_LINES)) {
    assert.ok(line.split(/\s+/).length <= 15, `line too long: ${line}`);
    assert.doesNotMatch(line, /—/, 'no em dashes');
  }
  runUntil(fight, (state) => state.mode === 'done', []);
  assert.equal(fight.awake, false);
});

test('a phase 2 slam sends shockwaves both ways that a jump clears', () => {
  const fight = createBossFight(DEFINITION);
  fight.hp = 3;
  assert.equal(bossPhaseFor(fight), 2);
  fight.phase = 2;
  fight.pendingPhase = 2;
  runUntil(fight, (state) => state.mode === 'leap', [fighter({ x: 8 })]);
  runUntil(fight, (state) => state.mode !== 'leap', [fighter({ x: 8, y: 8 })]);
  assert.equal(fight.mode, 'tired');
  const waves = fight.hazards.filter(({ kind }) => kind === 'wave');
  assert.equal(waves.length, 2);
  assert.deepEqual(waves.map(({ velocityX }) => Math.sign(velocityX)).sort(), [-1, 1]);

  for (let step = 0; step < 15; step += 1) stepBossFight(fight, [fighter({ x: 40, y: 8 })], STEP);
  const wave = fight.hazards.find(({ velocityX }) => velocityX < 0);
  assert.ok(fight.positionX - wave.positionX > 3);
  const jumping = stepBossFight(fight, [fighter({ x: wave.positionX - 0.3, y: 1.2 })], STEP);
  assert.equal(jumping.filter(({ kind }) => kind === 'hurt').length, 0, 'a chef above the wave is safe');
  const standing = stepBossFight(fight, [fighter({ x: wave.positionX - 0.3, y: 0 })], STEP);
  assert.equal(standing.filter(({ kind }) => kind === 'hurt').length, 1);
});

test('spores show their landing marks for over a second before they fall', () => {
  const fight = createBossFight(DEFINITION);
  fight.hp = 2;
  fight.phase = 3;
  fight.pendingPhase = 3;
  fight.attackIndex = 1;
  runUntil(fight, (state) => state.mode === 'windup', [fighter({ x: 8 })]);
  assert.equal(fight.attack, 'spores');
  const spores = fight.hazards.filter(({ kind }) => kind === 'spore');
  assert.equal(spores.length, 4);
  assert.ok(spores.every(({ state, timer }) => state === 'warn' && timer >= 1));
  const xs = spores.map(({ positionX }) => positionX).sort((a, b) => a - b);
  for (let index = 1; index < xs.length; index += 1) {
    assert.ok(xs[index] - xs[index - 1] >= 2.9, 'safe gaps between spores');
  }
});

test('the 3-3 finale is Don Funghi, reachable over a low arena step', () => {
  const definition = RELEASED_LEVELS.find(({ id }) => id === '3-3');
  assert.equal(definition.world, 3);
  assert.equal(definition.segs.at(-1)[0], 'boss');
  const level = buildReleasedLevel(definition);
  assert.equal(level.goal, null);
  assert.equal(level.boss.hp, 6);
  assert.ok(level.checkpoint[0] < level.boss.arena[0] - level.boss.arena[3] / 2);
  const entry = level.boxes.find(([x, , , , , , kind]) => kind === 'brick' && x < level.boss.arena[0]);
  assert.ok(entry[1] + entry[4] / 2 - level.boss.arena[1] <= 1.6, 'the arena entrance is one jump high');
});

// Arena-only course so the lockstep test exercises nothing but the boss.
function arenaLevel() {
  const level = compileLevel({ id: '9-9', world: 9, idx: 9, name: 'Arena', theme: 'taco', time: 600, segs: [['run', 6], ['boss', 0]] }, THEMES.taco);
  return { ...level, coins: [], items: [], killY: -9 };
}

// A deterministic chef who dodges what it can and stomps every dizzy window.
function botInput(fight, player, bounds) {
  const x = player.positionX;
  const grounded = player.grounded;
  if (!fight || !fight.awake) return { axis: 1, running: true, jumpPressed: grounded && x > 3.5 && x < 6.5 };
  if (fight.mode === 'tired') {
    const dx = fight.positionX - x;
    const jump = grounded && Math.abs(dx) < 3.2;
    return { axis: Math.abs(dx) < 0.4 && !grounded ? 0 : Math.sign(dx), running: true, jumpPressed: jump, jumpHeld: true };
  }
  const pocket = x < bounds.centerX ? bounds.centerX - 19.5 : bounds.centerX + 19.5;
  const threat = fight.hazards.some((hazard) => hazard.kind === 'wave'
    && Math.abs(hazard.positionX - x) < 2.4
    && Math.sign(hazard.velocityX) === Math.sign(x - hazard.positionX));
  return {
    axis: Math.abs(pocket - x) < 0.3 ? 0 : Math.sign(pocket - x),
    running: true,
    jumpPressed: threat && grounded,
    jumpHeld: true,
  };
}

test('solo and the co-op server stay in lockstep through the whole fight, and it is beatable', () => {
  const level = arenaLevel();
  const server = gameplay.createCourseSimulation({ level, seed: 'boss-lockstep', players: [{ playerId: 'solo', characterId: 'fatsio' }] });
  server.players.solo.hearts = 99;

  // Solo side: the real boss.js adapter and the real GameSession.hurt, with a
  // chef moved by the same player motion the server uses.
  const events = [];
  let completed = 0;
  let soloState = { ...server.players.solo };
  const context = {
    bossState: { fight: createBossFight(level.boss), hp: level.boss.hp },
    player: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, w: 0.8, h: 1.55, grounded: false },
    power: null,
    invuln: 0,
    hearts: 99,
    randomState: server.randomState,
    emit: (type, data) => events.push([type, data]),
    burst() {},
    die() { throw new Error('solo chef died'); },
    complete: () => { completed += 1; },
  };
  context.player.pos.clone = () => ({ setY: () => ({}) });
  const world = server.world;
  const bounds = bossArenaBounds(server.boss);

  let ticks = 0;
  for (; ticks < 60 * 300 && server.phase === 'playing'; ticks += 1) {
    const input = botInput(server.boss, server.players.solo, bounds);
    gameplay.stepCourseSimulation(server, { solo: input }, STEP);

    // Solo step in GameSession order: movement, invulnerability, then boss.
    soloState = applyPlayerInput(soloState, input, coursePlayerWorld(world, soloState), STEP);
    Object.assign(context.player, { grounded: soloState.grounded });
    context.player.pos.x = soloState.positionX;
    context.player.pos.y = soloState.positionY;
    context.player.vel.x = soloState.velocityX;
    context.player.vel.y = soloState.velocityY;
    context.invuln = Math.max(0, context.invuln - STEP);
    context.hurt = (from) => GameSession.prototype.hurt.call(context, from);
    updateBoss(context, STEP);
    soloState = {
      ...soloState,
      velocityX: context.player.vel.x,
      velocityY: context.player.vel.y,
      grounded: context.player.grounded,
    };

    const serverPlayer = server.players.solo;
    const soloFight = context.bossState.fight;
    if (server.phase === 'playing' || soloFight.mode !== 'done') {
      assert.deepEqual(soloFight, server.boss, `fight diverged at tick ${ticks}`);
    }
    assert.ok(Math.abs(soloState.positionX - serverPlayer.positionX) < 1e-9, `chef x diverged at tick ${ticks}`);
    assert.ok(Math.abs(soloState.velocityY - serverPlayer.velocityY) < 1e-9, `chef vy diverged at tick ${ticks}`);
    assert.equal(context.hearts, serverPlayer.hearts, `hearts diverged at tick ${ticks}`);
  }

  assert.equal(server.phase, 'completed');
  assert.equal(server.completion.levelId, '9-9');
  assert.equal(completed, 1);
  assert.ok(ticks < 60 * 180, `fight took ${ticks / 60} s`);
  assert.ok(events.some(([type]) => type === 'bossShow'));
  assert.equal(events.filter(([type]) => type === 'bossHp').length, 6);
});

test('the boss fight snapshot serializes and replays deterministically', () => {
  const level = buildReleasedLevel(RELEASED_LEVELS.find(({ id }) => id === '3-3'));
  const options = { level, seed: 'boss-replay', players: [{ playerId: 'p1', characterId: 'fatsio' }, { playerId: 'p2', characterId: 'chefno' }] };
  const first = gameplay.createCourseSimulation(options);
  const second = gameplay.createCourseSimulation(options);
  for (const state of [first, second]) {
    for (const player of Object.values(state.players)) {
      player.positionX = level.boss.arena[0] - 12;
      player.positionY = level.boss.arena[1];
      player.invulnerabilitySeconds = 600;
    }
  }
  for (let tick = 0; tick < 60 * 40; tick += 1) {
    const inputs = { p1: { axis: tick % 240 < 120 ? 1 : -1 }, p2: { axis: tick % 180 < 90 ? -1 : 1, jumpPressed: tick % 50 === 0 } };
    gameplay.stepCourseSimulation(first, inputs, STEP);
    gameplay.stepCourseSimulation(second, inputs, STEP);
  }
  const snapshot = gameplay.createCourseSnapshot(first);
  assert.equal(snapshot.boss.awake, true);
  assert.ok(snapshot.boss.attackIndex > 2);
  assert.deepEqual(snapshot, gameplay.createCourseSnapshot(second));
  assert.doesNotThrow(() => JSON.stringify(snapshot));
});
