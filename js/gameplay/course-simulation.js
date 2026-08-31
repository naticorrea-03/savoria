import { AABB } from '../core/aabb.js';
import { applyPlayerInput, createPlayerState } from './player-state.js';
import { nextSeededRandom, seedToUint32 } from './seeded-random.js';

const FIXED_STEP_SECONDS = 1 / 60;

export { applyPlayerInput, createPlayerState } from './player-state.js';

export function calculateCoopStars({ tomatoCount, totalTomatoes, players }) {
  const tomatoPercent = totalTomatoes > 0 ? tomatoCount / totalTomatoes : 1;
  const survivors = Object.values(players ?? {});
  const survivalStar = survivors.length > 0
    && survivors.every((player) => player.hearts >= 2);
  return 1 + (tomatoPercent >= 0.6 ? 1 : 0) + (survivalStar ? 1 : 0);
}

export function createCourseSimulation({ level, seed, players }) {
  const state = {
    phase: 'playing',
    tick: 0,
    elapsed: 0,
    timer: level.time,
    tomatoCount: 0,
    completion: null,
    level,
    randomState: seedToUint32(seed),
    nextProjectileId: 0,
    accumulator: 0,
    players: {},
    enemies: [],
    projectiles: [],
    collectibles: [],
    hazards: [],
    movingPlatforms: [],
    checkpoint: level.checkpoint
      ? { position: [...level.checkpoint], active: false, activatedBy: null }
      : null,
    goal: level.goal
      ? { position: [...level.goal], reachedPlayerIds: [] }
      : null,
    boss: null,
    world: {
      solids: (level.boxes ?? []).map(boxToSolid),
    },
  };
  state.hazards = (level.hazards ?? []).map((hazard, index) => {
    const [x, y, z, width, depth] = hazard;
    return {
      id: `hazard-${index}`,
      position: [x, y, z],
      width,
      depth,
      aabb: new AABB(x, y + 0.1, z, width, 1, depth),
    };
  });
  state.collectibles = [
    ...(level.coins ?? []).map((coin, index) => ({
      id: `tomato-${index}`,
      kind: 'tomato',
      position: [coin[0], coin[1] + 0.5, coin[2]],
      takenBy: null,
    })),
    ...(level.items ?? []).map((item, index) => ({
      id: `item-${index}`,
      kind: 'item',
      type: item.t,
      position: [item.p[0], item.p[1] + 0.8, item.p[2]],
      takenBy: null,
    })),
  ];

  for (const definition of playerDefinitions(players)) {
    const player = createPlayerState({ ...definition, spawn: level.spawn });
    state.players[player.playerId] = player;
  }
  state.movingPlatforms = (level.movers ?? []).map((mover, index) => {
    const [x, y, z, width, height, depth] = mover.box;
    const platform = {
      id: `mover-${index}`,
      base: [x, y, z],
      to: [...mover.to],
      period: mover.period,
      phase: mover.phase ?? 0,
      positionX: x,
      positionY: y,
      positionZ: z,
      width,
      height,
      depth,
      delta: [0, 0, 0],
      aabb: new AABB(x, y, z, width, height, depth),
    };
    state.world.solids.push({
      aabb: platform.aabb,
      movingPlatformId: platform.id,
    });
    return platform;
  });
  state.enemies = (level.enemies ?? []).map((enemy, index) => ({
    id: `enemy-${index}`,
    type: enemy.t,
    base: [...enemy.p],
    positionX: enemy.p[0],
    positionY: enemy.p[1],
    positionZ: enemy.p[2],
    range: Math.max(1.5, enemy.range || 5),
    phase: nextSeededRandom(state) * 6,
    shootCooldown: 1.5,
    dead: false,
  }));
  if (level.boss) {
    state.boss = {
      positionX: level.boss.p[0],
      positionY: level.boss.p[1],
      positionZ: level.boss.p[2],
      home: [...level.boss.p],
      hp: level.boss.hp,
      maxHp: level.boss.hp,
      arena: [...level.boss.arena],
      mode: 'sleep',
      timer: 0,
      chargeDirection: 1,
      speed: 9,
      awake: false,
      targetPlayerId: null,
    };
  }
  return state;
}

export function stepCourseSimulation(state, inputsByPlayer = {}, seconds = 0) {
  if (state.phase !== 'playing') return state;
  const elapsed = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  state.accumulator += elapsed;
  let firstStep = true;
  while (
    state.phase === 'playing'
    && state.accumulator + Number.EPSILON >= FIXED_STEP_SECONDS
  ) {
    stepFixed(state, inputsByPlayer, FIXED_STEP_SECONDS, firstStep);
    state.accumulator -= FIXED_STEP_SECONDS;
    firstStep = false;
  }
  return state;
}

