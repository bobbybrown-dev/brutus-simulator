import type { Tile } from './Location.ts';

/** Standard OSRS collision bit flags (subset used for movement). */
export const CollisionFlag = {
  WALL_NORTH_WEST: 0x1,
  WALL_NORTH: 0x2,
  WALL_NORTH_EAST: 0x4,
  WALL_EAST: 0x8,
  WALL_SOUTH_EAST: 0x10,
  WALL_SOUTH: 0x20,
  WALL_SOUTH_WEST: 0x40,
  WALL_WEST: 0x80,
  OBJECT: 0x100,
  FLOOR_DECORATION: 0x40000,
  FLOOR: 0x200000,
} as const;

/** Any flag that makes a tile impassable from every side. */
export const SOLID = CollisionFlag.OBJECT | CollisionFlag.FLOOR | CollisionFlag.FLOOR_DECORATION;

/**
 * Shape of a Phase 3 dump: one 64×64 region, `tiles[localX][localY]`.
 * `base_x`/`base_y` are the world coordinates of the region's south-west tile. They are optional
 * (older dumps omit them) but, when present, must agree with `region_id`.
 */
export interface RegionCollisionJson {
  region_id: number;
  base_x?: number;
  base_y?: number;
  width: number;
  height: number;
  tiles: number[][];
}

/**
 * How to read the numbers in a dump.
 * - `flags`: OSRS collision bit flags (`CollisionFlag`). This is what a cache dump contains.
 * - `solid`: any non-zero value means the whole tile is impassable.
 */
export type TileEncoding = 'flags' | 'solid';

export interface CollisionMapOptions {
  /** Flags reported for tiles in regions that were never loaded. Default `SOLID`. */
  unloadedFlags?: number;
  tileEncoding?: TileEncoding;
}

export interface CollisionOverride {
  x: number;
  y: number;
  /** Flags OR-ed onto the tile. */
  flags: number;
  reason?: string;
}

export const REGION_SIZE = 64;
export const regionIdOf = (x: number, y: number): number => ((x >> 6) << 8) | (y >> 6);
export const regionBase = (regionId: number): { x: number; y: number } => ({
  x: (regionId >> 8) * REGION_SIZE,
  y: (regionId & 0xff) * REGION_SIZE,
});

/**
 * Collision flags for any number of 64×64 regions, addressed in world coordinates.
 *
 * Each region is stored under its region ID, which is just its base coordinate divided by 64, so
 * a world tile resolves to (region, local index) with two shifts and a mask. Callers never see
 * region boundaries: a step from x = 3263 to x = 3264 reads one flag from each region.
 * Tiles in regions that were never loaded report `unloadedFlags` (solid by default).
 */
export class CollisionMap {
  private readonly regions = new Map<number, Int32Array>();
  private readonly unloadedFlags: number;
  private readonly tileEncoding: TileEncoding;

  constructor(options: CollisionMapOptions = {}) {
    this.unloadedFlags = options.unloadedFlags ?? SOLID;
    this.tileEncoding = options.tileEncoding ?? 'flags';
  }

  static fromRegionJson(dumps: readonly RegionCollisionJson[], options: CollisionMapOptions = {}): CollisionMap {
    const map = new CollisionMap(options);
    for (const d of dumps) map.loadRegion(d);
    return map;
  }

  hasRegion(regionId: number): boolean {
    return this.regions.has(regionId);
  }

  get loadedRegionIds(): number[] {
    return [...this.regions.keys()].sort((a, b) => a - b);
  }

