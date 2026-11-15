/**
 * OSRS accuracy and max-hit formulas, integer-exact.
 *
 * Ported from weirdgloop/osrs-dps-calc at commit 74958b1 (`NPCVsPlayerCalc.ts`,
 * `PlayerVsNPCCalc.ts`, `BaseCalc.getNormalAccuracyRoll`). Every intermediate value is an integer;
 * `Math.trunc` appears exactly where the reference truncates.
 */

/** A multiplier expressed as [numerator, denominator], applied with truncation. */
export type Factor = readonly [number, number];

export const applyFactor = (value: number, [numerator, denominator]: Factor): number =>
  Math.trunc((value * numerator) / denominator);

// ── NPC ────────────────────────────────────────────────────────────────────

/** `(level + 9) · (bonus + 64)` — an NPC's attack roll for the style it attacks with. */
export const npcAttackRoll = (level: number, attackBonus: number): number => (level + 9) * (attackBonus + 64);

/** `(level + 9) · (bonus + 64)` — an NPC's defence roll against one attack style. */
export const npcDefenceRoll = (level: number, defenceBonus: number): number => (level + 9) * (defenceBonus + 64);

/** `trunc(((level + 9) · (bonus + 64) + 320) / 640)`. */
export const npcMaxHit = (level: number, strengthBonus: number): number =>
  Math.trunc(((level + 9) * (strengthBonus + 64) + 320) / 640);

// ── Player ─────────────────────────────────────────────────────────────────

/**
 * Effective level: the boosted level through each prayer factor (truncating each time), then the
 * stance bonus, then +8. The prayer is applied before the additions; the order changes results.
 */
export function playerEffectiveLevel(boostedLevel: number, prayerFactors: readonly Factor[], stanceBonus: number): number {
  let level = boostedLevel;
  for (const factor of prayerFactors) level = applyFactor(level, factor);
  return level + stanceBonus + 8;
}

/** `effectiveLevel · (bonus + 64)` — used for both the attack roll and the defence roll. */
export const playerRoll = (effectiveLevel: number, bonus: number): number => effectiveLevel * (bonus + 64);

/** `trunc((effectiveStrength · (bonus + 64) + 320) / 640)`. */
export const playerMaxHit = (effectiveStrength: number, strengthBonus: number): number =>
  Math.trunc((effectiveStrength * (strengthBonus + 64) + 320) / 640);

/** Defence against magic uses 70% effective Magic and 30% effective Defence. */
export const playerMagicDefenceLevel = (effectiveMagic: number, effectiveDefence: number): number =>
  Math.trunc((effectiveMagic * 7) / 10) + Math.trunc((effectiveDefence * 3) / 10);

// ── Accuracy ───────────────────────────────────────────────────────────────

/**
 * Probability that an attack roll beats a defence roll. Closed form of the server's check
 * `rand(0..attackRoll) > rand(0..defenceRoll)` for non-negative rolls.
 */
export function hitChance(attackRoll: number, defenceRoll: number): number {
  if (attackRoll < 0 || defenceRoll < 0) throw new RangeError('negative rolls are not supported');
  return attackRoll > defenceRoll
    ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
    : attackRoll / (2 * (defenceRoll + 1));
}
