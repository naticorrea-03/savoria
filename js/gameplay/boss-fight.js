// Don Funghi's fight rules. Pure data in, pure data out: no THREE, no audio,
// no DOM. Solo (js/gameplay/boss.js) and the co-op server
// (course-simulation.js) both call stepBossFight with the same fixed step, so
// the server stays authoritative and solo plays the exact same fight.
//
// Every attack follows the same beat: a wind-up pose with a ground warning
// marker, then the attack, then (for charge and slam) a dizzy window where a
// stomp lands. Presenters read this state. They never write it.

export const BOSS_NAME = 'Don Funghi';
export const BOSS_TITLE = 'Self-crowned king of every kitchen';

export const BOSS_LINES = Object.freeze({
  intro: 'Taco Territory? Pah! This is Funghi Territory now, and you are the garnish.',
  hit1: 'My cap! Do you know what truffles cost?',
  phase2: 'No more appetizers. Time for the main course!',
  hit2: 'This apron is dry clean only!',
  phase3: 'I am a fun guy, but this is NOT funny anymore!',
  defeat: 'Impossible... I have been... overcooked...',
});

// Pressure rises per phase: shorter rests and wind-ups, faster charges,
// shockwaves from phase 2, spore rain in phase 3. Wind-ups never drop below
// 0.65 s and every dizzy window stays at least 1.8 s, so it is always fair.
export const BOSS_PHASES = Object.freeze([
  Object.freeze({ name: 'Appetizer', pattern: Object.freeze(['charge']), idle: 1.1, windup: 0.95, chargeSpeed: 10, tired: 2.4, waveSpeed: 0, spores: 0 }),
  Object.freeze({ name: 'Main Course', pattern: Object.freeze(['slam', 'charge']), idle: 0.85, windup: 0.8, chargeSpeed: 12, tired: 2.1, waveSpeed: 7, spores: 0 }),
  Object.freeze({ name: 'Dessert', pattern: Object.freeze(['slam', 'spores', 'charge']), idle: 0.6, windup: 0.65, chargeSpeed: 14, tired: 1.8, waveSpeed: 8.5, spores: 4 }),
]);

export const BOSS_TIMING = Object.freeze({
  intro: 3.4,
  chargeRamp: 0.3,
  chargeMax: 3.2,
  leap: 0.75,
  leapHeight: 6,
  hurt: 0.75,
  roar: 1.8,
  defeated: 2.6,
  sporeWarn: 1.05,
  sporeStagger: 0.14,
  sporeDrop: 9,
  sporeSpeed: 15,
  sporeTaunt: 2.1,
});

export const BOSS_BODY = Object.freeze({
  width: 3.2,
  height: 4,
  restOffset: 2,
  tiredDrop: 0.6,
  stompMargin: 0.6,
  stompBounce: 13,
  armorBounce: 11,
  hurtKnockback: 5.5,
  hurtLift: 6,
});

const WAVE = Object.freeze({ width: 1, height: 0.9 });
const SPORE_RADIUS = 0.9;
const HARMLESS = new Set(['sleep', 'intro', 'hurt', 'roar', 'defeated', 'done']);

export function createBossFight(definition) {
  if (!definition) return null;
  const arena = [...definition.arena];
  const groundY = arena[1];
  const hp = Math.max(1, Math.round(Number(definition.hp) || 6));
  return {
    positionX: definition.p[0],
    positionY: groundY + BOSS_BODY.restOffset,
    positionZ: definition.p[2] ?? 0,
    home: [...definition.p],
    arena,
    groundY,
    hp,
    maxHp: hp,
    phase: 1,
    pendingPhase: 1,
    mode: 'sleep',
    timer: 0,
    duration: 0,
    awake: false,
    attack: '',
    attackIndex: 0,
    facing: -1,
    chargeDirection: -1,
    startX: definition.p[0],
    targetX: definition.p[0],
    knockbackX: 0,
    targetPlayerId: null,
    tiredCount: 0,
    line: '',
    lineRevision: 0,
    hitRevision: 0,
    impactRevision: 0,
    hazards: [],
    nextHazardId: 0,
  };
}

export function bossPhaseFor(fight, hp = fight.hp) {
  // Integer thirds, so 6 hp splits 2 / 2 / 2 with no float edge cases.
  if (hp * 3 > fight.maxHp * 2) return 1;
  if (hp * 3 > fight.maxHp) return 2;
  return 3;
}

