import { playerEffectiveLevel, playerMagicDefenceLevel, playerMaxHit, playerRoll } from './Formulas.ts';
import { prayerFactors, type PrayerName } from './Prayers.ts';
import { zeroBonuses, type CombatBonuses, type CombatStats, type CombatStyle } from './Stats.ts';

export type Stance = 'accurate' | 'aggressive' | 'defensive' | 'controlled' | 'rapid' | 'longrange';

/** Everything about a player that the combat formulas need. */
export interface PlayerLoadout {
  /** Base levels. */
  stats: CombatStats;
  /** Temporary level changes from potions and the like, added to the base level. */
  boosts?: Partial<CombatStats>;
  bonuses: CombatBonuses;
  /** Style the equipped weapon attacks with. */
  attackStyle: CombatStyle;
  stance: Stance;
  /** Weapon speed in ticks, before the Rapid stance's −1. */
  weaponSpeed: number;
  /** Attack range in tiles (1 for melee), before Longrange's +2. */
  attackRange: number;
}

/** A level-1 character with nothing equipped. The default when no loadout is given. */
export const BARE_LOADOUT: PlayerLoadout = {
  stats: { attack: 1, strength: 1, defence: 1, range: 1, magic: 1, hitpoint: 10, prayer: 1 },
  bonuses: zeroBonuses(),
  attackStyle: 'crush',
  stance: 'accurate',
  weaponSpeed: 4,
  attackRange: 1,
};

const level = (l: PlayerLoadout, stat: keyof CombatStats): number => (l.stats[stat] ?? 0) + (l.boosts?.[stat] ?? 0);
const isRanged = (l: PlayerLoadout): boolean => l.attackStyle === 'range';

/** Ticks between the player's attacks. */
export const attackInterval = (l: PlayerLoadout): number => l.weaponSpeed - (l.stance === 'rapid' ? 1 : 0);

export const attackReach = (l: PlayerLoadout): number => l.attackRange + (l.stance === 'longrange' ? 2 : 0);

/** Defence roll against an incoming attack of `style`. */
export function playerDefenceRoll(l: PlayerLoadout, prayers: ReadonlySet<PrayerName>, style: CombatStyle): number {
  const stanceBonus = l.stance === 'defensive' || l.stance === 'longrange' ? 3 : l.stance === 'controlled' ? 1 : 0;
  // Reference order: prayer on the defence level, then the magic blend, then stance, then +8.
  let effective = playerEffectiveLevel(level(l, 'defence'), prayerFactors(prayers, 'defence'), 0) - 8;
  if (style === 'magic') {
    const magic = playerEffectiveLevel(level(l, 'magic'), prayerFactors(prayers, 'magicAccuracy'), 0) - 8;
    effective = playerMagicDefenceLevel(magic, effective);
  }
  return playerRoll(effective + stanceBonus + 8, l.bonuses.defence[style]);
}

/** Attack roll with the equipped weapon. Melee and ranged; magic is not modelled. */
export function playerAttackRoll(l: PlayerLoadout, prayers: ReadonlySet<PrayerName>): number {
  if (l.attackStyle === 'magic') throw new Error('magic attacks are not modelled');
  if (isRanged(l)) {
    const effective = playerEffectiveLevel(level(l, 'range'), prayerFactors(prayers, 'rangedAccuracy'), l.stance === 'accurate' ? 3 : 0);
    return playerRoll(effective, l.bonuses.attack.range);
  }
  const stanceBonus = l.stance === 'accurate' ? 3 : l.stance === 'controlled' ? 1 : 0;
  const effective = playerEffectiveLevel(level(l, 'attack'), prayerFactors(prayers, 'meleeAccuracy'), stanceBonus);
  return playerRoll(effective, l.bonuses.attack[l.attackStyle]);
}

/** Max hit with the equipped weapon. Melee and ranged; magic is not modelled. */
export function playerMaxHitOf(l: PlayerLoadout, prayers: ReadonlySet<PrayerName>): number {
  if (l.attackStyle === 'magic') throw new Error('magic attacks are not modelled');
  if (isRanged(l)) {
    const effective = playerEffectiveLevel(level(l, 'range'), prayerFactors(prayers, 'rangedStrength'), l.stance === 'accurate' ? 3 : 0);
    return playerMaxHit(effective, l.bonuses.other.rangedStrength);
  }
  const stanceBonus = l.stance === 'aggressive' ? 3 : l.stance === 'controlled' ? 1 : 0;
  const effective = playerEffectiveLevel(level(l, 'strength'), prayerFactors(prayers, 'meleeStrength'), stanceBonus);
  return playerMaxHit(effective, l.bonuses.other.meleeStrength);
}

/** Stances the equipped weapon offers. Bows: Accurate, Rapid, Longrange; melee: the four melee stances. */
export const availableStances = (l: PlayerLoadout): readonly Stance[] =>
  l.attackStyle === 'range' ? ['accurate', 'rapid', 'longrange'] : l.attackStyle === 'magic' ? ['accurate', 'longrange'] : ['accurate', 'aggressive', 'controlled', 'defensive'];
