/**
 * Every random decision in the engine goes through this interface, tagged with what it is for.
 * A seeded source gives reproducible training runs; a replay oracle answers from a recording.
 */
export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). `tag` names the decision being made. */
  int(maxExclusive: number, tag: string): number;
}

/** mulberry32: small, fast, fully deterministic PRNG. */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  int(maxExclusive: number, _tag: string): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(unit * maxExclusive);
  }
}
