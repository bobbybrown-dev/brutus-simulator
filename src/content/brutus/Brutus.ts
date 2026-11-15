import { npcAttacker, resolveAttack, type AttackSpec } from '../../sdk/combat/Attack.ts';
import { tile, type Tile } from '../../sdk/Location.ts';
import { Mob } from '../../sdk/Mob.ts';
import type { World } from '../../sdk/World.ts';
import {
  BRUTUS_BONUSES,
  BRUTUS_HITPOINTS,
  BRUTUS_SIZE,
  BRUTUS_SPAWN_TILE,
  BRUTUS_STATS,
  BRUTUS_SWING,
  BrutusIds,
  BrutusRandomTag,
  BrutusText,
  BrutusTiming as T,
  DEFAULT_BRUTUS_CONFIG,
  brutusChargeSpec,
  brutusStompSpec,
  OVERLAP_STEP_DIRECTIONS,
  type BrutusConfig,
  type SpecialKind,
} from './BrutusConstants.ts';
import {
  chargeDirection,
  chargeHits,
  chargeTargetTile,
  facingAngle,
  specialFaceTile,
  stompDangerTiles,
  stompDirection,
  stompTiles,
  type Direction,
} from './BrutusGeometry.ts';

export type BrutusPhase = 'spawning' | 'melee' | 'stomp' | 'charge' | 'dying' | 'gone';

/**
 * A special that has been announced but has not resolved yet. Read-only state for renderers and
 * agents; the real game shows only the animation, so this is derived, not a packet.
 */
export type BrutusTelegraph =
  | { kind: 'stomp'; startTick: number; resolveTick: number; marked: Tile[]; danger: Tile[] }
  | { kind: 'charge'; startTick: number; resolveTick: number; from: Tile; target: Tile; direction: Direction };

/**
 * Brutus (NPC 15626). State machine per BOSS_SPEC §5:
 *
 *   spawning (S..S+5) → melee block of 2 → special → melee block of 4 → special → …
 *
 * Specials alternate between a set of three stomps and a single charge. Each stomp or charge
 * takes 8 ticks: lock direction at T, resolve at T+4, free movement at T+6 and T+7.
 *
 * A special is an attack opportunity like a swing: it needs the player in melee range, and the
 * boss may step into range on the same tick. Later stomps of a set also wait for the player to
 * be within reach, chasing in the meantime.
 */
export class Brutus extends Mob {
  readonly npcId = BrutusIds.NPC;
  readonly size = BRUTUS_SIZE;
  readonly maxHitpoints = BRUTUS_HITPOINTS;
  readonly stats = BRUTUS_STATS;
  readonly bonuses = BRUTUS_BONUSES;

  phase: BrutusPhase = 'spawning';
  /** Tick HP reached 0, or -1 while alive. */
  deathTick = -1;
  /** Called on the despawn tick, after the mob has been removed from the world. */
  onDespawn: ((world: World, boss: Brutus) => void) | null = null;

  private readonly config: BrutusConfig;
  private swingsLeft = 0;
  /** Earliest tick for the next swing or special. */
  private nextActionTick = 0;
  private nextSpecial: SpecialKind | null = null;
  private specialStart = 0;
  private stompsDone = 0;
  private lockedDir: Direction = { dx: 0, dy: -1 };
  /** SW tile the charge is aiming for, fixed at the growl. */
  private chargeTarget: Tile = BRUTUS_SPAWN_TILE;
  /** Wind-up facing to send next tick (the boss stepped on the tick the special began). */
  private pendingFace: Tile | null = null;
  private deathAnimDelay: number = T.DEATH_ANIM;
  private specialResolved = true;

  constructor(config: BrutusConfig = DEFAULT_BRUTUS_CONFIG, location: Tile = BRUTUS_SPAWN_TILE) {
    super(location);
    this.config = config;
  }

