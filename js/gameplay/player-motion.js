import { AABB } from '../core/aabb.js';

export const DEFAULT_MOTION = Object.freeze({
  walkSpeed: 7.2,
  runSpeed: 10.6,
  acceleration: 46,
  deceleration: 58,
  gravity: 30,
  jumpSpeed: 12.5,
  jumpCutSpeed: 6.5,
  coyoteSeconds: 0.12,
  jumpBufferSeconds: 0.13,
  airJumps: 1,
  maxFallSpeed: 26,
});

const DEFAULT_STATE = Object.freeze({
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  velocityX: 0,
  velocityY: 0,
  velocityZ: 0,
  width: 0.8,
  height: 1.55,
  depth: 0.8,
  grounded: false,
  coyote: 0,
  jumpBuffer: 0,
  airJumpsRemaining: DEFAULT_MOTION.airJumps,
  facing: 1,
  targetSpeed: 0,
  acceleration: DEFAULT_MOTION.deceleration,
});

export function createPlayerMotion(overrides = {}) {
  return { ...DEFAULT_STATE, ...overrides };
}

export function stepPlayerMotion(state, input = {}, world = { solids: [] }, dt, config = DEFAULT_MOTION) {
  const motion = { ...DEFAULT_MOTION, ...config };
  const seconds = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const next = createPlayerMotion(state);
  const axis = Math.max(-1, Math.min(1, Number(input.axis) || 0));
  const speed = input.running ? motion.runSpeed : motion.walkSpeed;

  next.targetSpeed = axis * speed;
  next.acceleration = axis === 0 ? motion.deceleration : motion.acceleration;
  next.velocityX = approach(next.velocityX, next.targetSpeed, next.acceleration * seconds);
  if (axis !== 0) next.facing = Math.sign(axis);

  next.coyote = state.grounded
    ? motion.coyoteSeconds
    : Math.max(0, state.coyote - seconds);
  next.jumpBuffer = Math.max(0, state.jumpBuffer - seconds);
  if (input.jumpPressed) next.jumpBuffer = motion.jumpBufferSeconds;

  const hasGroundJump = state.grounded || next.coyote > 0;
  const hasAirJump = !hasGroundJump && next.airJumpsRemaining > 0;
  if (next.jumpBuffer > 0 && (hasGroundJump || hasAirJump)) {
    next.velocityY = motion.jumpSpeed;
    next.jumpBuffer = 0;
    next.coyote = 0;
    next.grounded = false;
    if (hasAirJump) next.airJumpsRemaining -= 1;
  }

  if (input.jumpHeld === false && next.velocityY > motion.jumpCutSpeed) {
    next.velocityY = motion.jumpCutSpeed;
  }

  next.velocityY = Math.max(-motion.maxFallSpeed, next.velocityY - motion.gravity * seconds);
  resolveMovement(next, world?.solids || [], seconds);
  if (next.grounded) next.airJumpsRemaining = motion.airJumps;
  next.positionZ = 0;
  next.velocityZ = 0;
  return next;
}

function approach(value, target, maximumDelta) {
  if (value < target) return Math.min(value + maximumDelta, target);
  return Math.max(value - maximumDelta, target);
}

function resolveMovement(state, solids, dt) {
  const box = new AABB(0, 0, 0, 0, 0, 0);
  const setBox = () => box.set(
    state.positionX,
    state.positionY + state.height / 2,
    state.positionZ,
    state.width,
    state.height,
    state.depth,
  );
  const maxDisplacement = Math.max(Math.abs(state.velocityX), Math.abs(state.velocityY)) * dt;
  const steps = Math.max(1, Math.ceil(maxDisplacement / 0.4));
  const stepSeconds = dt / steps;
  state.grounded = false;

  for (let index = 0; index < steps; index += 1) {
    state.positionX += state.velocityX * stepSeconds;
    setBox();
    for (const solid of solids) {
      const collider = solid.aabb || solid;
      if (!box.intersects(collider)) continue;
      const lip = collider.maxY - state.positionY;
      if (lip > -0.05 && lip <= 0.55 && state.velocityY <= 0.01) {
        state.positionY = Math.max(state.positionY, collider.maxY);
        setBox();
        continue;
      }
      const leftPenetration = box.maxX - collider.minX;
      const rightPenetration = collider.maxX - box.minX;
      state.positionX = leftPenetration < rightPenetration
        ? collider.minX - state.width / 2
        : collider.maxX + state.width / 2;
      state.velocityX = 0;
      setBox();
    }

    state.positionY += state.velocityY * stepSeconds;
    setBox();
    for (const solid of solids) {
      const collider = solid.aabb || solid;
      if (!box.intersects(collider)) continue;
      if (state.velocityY <= 0) {
        state.positionY = collider.maxY;
        state.velocityY = 0;
        state.grounded = true;
      } else {
        state.positionY = collider.minY - state.height;
        state.velocityY = 0;
      }
      setBox();
    }
  }
}
