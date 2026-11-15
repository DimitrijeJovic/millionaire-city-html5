// Flag: the plane's banner is drawn into a bitmap and cut into vertical strips. Plane.start calls
// start(20, 4, 0.01, 0.002) and Plane.logicUpdate calls updateWaveFlag(dt) with the frame time in ms.
export class FlagWave {
  readonly ys: number[];
  private time = 0;

  constructor(readonly strips = 20, readonly period = 4, readonly labda = 0.01, readonly frequency = 0.002) {
    this.ys = new Array<number>(strips).fill(0);
  }

  // Strips 2..n-1 take the previous strip's offset, strip 1 follows the sine and strip 0 never moves.
  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = this.strips - 1; i > 1; i--) this.ys[i] = this.ys[i - 1];
    this.time += dt;
    this.ys[1] = this.period * Math.sin(this.labda - this.time * this.frequency);
  }
}

// Flag.start: every strip is the whole bitmap placed at x = width / 8, masked by a rectangle from
// i * w - 4 to (i + 1) * w + 4 (w = width / strips). Returns the visible bitmap columns, clamped to the bitmap.
export function stripColumns(index: number, strips: number, width: number): [number, number] {
  const w = width / strips;
  const shift = width / 8;
  return [Math.max(0, index * w - 4 - shift), Math.min(width, (index + 1) * w + 4 - shift)];
}