export function bossPhaseConfig(fight, phase = fight.phase) {
  return BOSS_PHASES[Math.min(BOSS_PHASES.length, Math.max(1, phase)) - 1];
}

export function bossIsHarmless(fight) {
  return !fight || HARMLESS.has(fight.mode);
}

export function bossArenaBounds(fight) {
  const [centerX, , , width] = fight.arena;
  const half = width / 2;
  return {
    centerX,
    half,
    // Where a charge stops and a slam may land. Leaves a pocket by each wall.
    minX: centerX - half + 3,
    maxX: centerX + half - 3,
    // Shockwaves roll until the arena walls.
    waveMinX: centerX - half - 2,
    waveMaxX: centerX + half + 2,
  };
}

// fighters: [{ id, x, y (feet), vy, width, height, shielded, invulnerable, active }]
// random: () => number in [0, 1), seeded by the caller.
// Returns contacts for the caller to apply to its own player model:
//   { id, kind: 'stomp' | 'bounce', velocityY }
//   { id, kind: 'hurt', fromX, knockbackX, velocityY }
export function stepBossFight(fight, fighters, seconds, random = () => 0.5) {
  const contacts = [];
  if (!fight || fight.mode === 'done') return contacts;
  const active = fighters
    .filter((fighter) => fighter && fighter.active !== false)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const bounds = bossArenaBounds(fight);

  if (fight.mode === 'sleep') {
    const challenger = active.find((fighter) => Math.abs(fighter.x - bounds.centerX) < bounds.half - 2);
    if (challenger) {
      fight.awake = true;
      fight.facing = Math.sign(challenger.x - fight.positionX) || -1;
      enter(fight, 'intro', BOSS_TIMING.intro);
      say(fight, 'intro');
    }
    return contacts;
  }

  fight.timer -= seconds;
  updateHazards(fight, active, seconds, contacts, bounds);
  const config = bossPhaseConfig(fight);
  const restY = fight.groundY + BOSS_BODY.restOffset;

  switch (fight.mode) {
    case 'intro':
      fight.positionY = restY;
      if (fight.timer <= 0) enter(fight, 'idle', config.idle);
      break;
    case 'idle':
      fight.positionY = restY;
      faceNearest(fight, active);
      if (fight.timer <= 0) beginWindup(fight, active, config, bounds, random);
      break;
    case 'windup':
      if (fight.timer <= 0) beginAttack(fight);
      break;
    case 'charge': {
      const elapsed = fight.duration - fight.timer;
      const ramp = Math.min(1, elapsed / BOSS_TIMING.chargeRamp);
      fight.positionX += fight.chargeDirection * config.chargeSpeed * ramp * ramp * seconds;
      const stopX = fight.chargeDirection > 0 ? bounds.maxX : bounds.minX;
      if ((fight.positionX - stopX) * fight.chargeDirection >= 0 || fight.timer <= 0) {
        fight.positionX = clamp(fight.positionX, bounds.minX, bounds.maxX);
        fight.impactRevision += 1;
        enterTired(fight, config);
      }
      break;
    }
    case 'leap': {
      const progress = 1 - Math.max(0, fight.timer) / fight.duration;
      const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
      fight.positionX = fight.startX + (fight.targetX - fight.startX) * eased;
      fight.positionY = restY + 4 * BOSS_TIMING.leapHeight * progress * (1 - progress);
      if (fight.timer <= 0) {
        fight.positionX = fight.targetX;
        fight.positionY = restY;
        fight.impactRevision += 1;
        if (config.waveSpeed > 0) {
          const offset = BOSS_BODY.width / 2;
          spawnHazard(fight, { kind: 'wave', positionX: fight.positionX - offset, velocityX: -config.waveSpeed });
          spawnHazard(fight, { kind: 'wave', positionX: fight.positionX + offset, velocityX: config.waveSpeed });
        }
        enterTired(fight, config);
      }
      break;
    }
    case 'taunt':
      fight.positionY = restY;
      if (fight.timer <= 0) enter(fight, 'idle', config.idle);
      break;
    case 'tired':
      fight.positionY = restY - BOSS_BODY.tiredDrop;
      if (fight.timer <= 0) enter(fight, 'idle', config.idle);
      break;
    case 'hurt': {
      const progress = 1 - Math.max(0, fight.timer) / fight.duration;
      fight.positionX = clamp(
        fight.positionX + fight.knockbackX * seconds,
        bounds.minX,
        bounds.maxX,
      );
      fight.knockbackX *= Math.exp(-6 * seconds);
      fight.positionY = restY + Math.sin(Math.PI * progress) * 1.1;
      if (fight.timer <= 0) {
        fight.positionY = restY;
        fight.knockbackX = 0;
        if (fight.pendingPhase !== fight.phase) {
          fight.phase = fight.pendingPhase;
          fight.attackIndex = 0;
          fight.hazards = [];
          enter(fight, 'roar', BOSS_TIMING.roar);
          say(fight, `phase${fight.phase}`);
        } else {
          enter(fight, 'idle', bossPhaseConfig(fight).idle);
        }
      }
      break;
    }
    case 'roar':
      fight.positionY = restY;
      if (fight.timer <= 0) enter(fight, 'idle', bossPhaseConfig(fight).idle);
      break;
    case 'defeated':
      fight.positionY = restY - BOSS_BODY.tiredDrop;
      if (fight.timer <= 0) {
        fight.awake = false;
        enter(fight, 'done', 0);
      }
      break;
    default:
      break;
  }

  if (!bossIsHarmless(fight)) resolveBody(fight, active, contacts);
  return contacts;
}

