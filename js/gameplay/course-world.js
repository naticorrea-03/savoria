import { AABB } from '../core/aabb.js';

export const COURSE_TICKS_PER_SECOND = 60;

// Platforms are a pure function of elapsed time. The server and every client
// call this same formula, so a platform never needs to be sent between ticks.
export function moverPositionAt(platform, elapsedSeconds) {
  const progress = (
    Math.sin(
      ((elapsedSeconds / platform.period) + platform.phase) * Math.PI * 2
        - Math.PI / 2,
    ) + 1
  ) / 2;
  return [
    platform.base[0] + platform.to[0] * progress,
    platform.base[1] + platform.to[1] * progress,
    platform.base[2] + platform.to[2] * progress,
  ];
}

export function poseMover(platform, position) {
  [platform.positionX, platform.positionY, platform.positionZ] = position;
  platform.aabb.set(
    position[0],
    position[1],
    position[2],
    platform.width,
    platform.height,
    platform.depth,
  );
}

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
