import { Brutus } from '../content/brutus/Brutus.ts';
import { buildBrutusArena } from '../content/brutus/BrutusArena.ts';
import { BRUTUS_PLAYER_ENTRY_TILE, DEFAULT_BRUTUS_CONFIG, type BrutusConfig } from '../content/brutus/BrutusConstants.ts';
import { BrutusEncounter } from '../content/brutus/BrutusEncounter.ts';
import { DEFAULT_SUPPLIES, ITEMS } from '../content/items/Items.ts';
import { CAPTURE_LOADOUT } from '../content/loadouts/CaptureLoadout.ts';
import type { CollisionMap, RegionCollisionJson } from '../sdk/Collision.ts';
import { availableStances, type PlayerLoadout, type Stance } from '../sdk/combat/Loadout.ts';
import { PRAYER_BOOK, type PrayerInfo, type PrayerRefusal } from '../sdk/combat/PrayerBook.ts';
import type { PrayerName } from '../sdk/combat/Prayers.ts';
import { Inventory, type ItemDefinition } from '../sdk/Inventory.ts';
import type { SimEvent } from '../sdk/Events.ts';
import type { Tile } from '../sdk/Location.ts';
import { Player } from '../sdk/Player.ts';
import { SeededRandom } from '../sdk/Random.ts';
import { World } from '../sdk/World.ts';

export interface SessionOptions {
  regionDumps: readonly RegionCollisionJson[];
  seed?: number;
  loadout?: PlayerLoadout;
  config?: BrutusConfig;
  /** Item IDs the inventory starts with (at most 28). */
  supplies?: readonly number[];
  /** Spend prayer points while prayers are on. Default true. */
  prayerDrain?: boolean;
  /** Prayers unlocked beyond their level requirement (Rigour, Piety, …). Default none. */
  unlockedPrayers?: readonly PrayerName[];
}

export interface PrayerSlot {
  info: PrayerInfo;
  active: boolean;
  /** Why it cannot be switched on right now, or null. */
  refusal: PrayerRefusal | null;
}

export interface InventorySlot {
  slot: number;
  item: ItemDefinition | null;
  usable: boolean;
}

export type SessionState = 'idle' | 'fighting' | 'dead';

export interface SessionStats {
  state: SessionState;
  tick: number;
  seed: number;
  kills: number;
  bossHp: number | null;
  bossMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  prayerPoints: number;
  maxPrayerPoints: number;
  /** Ranged level including any potion boost. */
  rangedLevel: number;
  stance: Stance;
  damageDealt: number;
  damageTaken: number;
  /** Damage dealt per second over the ticks a boss was alive. */
  dps: number;
  lastKillTicks: number | null;
}

/**
 * One playable fight: owns the headless world and turns UI intents (move here, attack, toggle a
 * prayer) into engine calls. No rendering and no DOM in here, so it runs under Node for tests and
 * could drive a bot as easily as a browser.
 */
export class GameSession {
  readonly collision: CollisionMap;
  world!: World;
  player!: Player;
  seed: number;
  /** Attack back automatically when hit while standing idle. */
  autoRetaliate = true;

  private readonly options: SessionOptions;
  private encounter: BrutusEncounter | null = null;
  private damageDealt = 0;
  private damageTaken = 0;
  private bossAliveTicks = 0;
  /** Events from intents applied between ticks, handed out with the next tick. */
  private pending: SimEvent[] = [];

  constructor(options: SessionOptions) {
    this.options = options;
    this.collision = buildBrutusArena(options.regionDumps);
    this.seed = options.seed ?? 1;
    this.reset(this.seed);
  }

  /** Throw the fight away and stand the player at the pen gate again. */
  reset(seed: number = this.seed): void {
    this.seed = seed;
    const loadout = this.options.loadout ?? CAPTURE_LOADOUT;
    const keepPrayers = [...(this.player?.prayers ?? [])];
    const stance = this.player?.loadout.stance ?? loadout.stance;
    this.player = new Player(BRUTUS_PLAYER_ENTRY_TILE, loadout.stats.hitpoint, { ...loadout, stance });
    this.player.prayerDrain = this.options.prayerDrain ?? true;
    for (const name of this.options.unlockedPrayers ?? []) this.player.unlockedPrayers.add(name);
    for (const name of keepPrayers) this.player.prayers.add(name);
    this.player.inventory = new Inventory(this.options.supplies ?? DEFAULT_SUPPLIES);
    this.player.items = ITEMS;
    this.pending = [];
    this.world = new World({ collision: this.collision, random: new SeededRandom(seed), player: this.player });
    this.encounter = null;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.bossAliveTicks = 0;
  }

