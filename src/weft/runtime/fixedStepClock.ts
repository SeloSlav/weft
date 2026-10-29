/** Drives an authored simulation by integer ticks; rendering cadence is caller-owned. */
export class FixedStepClock {
  readonly ticksPerSecond: number
  readonly maxStepsPerAdvance: number
  private tick = -1
  private stepping = false

  constructor(options: { ticksPerSecond?: number; maxStepsPerAdvance?: number } = {}) {
    this.ticksPerSecond = options.ticksPerSecond ?? 60
    this.maxStepsPerAdvance = options.maxStepsPerAdvance ?? 600
    if (!Number.isSafeInteger(this.ticksPerSecond) || this.ticksPerSecond <= 0 ||
      !Number.isSafeInteger(this.maxStepsPerAdvance) || this.maxStepsPerAdvance <= 0) {
      throw new RangeError('ticksPerSecond and maxStepsPerAdvance must be positive safe integers')
    }
  }

  get currentTick(): number { return this.tick }

  /** Executes tick 0 on the first advance. Catch up in bounded batches without dropping ticks. */
  advanceTo(targetTick: number, step: (tick: number, elapsedSeconds: number) => void): { steps: number; complete: boolean } {
    if (!Number.isSafeInteger(targetTick) || targetTick < 0 || targetTick < this.tick) {
      throw new RangeError('targetTick must be a non-negative safe integer at or after the current tick')
    }
    if (this.stepping) throw new Error('Cannot advance a clock from inside its step callback')
    let steps = 0
    this.stepping = true
    try {
      while (this.tick < targetTick && steps < this.maxStepsPerAdvance) {
        const next = this.tick + 1
        step(next, next / this.ticksPerSecond)
        this.tick = next
        steps++
      }
    } finally { this.stepping = false }
    return { steps, complete: this.tick === targetTick }
  }
}
