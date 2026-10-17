import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOTION } from '../../js/gameplay/player-motion.js';
import { RELEASED_LEVELS, RELEASED_WORLDS, buildReleasedLevel } from '../../js/levels/index.js';
import { validateLevelDefinition } from '../../js/levels/validate.js';
import { difficultyProfile } from '../helpers/course-difficulty.js';
import { analyzeRequiredJumps, measureJumpCapabilities } from '../helpers/motion-simulation.js';

const compiled = new Map(RELEASED_LEVELS.map((definition) => [definition.id, buildReleasedLevel(definition)]));
const profiles = new Map([...compiled].map(([id, level]) => [id, difficultyProfile(level)]));
const NEW_COURSES = ['2-3', '3-1', '3-2'];
const GROUND_KINDS = new Set(['ground', 'ground2']);

const topAt = (level, x) => level.boxes.filter(([cx, , , w]) => x >= cx - w / 2 && x <= cx + w / 2)
  .map(([, cy, , , h]) => cy + h / 2);

test('Taco Territory is a released world with two courses, Sushi Shores has three', () => {
  const byWorld = (n) => RELEASED_LEVELS.filter(({ world }) => world === n).map(({ id }) => id);
  assert.deepEqual(byWorld(1), ['1-1', '1-2']);
  assert.deepEqual(byWorld(2), ['2-1', '2-2', '2-3']);
  assert.deepEqual(byWorld(3), ['3-1', '3-2']);
  const taco = RELEASED_WORLDS.find(({ n }) => n === 3);
  assert.equal(taco.name, 'Taco Territory');
  assert.equal(taco.theme, 'taco');
  assert.deepEqual(RELEASED_LEVELS.slice(4).map(({ name }) => name), [
    'Sashimi Summit', 'Tortilla Trail', 'Habanero Heights',
  ]);
});

test('new courses validate and every required jump is reachable with a 0.5 margin', () => {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  for (const id of NEW_COURSES) {
    const definition = RELEASED_LEVELS.find((level) => level.id === id);
    assert.deepEqual(validateLevelDefinition(definition), [], id);
    const report = analyzeRequiredJumps(compiled.get(id), capabilities);
    assert.ok(report.analyzed.length >= 14, `${id} needs a real jump sequence`);
    assert.deepEqual(report.unreachable.map(({ id: jump, reason }) => `${jump}: ${reason}`), []);
  }
});

test('every fixed takeoff stands on authored ground, so no jump starts in midair', () => {
  for (const id of NEW_COURSES) {
    const level = compiled.get(id);
    for (const jump of level.requiredJumps) {
      if (jump.transfer === 'exit' && jump.movingPlatform) continue;
      if (jump.transfer === 'step') continue;
      // plats flowing straight into pillars: the compiler records the pillar entry
      // from ground level, but the chef really leaves from the last floating platform.
      const previousKind = RELEASED_LEVELS.find((definition) => definition.id === id)
        .segs[jump.sourceIndex - 1]?.[0];
      if (jump.transfer === 'enter' && jump.kind === 'pillars' && previousKind === 'plats') continue;
      const tops = topAt(level, jump.takeoffX - 0.05);
      assert.ok(
        tops.some((top) => Math.abs(top - jump.takeoffY) < 0.011),
        `${id} ${jump.id} takes off from nothing at x=${jump.takeoffX}`,
      );
    }
  }
});

test('ground enemies and shooters stand on ground, with room to stomp them', () => {
  for (const id of NEW_COURSES) {
    const level = compiled.get(id);
    for (const enemy of level.enemies.filter(({ t }) => t !== 'flyer')) {
      const tops = topAt(level, enemy.p[0]);
      assert.ok(
        tops.some((top) => Math.abs(top + 0.4 - enemy.p[1]) < 0.011),
        `${id} ${enemy.t} at x=${enemy.p[0]} floats or is buried`,
      );
    }
  }
});

test('each new course gives the clock enough time and a checkpoint before the final stretch', () => {
  for (const id of NEW_COURSES) {
    const level = compiled.get(id);
    assert.ok(level.time >= level.length * 1.2, `${id} timer is too tight`);
    assert.ok(level.checkpoint, `${id} needs a checkpoint`);
    const jumpsAfter = level.requiredJumps.filter((jump) => jump.takeoffX > level.checkpoint[0]);
    assert.ok(jumpsAfter.length >= level.requiredJumps.length / 2, `${id} checkpoint comes too late`);
    assert.ok(level.checkpoint[0] > level.length * 0.25, `${id} checkpoint comes too early`);
  }
});

test('hazard moving platforms stay within a boardable period range', () => {
  for (const [id, level] of compiled) {
    for (const mover of level.movers.filter(({ hazard }) => hazard)) {
      assert.ok(mover.period >= 2.5 && mover.period <= 6, `${id} mover period ${mover.period}`);
    }
  }
});

test('difficulty rises within every world and peaks in 3-2', () => {
  const score = (id) => profiles.get(id).score;
  assert.ok(score('1-1') < score('1-2'));
  assert.ok(score('2-3') > score('2-1') && score('2-3') > score('2-2'));
  assert.ok(score('3-1') < score('3-2'));
  assert.ok(score('3-1') > score('2-2'), 'World 3 opens harder than the previous world mid-point');
  const max = Math.max(...[...profiles.values()].map(({ score: s }) => s));
  assert.equal(score('3-2'), max);
  assert.equal(Math.min(...[...profiles.values()].map(({ score: s }) => s)), score('1-1'));
});

test('1-1 stays friendly: no moving platforms, no tight landings, the widest margins', () => {
  const first = profiles.get('1-1');
  assert.equal(first.hazardMovers, 0);
  assert.equal(first.tightJumps, 0);
  assert.equal(first.combos, 0);
  assert.ok(first.safeRatio > 0.8);
  for (const [id, profile] of profiles) {
    if (id !== '1-1') assert.ok(profile.safeRatio < first.safeRatio, `${id} should have fewer safe spots`);
  }
});

test('later courses tighten jumps, timing, safe spots, and enemy combos', () => {
  const early = profiles.get('1-2');
  const sashimi = profiles.get('2-3');
  const habanero = profiles.get('3-2');
  assert.ok(sashimi.minMargin < early.minMargin);
  assert.ok(habanero.minMargin < sashimi.minMargin);
  assert.ok(habanero.minMoverPeriod < sashimi.minMoverPeriod);
  assert.ok(sashimi.minMoverPeriod < early.minMoverPeriod);
  assert.ok(habanero.safeRatio < sashimi.safeRatio && sashimi.safeRatio < early.safeRatio);
  assert.ok(habanero.runJumps > sashimi.runJumps);
  for (const id of NEW_COURSES) assert.ok(profiles.get(id).combos >= 2, `${id} needs enemy combos`);
  for (const id of ['1-1', '1-2', '2-1', '2-2']) assert.equal(profiles.get(id).combos, 0);
});

test('the hardest jump ever demanded never exceeds measured run reach minus the margin', () => {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  for (const id of NEW_COURSES) {
    for (const jump of compiled.get(id).requiredJumps.filter(({ movingPlatform }) => !movingPlatform)) {
      const reach = jump.requiresRun ? capabilities.run : capabilities.walk;
      assert.ok(jump.gap <= reach - 0.5, `${id} ${jump.id} gap ${jump.gap} vs reach ${reach}`);
    }
  }
});
