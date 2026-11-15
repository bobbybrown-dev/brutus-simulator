import type { ItemDefinition } from '../../sdk/Inventory.ts';

/** Cache item IDs used by the simulator. Names are checked against the cache by `npm run assets`. */
export const ItemIds = {
  snakeskinBandana: 6326,
  amuletOfGlory: 1704,
  magicShortbow: 861,
  blackDhideBody: 2503,
  blackDhideChaps: 2497,
  blackDhideVambraces: 2491,
  snakeskinBoots: 6328,
  runeArrow: 892,
  shark: 385,
  lobster: 379,
  rangingPotion4: 2444,
  rangingPotion3: 169,
  rangingPotion2: 171,
  rangingPotion1: 173,
  prayerPotion4: 2434,
  prayerPotion3: 139,
  prayerPotion2: 141,
  prayerPotion1: 143,
  vial: 229,
} as const;

const I = ItemIds;
const ranging = (amount: number): number => 4 + Math.floor(amount / 10);
const prayer = (level: number): number => 7 + Math.floor(level / 4);

const potion = (name: string, ids: readonly number[], effect: { boost?: { stat: 'range'; amount: (n: number) => number }; restorePrayer?: (n: number) => number }): ItemDefinition[] =>
  ids.map((id, i) => ({ id, name: `${name}(${ids.length - i})`, effect: { kind: 'potion', becomes: ids[i + 1] ?? I.vial, ...effect } }));

/**
 * Usable items. Heal amounts and potion formulas are the standard OSRS values (shark 20, lobster 12,
 * ranging potion +4 +10%, prayer potion 7 + 25%); the captures contain no eating or drinking.
 */
export const ITEMS: ReadonlyMap<number, ItemDefinition> = new Map(
  [
    { id: I.shark, name: 'Shark', effect: { kind: 'food', heal: 20 } },
    { id: I.lobster, name: 'Lobster', effect: { kind: 'food', heal: 12 } },
    ...potion('Ranging potion', [I.rangingPotion4, I.rangingPotion3, I.rangingPotion2, I.rangingPotion1], { boost: { stat: 'range', amount: ranging } }),
    ...potion('Prayer potion', [I.prayerPotion4, I.prayerPotion3, I.prayerPotion2, I.prayerPotion1], { restorePrayer: prayer }),
    { id: I.vial, name: 'Vial' },
    { id: I.snakeskinBandana, name: 'Snakeskin bandana' },
    { id: I.amuletOfGlory, name: 'Amulet of glory' },
    { id: I.magicShortbow, name: 'Magic shortbow' },
    { id: I.blackDhideBody, name: "Black d'hide body" },
    { id: I.blackDhideChaps, name: "Black d'hide chaps" },
    { id: I.blackDhideVambraces, name: "Black d'hide vambraces" },
    { id: I.snakeskinBoots, name: 'Snakeskin boots' },
    { id: I.runeArrow, name: 'Rune arrow' },
  ].map((item) => [item.id, item as ItemDefinition]),
);

/** Supplies a free-play fight starts with. A choice for the simulator, not something captured. */
export const DEFAULT_SUPPLIES: readonly number[] = [
  I.rangingPotion4,
  I.prayerPotion4,
  I.prayerPotion4,
  I.lobster,
  ...Array<number>(12).fill(I.shark),
];
