import type { CacheAssets } from './assetBundle/manifest.ts';
import { BrutusIds } from './content/brutus/BrutusConstants.ts';
import { ItemIds } from './content/items/Items.ts';

export { ItemIds };

/**
 * Everything this simulator takes from the OSRS cache, by cache ID. Browser-safe: the client
 * imports the IDs, and `npm run assets` extracts exactly this list into public/osrs-assets/.
 * Add an ID here, run `npm run assets`, and a missing definition fails the build with its ID.
 */

/** Sprite-group IDs (RuneLite `gameval.SpriteID`, checked against the cache by the build). */
export const SpriteIds = {
  headIconsPrayer: 440,
  /** Fixed-mode frame: chatbox, border strips and the minimap surround. */
  chatBackground: 1017,
  mainStonesBottom: 1018,
  miniLeft: 1037,
  miniRight: 1038,
  mainTop: 1039,
  fixedMinimapCover: 1182,
  miniBottom: 1611,
  sideBackground: 1031,
  sideBackgroundBottom: 1032,
  sideBackgroundLeft1: 1033,
  sideBackgroundLeft2: 1034,
  sideBackgroundRight: 1035,
  sideBackgroundTop: 1036,
  /** Side-tab icons in tab order. */
  tabCombat: 168,
  tabStats: 898,
  tabQuests: 899,
  tabInventory: 900,
  tabEquipment: 901,
  tabPrayer: 902,
  tabMagic: 903,
  /** Bottom-row side-tab icons, left to right; their panels are placeholders in this simulator. */
  tabBottom0: 904,
  tabBottom1: 905,
  tabBottom2: 906,
  tabBottom3: 907,
  tabBottom4: 908,
  tabBottom5: 909,
  tabBottom6: 910,
  /** Empty-slot silhouettes of the equipment tab (`Wornicons`). */
  wornHead: 156,
  wornCape: 157,
  wornNeck: 158,
  wornWeapon: 159,
  wornRing: 160,
  wornTorso: 161,
  wornShield: 162,
  wornLegs: 163,
  wornHands: 164,
  wornFeet: 165,
  wornAmmo: 166,
} as const;

/** Prayer-book icons: [name, sprite when available, sprite when unavailable], in `Prayeron` / `Prayeroff` order. */
export const PRAYER_SPRITES = {
  THICK_SKIN: [115, 135],
  BURST_OF_STRENGTH: [116, 136],
  CLARITY_OF_THOUGHT: [117, 137],
  ROCK_SKIN: [118, 138],
  SUPERHUMAN_STRENGTH: [119, 139],
  IMPROVED_REFLEXES: [120, 140],
  RAPID_RESTORE: [121, 141],
  RAPID_HEAL: [122, 142],
  PROTECT_ITEM: [123, 143],
  STEEL_SKIN: [124, 144],
  ULTIMATE_STRENGTH: [125, 145],
  INCREDIBLE_REFLEXES: [126, 146],
  PROTECT_FROM_MAGIC: [127, 147],
  PROTECT_FROM_MISSILES: [128, 148],
  PROTECT_FROM_MELEE: [129, 149],
  REDEMPTION: [130, 150],
  RETRIBUTION: [131, 151],
  SMITE: [132, 152],
  SHARP_EYE: [133, 153],
  MYSTIC_WILL: [134, 154],
  HAWK_EYE: [502, 506],
  MYSTIC_LORE: [503, 507],
  EAGLE_EYE: [504, 508],
  MYSTIC_MIGHT: [505, 509],
  CHIVALRY: [945, 949],
  PIETY: [946, 950],
  PRESERVE: [947, 951],
  RIGOUR: [1420, 1424],
  AUGURY: [1421, 1425],
} as const satisfies Record<string, readonly [number, number]>;

/** Frames of the overhead prayer sprite group. */
export const HEAD_ICON_FRAMES = { PROTECT_FROM_MELEE: 0, PROTECT_FROM_MISSILES: 1, PROTECT_FROM_MAGIC: 2, RETRIBUTION: 3, SMITE: 4, REDEMPTION: 5 } as const;

export const PLAYER_SEQUENCES = { idle: 808, walk: 819, run: 824, fireBow: 426, block: 424, death: 836, eat: 829 } as const;

type SpriteRequirement = { id: number; frame?: number };
const single: Record<string, SpriteRequirement> = Object.fromEntries(Object.entries(SpriteIds).filter(([name]) => name !== 'headIconsPrayer').map(([name, id]) => [name, { id }]));
const prayerIcons: Record<string, SpriteRequirement> = Object.fromEntries(
  Object.entries(PRAYER_SPRITES).flatMap(([name, [on, off]]) => [
    [`prayer.${name}.on`, { id: on }],
    [`prayer.${name}.off`, { id: off }],
  ]),
);
const headIcons: Record<string, SpriteRequirement> = Object.fromEntries(Object.entries(HEAD_ICON_FRAMES).map(([name, frame]) => [`headIcon.${name}`, { id: SpriteIds.headIconsPrayer, frame }]));

export const BRUTUS_ASSETS = {
  npcs: {
    brutus: {
      id: BrutusIds.NPC,
      animations: {
        spawn: BrutusIds.SEQ_SPAWN,
        attack: BrutusIds.SEQ_ATTACK,
        stomp: BrutusIds.SEQ_STOMP,
        charge: BrutusIds.SEQ_CHARGE,
        death: BrutusIds.SEQ_DEATH,
      },
    },
  },
  player: {
    /** Default male body: hair, jaw, torso, arms, hands, legs, feet. */
    kits: [0, 10, 18, 26, 33, 36, 42],
    worn: {
      head: ItemIds.snakeskinBandana,
      neck: ItemIds.amuletOfGlory,
      weapon: ItemIds.magicShortbow,
      body: ItemIds.blackDhideBody,
      legs: ItemIds.blackDhideChaps,
      hands: ItemIds.blackDhideVambraces,
      feet: ItemIds.snakeskinBoots,
    },
    animations: PLAYER_SEQUENCES,
  },
  terrain: {
    arena: { regions: [12851, 13107, 12850, 13106], bounds: { minX: 3228, maxX: 3277, minY: 3243, maxY: 3310 } },
  },
  items: ItemIds,
  sprites: { ...single, ...prayerIcons, ...headIcons },
  sounds: { spawn: BrutusIds.SOUND_SPAWN, snort: BrutusIds.SOUND_SNORT, growl: BrutusIds.SOUND_GROWL },
} as const satisfies CacheAssets;
