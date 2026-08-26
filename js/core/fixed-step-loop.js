const FIXED_STEP = 1 / 60;
const MAX_STEPS = 5;

export class FixedStepLoop {
  constructor() {
    this.step = FIXED_STEP;
    this.maxSteps = MAX_STEPS;
    this.accumulator = 0;
  }

  advance(frameSeconds, simulate, render) {
    this.accumulator += Math.max(0, Number.isFinite(frameSeconds) ? frameSeconds : 0);

    let simulations = 0;
    while (this.accumulator >= this.step && simulations < this.maxSteps) {
      simulate(this.step);
      this.accumulator -= this.step;
      simulations += 1;
    }

    if (simulations === this.maxSteps && this.accumulator >= this.step) {
      this.accumulator = 0;
    }

    render(this.accumulator / this.step);
    return simulations;
  }
}