export function createCourseSnapshot(state) {
  return {
    phase: state.phase,
    failureReason: state.failureReason ?? null,
    failedPlayerId: state.failedPlayerId ?? null,
    tick: state.tick,
    elapsed: state.elapsed,
    timer: state.timer,
    tomatoCount: state.tomatoCount,
    completion: cloneValue(state.completion),
    checkpoint: cloneValue(state.checkpoint),
    goal: cloneValue(state.goal),
    players: Object.fromEntries(
      Object.keys(state.players).sort().map((playerId) => [
        playerId,
        cloneValue(state.players[playerId]),
      ]),
    ),
    enemies: state.enemies.map(cloneValue),
    projectiles: state.projectiles.map(cloneValue),
    collectibles: state.collectibles.map(cloneValue),
    hazards: state.hazards.map(cloneValue),
    movingPlatforms: state.movingPlatforms.map(cloneValue),
    boss: cloneValue(state.boss),
  };
}

function stepFixed(state, inputsByPlayer, seconds, acceptJumpPress) {
  state.tick += 1;
  state.elapsed += seconds;
  state.timer = Math.max(0, state.timer - seconds);
  if (state.timer <= 0) {
    state.phase = 'failed';
    state.failureReason = 'timeout';
    state.failedPlayerId = null;
    return;
  }
  updateMovingPlatforms(state);

  for (const playerId of Object.keys(state.players).sort()) {
    const player = state.players[playerId];
    player.invulnerabilitySeconds = Math.max(
      0,
      player.invulnerabilitySeconds - seconds,
    );
    updateTimedPower(player, seconds);
    if (!player.active || player.safe) continue;
    const input = inputsByPlayer[playerId] ?? {};
    state.players[playerId] = applyPlayerInput(
      player,
      acceptJumpPress ? input : { ...input, jumpPressed: false },
      playerWorld(state.world, player),
      seconds,
    );
  }
  updateCollectibles(state);
  updateCourseLandmarks(state);
  updateBossDecision(state, seconds);

  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    enemy.phase += seconds;
    if (enemy.type === 'flyer') {
      enemy.positionX = enemy.base[0] + Math.sin(enemy.phase * (4 / enemy.range)) * enemy.range;
      enemy.positionY = enemy.base[1] + Math.sin(enemy.phase * 2.4) * 1.1;
    } else if (enemy.type === 'meatball') {
      enemy.positionX = enemy.base[0] + Math.sin(enemy.phase * (5 / enemy.range)) * enemy.range;
      enemy.positionY = enemy.base[1] + Math.abs(Math.sin(enemy.phase * 7)) * 0.18;
    } else if (enemy.type === 'shooter') {
      enemy.shootCooldown -= seconds;
      const target = nearestActivePlayer(state, enemy.positionX, enemy.positionY);
      const distance = target
        ? Math.hypot(target.positionX - enemy.positionX, target.positionY - enemy.positionY)
        : Infinity;
      if (enemy.shootCooldown <= 0 && distance < 11 && distance > 2) {
        enemy.shootCooldown = 3;
        spawnProjectile(state, enemy, target, distance);
      }
    }
  }
  updateProjectiles(state, seconds);
}

function updateBossDecision(state, seconds) {
  const boss = state.boss;
  if (!boss) return;
  const target = nearestActivePlayer(state, boss.positionX, boss.positionY);
  if (!boss.awake) {
    if (target && Math.abs(target.positionX - boss.positionX) < 18) {
      boss.awake = true;
      boss.mode = 'idle';
      boss.timer = 1.2;
    }
    return;
  }

  boss.timer -= seconds;
  if (boss.mode === 'idle' && boss.timer <= 0) {
    const nextTarget = nearestActivePlayer(state, boss.positionX, boss.positionY);
    boss.targetPlayerId = nextTarget?.playerId ?? null;
    boss.chargeDirection = Math.sign(
      (nextTarget?.positionX ?? boss.positionX + 1) - boss.positionX,
    ) || 1;
    boss.mode = 'telegraph';
    boss.timer = 0.7;
  } else if (boss.mode === 'telegraph' && boss.timer <= 0) {
    boss.mode = 'charge';
    boss.timer = 1.8;
  } else if (boss.mode === 'charge') {
    boss.positionX += boss.chargeDirection * boss.speed * seconds;
    const [arenaX, , , arenaWidth] = boss.arena;
    if (Math.abs(boss.positionX - arenaX) > arenaWidth / 2 - 3 || boss.timer <= 0) {
      boss.mode = 'tired';
      boss.timer = 2.4;
    }
  } else if (boss.mode === 'tired' && boss.timer <= 0) {
    boss.mode = 'idle';
    boss.timer = 1 + nextSeededRandom(state);
    boss.targetPlayerId = null;
  }
}

