// Fixed-step simulation clock. Rendering may run at any rate; rules advance only in whole steps.
export class FixedStepClock {
    constructor(stepMs, maxStepsPerAdvance = 250) {
        this.stepMs = stepMs;
        this.maxStepsPerAdvance = maxStepsPerAdvance;
        this.accumulator = 0;
        this.elapsed = 0;
    }
    // Returns how many simulation steps to run for `deltaMs` of real time.
    advance(deltaMs) {
        if (!(deltaMs > 0))
            return 0;
        this.accumulator += deltaMs;
        let steps = Math.floor(this.accumulator / this.stepMs);
        if (steps > this.maxStepsPerAdvance) {
            steps = this.maxStepsPerAdvance;
            this.accumulator = 0;
        }
        else {
            this.accumulator -= steps * this.stepMs;
        }
        this.elapsed += steps * this.stepMs;
        return steps;
    }
    get simulatedMs() {
        return this.elapsed;
    }
}
//# sourceMappingURL=clock.js.map