import {
  CollisionFlag,
  CollisionMap,
  SOLID,
  type CollisionOverride,
  type RegionCollisionJson,
} from '../../sdk/Collision.ts';

/**
 * Template regions the instanced arena is copied from. The cow field straddles both x = 3264 and
 * y = 3264: the fight has only been recorded in the northern half, but the field runs south to
 * about y = 3255.
 */
export const BRUTUS_ARENA_REGIONS = [12851, 13107, 12850, 13106] as const;

const F = CollisionFlag;

/**
 * Gates that are shut for the duration of the fight.
 *
 * The cache map has both gates passable (gates are doors). On entry the server replaces them
 * with closed variants — seen in the capture as `loc_add_change`, wall shape 0:
 *   pen gate  60761/60762 at (3262–3263, 3294), rotation 1 → north edge
 *   exit gate 60764/60765 at (3253, 3266–3267), rotation 0 → west edge
 * A wall sets a flag on both tiles it separates.
 */
export const INSTANCE_GATE_WALLS: readonly CollisionOverride[] = [
  ...[3262, 3263].flatMap((x) => [
    { x, y: 3294, flags: F.WALL_NORTH, reason: 'pen gate (closed in instance)' },
    { x, y: 3295, flags: F.WALL_SOUTH, reason: 'pen gate (closed in instance)' },
  ]),
  ...[3266, 3267].flatMap((y) => [
    { x: 3253, y, flags: F.WALL_WEST, reason: 'exit gate (closed in instance)' },
    { x: 3252, y, flags: F.WALL_EAST, reason: 'exit gate (closed in instance)' },
  ]),
];

/**
 * Build the arena collision map from the Phase 3 region dumps. Pure: no file or network access.
 * Both regions are required; anything outside them is solid.
 */
export function buildBrutusArena(dumps: readonly RegionCollisionJson[]): CollisionMap {
  const map = CollisionMap.fromRegionJson(dumps, { unloadedFlags: SOLID });
  const missing = BRUTUS_ARENA_REGIONS.filter((id) => !map.hasRegion(id));
  if (missing.length > 0) throw new Error(`Brutus arena is missing collision for region(s) ${missing.join(', ')}`);
  map.applyOverrides(INSTANCE_GATE_WALLS);
  return map;
}
