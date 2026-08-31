import { schema, t } from '@colyseus/schema';

export const PlayerState = schema({
  playerId: t.string(),
  identityId: t.string(),
  guestName: t.string(),
  characterId: t.string(),
  connected: t.boolean(),
  ready: t.boolean(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
  velocityX: t.number(),
  velocityY: t.number(),
  velocityZ: t.number(),
  grounded: t.boolean(),
  hearts: t.uint8(),
  lives: t.uint8(),
  invulnerabilitySeconds: t.number(),
  active: t.boolean(),
  safe: t.boolean(),
  reachedGoal: t.boolean(),
  powerType: t.string(),
  powerSeconds: t.number(),
}, 'SavoriaPlayerState');

export const EnemyState = schema({
  id: t.string(),
  type: t.string(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
  dead: t.boolean(),
}, 'SavoriaEnemyState');

export const ProjectileState = schema({
  id: t.string(),
  targetPlayerId: t.string(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
  velocityX: t.number(),
  velocityY: t.number(),
  velocityZ: t.number(),
  life: t.number(),
}, 'SavoriaProjectileState');

export const CollectibleState = schema({
  id: t.string(),
  kind: t.string(),
  itemType: t.string(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
  takenBy: t.string(),
}, 'SavoriaCollectibleState');

export const MovingPlatformState = schema({
  id: t.string(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
  width: t.number(),
  height: t.number(),
  depth: t.number(),
}, 'SavoriaMovingPlatformState');

export const CheckpointState = schema({
  present: t.boolean(),
  active: t.boolean(),
  activatedBy: t.string(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
}, 'SavoriaCheckpointState');

export const BossState = schema({
  present: t.boolean(),
  positionX: t.number(),
  positionY: t.number(),
  positionZ: t.number(),
  hp: t.uint16(),
  maxHp: t.uint16(),
  mode: t.string(),
  timer: t.number(),
  awake: t.boolean(),
  targetPlayerId: t.string(),
}, 'SavoriaBossState');

export const RoomState = schema({
  phase: t.string(),
  protocolVersion: t.uint8(),
  hostPlayerId: t.string(),
  selectedLevelId: t.string(),
  timer: t.number(),
  tomatoCount: t.uint16(),
  checkpoint: CheckpointState,
  players: t.map(PlayerState),
  enemies: t.array(EnemyState),
  projectiles: t.array(ProjectileState),
  collectibles: t.array(CollectibleState),
  movingPlatforms: t.array(MovingPlatformState),
  boss: BossState,
}, 'SavoriaRoomState');

export function createLobbyState(protocolVersion, selectedLevelId) {
  const state = new RoomState();
  state.phase = 'lobby';
  state.protocolVersion = protocolVersion;
  state.hostPlayerId = '';
  state.selectedLevelId = selectedLevelId;
  state.timer = 0;
  state.tomatoCount = 0;
  resetCheckpoint(state.checkpoint);
  resetBoss(state.boss);
  return state;
}

export function createLobbyPlayer(
  playerId,
  characterId,
  guestName = 'Guest Chef',
  identityId = playerId,
) {
  const player = new PlayerState();
  player.playerId = playerId;
  player.identityId = identityId;
  player.guestName = guestName;
  player.characterId = characterId;
  player.connected = true;
  player.ready = false;
  applySimulationPlayer(player, {});
  return player;
}

export function applySimulationSnapshot(state, snapshot) {
  state.timer = snapshot.timer;
  state.tomatoCount = snapshot.tomatoCount;
  applyCheckpoint(state.checkpoint, snapshot.checkpoint);
  applyBoss(state.boss, snapshot.boss);

  for (const [playerId, simulationPlayer] of Object.entries(snapshot.players)) {
    const player = state.players.get(playerId);
    if (!player) continue;
    applySimulationPlayer(player, simulationPlayer);
  }

  replaceCollection(state.enemies, snapshot.enemies, EnemyState, (target, value) => {
    target.id = value.id;
    target.type = value.type;
    target.positionX = value.positionX;
    target.positionY = value.positionY;
    target.positionZ = value.positionZ;
    target.dead = value.dead === true;
  });
  replaceCollection(state.projectiles, snapshot.projectiles, ProjectileState, (target, value) => {
    target.id = value.id;
    target.targetPlayerId = value.targetPlayerId ?? '';
    target.positionX = value.positionX;
    target.positionY = value.positionY;
    target.positionZ = value.positionZ;
    target.velocityX = value.velocityX;
    target.velocityY = value.velocityY;
    target.velocityZ = value.velocityZ;
    target.life = value.life;
  });
  replaceCollection(state.collectibles, snapshot.collectibles, CollectibleState, (target, value) => {
    target.id = value.id;
    target.kind = value.kind;
    target.itemType = value.type ?? '';
    target.positionX = value.position[0];
    target.positionY = value.position[1];
    target.positionZ = value.position[2];
    target.takenBy = value.takenBy ?? '';
  });
  replaceCollection(
    state.movingPlatforms,
    snapshot.movingPlatforms,
    MovingPlatformState,
    (target, value) => {
      target.id = value.id;
      target.positionX = value.positionX;
      target.positionY = value.positionY;
      target.positionZ = value.positionZ;
      target.width = value.width;
      target.height = value.height;
      target.depth = value.depth;
    },
  );
}

export function resetCourseState(state) {
  state.timer = 0;
  state.tomatoCount = 0;
  resetCheckpoint(state.checkpoint);
  resetBoss(state.boss);
  state.enemies.splice(0, state.enemies.length);
  state.projectiles.splice(0, state.projectiles.length);
  state.collectibles.splice(0, state.collectibles.length);
  state.movingPlatforms.splice(0, state.movingPlatforms.length);
  for (const player of state.players.values()) {
    player.ready = false;
    applySimulationPlayer(player, {});
  }
}

function applySimulationPlayer(target, source) {
  target.positionX = source.positionX ?? 0;
  target.positionY = source.positionY ?? 0;
  target.positionZ = source.positionZ ?? 0;
  target.velocityX = source.velocityX ?? 0;
  target.velocityY = source.velocityY ?? 0;
  target.velocityZ = source.velocityZ ?? 0;
  target.grounded = source.grounded === true;
  target.hearts = source.hearts ?? 3;
  target.lives = source.lives ?? 4;
  target.invulnerabilitySeconds = source.invulnerabilitySeconds ?? 0;
  target.active = source.active !== false;
  target.safe = source.safe === true;
  target.reachedGoal = source.reachedGoal === true;
  target.powerType = source.power?.type ?? '';
  target.powerSeconds = source.power?.seconds ?? 0;
}

function applyCheckpoint(target, checkpoint) {
  resetCheckpoint(target);
  if (!checkpoint) return;
  target.present = true;
  target.active = checkpoint.active === true;
  target.activatedBy = checkpoint.activatedBy ?? '';
  target.positionX = checkpoint.position[0];
  target.positionY = checkpoint.position[1];
  target.positionZ = checkpoint.position[2];
}

function resetCheckpoint(checkpoint) {
  checkpoint.present = false;
  checkpoint.active = false;
  checkpoint.activatedBy = '';
  checkpoint.positionX = 0;
  checkpoint.positionY = 0;
  checkpoint.positionZ = 0;
}

function applyBoss(target, boss) {
  resetBoss(target);
  if (!boss) return;
  target.present = true;
  target.positionX = boss.positionX;
  target.positionY = boss.positionY;
  target.positionZ = boss.positionZ;
  target.hp = boss.hp;
  target.maxHp = boss.maxHp;
  target.mode = boss.mode;
  target.timer = boss.timer;
  target.awake = boss.awake === true;
  target.targetPlayerId = boss.targetPlayerId ?? '';
}

function resetBoss(boss) {
  boss.present = false;
  boss.positionX = 0;
  boss.positionY = 0;
  boss.positionZ = 0;
  boss.hp = 0;
  boss.maxHp = 0;
  boss.mode = '';
  boss.timer = 0;
  boss.awake = false;
  boss.targetPlayerId = '';
}

function replaceCollection(collection, values, StateClass, applyValue) {
  collection.splice(0, collection.length);
  for (const value of values) {
    const target = new StateClass();
    applyValue(target, value);
    collection.push(target);
  }
}
