import { Brutus } from '../content/brutus/Brutus.ts';
import { buildBrutusArena } from '../content/brutus/BrutusArena.ts';
import { BRUTUS_PLAYER_ENTRY_TILE, DEFAULT_BRUTUS_CONFIG, type BrutusConfig } from '../content/brutus/BrutusConstants.ts';
import { BrutusEncounter } from '../content/brutus/BrutusEncounter.ts';
import { CAPTURE_LOADOUT } from '../content/loadouts/CaptureLoadout.ts';
import type { CollisionMap, RegionCollisionJson } from '../sdk/Collision.ts';
import type { PlayerLoadout } from '../sdk/combat/Loadout.ts';
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
    const keepPrayer = this.player?.prayers.has('PROTECT_FROM_MELEE') ?? false;
    this.player = new Player(BRUTUS_PLAYER_ENTRY_TILE, loadout.stats.hitpoint, loadout);
    if (keepPrayer) this.player.prayers.add('PROTECT_FROM_MELEE');
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
    if (on) this.player.prayers.add('PROTECT_FROM_MELEE');
    else this.player.prayers.delete('PROTECT_FROM_MELEE');
  }

  get protectFromMelee(): boolean {
    return this.player.prayers.has('PROTECT_FROM_MELEE');
  }

  // ── Ticking ──────────────────────────────────────────────────────────────

  /** Advance one server tick and return what happened in it. */
  tick(): readonly SimEvent[] {
    if (this.player.dead) return [];
    this.world.tickOnce();
    const events = this.world.events.at(this.world.tick);
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
      damageDealt: this.damageDealt,
      damageTaken: this.damageTaken,
      dps: this.bossAliveTicks > 0 ? this.damageDealt / (this.bossAliveTicks * 0.6) : 0,
      lastKillTicks: kills.length > 0 ? kills[kills.length - 1]!.fightDurationTicks : null,
    };
  }
}
