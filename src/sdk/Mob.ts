import type { CombatBonuses, CombatStats } from './combat/Stats.ts';
import { HITSPLAT_BLOCK, HITSPLAT_DAMAGE } from './Events.ts';
import { footprintContains, isCardinallyAdjacent, tile, tileEquals, type Tile } from './Location.ts';
import { naiveDestination, naiveStep } from './Pathing.ts';
import type { World } from './World.ts';

interface PendingHit {
  landTick: number;
  damage: number;
  hitsplat?: number;
}

/**
 * Base class for NPCs. Owns the SW-anchored footprint, hitpoints, the incoming-hit queue and
 * the shared "dumb" chase step. Boss behaviour lives in subclasses under `src/content`.
 */
export abstract class Mob {
  abstract readonly npcId: number;
  abstract readonly size: number;
  abstract readonly maxHitpoints: number;
  /** Combat levels and bonuses, as on the monster's wiki infobox. */
  abstract readonly stats: CombatStats;
  abstract readonly bonuses: CombatBonuses;

  /** South-west tile of the footprint. */
  location: Tile;
  hitpoints = 0;
  /** Tick on which the mob was added to the world; -1 until its first tick. */
  spawnTick = -1;
  private pendingHits: PendingHit[] = [];

  constructor(location: Tile) {
    this.location = location;
  }

  /** Called once, on the tick the mob enters the world. */
  protected abstract onSpawn(world: World): void;
  /** Called every later tick, in the NPC phase, after incoming hits have been applied. */
  protected abstract onTick(world: World): void;

  /** Centre tile for odd sizes; SW + floor(size/2) in general (what projectiles aim at). */
  get centre(): Tile {
    const half = Math.floor(this.size / 2);
    return tile(this.location.x + half, this.location.y + half);
  }

  /** Spawned and not yet reduced to 0 hitpoints. */
  get alive(): boolean {
    return this.spawnTick >= 0 && this.hitpoints > 0;
  }

  occupies(t: Tile): boolean {
    return footprintContains(this.location, this.size, t);
  }

  inMeleeRange(t: Tile): boolean {
    return isCardinallyAdjacent(this.location, this.size, t);
  }

  /** Schedule damage to land on this mob in the NPC phase of `landTick`. */
  queueHit(damage: number, landTick: number, hitsplat?: number): void {
    this.pendingHits.push({ landTick, damage, hitsplat });
  }

  processTick(world: World): void {
    if (this.spawnTick < 0) {
      this.spawnTick = world.tick;
      this.hitpoints = this.maxHitpoints;
      world.emit({ type: 'npc_spawn', npcId: this.npcId, at: this.location });
      this.onSpawn(world);
      return;
    }
    this.applyHits(world);
    this.onTick(world);
  }

  private applyHits(world: World): void {
    if (this.pendingHits.length === 0) return;
    const due = this.pendingHits.filter((h) => h.landTick <= world.tick);
    if (due.length === 0) return;
    this.pendingHits = this.pendingHits.filter((h) => h.landTick > world.tick);
    for (const h of due) {
      this.hitpoints = Math.max(0, this.hitpoints - h.damage);
      world.emit({
        type: 'hitsplat',
        target: 'npc',
        damage: h.damage,
        hitsplat: h.hitsplat ?? (h.damage > 0 ? HITSPLAT_DAMAGE : HITSPLAT_BLOCK),
        source: 'player',
      });
    }
    world.emit({ type: 'npc_hp', npcId: this.npcId, hp: this.hitpoints });
  }

  /** Move the footprint and emit the step. No-op when `to` is the current tile. */
  protected setLocation(world: World, to: Tile): boolean {
    if (tileEquals(to, this.location)) return false;
    world.emit({ type: 'npc_move', npcId: this.npcId, from: this.location, to });
    this.location = to;
    return true;
  }

  /** One naive chase step toward melee range of a 1×1 target. */
  protected stepToward(world: World, target: Tile): boolean {
    const dest = naiveDestination(this.location, this.size, this.size, target);
    return this.setLocation(world, naiveStep(world.collision, this.location, this.size, dest));
  }
}
