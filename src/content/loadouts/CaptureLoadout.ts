import type { PlayerLoadout } from '../../sdk/combat/Loadout.ts';
import { sumBonuses, type CombatBonuses } from '../../sdk/combat/Stats.ts';

/** Shorthand: attack [stab, slash, crush, magic, range], defence [same], other [melee str, ranged str, magic dmg, prayer]. */
const item = (attack: number[], defence: number[], other: number[]): CombatBonuses => ({
  attack: { stab: attack[0]!, slash: attack[1]!, crush: attack[2]!, magic: attack[3]!, range: attack[4]! },
  defence: { stab: defence[0]!, slash: defence[1]!, crush: defence[2]!, magic: defence[3]!, range: defence[4]! },
  other: { meleeStrength: other[0]!, rangedStrength: other[1]!, magicDamage: other[2]!, prayer: other[3]! },
});

/**
 * The equipment worn in the captures, as listed in the worn-inventory packet at login
 * (capture 2, tick 0). Bonuses from osrs-dps-calc `cdn/json/equipment.json` at commit 74958b1.
 */
export const CAPTURE_EQUIPMENT = {
  'Snakeskin bandana (6326)': item([0, 0, 0, -5, 4], [2, 4, 4, 2, 2], [0, 0, 0, 0]),
  'Amulet of glory (1704)': item([10, 10, 10, 10, 10], [3, 3, 3, 3, 3], [6, 0, 0, 3]),
  'Magic shortbow (861)': item([0, 0, 0, 0, 69], [0, 0, 0, 0, 0], [0, 0, 0, 0]),
  "Black d'hide body (2503)": item([0, 0, 0, -15, 30], [30, 38, 45, 45, 50], [0, 0, 0, 0]),
  "Black d'hide chaps (2497)": item([0, 0, 0, -10, 17], [18, 20, 26, 23, 26], [0, 0, 0, 0]),
  "Black d'hide vambraces (2491)": item([0, 0, 0, -10, 11], [4, 5, 5, 8, 0], [0, 0, 0, 0]),
  'Snakeskin boots (6328)': item([0, 0, 0, -10, 3], [1, 1, 2, 1, 0], [0, 0, 0, 0]),
  'Rune arrow (892)': item([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 49, 0, 0]),
} as const;

/**
 * The player in the nine recorded kills: Attack 82, Strength 80, Defence 80, Ranged 85, Magic 80,
 * Hitpoints 85, Prayer 74; magic shortbow on Rapid (3-tick attacks in the logs) with rune arrows.
 *
 * Totals: defence stab 58 / slash 71 / crush 85 / magic 82 / ranged 81; ranged attack +144;
 * ranged strength +49.
 */
export const CAPTURE_LOADOUT: PlayerLoadout = {
  stats: { attack: 82, strength: 80, defence: 80, range: 85, magic: 80, hitpoint: 85, prayer: 74 },
  bonuses: sumBonuses(Object.values(CAPTURE_EQUIPMENT)),
  attackStyle: 'range',
  stance: 'rapid',
  weaponSpeed: 4,
  attackRange: 7,
};
