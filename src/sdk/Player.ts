import { playerAttacker, playerDefender, npcDefender, resolveAttack, type AttackSpec, type Defender } from './combat/Attack.ts';
import { BARE_LOADOUT, attackInterval, attackReach, type PlayerLoadout } from './combat/Loadout.ts';
import type { PrayerName } from './combat/Prayers.ts';
import { HITSPLAT_BLOCK, HITSPLAT_DAMAGE } from './Events.ts';
import { distanceToFootprint, tileEquals, type Tile } from './Location.ts';
import type { Mob } from './Mob.ts';
import { findPath } from './Pathing.ts';
import type { World } from './World.ts';

/**
 * Hook that drives the player each tick, called in the player phase (after all NPCs).
 * Bots, RL policies and the log-replay harness all plug in here.
 */
export type PlayerController = (world: World, player: Player) => void;

export const PLAYER_ATTACK_TAG = 'player.attack';

export class Player {
  location: Tile;
  hitpoints: number;
  maxHitpoints: number;
  running = true;
  controller: PlayerController | null = null;
  /** Stats, gear and weapon. Defaults to a level-1 character with nothing equipped. */
  loadout: PlayerLoadout;
  /** Prayers switched on. NPCs acting on tick N see the set as it was at the end of tick N−1. */
  readonly prayers = new Set<PrayerName>();
  private path: Tile[] = [];
  private attackTarget: Mob | null = null;
  private nextAttackTick = 0;

  constructor(location: Tile, hitpoints = 99, loadout: PlayerLoadout = BARE_LOADOUT) {
    this.location = location;
    this.hitpoints = hitpoints;
    this.maxHitpoints = hitpoints;
    this.loadout = loadout;
  }

  get dead(): boolean {
    return this.hitpoints <= 0;
  }

  /** This player as the target of an attack: defence rolls from the loadout, protection from prayers. */
  asDefender(): Defender {
    return playerDefender(this.loadout, this.prayers);
  }

  /** Queue a walk/run to `dest`, routed with OSRS-style BFS over the collision map. */
  moveTo(world: World, dest: Tile): void {
    this.path = findPath(world.collision, this.location, dest);
  }

  /** Place the player directly (teleports, and recorded positions during log replay). */
  setLocation(t: Tile): void {
    this.location = t;
    this.path = [];
  }

  /**
   * Attack `target` with the equipped weapon whenever it is in reach and the weapon is ready,
   * until told otherwise. Pass null to stop. The player does not walk toward the target and does
   * not attack while it still has steps queued.
   */
  attack(target: Mob | null): void {
    this.attackTarget = target;
  }

  /** Apply damage immediately and emit the hitsplat. */
  takeHit(world: World, damage: number, source: string): void {
    const dealt = Math.max(0, Math.min(damage, this.hitpoints));
    this.hitpoints -= dealt;
    world.emit({
      type: 'hitsplat',
      target: 'player',
      damage,
      hitsplat: damage > 0 ? HITSPLAT_DAMAGE : HITSPLAT_BLOCK,
      source,
    });
    if (this.dead) world.emit({ type: 'player_death' });
  }

  processTick(world: World): void {
    this.controller?.(world, this);
    const steps = this.running ? 2 : 1;
    for (let i = 0; i < steps && this.path.length > 0; i++) {
      const next = this.path[0]!;
      const dx = next.x - this.location.x;
      const dy = next.y - this.location.y;
      if (!world.collision.canTravel(this.location, 1, dx, dy)) {
        this.path = [];
        break;
      }
      this.location = next;
      this.path.shift();
    }
    this.tryAttack(world);
  }

  private tryAttack(world: World): void {
    const target = this.attackTarget;
    if (!target || this.dead || world.tick < this.nextAttackTick) return;
    if (this.path.length > 0) return; // still walking

    if (!target.alive || !world.npcs.includes(target)) return;
    const distance = distanceToFootprint(target.location, target.size, this.location);
    // Distance 0 means standing under the target, from where nothing can be attacked.
    if (distance < 1 || distance > attackReach(this.loadout)) return;

    const spec: AttackSpec = {
      name: PLAYER_ATTACK_TAG,
      style: this.loadout.attackStyle,
      accuracy: 'roll',
      damage: { kind: 'maxHit' },
      prayerPenetration: 0,
      minimumOneOnHit: true,
    };
    const result = resolveAttack(
      playerAttacker(this.loadout, this.prayers),
      npcDefender(target.stats, target.bonuses),
      spec,
      world.random,
    );
    // Ranged projectiles take 1 + floor((3 + distance) / 6) ticks; the hitsplat is applied in the
    // NPC phase of the tick after that (BOSS_SPEC §8: 2 ticks at distance ≤ 2, 3 at distance 5).
    const travel = this.loadout.attackStyle === 'range' ? 1 + Math.floor((3 + distance) / 6) : 0;
    const landTick = world.tick + 1 + travel;
    target.queueHit(result.damage, landTick);
    world.emit({ type: 'player_attack', npcId: target.npcId, accurate: result.accurate, damage: result.damage, landTick });
    this.nextAttackTick = world.tick + attackInterval(this.loadout);
  }

  get target(): Mob | null {
    return this.attackTarget;
  }

  get destination(): Tile | null {
    const last = this.path[this.path.length - 1];
    return last && !tileEquals(last, this.location) ? last : null;
  }
}
