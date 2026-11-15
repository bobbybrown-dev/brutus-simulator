import type { RandomSource } from '../Random.ts';
import { npcAttackRoll, npcDefenceRoll, npcMaxHit } from './Formulas.ts';
import { playerAttackRoll, playerDefenceRoll, playerMaxHitOf, type PlayerLoadout } from './Loadout.ts';
import { isProtectedFrom, type PrayerName, type ProtectionStyle } from './Prayers.ts';
import type { CombatBonuses, CombatStats, CombatStyle } from './Stats.ts';

/** `typeless` attacks have no style: nothing defends against them and no prayer applies. */
export type AttackStyle = CombatStyle | 'typeless';

/** What kind of attack this is, independent of who makes it. */
export interface AttackSpec {
  /** Used as the prefix of the random tags: `<name>.attackRoll`, `.defenceRoll`, `.damage`. */
  name: string;
  style: AttackStyle;
  /** `roll`: attack roll vs. defence roll. `always`: lands without a roll. */
  accuracy: 'roll' | 'always';
  /** `maxHit`: uniform 0..attacker's max hit. `range`: uniform min..max, independent of stats. */
  damage: { kind: 'maxHit' } | { kind: 'range'; min: number; max: number };
  /** Share of damage that gets through the matching protection prayer: 0 = none, 1 = all. */
  prayerPenetration: number;
  /** A landed hit that rolls 0 deals 1 instead (player attacks). */
  minimumOneOnHit?: boolean;
}

export interface Attacker {
  attackRoll(style: CombatStyle): number;
  maxHit(style: CombatStyle): number;
}

export interface Defender {
  defenceRoll(style: CombatStyle): number;
  isProtectedFrom(style: ProtectionStyle): boolean;
}

export interface AttackResult {
  /** The attack beat the defence roll (or needed none). */
  accurate: boolean;
  /** A protection prayer reduced the damage. */
  prayed: boolean;
  /** Damage to apply. 0 for a miss, a landed 0, or a fully prayed hit. */
  damage: number;
}

const protectionFor = (style: AttackStyle): ProtectionStyle | null =>
  style === 'typeless' ? null : style === 'range' ? 'ranged' : style === 'magic' ? 'magic' : 'melee';

/**
 * Resolve one attack. Rolls are made the way the server makes them — two integer rolls for
 * accuracy, one for damage — so a seeded source reproduces a fight exactly.
 */
export function resolveAttack(attacker: Attacker, defender: Defender, spec: AttackSpec, random: RandomSource): AttackResult {
  let accurate = true;
  if (spec.accuracy === 'roll') {
    if (spec.style === 'typeless') throw new Error(`${spec.name}: a typeless attack cannot roll accuracy`);
    const attack = random.int(attacker.attackRoll(spec.style) + 1, `${spec.name}.attackRoll`);
    const defence = random.int(defender.defenceRoll(spec.style) + 1, `${spec.name}.defenceRoll`);
    accurate = attack > defence;
  }
  if (!accurate) return { accurate, prayed: false, damage: 0 };

  let damage: number;
  if (spec.damage.kind === 'range') {
    damage = spec.damage.min + random.int(spec.damage.max - spec.damage.min + 1, `${spec.name}.damage`);
  } else {
    if (spec.style === 'typeless') throw new Error(`${spec.name}: a typeless attack needs a damage range`);
    damage = random.int(attacker.maxHit(spec.style) + 1, `${spec.name}.damage`);
    if (spec.minimumOneOnHit && damage === 0) damage = 1;
  }

  const protection = protectionFor(spec.style);
  const prayed = protection !== null && spec.prayerPenetration < 1 && defender.isProtectedFrom(protection);
  if (prayed) damage = Math.trunc(damage * spec.prayerPenetration);
  return { accurate, prayed, damage };
}

// ── Adapters ───────────────────────────────────────────────────────────────

const isMelee = (style: CombatStyle): boolean => style === 'stab' || style === 'slash' || style === 'crush';

/** An NPC as an attacker: level + 9 and its own bonuses. */
export function npcAttacker(stats: CombatStats, bonuses: CombatBonuses): Attacker {
  return {
    attackRoll: (style) =>
      npcAttackRoll(isMelee(style) ? stats.attack : style === 'range' ? stats.range : stats.magic, bonuses.attack[style]),
    maxHit: (style) =>
      isMelee(style)
        ? npcMaxHit(stats.strength, bonuses.other.meleeStrength)
        : style === 'range'
          ? npcMaxHit(stats.range, bonuses.other.rangedStrength)
          : npcMaxHit(stats.magic, bonuses.other.magicDamage),
  };
}

/** An NPC as a defender. Magic is defended with the Magic level, everything else with Defence. NPCs here do not pray. */
export function npcDefender(stats: CombatStats, bonuses: CombatBonuses): Defender {
  return {
    defenceRoll: (style) => npcDefenceRoll(style === 'magic' ? stats.magic : stats.defence, bonuses.defence[style]),
    isProtectedFrom: () => false,
  };
}

/** A player attacking with the equipped weapon; the style argument is ignored. */
export function playerAttacker(loadout: PlayerLoadout, prayers: ReadonlySet<PrayerName>): Attacker {
  return {
    attackRoll: () => playerAttackRoll(loadout, prayers),
    maxHit: () => playerMaxHitOf(loadout, prayers),
  };
}

export function playerDefender(loadout: PlayerLoadout, prayers: ReadonlySet<PrayerName>): Defender {
  return {
    defenceRoll: (style) => playerDefenceRoll(loadout, prayers, style),
    isProtectedFrom: (style) => isProtectedFrom(prayers, style),
  };
}
