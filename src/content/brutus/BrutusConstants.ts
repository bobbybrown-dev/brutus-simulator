import type { AttackSpec } from '../../sdk/combat/Attack.ts';
import type { CombatBonuses, CombatStats } from '../../sdk/combat/Stats.ts';
import { tile } from '../../sdk/Location.ts';

/** IDs from `brutus_ids.json` (RSProx rev 242.1). */
export const BrutusIds = {
  NPC: 15626,
  SEQ_SPAWN: 13790,
  SEQ_ATTACK: 13783,
  SEQ_STOMP: 13785,
  SEQ_CHARGE: 13778,
  SEQ_DEATH: 13784,
  SPOTANIM_STOMP_TILE: 3588,
  SPOTANIM_STOMP_BOSS: 3589,
  SOUND_SPAWN: 11212,
  SOUND_SNORT: 11213,
  SOUND_GROWL: 11210,
} as const;

export const BrutusSeqNames: Readonly<Record<number, string>> = {
  [BrutusIds.SEQ_SPAWN]: 'cow_boss_spawn',
  [BrutusIds.SEQ_ATTACK]: 'cow_boss_attack',
  [BrutusIds.SEQ_STOMP]: 'cow_boss_stomp',
  [BrutusIds.SEQ_CHARGE]: 'cow_boss_charge',
  [BrutusIds.SEQ_DEATH]: 'cow_boss_death',
};

export const BrutusSoundNames: Readonly<Record<number, string>> = {
  [BrutusIds.SOUND_SPAWN]: 'cb_boss_moo_angry_01',
  [BrutusIds.SOUND_SNORT]: 'cb_boss_snort_01',
  [BrutusIds.SOUND_GROWL]: 'cb_boss_growl_01',
};

export const BrutusText = {
  WAKE: 'Moo',
  STOMP: '*snorts*',
  CHARGE: '*growls*',
  DEATH: 'm-moo...',
} as const;

/** All values in ticks, from BOSS_SPEC §4. */
export const BrutusTiming = {
  WAKE_SAY: 5,
  ACTIVE: 6,
  ATTACK_SPEED: 5,
  OPENING_BLOCK: 2,
  BLOCK: 4,
  SPECIAL_IMPACT: 4,
  SPECIAL_FREE_MOVE: 6,
  SPECIAL_LENGTH: 8,
  STOMPS_PER_SET: 3,
  /** The charge aims its SW tile this many tiles past the player along the charge axis. */
  CHARGE_PAST_PLAYER: 3,
  CHARGE_MAX_OVERRUN: 3,
  CHARGE_EXACT_MOVE_CYCLES: 60,
  DEATH_SAY: 1,
  FIGHT_TIMER_STOP: 1,
  DEATH_ANIM: 1,
  /** Death animation delay when the boss took a step on the tick it died (K7; one sample). */
  DEATH_ANIM_AFTER_MOVE: 3,
  DESPAWN_AFTER_ANIM: 4,
  /** Ticks from the despawn to the next spawn. */
  RESPAWN_AFTER_DESPAWN: 35,
  /**
   * Documented, not captured, not yet wired to anything: ringing the cowbell amulet right after
   * the kill shortens the respawn to this many ticks.
   */
  RESPAWN_AFTER_COWBELL: 13,
} as const;

export const BRUTUS_SIZE = 3;
export const BRUTUS_HITPOINTS = 58;
export const BRUTUS_SPAWN_TILE = tile(3261, 3287);
export const BRUTUS_PLAYER_ENTRY_TILE = tile(3262, 3294);

/** Combat levels: wiki infobox and osrs-dps-calc `monsters.json` (id 15626, "Post-quest"). */
export const BRUTUS_STATS: CombatStats = { attack: 12, strength: 25, defence: 10, range: 1, magic: 8, hitpoint: 58 };

export const BRUTUS_BONUSES: CombatBonuses = {
  attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
  defence: { stab: -7, slash: -7, crush: -7, magic: -3, range: -7 },
  other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
};

export type SpecialKind = 'stomp' | 'charge';

export interface DamageRange {
  min: number;
  max: number;
}

export interface BrutusConfig {
  /** First special of the fight. Captured openings: stomp 7, charge 3 (one of them the quest kill). */
  firstSpecial: SpecialKind | 'random';
  /**
   * Stomp and charge damage: 15–19, the documented OSRS range. Our 14 recorded hits were all
   * 15–17 (with and without Protect from Melee), so 18 and 19 have not been seen in a capture.
   */
  stompDamage: DamageRange;
  chargeDamage: DamageRange;
}

export const DEFAULT_BRUTUS_CONFIG: BrutusConfig = {
  firstSpecial: 'random',
  stompDamage: { min: 15, max: 19 },
  chargeDamage: { min: 15, max: 19 },
};

/**
 * The swing: an ordinary crush attack. Attack roll (12 + 9) · 64 = 1,344 against the player's
 * crush defence roll; damage uniform 0..3. Protect from Melee blocks it completely — confirmed
 * from OSRS documentation. (Our captures cannot show it: every swing under the prayer was a 0,
 * but so were 68 of 69 without it.)
 */
export const BRUTUS_SWING: AttackSpec = {
  name: 'brutus.swing',
  style: 'crush',
  accuracy: 'roll',
  damage: { kind: 'maxHit' },
  prayerPenetration: 0,
};

/** Stomp and charge are typeless: no accuracy roll, and protection prayers do nothing (K6: 8 of 8). */
export const brutusStompSpec = (config: BrutusConfig): AttackSpec => ({
  name: 'brutus.stomp',
  style: 'typeless',
  accuracy: 'always',
  damage: { kind: 'range', ...config.stompDamage },
  prayerPenetration: 1,
});

export const brutusChargeSpec = (config: BrutusConfig): AttackSpec => ({
  name: 'brutus.charge',
  style: 'typeless',
  accuracy: 'always',
  damage: { kind: 'range', ...config.chargeDamage },
  prayerPenetration: 1,
});

/** Tags passed to `RandomSource.int` so replay oracles can tell the decisions apart. */
export const BrutusRandomTag = {
  FIRST_SPECIAL: 'brutus.firstSpecial',
  OVERLAP_STEP: 'brutus.overlapStep',
  SWING_ATTACK_ROLL: 'brutus.swing.attackRoll',
  SWING_DEFENCE_ROLL: 'brutus.swing.defenceRoll',
  SWING_DAMAGE: 'brutus.swing.damage',
  STOMP_DAMAGE: 'brutus.stomp.damage',
  CHARGE_DAMAGE: 'brutus.charge.damage',
} as const;

/**
 * Outcomes for `BrutusRandomTag.OVERLAP_STEP`, by index: a step west, east, south or north, or
 * no step at all. Recorded while the boss stood on the player (15 rolls): W ×6, N ×5, E ×2, S ×1,
 * no step ×1; never diagonal. The real weights are unknown; the seeded source picks uniformly
 * from these five.
 */
export const OVERLAP_STEP_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [0, 0],
];