function beginWindup(fight, fighters, config, bounds, random) {
  const target = nearestFighter(fight, fighters);
  fight.targetPlayerId = target?.id ?? null;
  const targetX = target?.x ?? fight.positionX + fight.facing;
  fight.attack = config.pattern[fight.attackIndex % config.pattern.length];
  fight.attackIndex += 1;
  fight.facing = Math.sign(targetX - fight.positionX) || fight.facing;
  fight.startX = fight.positionX;

  if (fight.attack === 'charge') {
    const stopX = fight.facing > 0 ? bounds.maxX : bounds.minX;
    // Already against that wall: hop back to the middle instead, so hiding
    // behind him in the wall pocket never earns a free dizzy window.
    if (Math.abs(stopX - fight.positionX) < 4) {
      fight.attack = 'slam';
      fight.targetX = bounds.centerX;
    } else {
      fight.chargeDirection = fight.facing;
      fight.targetX = stopX;
    }
  } else if (fight.attack === 'slam') {
    fight.targetX = clamp(targetX, bounds.minX, bounds.maxX);
  } else if (fight.attack === 'spores') {
    fight.targetX = clamp(targetX, bounds.minX, bounds.maxX);
    // Spores land three units apart around the target, with a little
    // seeded jitter. The gaps between markers are always safe to stand in.
    const count = config.spores;
    const shift = (random() - 0.5) * 1.2;
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * 3 + shift;
      spawnHazard(fight, {
        kind: 'spore',
        positionX: clamp(fight.targetX + offset, bounds.waveMinX + 1.5, bounds.waveMaxX - 1.5),
        positionY: fight.groundY + BOSS_TIMING.sporeDrop,
        timer: BOSS_TIMING.sporeWarn + index * BOSS_TIMING.sporeStagger,
        state: 'warn',
      });
    }
  }
  enter(fight, 'windup', config.windup);
}

function beginAttack(fight) {
  if (fight.attack === 'charge') {
    enter(fight, 'charge', BOSS_TIMING.chargeMax);
  } else if (fight.attack === 'slam') {
    enter(fight, 'leap', BOSS_TIMING.leap);
  } else {
    enter(fight, 'taunt', BOSS_TIMING.sporeTaunt);
  }
}

function enterTired(fight, config) {
  fight.tiredCount += 1;
  enter(fight, 'tired', config.tired);
}

function enter(fight, mode, duration) {
  fight.mode = mode;
  fight.timer = duration;
  fight.duration = duration;
}

function say(fight, lineId) {
  if (!BOSS_LINES[lineId]) return;
  fight.line = lineId;
  fight.lineRevision += 1;
}

function faceNearest(fight, fighters) {
  const target = nearestFighter(fight, fighters);
  if (target) fight.facing = Math.sign(target.x - fight.positionX) || fight.facing;
}

function nearestFighter(fight, fighters) {
  let best = null;
  let bestDistance = Infinity;
  for (const fighter of fighters) {
    const distance = Math.hypot(fighter.x - fight.positionX, fighter.y - fight.positionY);
    if (distance < bestDistance) {
      best = fighter;
      bestDistance = distance;
    }
  }
  return best;
}

function spawnHazard(fight, { kind, positionX, positionY = fight.groundY, velocityX = 0, timer = 0, state = 'live' }) {
  fight.hazards.push({
    id: `boss-hazard-${fight.nextHazardId}`,
    kind,
    positionX,
    positionY,
    velocityX,
    timer,
    state,
  });
  fight.nextHazardId += 1;
}

