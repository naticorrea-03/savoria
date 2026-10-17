// Visual-only smoothing for things that move once per 60 Hz step (enemies,
// projectiles, the boss). Call remember() before a step, blend(alpha) before
// drawing, and restore() after drawing so the simulation never sees the blend.
const TELEPORT_DISTANCE_SQUARED = 9;

export class PositionBlend {
  constructor() {
    this.before = new Map();
    this.restoreList = [];
  }

  remember(objects) {
    this.before.clear();
    for (const object of objects) {
      if (!object?.position) continue;
      const { x, y, z } = object.position;
      this.before.set(object, [x, y, z]);
    }
  }

  blend(alpha) {
    this.restoreList.length = 0;
    for (const [object, from] of this.before) {
      const position = object.position;
      const dx = position.x - from[0];
      const dy = position.y - from[1];
      const dz = position.z - from[2];
      if (dx === 0 && dy === 0 && dz === 0) continue;
      // A respawn or reset jumps far in one step. Show it as it happened.
      if (dx * dx + dy * dy + dz * dz > TELEPORT_DISTANCE_SQUARED) continue;
      this.restoreList.push([object, position.x, position.y, position.z]);
      position.set(
        from[0] + dx * alpha,
        from[1] + dy * alpha,
        from[2] + dz * alpha,
      );
    }
  }

  restore() {
    for (const [object, x, y, z] of this.restoreList) object.position.set(x, y, z);
    this.restoreList.length = 0;
  }
}