  /** The pending stomp or charge, from the tick it is announced until the tick it resolves. */
  get telegraph(): BrutusTelegraph | null {
    if (this.specialResolved || (this.phase !== 'stomp' && this.phase !== 'charge')) return null;
    const startTick = this.specialStart;
    const resolveTick = startTick + T.SPECIAL_IMPACT;
    if (this.phase === 'stomp') {
      return {
        kind: 'stomp',
        startTick,
        resolveTick,
        marked: stompTiles(this.location, this.lockedDir),
        danger: stompDangerTiles(this.location, this.lockedDir),
      };
    }
    return { kind: 'charge', startTick, resolveTick, from: this.location, target: this.chargeTarget, direction: this.lockedDir };
  }

  /** Direction locked for the current special (meaningful while `telegraph` is non-null). */
  get lockedDirection(): Direction {
    return this.lockedDir;
  }

  /** Fight timer as the game reports it: spawn tick to death-animation tick. -1 while alive. */
  get fightDurationTicks(): number {
    return this.deathTick < 0 ? -1 : this.deathTick + T.FIGHT_TIMER_STOP - this.spawnTick;
  }

  protected onSpawn(world: World): void {
    world.emit({ type: 'npc_seq', npcId: this.npcId, seq: BrutusIds.SEQ_SPAWN, delayCycles: 0 });
    world.emit({ type: 'npc_face_coord', npcId: this.npcId, at: world.player.location });
    world.emit({ type: 'sound', id: BrutusIds.SOUND_SPAWN });
  }

  protected onTick(world: World): void {
    const t = world.tick;

    if (this.phase === 'dying') {
      this.tickDying(world);
      return;
    }
    if (this.phase === 'gone') return;
    if (this.hitpoints <= 0) {
      // Hits land before the boss acts. On the tick it dies the boss may still take its
      // movement step, but it does not swing or start a special, and anything pending is dropped.
      const moved = world.player.dead ? false : this.moveOnly(world);
      this.phase = 'dying';
      this.specialResolved = true;
      this.deathTick = t;
      this.deathAnimDelay = moved ? T.DEATH_ANIM_AFTER_MOVE : T.DEATH_ANIM;
      this.pendingFace = null;
      return;
    }
    if (this.pendingFace) {
      world.emit({ type: 'npc_face_coord', npcId: this.npcId, at: this.pendingFace });
      this.pendingFace = null;
    }

    if (this.phase === 'spawning') {
      const sinceSpawn = t - this.spawnTick;
      if (sinceSpawn === T.WAKE_SAY) world.emit({ type: 'npc_say', npcId: this.npcId, text: BrutusText.WAKE });
      if (sinceSpawn < T.ACTIVE) return;
      this.enterMeleeBlock(T.OPENING_BLOCK, t);
    }

    if (world.player.dead) return;
    if (this.phase === 'melee') this.tickMelee(world);
    else this.tickSpecial(world);
  }

  // ── Melee ────────────────────────────────────────────────────────────────

  private enterMeleeBlock(swings: number, eligibleTick: number): void {
    this.phase = 'melee';
    this.swingsLeft = swings;
    this.nextActionTick = eligibleTick;
  }

  private tickMelee(world: World): void {
    // Player tile as of the end of the previous tick: NPCs act before players move.
    const target = world.player.location;
    if (this.occupies(target)) {
      // Standing on top of the target: shuffle off in a random cardinal direction, no action.
      this.overlapStep(world);
      return;
    }
    const moved = !this.inMeleeRange(target) && this.stepToward(world, target);
    if (world.tick < this.nextActionTick || !this.inMeleeRange(target)) return;
    // An attack opportunity. Once the block's swings are spent it becomes the special instead,
    // so a special waits for melee range exactly like a swing does.
    if (this.swingsLeft > 0) this.swing(world);
    else this.startSpecial(world, moved);
  }

  /** The movement half of a tick with no action. Returns true if the boss changed tile. */
  private moveOnly(world: World): boolean {
    const target = world.player.location;
    if (this.phase === 'spawning') return false;
    if (this.phase !== 'melee') {
      const elapsed = world.tick - this.specialStart;
      if (elapsed < T.SPECIAL_FREE_MOVE) return false;
      // Waiting to continue a stomp set: within reach means it would have stomped, not moved.
      if (elapsed >= T.SPECIAL_LENGTH) {
        if (this.occupies(target) || this.inMeleeRange(target)) return false;
        return this.stepToward(world, target);
      }
    }
    const before = this.location;
    if (this.occupies(target)) this.overlapStep(world);
    else if (!this.inMeleeRange(target)) this.stepToward(world, target);
    return before !== this.location;
  }