  /** Release Brutus. He spawns on the next tick. */
  start(): void {
    if (this.encounter) return;
    this.encounter = new BrutusEncounter(this.world, { config: this.options.config ?? DEFAULT_BRUTUS_CONFIG });
    this.encounter.start();
  }

  get boss(): Brutus | null {
    return this.encounter?.boss ?? null;
  }

  get state(): SessionState {
    if (this.player.dead) return 'dead';
    return this.encounter ? 'fighting' : 'idle';
  }

  // ── Intents ──────────────────────────────────────────────────────────────

  /** Walk or run to a tile. Stops attacking, as a ground click does in the game. */
  moveTo(tile: Tile): void {
    if (this.player.dead) return;
    this.player.attack(null);
    this.player.moveTo(this.world, tile);
  }

  attackBoss(): void {
    const boss = this.boss;
    if (boss && !this.player.dead) this.player.attack(boss);
  }

  setProtectFromMelee(on: boolean): void {
    if (on !== this.protectFromMelee) this.togglePrayer('PROTECT_FROM_MELEE');
  }

  /** Switch a prayer on or off. Returns why it could not be switched on, or null. */
  togglePrayer(name: PrayerName): PrayerRefusal | null {
    if (this.player.dead) return null;
    return this.betweenTicks(() => this.player.togglePrayer(this.world, name));
  }

  /** Eat or drink what is in an inventory slot. False when nothing happened. */
  useItem(slot: number): boolean {
    return this.betweenTicks(() => this.player.useItem(this.world, slot));
  }

  setStance(stance: Stance): boolean {
    return this.player.setStance(stance);
  }

  /** Run an intent now and keep the events it emits for the next `tick()` result. */
  private betweenTicks<T>(intent: () => T): T {
    const before = this.world.events.at(this.world.tick).length;
    const result = intent();
    this.pending.push(...this.world.events.at(this.world.tick).slice(before));
    return result;
  }

  // ── Read-only views for the interface ────────────────────────────────────

  get prayerBook(): PrayerSlot[] {
    return PRAYER_BOOK.map((info) => ({ info, active: this.player.prayers.has(info.name), refusal: this.player.prayerRefusal(info.name) }));
  }

  get inventory(): InventorySlot[] {
    return (this.player.inventory?.slots ?? []).map((id, slot) => {
      const item = id === null ? null : (ITEMS.get(id) ?? { id, name: `Item ${id}` });
      return { slot, item, usable: item?.effect !== undefined };
    });
  }

  get stances(): readonly Stance[] {
    return availableStances(this.player.loadout);
  }

  get protectFromMelee(): boolean {
    return this.player.prayers.has('PROTECT_FROM_MELEE');
  }

  // ── Ticking ──────────────────────────────────────────────────────────────

  /** Advance one server tick and return what happened in it. */
  tick(): readonly SimEvent[] {
    if (this.player.dead) return [];
    this.world.tickOnce();
    const events = [...this.pending, ...this.world.events.at(this.world.tick)];
    this.pending = [];
    let wasHit = false;
    for (const e of events) {
      if (e.type !== 'hitsplat') continue;
      if (e.target === 'npc') this.damageDealt += e.damage;
      else {
        this.damageTaken += e.damage;
        wasHit = true;
      }
    }
    const boss = this.boss;
    if (boss?.alive) this.bossAliveTicks++;
    // The attack target dies with its boss; drop it so a respawn starts clean.
    if (this.player.target && !this.world.npcs.includes(this.player.target)) this.player.attack(null);
    if (this.autoRetaliate && wasHit && boss?.alive && !this.player.target && !this.player.destination) {
      this.player.attack(boss);
    }
    return events;
  }

  get stats(): SessionStats {
    const boss = this.boss;
    const kills = this.encounter?.kills ?? [];
    return {
      state: this.state,
      tick: this.world.tick,
      seed: this.seed,
      kills: kills.length,
      bossHp: boss && boss.spawnTick >= 0 ? boss.hitpoints : null,
      bossMaxHp: boss?.maxHitpoints ?? 58,
      playerHp: this.player.hitpoints,
      playerMaxHp: this.player.maxHitpoints,
      prayerPoints: this.player.prayerPoints,
      maxPrayerPoints: this.player.maxPrayerPoints,
      rangedLevel: (this.player.loadout.stats.range ?? 1) + (this.player.loadout.boosts?.range ?? 0),
      stance: this.player.loadout.stance,
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      dps: this.bossAliveTicks > 0 ? this.damageDealt / (this.bossAliveTicks * 0.6) : 0,
      lastKillTicks: kills.length > 0 ? kills[kills.length - 1]!.fightDurationTicks : null,
    };
  }
}
