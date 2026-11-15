// Fixed-step simulation clock. Rendering may run at any rate; rules advance only in whole steps.
export class FixedStepClock {
  private accumulator = 0;
  private elapsed = 0;

  constructor(readonly stepMs: number, private readonly maxStepsPerAdvance = 250) {}

  // Returns how many simulation steps to run for `deltaMs` of real time.
  advance(deltaMs: number): number {
    if (!(deltaMs > 0)) return 0;
    this.accumulator += deltaMs;
    let steps = Math.floor(this.accumulator / this.stepMs);
    if (steps > this.maxStepsPerAdvance) {
      steps = this.maxStepsPerAdvance;
      this.accumulator = 0;
    } else {
      this.accumulator -= steps * this.stepMs;
    }
    this.elapsed += steps * this.stepMs;
    return steps;
  }

  get simulatedMs(): number {
    return this.elapsed;
  }
}