  private swing(world: World): void {
    world.emit({ type: 'npc_seq', npcId: this.npcId, seq: BrutusIds.SEQ_ATTACK, delayCycles: 0 });
    this.hit(world, BRUTUS_SWING, 'brutus.melee');
    this.swingsLeft--;
    this.nextActionTick = world.tick + T.ATTACK_SPEED;
  }

  private overlapStep(world: World): void {
    const pick = world.random.int(OVERLAP_STEP_DIRECTIONS.length, BrutusRandomTag.OVERLAP_STEP);
    const [dx, dy] = OVERLAP_STEP_DIRECTIONS[pick]!;
    if (world.collision.canTravel(this.location, this.size, dx, dy)) {
      this.setLocation(world, tile(this.location.x + dx, this.location.y + dy));
    }
  }

  // ── Specials ─────────────────────────────────────────────────────────────

  private startSpecial(world: World, movedThisTick: boolean): void {
    let kind = this.nextSpecial;
    if (!kind) {
      kind =
        this.config.firstSpecial === 'random'
          ? world.random.int(2, BrutusRandomTag.FIRST_SPECIAL) === 0
            ? 'stomp'
            : 'charge'
          : this.config.firstSpecial;
    }
    this.nextSpecial = kind === 'stomp' ? 'charge' : 'stomp';
    if (kind === 'stomp') {
      this.stompsDone = 0;
      this.beginStomp(world, movedThisTick);
    } else {
      this.beginCharge(world, movedThisTick);
    }
  }

  private beginStomp(world: World, movedThisTick: boolean): void {
    this.phase = 'stomp';
    this.specialResolved = false;
    this.specialStart = world.tick;
    this.lockedDir = stompDirection(this.location, world.player.location);
    this.emitWindUp(world, BrutusIds.SEQ_STOMP, 30, BrutusText.STOMP, BrutusIds.SOUND_SNORT, movedThisTick);
  }

  private beginCharge(world: World, movedThisTick: boolean): void {
    this.phase = 'charge';
    this.specialResolved = false;
    this.specialStart = world.tick;
    this.lockedDir = chargeDirection(this.location, world.player.location);
    this.chargeTarget = chargeTargetTile(this.location, this.lockedDir, world.player.location);
    this.emitWindUp(world, BrutusIds.SEQ_CHARGE, 60, BrutusText.CHARGE, BrutusIds.SOUND_GROWL, movedThisTick);
  }

  private emitWindUp(world: World, seq: number, delayCycles: number, text: string, sound: number, movedThisTick: boolean): void {
    world.emit({ type: 'npc_seq', npcId: this.npcId, seq, delayCycles });
    world.emit({ type: 'npc_say', npcId: this.npcId, text });
    world.emit({ type: 'sound', id: sound });
    // A step and a fixed facing cannot share a tick: when the boss walked into range on the tick
    // the special began, the facing coordinate follows one tick later.
    const face = specialFaceTile(this.location, this.lockedDir);
    if (movedThisTick) this.pendingFace = face;
    else world.emit({ type: 'npc_face_coord', npcId: this.npcId, at: face });
  }

  private tickSpecial(world: World): void {
    const elapsed = world.tick - this.specialStart;
    if (elapsed === T.SPECIAL_IMPACT) {
      if (this.phase === 'stomp') this.resolveStomp(world);
      else this.resolveCharge(world);
    } else if (elapsed >= T.SPECIAL_FREE_MOVE && elapsed < T.SPECIAL_LENGTH) {
      const target = world.player.location;
      if (this.occupies(target)) this.overlapStep(world);
      else if (!this.inMeleeRange(target)) this.stepToward(world, target);
    } else if (elapsed >= T.SPECIAL_LENGTH) {
      if (this.phase === 'stomp' && this.stompsDone + 1 < T.STOMPS_PER_SET) {
        // Stomps 2 and 3 need the player within reach (adjacent, or under the boss) at the start
        // of the tick. If not, the boss keeps chasing and tries again next tick; unlike the first
        // special of a set, it does not step and stomp on the same tick (K10 561/562, 573/574).
        const target = world.player.location;
        if (this.occupies(target) || this.inMeleeRange(target)) {
          this.stompsDone++;
          this.beginStomp(world, false);
        } else {
          this.stepToward(world, target);
        }
        return;
      }
      this.enterMeleeBlock(T.BLOCK, world.tick);
      this.tickMelee(world);
    }
  }