  loadRegion(dump: RegionCollisionJson): void {
    if (dump.width !== REGION_SIZE || dump.height !== REGION_SIZE) {
      throw new Error(`region ${dump.region_id}: dump must be ${REGION_SIZE}x${REGION_SIZE}`);
    }
    const base = regionBase(dump.region_id);
    const baseX = dump.base_x ?? base.x;
    const baseY = dump.base_y ?? base.y;
    if (baseX !== base.x || baseY !== base.y) {
      throw new Error(
        `region ${dump.region_id}: base (${baseX}, ${baseY}) does not match its region id (expected ${base.x}, ${base.y})`,
      );
    }
    if (this.regions.has(dump.region_id)) throw new Error(`region ${dump.region_id} loaded twice`);
    const flags = new Int32Array(REGION_SIZE * REGION_SIZE);
    for (let lx = 0; lx < REGION_SIZE; lx++) {
      const column = dump.tiles[lx];
      if (!column || column.length !== REGION_SIZE) throw new Error(`region ${dump.region_id}: bad column ${lx}`);
      for (let ly = 0; ly < REGION_SIZE; ly++) {
        const raw = column[ly] ?? 0;
        flags[lx * REGION_SIZE + ly] = this.tileEncoding === 'solid' ? (raw !== 0 ? CollisionFlag.OBJECT : 0) : raw;
      }
    }
    this.regions.set(dump.region_id, flags);
  }

  applyOverrides(overrides: readonly CollisionOverride[]): void {
    for (const o of overrides) {
      const region = this.regions.get(regionIdOf(o.x, o.y));
      if (!region) throw new Error(`override at ${o.x},${o.y} is outside loaded regions`);
      const i = (o.x & 63) * 64 + (o.y & 63);
      region[i] = (region[i] ?? 0) | o.flags;
    }
  }

  /** Raw flags for a world tile; `unloadedFlags` when the tile's region is not loaded. */
  flagsAt(x: number, y: number): number {
    const region = this.regions.get(regionIdOf(x, y));
    if (!region) return this.unloadedFlags;
    return region[(x & 63) * 64 + (y & 63)] ?? 0;
  }

  nonZeroTileCount(): number {
    let n = 0;
    for (const r of this.regions.values()) for (const f of r) if (f !== 0) n++;
    return n;
  }

  /** World tiles with any flag set, for diagnostics. */
  flaggedTiles(): Array<{ x: number; y: number; flags: number }> {
    const out: Array<{ x: number; y: number; flags: number }> = [];
    for (const [id, region] of this.regions) {
      const base = regionBase(id);
      region.forEach((flags, i) => {
        if (flags !== 0) out.push({ x: base.x + Math.floor(i / REGION_SIZE), y: base.y + (i % REGION_SIZE), flags });
      });
    }
    return out;
  }

