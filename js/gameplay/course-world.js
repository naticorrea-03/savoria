import { AABB } from '../core/aabb.js';

export function createCourseWorld(level = {}) {
  const movingPlatforms = (level.movers ?? []).map((mover, index) => {
    const [x, y, z, width, height, depth] = mover.box;
    return {
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
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
      aabb: new AABB(x, y, z, width, height, depth),
    };
  });
  return {
    solids: [
      ...(level.boxes ?? []).map(([x, y, z, width, height, depth]) => ({
        aabb: new AABB(x, y, z, width, height, depth),
      })),
      ...movingPlatforms.map((platform) => ({
        aabb: platform.aabb,
        movingPlatformId: platform.id,
        platform,
      })),
    ],
    movingPlatforms,
    authoritativeTick: 0,
  };
}

export function syncCourseWorld(world, platforms = [], authoritativeTick = 0) {
  const tickDelta = authoritativeTick - (world.authoritativeTick ?? authoritativeTick);
  const seconds = tickDelta > 0 ? tickDelta / 60 : 0;
  for (const incoming of platforms) {
    const platform = world.movingPlatforms.find(({ id }) => id === incoming.id);
    if (!platform) continue;
    const nextX = incoming.position.x;
    const nextY = incoming.position.y;
    const nextZ = incoming.position.z;
    platform.velocityX = seconds > 0 ? (nextX - platform.positionX) / seconds : 0;
    platform.velocityY = seconds > 0 ? (nextY - platform.positionY) / seconds : 0;
    platform.velocityZ = seconds > 0 ? (nextZ - platform.positionZ) / seconds : 0;
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
  }
  world.authoritativeTick = Math.max(world.authoritativeTick ?? 0, authoritativeTick);
  return world;
}

export function coursePlayerWorld(world, player) {
  if (!player.power || !['speed', 'boost'].includes(player.power.type)) return world;
  return {
    ...world,
    motion: player.power.type === 'speed'
      ? { walkSpeed: 7.2 * 1.55, runSpeed: 10.6 * 1.55 }
      : { jumpSpeed: 12.5 * 1.28 },
  };
}
