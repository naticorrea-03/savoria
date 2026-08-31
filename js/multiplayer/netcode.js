export const REMOTE_INTERPOLATION_MS = 100;
export const LOCAL_CORRECTION_MS = 65;

const SNAP_REASONS = new Set(['respawn', 'door', 'checkpoint']);

export class RemoteInterpolation {
  constructor({ delayMs = REMOTE_INTERPOLATION_MS } = {}) {
    this.delayMs = delayMs;
    this.samples = [];
  }

  get sampleCount() {
    return this.samples.length;
  }

  push(value, receivedAt) {
    const sample = { value: copyPosition(value), receivedAt };
    const last = this.samples.at(-1);
    if (last && receivedAt < last.receivedAt) return false;
    if (last && receivedAt === last.receivedAt) this.samples[this.samples.length - 1] = sample;
    else this.samples.push(sample);
    while (this.samples.length > 32) this.samples.shift();
    return true;
  }

  sample(now) {
    if (this.samples.length === 0) return null;
    const renderAt = now - this.delayMs;
    const first = this.samples[0];
    if (renderAt <= first.receivedAt) return copyPosition(first.value);
    const last = this.samples.at(-1);
    if (renderAt >= last.receivedAt) return copyPosition(last.value);

    for (let index = 1; index < this.samples.length; index += 1) {
      const after = this.samples[index];
      if (after.receivedAt < renderAt) continue;
      const before = this.samples[index - 1];
      const progress = (renderAt - before.receivedAt) / (after.receivedAt - before.receivedAt);
      return lerpPosition(before.value, after.value, progress);
    }
    return copyPosition(last.value);
  }

  reset(value, receivedAt = 0) {
    this.samples = value ? [{ value: copyPosition(value), receivedAt }] : [];
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
    this.pending = [];
    this.correction = null;
  }

  get pendingCount() {
    return this.pending.length;
  }

  applyInput(sequence, controls, seconds, now) {
    this.predicted = copyPosition(this.simulate(this.sample(now), controls, seconds));
    this.pending.push({ sequence, controls: { ...controls }, seconds });
    this.correction = null;
    return copyPosition(this.predicted);
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
    for (const pending of this.pending) {
      replayed = copyPosition(this.simulate(replayed, pending.controls, pending.seconds));
    }
    this.predicted = replayed;
    this.correction = {
      from: visible,
      to: copyPosition(replayed),
      startedAt: now,
    };
    return copyPosition(visible);
  }

  sample(now) {
    if (!this.correction) return copyPosition(this.predicted);
    const progress = Math.max(0, Math.min(1, (now - this.correction.startedAt) / this.correctionMs));
    if (progress >= 1) {
      this.correction = null;
      return copyPosition(this.predicted);
    }
    return lerpPosition(this.correction.from, this.correction.to, progress);
  }

  reset(value) {
    this.predicted = copyPosition(value);
    this.pending = [];
    this.correction = null;
  }
}

function copyPosition(value = {}) {
  return {
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
