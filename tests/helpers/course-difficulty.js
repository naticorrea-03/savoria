import { DEFAULT_MOTION } from '../../js/gameplay/player-motion.js';
import { analyzeRequiredJumps, measureJumpCapabilities } from './motion-simulation.js';

const ENEMY_WEIGHT = { meatball: 1, flyer: 1.5, shooter: 2 };
const COMBO_RADIUS = 7;

// Plain-number difficulty profile of a compiled course. Weights are arbitrary
// but fixed, so the curve test catches a hard course that gets easier by accident.
export function difficultyProfile(level) {
  const capabilities = measureJumpCapabilities(DEFAULT_MOTION);
  const { analyzed } = analyzeRequiredJumps(level, capabilities);
  const hazardJumps = analyzed.filter((jump) => jump.hazard);
  const runJumps = analyzed.filter((jump) => jump.requiresRun);
  const hazardMovers = level.movers.filter((mover) => mover.hazard);
  const minMoverPeriod = hazardMovers.length
    ? Math.min(...hazardMovers.map((mover) => mover.period))
    : Infinity;

  const enemyScore = level.enemies.reduce((total, enemy) => total + (ENEMY_WEIGHT[enemy.t] ?? 1), 0);
  // A combo is two or more enemies within COMBO_RADIUS of each other.
  let combos = 0;
  for (let i = 0; i < level.enemies.length; i += 1) {
    for (let j = i + 1; j < level.enemies.length; j += 1) {
      if (Math.abs(level.enemies[i].p[0] - level.enemies[j].p[0]) <= COMBO_RADIUS) combos += 1;
    }
  }

  const tightJumps = analyzed.filter((jump) => jump.landingMargin < 1.5).length;
  const safeLength = level.boxes
    .filter(([, , , , , , kind]) => kind === 'ground' || kind === 'ground2')
    .reduce((total, box) => total + box[3], 0);
  const hazardPer100 = (hazardJumps.length / level.length) * 100;

  const score = hazardJumps.length
    + runJumps.length
    + tightJumps * 1.5
    + hazardMovers.length * 3
    + (Number.isFinite(minMoverPeriod) && minMoverPeriod < 4 ? 3 : 0)
    + enemyScore
    + combos * 2
    // A boss is the course's main challenge: two points per hit it takes.
    + (level.boss ? level.boss.hp * 2 : 0);

  return {
    score,
    hazardJumps: hazardJumps.length,
    runJumps: runJumps.length,
    tightJumps,
    hazardMovers: hazardMovers.length,
    minMoverPeriod,
    enemyScore,
    combos,
    hazardPer100,
    safeRatio: safeLength / level.length,
    minMargin: Math.min(...analyzed.map((jump) => jump.landingMargin)),
    length: level.length,
  };
}
