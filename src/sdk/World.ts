import type { CollisionMap } from './Collision.ts';
import { EventLog, type SimEventBody } from './Events.ts';
import type { Mob } from './Mob.ts';
import type { Player } from './Player.ts';
import type { RandomSource } from './Random.ts';

export interface WorldOptions {
  collision: CollisionMap;
  random: RandomSource;
  player: Player;
  /** Value of `world.tick` before the first `tickOnce()`. Lets replays use capture tick numbers. */
  startTick?: number;
}

/**
 * The headless simulation. One call to `tickOnce()` is one 600 ms server tick; nothing in here
 * knows about wall-clock time, rendering, or input devices.
 *
 * Tick order follows the live game: scheduled world events → NPCs → players. An NPC acting on
 * tick N therefore sees the player's tile from the end of tick N−1.
 */
export class World {
  static readonly TICK_MS = 600;

  tick: number;
  readonly collision: CollisionMap;
  readonly random: RandomSource;
  readonly player: Player;
  readonly events = new EventLog();
  private mobs: Mob[] = [];
  private scheduled = new Map<number, Array<(world: World) => void>>();

  constructor(options: WorldOptions) {
    this.collision = options.collision;
    this.random = options.random;
    this.player = options.player;
    this.tick = options.startTick ?? 0;
  }

  get npcs(): readonly Mob[] {
    return this.mobs;
  }

  /** The mob spawns (and emits its spawn events) in the NPC phase of the next tick. */
  addMob(mob: Mob): void {
    this.mobs.push(mob);
  }

  removeMob(mob: Mob): void {
    this.mobs = this.mobs.filter((m) => m !== mob);
  }

  /** Run `fn` at the start of tick `atTick`, before NPCs act. */
  schedule(atTick: number, fn: (world: World) => void): void {
    if (atTick <= this.tick) throw new Error(`cannot schedule for tick ${atTick} at tick ${this.tick}`);
    const list = this.scheduled.get(atTick);
    if (list) list.push(fn);
    else this.scheduled.set(atTick, [fn]);
  }

  emit(event: SimEventBody): void {
    this.events.push({ ...event, tick: this.tick });
  }

  tickOnce(): void {
    this.tick++;
    const due = this.scheduled.get(this.tick);
    if (due) {
      this.scheduled.delete(this.tick);
      for (const fn of due) fn(this);
    }
    for (const mob of [...this.mobs]) mob.processTick(this);
    this.player.processTick(this);
  }

  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.tickOnce();
  }
}
