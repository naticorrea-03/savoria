// Small, allocation-free helpers for presentation motion.

export const SHAKE_MAX_OFFSET = 0.32;
export const SHAKE_DECAY = 1.9;

export function prefersReducedMotion(win = globalThis) {
  try {
    return Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

// Trauma-style screen shake. Trauma adds up but never passes 1, and the
// visible offset is trauma squared times a small world-unit cap.
export function createShake() {
  return { trauma: 0, time: 0, x: 0, y: 0 };
}

export function addTrauma(shake, amount) {
  shake.trauma = Math.min(1, shake.trauma + Math.max(0, amount));
}

export function stepShake(shake, dt, maxOffset = SHAKE_MAX_OFFSET) {
  shake.time += dt;
  shake.trauma = Math.max(0, shake.trauma - SHAKE_DECAY * dt);
  const power = shake.trauma * shake.trauma * maxOffset;
  const t = shake.time * 31;
  shake.x = power * (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4);
  shake.y = power * (Math.sin(t * 1.3 + 4.1) * 0.6 + Math.sin(t * 2.9 + 0.3) * 0.4);
  return shake;
}

// Damped spring for squash and stretch. value rests at 1.
export function createSquash() {
  return { value: 1, velocity: 0, target: 1 };
}

export function kickSquash(squash, value) {
  squash.value = value;
  squash.velocity = 0;
}

export function stepSquash(squash, dt, stiffness = 340, damping = 17) {
  // Semi-implicit Euler in fixed slices keeps the spring stable on slow frames.
  let remaining = Math.min(dt, 0.1);
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    const force = (squash.target - squash.value) * stiffness - squash.velocity * damping;
    squash.velocity += force * step;
    squash.value += squash.velocity * step;
    remaining -= step;
  }
  squash.value = Math.min(1.45, Math.max(0.55, squash.value));
  return squash.value;
}

export function easeOutBack(t, overshoot = 1.70158) {
  const x = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

export function easeOutCubic(t) {
  const x = 1 - Math.min(1, Math.max(0, t));
  return 1 - x * x * x;
}
