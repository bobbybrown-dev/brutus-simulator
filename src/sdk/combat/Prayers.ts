import type { Factor } from './Formulas.ts';

export type ProtectionStyle = 'melee' | 'ranged' | 'magic';

export interface PrayerEffect {
  /** Overhead protection: which kind of attack it protects against. */
  protects?: ProtectionStyle;
  meleeAccuracy?: Factor;
  meleeStrength?: Factor;
  rangedAccuracy?: Factor;
  rangedStrength?: Factor;
  magicAccuracy?: Factor;
  defence?: Factor;
}

const pct = (n: number): Factor => [n, 100];

/** Factors as in osrs-dps-calc `enums/Prayer.ts`. */
export const Prayers = {
  PROTECT_FROM_MELEE: { protects: 'melee' },
  PROTECT_FROM_MISSILES: { protects: 'ranged' },
  PROTECT_FROM_MAGIC: { protects: 'magic' },
  THICK_SKIN: { defence: pct(105) },
  ROCK_SKIN: { defence: pct(110) },
  STEEL_SKIN: { defence: pct(115) },
  CLARITY_OF_THOUGHT: { meleeAccuracy: pct(105) },
  IMPROVED_REFLEXES: { meleeAccuracy: pct(110) },
  INCREDIBLE_REFLEXES: { meleeAccuracy: pct(115) },
  BURST_OF_STRENGTH: { meleeStrength: pct(105) },
  SUPERHUMAN_STRENGTH: { meleeStrength: pct(110) },
  ULTIMATE_STRENGTH: { meleeStrength: pct(115) },
  SHARP_EYE: { rangedAccuracy: pct(105), rangedStrength: pct(105) },
  HAWK_EYE: { rangedAccuracy: pct(110), rangedStrength: pct(110) },
  EAGLE_EYE: { rangedAccuracy: pct(115), rangedStrength: pct(115) },
  CHIVALRY: { meleeAccuracy: pct(115), meleeStrength: pct(118), defence: pct(120) },
  PIETY: { meleeAccuracy: pct(120), meleeStrength: pct(123), defence: pct(125) },
  RIGOUR: { rangedAccuracy: pct(120), rangedStrength: pct(123), defence: pct(125) },
  AUGURY: { magicAccuracy: pct(125), defence: pct(125) },
} as const satisfies Record<string, PrayerEffect>;

export type PrayerName = keyof typeof Prayers;

/** Factors that the active prayers contribute to one stat, in table order. */
export function prayerFactors(active: ReadonlySet<PrayerName>, stat: Exclude<keyof PrayerEffect, 'protects'>): Factor[] {
  const factors: Factor[] = [];
  for (const name of active) {
    const factor = (Prayers[name] as PrayerEffect)[stat];
    if (factor) factors.push(factor);
  }
  return factors;
}

export function isProtectedFrom(active: ReadonlySet<PrayerName>, style: ProtectionStyle): boolean {
  for (const name of active) if ((Prayers[name] as PrayerEffect).protects === style) return true;
  return false;
}