  private resolveStomp(world: World): void {
    this.specialResolved = true;
    world.emit({ type: 'npc_spotanim', npcId: this.npcId, spotanim: BrutusIds.SPOTANIM_STOMP_BOSS });
    for (const at of stompTiles(this.location, this.lockedDir)) {
      world.emit({ type: 'map_anim', spotanim: BrutusIds.SPOTANIM_STOMP_TILE, at });
    }
    const p = world.player.location;
    if (stompDangerTiles(this.location, this.lockedDir).some((d) => d.x === p.x && d.y === p.y)) {
      this.hit(world, brutusStompSpec(this.config), 'brutus.stomp');
    }
  }

  private resolveCharge(world: World): void {
    this.specialResolved = true;
    const from = this.location;
    const { dx, dy } = this.lockedDir;
    const step = (t: Tile): Tile => tile(t.x + dx, t.y + dy);
    const distance = Math.max(0, (this.chargeTarget.x - from.x) * dx + (this.chargeTarget.y - from.y) * dy);

    // The dash ignores scenery but not fences or walls (K8: stopped short at the pen fence).
    let to = from;
    for (let i = 0; i < distance && world.collision.canTravel(to, this.size, dx, dy, true); i++) to = step(to);
    // It cannot come to rest on scenery: carry on until the footprint is clear (K9 tick 485:
    // 5 tiles instead of 4, past the object at 3257,3289). INFERRED from that one dash.
    let landing = to;
    for (let i = 0; i < T.CHARGE_MAX_OVERRUN && world.collision.footprintHasSolid(landing, this.size); i++) {
      if (!world.collision.canTravel(landing, this.size, dx, dy, true)) break;
      landing = step(landing);
    }
    if (!world.collision.footprintHasSolid(landing, this.size)) to = landing;
    else while (world.collision.footprintHasSolid(to, this.size) && !(to.x === from.x && to.y === from.y)) to = tile(to.x - dx, to.y - dy);

    this.location = to;
    world.emit({
      type: 'npc_exact_move',
      npcId: this.npcId,
      from,
      to,
      delay1: 0,
      delay2: T.CHARGE_EXACT_MOVE_CYCLES,
      angle: facingAngle(this.lockedDir),
    });
    if (chargeHits(from, to, world.player.location)) {
      this.hit(world, brutusChargeSpec(this.config), 'brutus.charge');
    }
  }

  // ── Death ────────────────────────────────────────────────────────────────

  private tickDying(world: World): void {
    const elapsed = world.tick - this.deathTick;
    if (elapsed === T.DEATH_SAY) world.emit({ type: 'npc_say', npcId: this.npcId, text: BrutusText.DEATH });
    if (elapsed === this.deathAnimDelay) {
      world.emit({ type: 'npc_seq', npcId: this.npcId, seq: BrutusIds.SEQ_DEATH, delayCycles: 0 });
    } else if (elapsed === this.deathAnimDelay + T.DESPAWN_AFTER_ANIM) {
      this.phase = 'gone';
      world.emit({ type: 'npc_despawn', npcId: this.npcId, at: this.location });
      world.removeMob(this);
      this.onDespawn?.(world, this);
    }
  }

  /** Resolve one of Brutus's attacks against the player and apply the result. */
  private hit(world: World, spec: AttackSpec, source: string): void {
    const result = resolveAttack(npcAttacker(this.stats, this.bonuses), world.player.asDefender(), spec, world.random);
    world.player.takeHit(world, result.damage, source);
  }
}
