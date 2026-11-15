/**
 * Optional real-time driver: calls `step` once every 600 ms. Hosts (the Three.js layer, a CLI) use
 * this; training and tests call `world.tickOnce()` directly as fast as they like.
 * Uses a fixed-step accumulator so timer jitter never changes how many ticks have run.
 */
export class TickClock {
  static readonly TICK_MS = 600;

  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private accumulator = 0;
  private now: () => number = () => performance.now();

  constructor(
    private readonly step: () => void,
    private readonly tickMs: number = TickClock.TICK_MS,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  /** Fraction of the way from the last tick to the next, 0..1. For render interpolation only. */
  get alpha(): number {
    if (!this.timer) return 1;
    return Math.min(1, (this.accumulator + (this.now() - this.last)) / this.tickMs);
  }

  start(now: () => number = () => performance.now()): void {
    if (this.timer) return;
    this.now = now;
    this.last = now();
    this.accumulator = 0;
    this.timer = setInterval(() => {
      const t = this.now();
      this.accumulator += t - this.last;
      this.last = t;
      while (this.accumulator >= this.tickMs) {
        this.accumulator -= this.tickMs;
        this.step();
      }
    }, Math.min(25, this.tickMs));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