  /** True when any tile of the footprint is impassable (object, blocked floor). */
  footprintHasSolid(sw: Tile, size: number): boolean {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) if ((this.flagsAt(sw.x + i, sw.y + j) & SOLID) !== 0) return true;
    }
    return false;
  }

  /**
   * Can a `size`×`size` unit whose SW tile is `from` take one step of (dx, dy)?
   *
   * Follows the OSRS step rules for units of any size. Every tile the unit newly covers is
   * checked for solids, for walls on the edge being crossed, and — for units larger than 1×1 —
   * for walls that would end up inside the new footprint (a fence between two of the newly
   * covered tiles blocks the step even though neither tile is solid).
   *
   * `wallsOnly` skips the solid checks: fences and walls still stop the step, scenery does not.
   */
  canTravel(from: Tile, size: number, dx: number, dy: number, wallsOnly = false): boolean {
    const keep = wallsOnly ? ~SOLID : ~0;
    const has = (x: number, y: number, mask: number): boolean => (this.flagsAt(x, y) & mask & keep) !== 0;
    if (dx === 0 && dy === 0) return true;
    const { x, y } = from;
    const B = Block;
    const far = size - 1;

    if (size === 1) {
      if (dy === 0) return !has(x + dx, y, dx < 0 ? B.WEST : B.EAST);
      if (dx === 0) return !has(x, y + dy, dy < 0 ? B.SOUTH : B.NORTH);
      return (
        !has(x + dx, y + dy, diagonalBlock(dx, dy)) &&
        !has(x + dx, y, dx < 0 ? B.WEST : B.EAST) &&
        !has(x, y + dy, dy < 0 ? B.SOUTH : B.NORTH)
      );
    }

    if (dy === 0) {
      // West or east: the new column. Corners first, then the tiles between them.
      const nx = dx < 0 ? x - 1 : x + size;
      if (has(nx, y, dx < 0 ? B.SOUTH_WEST : B.SOUTH_EAST)) return false;
      if (has(nx, y + far, dx < 0 ? B.NORTH_WEST : B.NORTH_EAST)) return false;
      const mid = dx < 0 ? B.NORTH_AND_SOUTH_EAST : B.NORTH_AND_SOUTH_WEST;
      for (let i = 1; i < far; i++) if (has(nx, y + i, mid)) return false;
      return true;
    }
    if (dx === 0) {
      // South or north: the new row.
      const ny = dy < 0 ? y - 1 : y + size;
      if (has(x, ny, dy < 0 ? B.SOUTH_WEST : B.NORTH_WEST)) return false;
      if (has(x + far, ny, dy < 0 ? B.SOUTH_EAST : B.NORTH_EAST)) return false;
      const mid = dy < 0 ? B.NORTH_EAST_AND_WEST : B.SOUTH_EAST_AND_WEST;
      for (let i = 1; i < far; i++) if (has(x + i, ny, mid)) return false;
      return true;
    }

    // Diagonal: the new corner tile, then the rest of the new column and the new row.
    const nx = dx < 0 ? x - 1 : x + size;
    const ny = dy < 0 ? y - 1 : y + size;
    if (has(nx, ny, diagonalBlock(dx, dy))) return false;
    const columnMask = dx < 0 ? B.NORTH_AND_SOUTH_EAST : B.NORTH_AND_SOUTH_WEST;
    const rowMask = dy < 0 ? B.NORTH_EAST_AND_WEST : B.SOUTH_EAST_AND_WEST;
    for (let i = 1; i < size; i++) {
      const columnY = dy < 0 ? y + i - 1 : y + i;
      const rowX = dx < 0 ? x + i - 1 : x + i;
      if (has(nx, columnY, columnMask) || has(rowX, ny, rowMask)) return false;
    }
    return true;
  }
}

const F = CollisionFlag;
/** What stops a unit entering a tile, named by the direction of travel. */
const Block = {
  WEST: SOLID | F.WALL_EAST,
  EAST: SOLID | F.WALL_WEST,
  SOUTH: SOLID | F.WALL_NORTH,
  NORTH: SOLID | F.WALL_SOUTH,
  SOUTH_WEST: SOLID | F.WALL_NORTH | F.WALL_NORTH_EAST | F.WALL_EAST,
  SOUTH_EAST: SOLID | F.WALL_NORTH_WEST | F.WALL_NORTH | F.WALL_WEST,
  NORTH_WEST: SOLID | F.WALL_EAST | F.WALL_SOUTH_EAST | F.WALL_SOUTH,
  NORTH_EAST: SOLID | F.WALL_SOUTH | F.WALL_SOUTH_WEST | F.WALL_WEST,
  NORTH_AND_SOUTH_EAST: SOLID | F.WALL_NORTH | F.WALL_NORTH_EAST | F.WALL_EAST | F.WALL_SOUTH_EAST | F.WALL_SOUTH,
  NORTH_AND_SOUTH_WEST: SOLID | F.WALL_NORTH_WEST | F.WALL_NORTH | F.WALL_SOUTH | F.WALL_SOUTH_WEST | F.WALL_WEST,
  NORTH_EAST_AND_WEST: SOLID | F.WALL_NORTH_WEST | F.WALL_NORTH | F.WALL_NORTH_EAST | F.WALL_EAST | F.WALL_WEST,
  SOUTH_EAST_AND_WEST: SOLID | F.WALL_EAST | F.WALL_SOUTH_EAST | F.WALL_SOUTH | F.WALL_SOUTH_WEST | F.WALL_WEST,
} as const;

function diagonalBlock(dx: number, dy: number): number {
  if (dx < 0) return dy < 0 ? Block.SOUTH_WEST : Block.NORTH_WEST;
  return dy < 0 ? Block.SOUTH_EAST : Block.NORTH_EAST;
}
