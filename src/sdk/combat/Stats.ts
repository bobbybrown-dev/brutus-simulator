/**
 * Combat stats and equipment bonuses. Field names follow `osrs-sdk` (`UnitStats`, `UnitBonuses`,
 * `UnitStyleBonuses`, `UnitOtherBonuses`) so content can move into that fork without renaming.
 */
export interface CombatStats {
  attack: number;
  strength: number;
  defence: number;
  range: number;
  magic: number;
  hitpoint: number;
  prayer?: number;
}

export interface StyleBonuses {
  stab: number;
  slash: number;
  crush: number;
  magic: number;
  range: number;
}

export interface OtherBonuses {
  meleeStrength: number;
  rangedStrength: number;
  magicDamage: number;
  prayer: number;
}

export interface CombatBonuses {
  attack: StyleBonuses;
  defence: StyleBonuses;
  other: OtherBonuses;
}

/** The style an attack is made with, which also selects the defence bonus it is rolled against. */
export type CombatStyle = keyof StyleBonuses;

export const zeroStyleBonuses = (): StyleBonuses => ({ stab: 0, slash: 0, crush: 0, magic: 0, range: 0 });
export const zeroBonuses = (): CombatBonuses => ({
  attack: zeroStyleBonuses(),
  defence: zeroStyleBonuses(),
  other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
});

/** Add up the bonuses of every worn item. */
export function sumBonuses(items: readonly CombatBonuses[]): CombatBonuses {
  const total = zeroBonuses();
  for (const item of items) {
    for (const style of Object.keys(total.attack) as CombatStyle[]) {
      total.attack[style] += item.attack[style];
      total.defence[style] += item.defence[style];
    }
    total.other.meleeStrength += item.other.meleeStrength;
    total.other.rangedStrength += item.other.rangedStrength;
    total.other.magicDamage += item.other.magicDamage;
    total.other.prayer += item.other.prayer;
  }
  return total;
}