function nearestActivePlayer(state, positionX, positionY) {
  return Object.values(state.players)
    .filter((player) => player.active && !player.safe)
    .sort((left, right) => {
      const leftDistance = Math.hypot(
        left.positionX - positionX,
        left.positionY - positionY,
      );
      const rightDistance = Math.hypot(
        right.positionX - positionX,
        right.positionY - positionY,
      );
      return leftDistance - rightDistance || left.playerId.localeCompare(right.playerId);
    })[0] ?? null;
}

function spawnProjectile(state, enemy, target, distance) {
  const flight = Math.max(0.7, distance / 12);
  state.projectiles.push({
    id: `projectile-${state.nextProjectileId}`,
    targetPlayerId: target.playerId,
    positionX: enemy.positionX,
    positionY: enemy.positionY + 0.4,
    positionZ: enemy.positionZ,
    velocityX: (target.positionX - enemy.positionX) / flight,
    velocityY: (target.positionY - enemy.positionY) / flight + 11 * flight * 0.5,
    velocityZ: 0,
    life: 3.5,
  });
  state.nextProjectileId += 1;
}

function updateProjectiles(state, seconds) {
  for (const projectile of state.projectiles) {
    projectile.velocityY -= 22 * seconds;
    projectile.positionX += projectile.velocityX * seconds;
    projectile.positionY += projectile.velocityY * seconds;
    projectile.life -= seconds;
    projectile.dead = projectile.life <= 0
      || projectile.positionY < state.level.killY
      || state.world.solids.some(({ aabb }) => (
        projectile.positionX > aabb.minX
        && projectile.positionX < aabb.maxX
        && projectile.positionY > aabb.minY
        && projectile.positionY < aabb.maxY
      ));
    if (projectile.dead) continue;
    const hit = Object.values(state.players)
      .filter((player) => player.active && !player.safe)
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .find((player) => distanceToPosition(player, [
        projectile.positionX,
        projectile.positionY,
        projectile.positionZ,
      ]) < 1);
    if (hit) {
      projectile.dead = true;
      damagePlayer(state, hit);
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => !projectile.dead);
}

function updateCollectibles(state) {
  for (const collectible of state.collectibles) {
    if (collectible.takenBy) continue;
    const radius = collectible.kind === 'tomato' ? 1.4 : 1.5;
    const player = Object.values(state.players)
      .filter((candidate) => candidate.active && !candidate.safe)
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .find((candidate) => distanceToPosition(candidate, collectible.position) < radius);
    if (!player) continue;
    collectible.takenBy = player.playerId;
    if (collectible.kind === 'tomato') {
      state.tomatoCount += 1;
    } else if (collectible.type === 'basil') {
      player.hearts = Math.min(5, player.hearts + 1);
    } else {
      player.power = {
        type: collectible.type,
        seconds: collectible.type === 'shield' ? 8 : 10,
      };
    }
  }
}

function updateCourseLandmarks(state) {
  for (const playerId of Object.keys(state.players).sort()) {
    const player = state.players[playerId];
    if (!player.active || player.safe) continue;
    if (player.positionY < state.level.killY) {
      loseLifeAndRespawn(state, player);
      if (state.phase === 'failed') return;
      continue;
    }
    const playerCollider = playerAabb(player);
    if (
      player.invulnerabilitySeconds <= 0
      && state.hazards.some((hazard) => playerCollider.intersects(hazard.aabb))
    ) {
      damagePlayer(state, player);
      if (state.phase === 'failed') return;
      continue;
    }
    if (
      state.checkpoint
      && !state.checkpoint.active
      && Math.abs(player.positionX - state.checkpoint.position[0]) < 2.2
      && Math.abs(player.positionY - state.checkpoint.position[1]) < 3.5
    ) {
      state.checkpoint.active = true;
      state.checkpoint.activatedBy = playerId;
    }
    if (state.goal && distanceToPosition(player, state.goal.position) < 2.6) {
      player.reachedGoal = true;
      player.safe = true;
      state.goal.reachedPlayerIds.push(playerId);
    }
  }

  const players = Object.values(state.players);
  if (state.goal && players.length > 0 && players.every((player) => player.reachedGoal)) {
    state.phase = 'completed';
    state.completion = {
      levelId: state.level.id,
      tomatoCount: state.tomatoCount,
      totalTomatoes: (state.level.coins ?? []).length,
      elapsed: state.elapsed,
      players: Object.fromEntries(players.map((player) => [player.playerId, {
        hearts: player.hearts,
        lives: player.lives,
      }])),
    };
    state.completion.stars = calculateCoopStars(state.completion);
  }
}

function updateTimedPower(player, seconds) {
  if (!player.power) return;
  player.power.seconds = Math.max(0, player.power.seconds - seconds);
  if (player.power.seconds <= 0) delete player.power;
}

function playerWorld(world, player) {
  if (!player.power || !['speed', 'boost'].includes(player.power.type)) return world;
  return {
    ...world,
    motion: player.power.type === 'speed'
      ? { walkSpeed: 7.2 * 1.55, runSpeed: 10.6 * 1.55 }
      : { jumpSpeed: 12.5 * 1.28 },
  };
}

function damagePlayer(state, player) {
  if (player.power?.type === 'shield' || player.invulnerabilitySeconds > 0) return false;
  player.hearts -= 1;
  if (player.hearts <= 0) {
    player.lives -= 1;
    if (player.lives <= 0) {
      player.hearts = 0;
      player.active = false;
      state.phase = 'failed';
      state.failureReason = 'lives';
      state.failedPlayerId = player.playerId;
      return true;
    }
    player.hearts = 3;
    respawnPlayer(state, player);
    return true;
  }
  player.invulnerabilitySeconds = 1.6;
  return true;
}

function loseLifeAndRespawn(state, player) {
  player.lives -= 1;
  if (player.lives <= 0) {
    player.hearts = 0;
    player.active = false;
    state.phase = 'failed';
    state.failureReason = 'lives';
    state.failedPlayerId = player.playerId;
    return;
  }
  player.hearts = 3;
  respawnPlayer(state, player);
}

function respawnPlayer(state, player) {
  const spawn = state.checkpoint?.active
    ? state.checkpoint.position
    : state.level.spawn;
  player.positionX = spawn[0];
  player.positionY = spawn[1] + 1;
  player.positionZ = 0;
  player.velocityX = 0;
  player.velocityY = 0;
  player.velocityZ = 0;
  player.grounded = false;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.groundMoverId = null;
  player.invulnerabilitySeconds = 2;
}

function distanceToPosition(player, position) {
  return Math.hypot(
    player.positionX - position[0],
    player.positionY - position[1],
    player.positionZ - position[2],
  );
}

function playerAabb(player) {
  return new AABB(
    player.positionX,
    player.positionY + player.height / 2,
    player.positionZ,
    player.width,
    player.height,
    player.depth,
  );
}

function updateMovingPlatforms(state) {
  for (const platform of state.movingPlatforms) {
    const riders = Object.values(state.players).filter((player) => (
      player.active
      && player.positionX > platform.aabb.minX - player.width / 2
      && player.positionX < platform.aabb.maxX + player.width / 2
      && Math.abs(player.positionY - platform.aabb.maxY) < 0.06
      && player.velocityY <= 0.01
    ));
    const progress = (
      Math.sin(
        ((state.elapsed / platform.period) + platform.phase) * Math.PI * 2
          - Math.PI / 2,
      ) + 1
    ) / 2;
    const nextX = platform.base[0] + platform.to[0] * progress;
    const nextY = platform.base[1] + platform.to[1] * progress;
    const nextZ = platform.base[2] + platform.to[2] * progress;
    platform.delta = [
      nextX - platform.positionX,
      nextY - platform.positionY,
      nextZ - platform.positionZ,
    ];
    platform.positionX = nextX;
    platform.positionY = nextY;
    platform.positionZ = nextZ;
    platform.aabb.set(
      nextX,
      nextY,
      nextZ,
      platform.width,
      platform.height,
      platform.depth,
    );
    for (const player of riders) {
      player.positionX += platform.delta[0];
      player.positionY += platform.delta[1];
      player.positionZ = 0;
      player.groundMoverId = platform.id;
    }
  }
}

function boxToSolid(box) {
  const [x, y, z, width, height, depth] = box;
  return { aabb: new AABB(x, y, z, width, height, depth) };
}

function playerDefinitions(players) {
  if (Array.isArray(players)) return players;
  return Object.entries(players ?? {}).map(([playerId, definition]) => ({
    playerId,
    ...definition,
  }));
}

function cloneValue(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneValue(child)]),
  );
}
