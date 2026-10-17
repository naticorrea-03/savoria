// Side-scroller camera. Pure math, no three.js, so it can be unit tested and
// shared by the solo session and the co-op renderer.
//
// - Looks ahead in the direction of travel, eased so turning does not jerk.
// - Holds still vertically through normal jumps. It only moves up when the
//   player climbs past a window, and follows quickly when falling.
// - Smoothing is exponential in real time, so it feels the same at any
//   refresh rate.
// - Snaps on teleports (respawn, doors) instead of sweeping across the level.

export const CAMERA_TUNING = Object.freeze({
  idleLook: 1.5,
  speedLook: 0.16,
  maxLook: 3.4,
  lookRate: 2.6,
  followRateX: 6.5,
  followRateY: 8,
  groundAnchorRate: 7,
  climbWindow: 2.2,
  fallWindow: 0.8,
  heightAbovePlayer: 4,
  minHeight: 3.5,
  snapDistanceX: 14,
  snapDistanceY: 10,
});

export class CameraFollow {
  constructor(tuning = {}) {
    this.tuning = { ...CAMERA_TUNING, ...tuning };
    this.ready = false;
    this.x = 0;
    this.y = this.tuning.minHeight;
    this.lookAhead = 0;
    this.anchorY = 0;
  }

  snap(x, y, facing = 1, minX = -Infinity, maxX = Infinity) {
    const t = this.tuning;
    this.lookAhead = facing * t.idleLook;
    this.anchorY = y;
    this.x = Math.max(minX, Math.min(maxX, x + this.lookAhead));
    this.y = Math.max(t.minHeight, y + t.heightAbovePlayer);
    this.ready = true;
    return this;
  }

  update({
    x,
    y,
    velocityX = 0,
    facing = 1,
    grounded = true,
    dt,
    minX = -Infinity,
    maxX = Infinity,
  }) {
    const t = this.tuning;
    if (!this.ready) this.snap(x, y, facing, minX, maxX);
    const seconds = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));

    const lookTarget = Math.max(-t.maxLook, Math.min(
      t.maxLook,
      facing * t.idleLook + velocityX * t.speedLook,
    ));
    this.lookAhead += (lookTarget - this.lookAhead) * ease(t.lookRate, seconds);

    if (grounded) {
      this.anchorY += (y - this.anchorY) * ease(t.groundAnchorRate, seconds);
    } else if (y > this.anchorY + t.climbWindow) {
      this.anchorY = y - t.climbWindow;
    } else if (y < this.anchorY - t.fallWindow) {
      this.anchorY = y + t.fallWindow;
    }

    const targetX = Math.max(minX, Math.min(maxX, x + this.lookAhead));
    const targetY = Math.max(t.minHeight, this.anchorY + t.heightAbovePlayer);
    if (
      Math.abs(targetX - this.x) > t.snapDistanceX
      || Math.abs(targetY - this.y) > t.snapDistanceY
    ) {
      this.anchorY = y;
      this.x = targetX;
      this.y = Math.max(t.minHeight, y + t.heightAbovePlayer);
      return this;
    }
    this.x += (targetX - this.x) * ease(t.followRateX, seconds);
    this.y += (targetY - this.y) * ease(t.followRateY, seconds);
    return this;
  }
}

function ease(rate, seconds) {
  return 1 - Math.exp(-rate * seconds);
}
