export const REMOTE_INTERPOLATION_MS = 100;
export const LOCAL_CORRECTION_MS = 65;

const SNAP_REASONS = new Set(['respawn', 'door', 'checkpoint']);

export class RemoteInterpolation {
  constructor({ delayMs = REMOTE_INTERPOLATION_MS, extrapolateMs = 0 } = {}) {
    this.delayMs = delayMs;
    this.extrapolateMs = extrapolateMs;
    this.samples = [];
  }

  get sampleCount() {
    return this.samples.length;
  }

  push(value, authoritativeTick, receivedAt) {
    const last = this.samples.at(-1);
    if (last && authoritativeTick <= last.authoritativeTick) return false;
    const sample = { value: copyPosition(value), authoritativeTick, receivedAt };
    this.samples.push(sample);
    while (this.samples.length > 32) this.samples.shift();
    return true;
  }

  sample(now) {
    return this.sampleWithTick(now)?.value ?? null;
  }

  // Same as sample, plus the authoritative tick the returned position belongs
  // to (fractional between two patches). Callers use it to put the remote
  // player on the same clock as the moving platform under them.
  sampleWithTick(now) {
    if (this.samples.length === 0) return null;
    const renderAt = now - this.delayMs;
    const first = this.samples[0];
    if (renderAt <= first.receivedAt) {
      return { value: copyPosition(first.value), tick: first.authoritativeTick };
    }
    const last = this.samples.at(-1);
    if (renderAt >= last.receivedAt) return this.extrapolate(renderAt, last);

    for (let index = 1; index < this.samples.length; index += 1) {
      const after = this.samples[index];
      if (after.receivedAt < renderAt) continue;
      const before = this.samples[index - 1];
      const progress = (renderAt - before.receivedAt) / (after.receivedAt - before.receivedAt);
      return {
        value: lerpPosition(before.value, after.value, progress),
        tick: before.authoritativeTick
          + (after.authoritativeTick - before.authoritativeTick) * progress,
      };
    }
    return { value: copyPosition(last.value), tick: last.authoritativeTick };
  }

  // A late patch used to freeze the remote player and then jump. Keep moving
  // along the last observed velocity for a short, capped time instead.
  extrapolate(renderAt, last) {
    const before = this.samples.at(-2);
    const overshoot = Math.min(this.extrapolateMs, renderAt - last.receivedAt);
    if (!before || overshoot <= 0 || last.receivedAt <= before.receivedAt) {
      return { value: copyPosition(last.value), tick: last.authoritativeTick };
    }
    const span = last.receivedAt - before.receivedAt;
    const progress = 1 + overshoot / span;
    const value = lerpPosition(before.value, last.value, progress);
    return {
      value: { ...copyPosition(last.value), x: value.x, y: value.y, z: value.z },
      tick: last.authoritativeTick
        + (last.authoritativeTick - before.authoritativeTick) * (overshoot / span),
    };
  }

  reset(value, authoritativeTick = 0, receivedAt = 0) {
    this.samples = value
      ? [{ value: copyPosition(value), authoritativeTick, receivedAt }]
      : [];
  }
}

export class LocalPrediction {
  constructor({
    initial,
    simulate,
    correctionMs = LOCAL_CORRECTION_MS,
  }) {
    this.simulate = simulate;
    this.correctionMs = correctionMs;
    this.predicted = copyPosition(initial);
    this.previous = this.predicted;
    this.renderAlpha = 1;
    this.pending = [];
    this.correction = null;
  }

  // Fraction (0..1) of a fixed step between the previous and the newest
  // predicted state. Lets a 120 or 144 Hz display glide between 60 Hz steps.
  setRenderAlpha(alpha) {
    this.renderAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  }

  get pendingCount() {
    return this.pending.length;
  }

  applyInput(sequence, controls, seconds, now) {
    this.previous = this.predicted;
    this.predicted = copyPosition(this.simulate(this.predicted, controls, seconds));
    this.pending.push({ sequence, controls: { ...controls }, seconds });
    return this.sample(now);
  }

  reconcile(authoritative, acknowledgedSequence, {
    now,
    reason = 'authority',
  } = {}) {
    if (SNAP_REASONS.has(reason)) {
      this.reset(authoritative);
      return copyPosition(this.predicted);
    }

    const visible = this.sample(now);
    this.pending = this.pending.filter(({ sequence }) => sequence > acknowledgedSequence);
    let replayed = copyPosition(authoritative);
    let previous = replayed;
    for (const pending of this.pending) {
      previous = replayed;
      replayed = copyPosition(this.simulate(replayed, pending.controls, pending.seconds));
    }
    this.predicted = replayed;
    this.previous = previous;
    this.correction = {
      offset: {
        x: visible.x - replayed.x,
        y: visible.y - replayed.y,
        z: visible.z - replayed.z,
      },
      startedAt: now,
    };
    return copyPosition(visible);
  }

  sample(now) {
    const base = this.renderAlpha < 1
      ? { ...this.predicted, ...lerpPosition(this.previous, this.predicted, this.renderAlpha) }
      : this.predicted;
    if (!this.correction) return copyPosition(base);
    const progress = Math.max(0, Math.min(1, (now - this.correction.startedAt) / this.correctionMs));
    if (progress >= 1) {
      this.correction = null;
      return copyPosition(base);
    }
    const scale = 1 - progress;
    return {
      ...base,
      x: base.x + this.correction.offset.x * scale,
      y: base.y + this.correction.offset.y * scale,
      z: base.z + this.correction.offset.z * scale,
    };
  }

  reset(value) {
    this.predicted = copyPosition(value);
    this.previous = this.predicted;
    this.pending = [];
    this.correction = null;
  }
}

function copyPosition(value = {}) {
  return {
    ...value,
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    z: Number(value.z) || 0,
  };
}

function lerpPosition(from, to, progress) {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
    z: from.z + (to.z - from.z) * progress,
  };
}
