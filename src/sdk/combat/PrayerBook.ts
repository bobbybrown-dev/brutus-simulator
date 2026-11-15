import type { PrayerName } from './Prayers.ts';

/** Prayers sharing a group cannot be active together; switching one on switches the others off. */
export type PrayerGroup = 'overhead' | 'defence' | 'attack' | 'strength';

export interface PrayerInfo {
  name: PrayerName;
  label: string;
  /** Prayer level needed. */
  level: number;
  /** Drain effect: added to the drain counter every tick the prayer is on. */
  drain: number;
  groups: readonly PrayerGroup[];
  /** Needs a quest or scroll in addition to the level (Chivalry, Piety, Preserve, Rigour, Augury). */
  requiresUnlock?: boolean;
}

const p = (name: PrayerName, label: string, level: number, drain: number, groups: PrayerGroup[], requiresUnlock = false): PrayerInfo => ({ name, label, level, drain, groups, requiresUnlock });

/** Ranged and magic prayers replace both the melee attack and melee strength prayers. */
const OFFENCE: PrayerGroup[] = ['attack', 'strength'];
const ALL: PrayerGroup[] = ['attack', 'strength', 'defence'];

/**
 * The standard prayer book in interface order. Levels and drain effects are the OSRS Wiki's
 * (protection prayers 12, Piety/Rigour/Augury 24); none of this appears in the captures.
 */
export const PRAYER_BOOK: readonly PrayerInfo[] = [
  p('THICK_SKIN', 'Thick Skin', 1, 1, ['defence']),
  p('BURST_OF_STRENGTH', 'Burst of Strength', 4, 1, ['strength']),
  p('CLARITY_OF_THOUGHT', 'Clarity of Thought', 7, 1, ['attack']),
  p('SHARP_EYE', 'Sharp Eye', 8, 1, OFFENCE),
  p('MYSTIC_WILL', 'Mystic Will', 9, 1, OFFENCE),
  p('ROCK_SKIN', 'Rock Skin', 10, 6, ['defence']),
  p('SUPERHUMAN_STRENGTH', 'Superhuman Strength', 13, 6, ['strength']),
  p('IMPROVED_REFLEXES', 'Improved Reflexes', 16, 6, ['attack']),
  p('RAPID_RESTORE', 'Rapid Restore', 19, 1, []),
  p('RAPID_HEAL', 'Rapid Heal', 22, 2, []),
  p('PROTECT_ITEM', 'Protect Item', 25, 2, []),
  p('HAWK_EYE', 'Hawk Eye', 26, 6, OFFENCE),
  p('MYSTIC_LORE', 'Mystic Lore', 27, 6, OFFENCE),
  p('STEEL_SKIN', 'Steel Skin', 28, 12, ['defence']),
  p('ULTIMATE_STRENGTH', 'Ultimate Strength', 31, 12, ['strength']),
  p('INCREDIBLE_REFLEXES', 'Incredible Reflexes', 34, 12, ['attack']),
  p('PROTECT_FROM_MAGIC', 'Protect from Magic', 37, 12, ['overhead']),
  p('PROTECT_FROM_MISSILES', 'Protect from Missiles', 40, 12, ['overhead']),
  p('PROTECT_FROM_MELEE', 'Protect from Melee', 43, 12, ['overhead']),
  p('EAGLE_EYE', 'Eagle Eye', 44, 12, OFFENCE),
  p('MYSTIC_MIGHT', 'Mystic Might', 45, 12, OFFENCE),
  p('RETRIBUTION', 'Retribution', 46, 3, ['overhead']),
  p('REDEMPTION', 'Redemption', 49, 6, ['overhead']),
  p('SMITE', 'Smite', 52, 18, ['overhead']),
  p('PRESERVE', 'Preserve', 55, 2, [], true),
  p('CHIVALRY', 'Chivalry', 60, 12, ALL, true),
  p('PIETY', 'Piety', 70, 24, ALL, true),
  p('RIGOUR', 'Rigour', 74, 24, ALL, true),
  p('AUGURY', 'Augury', 77, 24, ALL, true),
];

const BY_NAME = new Map(PRAYER_BOOK.map((info) => [info.name, info]));

export function prayerInfo(name: PrayerName): PrayerInfo {
  const info = BY_NAME.get(name);
  if (!info) throw new Error(`${name} is not in the standard prayer book`);
  return info;
}

/** Points are lost each time the drain counter exceeds this. */
export const drainResistance = (prayerBonus: number): number => 60 + 2 * prayerBonus;

export const totalDrain = (active: ReadonlySet<PrayerName>): number => {
  let sum = 0;
  for (const name of active) sum += BY_NAME.get(name)?.drain ?? 0;
  return sum;
};

/** Active prayers that `name` would switch off. */
export function conflictsWith(name: PrayerName, active: ReadonlySet<PrayerName>): PrayerName[] {
  const groups = prayerInfo(name).groups;
  return [...active].filter((other) => other !== name && (BY_NAME.get(other)?.groups ?? []).some((g) => groups.includes(g)));
}

export type PrayerRefusal = 'level' | 'locked' | 'no-points';
