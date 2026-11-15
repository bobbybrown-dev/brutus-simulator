import { INSTANCE_GATE_WALLS } from '../content/brutus/BrutusArena.ts';
import { SOLID, type CollisionMap } from '../sdk/Collision.ts';
import { tile, tileKey, type Tile } from '../sdk/Location.ts';

export type Side = 'north' | 'east' | 'south' | 'west';

export interface FenceSegment {
  /** Arena tile the segment borders. */
  tile: Tile;
  side: Side;
  /** One of the two gates that are shut for the fight. */
  gate: boolean;
}

export interface ArenaLayout {
  /** Every tile the player can reach from inside the pen. */
  floor: Tile[];
  /** Edges of floor tiles that cannot be crossed because of a fence, wall or gate. */
  fences: FenceSegment[];
  /** Impassable tiles touching the floor: scenery inside the field and whatever bounds it. */
  solids: Tile[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** x coordinate of the first column of the eastern region, if the arena crosses a region seam. */
  seamX: number | null;
}

const SIDES: ReadonlyArray<readonly [Side, number, number]> = [
  ['north', 0, 1], ['east', 1, 0], ['south', 0, -1], ['west', -1, 0],
];

/**
 * Work out what the arena looks like from collision data alone: flood-fill the tiles reachable
 * from `start`, then classify every blocked edge as a fence or as the face of a solid tile.
 * Pure geometry — the renderer turns this into meshes.
 */
export function computeArenaLayout(collision: CollisionMap, start: Tile): ArenaLayout {
  const seen = new Set<string>([tileKey(start)]);
  const floor: Tile[] = [start];
  for (let head = 0; head < floor.length; head++) {
    const t = floor[head]!;
    for (const [, dx, dy] of SIDES) {
      const n = tile(t.x + dx, t.y + dy);
      if (seen.has(tileKey(n)) || !collision.canTravel(t, 1, dx, dy)) continue;
      seen.add(tileKey(n));
      floor.push(n);
    }
  }

  const gateTiles = new Set(INSTANCE_GATE_WALLS.map((w) => `${w.x},${w.y}`));
  const fences: FenceSegment[] = [];
  const solidKeys = new Set<string>();
  const solids: Tile[] = [];
  for (const t of floor) {
    for (const [side, dx, dy] of SIDES) {
      if (collision.canTravel(t, 1, dx, dy)) continue;
      const n = tile(t.x + dx, t.y + dy);
      if ((collision.flagsAt(n.x, n.y) & SOLID) !== 0) {
        if (!solidKeys.has(tileKey(n))) {
          solidKeys.add(tileKey(n));
          solids.push(n);
        }
      } else {
        fences.push({ tile: t, side, gate: gateTiles.has(tileKey(t)) && gateTiles.has(tileKey(n)) });
      }
    }
  }

  const xs = floor.map((t) => t.x);
  const ys = floor.map((t) => t.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const seam = (Math.floor(bounds.minX / 64) + 1) * 64;
  return { floor, fences, solids, bounds, seamX: seam <= bounds.maxX ? seam : null };
}
