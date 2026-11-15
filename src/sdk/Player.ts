import { playerAttacker, playerDefender, npcDefender, resolveAttack, type AttackSpec, type Defender } from './combat/Attack.ts';
import { BARE_LOADOUT, attackInterval, attackReach, availableStances, type PlayerLoadout, type Stance } from './combat/Loadout.ts';
import { conflictsWith, drainResistance, prayerInfo, totalDrain, type PrayerRefusal } from './combat/PrayerBook.ts';
import type { PrayerName } from './combat/Prayers.ts';
import type { Inventory, ItemDefinition } from './Inventory.ts';
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
  /**
   * Prayer points. Only spent when `prayerDrain` is on: the log replay sets the prayers from the
   * recording each tick and must not have them run out on their own.
   */
  prayerPoints: number;
  prayerDrain = false;
  /** Prayers that need more than a level (Rigour, Piety, …) and have been unlocked. */
  readonly unlockedPrayers = new Set<PrayerName>();
  inventory: Inventory | null = null;
  /** What the items in the inventory do; without it nothing can be eaten or drunk. */
  items: ReadonlyMap<number, ItemDefinition> = new Map();
  private path: Tile[] = [];
  private attackTarget: Mob | null = null;
  private nextAttackTick = 0;
  private prayerDrainCounter = 0;
  private nextEatTick = 0;
  private nextDrinkTick = 0;
  private boostSetTick = new Map<string, number>();

  constructor(location: Tile, hitpoints = 99, loadout: PlayerLoadout = BARE_LOADOUT) {
    this.location = location;
    this.hitpoints = hitpoints;
    this.maxHitpoints = hitpoints;
    this.loadout = loadout;
    this.prayerPoints = loadout.stats.prayer ?? 1;
  }

  get maxPrayerPoints(): number {
    return this.loadout.stats.prayer ?? 1;
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

  /** Whether `name` could be switched on right now, and if not, why. */
  prayerRefusal(name: PrayerName): PrayerRefusal | null {
    const info = prayerInfo(name);
    if ((this.loadout.stats.prayer ?? 1) < info.level) return 'level';
    if (info.requiresUnlock && !this.unlockedPrayers.has(name)) return 'locked';
    if (this.prayerDrain && this.prayerPoints <= 0) return 'no-points';
    return null;
  }

  /**
   * Switch a prayer on or off. Switching one on switches off any active prayer it cannot be
   * combined with. Returns the refusal reason when it cannot be switched on.
   */
  togglePrayer(world: World, name: PrayerName): PrayerRefusal | null {
    if (this.prayers.has(name)) {
      this.prayers.delete(name);
      world.emit({ type: 'player_prayer', prayer: name, on: false });
      return null;
    }
    const refusal = this.prayerRefusal(name);
    if (refusal) return refusal;
    for (const other of conflictsWith(name, this.prayers)) {
      this.prayers.delete(other);
      world.emit({ type: 'player_prayer', prayer: other, on: false });
    }
    this.prayers.add(name);
    world.emit({ type: 'player_prayer', prayer: name, on: true });
    return null;
  }

  /** One tick of prayer drain: the counter grows by the active prayers' drain and sheds a point each time it passes the resistance. */
  private drainPrayers(): void {
    if (!this.prayerDrain || this.prayers.size === 0) return;
    const resistance = drainResistance(this.loadout.bonuses.other.prayer);
    this.prayerDrainCounter += totalDrain(this.prayers);
    while (this.prayerDrainCounter > resistance && this.prayerPoints > 0) {
      this.prayerDrainCounter -= resistance;
      this.prayerPoints--;
    }
    if (this.prayerPoints <= 0) {
      this.prayers.clear();
      this.prayerDrainCounter = 0;
    }
  }

  /** A boosted level drops by one every 100 ticks (one minute). */
  private decayBoosts(tick: number): void {
    const boosts = this.loadout.boosts;
    if (!boosts) return;
    for (const [stat, amount] of Object.entries(boosts) as Array<[keyof typeof boosts, number]>) {
      if (!(amount > 0)) continue;
      const since = this.boostSetTick.get(stat) ?? tick;
      if (tick - since < 100) continue;
      this.boostSetTick.set(stat, tick);
      this.loadout = { ...this.loadout, boosts: { ...this.loadout.boosts, [stat]: amount - 1 } };
    }
  }

  /** Change combat stance if the weapon offers it. The attack already in cooldown keeps its timing. */
  setStance(stance: Stance): boolean {
    if (!availableStances(this.loadout).includes(stance)) return false;
    this.loadout = { ...this.loadout, stance };
    return true;
  }

  /**
   * Eat or drink the item in an inventory slot. Food heals, can be eaten once every 3 ticks and
   * pushes the next attack back 3 ticks; a potion dose has its own 3-tick delay and does not delay
   * attacks. Returns false when the slot holds nothing usable or the delay has not passed.
   */
  useItem(world: World, slot: number): boolean {
    const itemId = this.inventory?.get(slot) ?? null;
    const effect = itemId === null ? undefined : this.items.get(itemId)?.effect;
    if (itemId === null || !effect || this.dead) return false;
    if (effect.kind === 'food') {
      if (world.tick < this.nextEatTick) return false;
      const healed = Math.min(effect.heal, this.maxHitpoints - this.hitpoints);
      this.hitpoints += healed;
      this.inventory!.set(slot, null);
      this.nextEatTick = world.tick + 3;
      this.nextAttackTick = Math.max(this.nextAttackTick, world.tick) + 3;
      world.emit({ type: 'player_consume', itemId, kind: 'food', healed });
      return true;
    }
    if (world.tick < this.nextDrinkTick) return false;
    if (effect.boost) {
      const stat = effect.boost.stat;
      const amount = effect.boost.amount(this.loadout.stats[stat] ?? 1);
      this.loadout = { ...this.loadout, boosts: { ...this.loadout.boosts, [stat]: Math.max(this.loadout.boosts?.[stat] ?? 0, amount) } };
      this.boostSetTick.set(stat, world.tick);
    }
    if (effect.restorePrayer) this.prayerPoints = Math.min(this.maxPrayerPoints, this.prayerPoints + effect.restorePrayer(this.maxPrayerPoints));
    this.inventory!.set(slot, effect.becomes);
    this.nextDrinkTick = world.tick + 3;
    world.emit({ type: 'player_consume', itemId, kind: 'potion', healed: 0 });
    return true;
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
    this.drainPrayers();
    this.decayBoosts(world.tick);
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