function updateHazards(fight, fighters, seconds, contacts, bounds) {
  if (fight.hazards.length === 0) return;
  for (const hazard of fight.hazards) {
    if (hazard.kind === 'wave') {
      hazard.positionX += hazard.velocityX * seconds;
      if (hazard.positionX < bounds.waveMinX || hazard.positionX > bounds.waveMaxX) {
        hazard.state = 'dead';
        continue;
      }
      for (const fighter of fighters) {
        if (fighter.invulnerable || fighter.shielded) continue;
        const feet = fighter.y;
        const overlapX = Math.abs(fighter.x - hazard.positionX) < (WAVE.width + (fighter.width ?? 0.8)) / 2;
        if (overlapX && feet < fight.groundY + WAVE.height) {
          pushHurt(contacts, fighter, hazard.positionX);
        }
      }
    } else if (hazard.kind === 'spore') {
      if (hazard.state === 'warn') {
        hazard.timer -= seconds;
        if (hazard.timer <= 0) hazard.state = 'fall';
        continue;
      }
      hazard.positionY -= BOSS_TIMING.sporeSpeed * seconds;
      if (hazard.positionY <= fight.groundY + 0.3) {
        hazard.state = 'dead';
        continue;
      }
      for (const fighter of fighters) {
        if (fighter.invulnerable || fighter.shielded) continue;
        const centerY = fighter.y + (fighter.height ?? 1.55) / 2;
        if (Math.hypot(fighter.x - hazard.positionX, centerY - hazard.positionY) < SPORE_RADIUS + 0.4) {
          pushHurt(contacts, fighter, hazard.positionX);
          hazard.state = 'dead';
          break;
        }
      }
    }
  }
  fight.hazards = fight.hazards.filter((hazard) => hazard.state !== 'dead');
}

function resolveBody(fight, fighters, contacts) {
  const halfW = BOSS_BODY.width / 2;
  const halfH = BOSS_BODY.height / 2;
  for (const fighter of fighters) {
    const width = fighter.width ?? 0.8;
    const height = fighter.height ?? 1.55;
    const overlapX = Math.abs(fighter.x - fight.positionX) < halfW + width / 2;
    const overlapY = fighter.y < fight.positionY + halfH && fighter.y + height > fight.positionY - halfH;
    if (!overlapX || !overlapY) continue;
    const stomping = fighter.vy < -2 && fighter.y > fight.positionY + BOSS_BODY.stompMargin;
    if (stomping && fight.mode === 'tired') {
      contacts.push({ id: fighter.id, kind: 'stomp', velocityY: BOSS_BODY.stompBounce });
      landHit(fight, fighter);
      return;
    }
    if (stomping) {
      // His cap is springy. Landing on it outside the dizzy window is safe.
      contacts.push({ id: fighter.id, kind: 'bounce', velocityY: BOSS_BODY.armorBounce });
      continue;
    }
    if (fighter.shielded || fighter.invulnerable) continue;
    pushHurt(contacts, fighter, fight.positionX);
  }
}

function landHit(fight, fighter) {
  fight.hp = Math.max(0, fight.hp - 1);
  fight.hitRevision += 1;
  fight.hazards = fight.hazards.filter((hazard) => hazard.kind !== 'spore');
  if (fight.hp <= 0) {
    fight.hazards = [];
    enter(fight, 'defeated', BOSS_TIMING.defeated);
    say(fight, 'defeat');
    return;
  }
  fight.pendingPhase = bossPhaseFor(fight);
  fight.knockbackX = (Math.sign(fight.positionX - fighter.x) || fight.facing * -1) * 7;
  enter(fight, 'hurt', BOSS_TIMING.hurt);
  if (fight.pendingPhase === fight.phase) {
    const hitsTaken = fight.maxHp - fight.hp;
    if (hitsTaken === 1) say(fight, 'hit1');
    else if (fight.phase === 2) say(fight, 'hit2');
  }
}

function pushHurt(contacts, fighter, fromX) {
  if (contacts.some((contact) => contact.id === fighter.id && contact.kind === 'hurt')) return;
  const direction = Math.sign(fighter.x - fromX) || 1;
  contacts.push({
    id: fighter.id,
    kind: 'hurt',
    fromX,
    knockbackX: direction * BOSS_BODY.hurtKnockback,
    velocityY: BOSS_BODY.hurtLift,
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
