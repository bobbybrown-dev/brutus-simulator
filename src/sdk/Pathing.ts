import type { CollisionMap } from './Collision.ts';
import { sign, tile, tileKey, type Tile } from './Location.ts';

/**
 * Destination tile (SW anchor of the source) an NPC walks to when it wants to stand
 * cardinally adjacent to a target. This is the "naive destination" used by OSRS NPC
 * follow/combat movement: the plane around the target is split into four quadrants by its
 * two diagonals, and the source goes to the side it is already on.
 *
 * Verified against every non-overlapping Brutus step in the Phase 1 capture (38/38).
 */
export function naiveDestination(
  source: Tile,
  sourceWidth: number,
  sourceHeight: number,
  target: Tile,
  targetWidth = 1,
  targetHeight = 1,
): Tile {
  const diagonal = source.x - target.x + (source.y - target.y);
  const anti = source.x - target.x - (source.y - target.y);
  const southWestClockwise = anti < 0;
  const northWestClockwise = diagonal >= targetHeight - 1 - (sourceWidth - 1);
  const northEastClockwise = anti > sourceWidth - sourceHeight;
  const southEastClockwise = diagonal <= targetWidth - 1 - (sourceHeight - 1);

  if (southWestClockwise && !northWestClockwise) {
    // Source is west of the target.
    let off = 0;
    if (diagonal >= -sourceWidth) off = Math.min(diagonal + sourceWidth, targetHeight - 1);
    else if (anti > -sourceWidth) off = -(sourceWidth + anti);
    return tile(target.x - sourceWidth, target.y + off);
  }
  if (northWestClockwise && !northEastClockwise) {
    // Source is north of the target.
    let off = 0;
    if (anti >= -targetHeight) off = Math.min(anti + targetHeight, targetWidth - 1);
    else if (diagonal < targetHeight) off = Math.max(diagonal - targetHeight, -(sourceWidth - 1));
    return tile(target.x + off, target.y + targetHeight);
  }
  if (northEastClockwise && !southEastClockwise) {
    // Source is east of the target.
    let off = 0;
    if (anti <= targetWidth) off = targetHeight - anti;
    else if (diagonal < targetWidth) off = Math.max(diagonal - targetWidth, -(sourceHeight - 1));
    return tile(target.x + targetWidth, target.y + off);
  }
  // Source is south of the target.
  let off = 0;
  if (diagonal > -sourceHeight) off = Math.min(diagonal + sourceHeight, targetWidth - 1);
  else if (anti < sourceHeight) off = Math.max(anti - sourceHeight, -(sourceHeight - 1));
  return tile(target.x + off, target.y - sourceHeight);
}

/**
 * One tick of "dumb" NPC movement toward `dest`: try the diagonal, then the x axis, then
 * the y axis. Returns the new SW tile, or `from` when every option is blocked or it has arrived.
 */
export function naiveStep(collision: CollisionMap, from: Tile, size: number, dest: Tile): Tile {
  const dx = sign(dest.x - from.x);
  const dy = sign(dest.y - from.y);
  if (dx !== 0 && dy !== 0 && collision.canTravel(from, size, dx, dy)) return tile(from.x + dx, from.y + dy);
  if (dx !== 0 && collision.canTravel(from, size, dx, 0)) return tile(from.x + dx, from.y);
  if (dy !== 0 && collision.canTravel(from, size, 0, dy)) return tile(from.x, from.y + dy);
  return from;
}

/** OSRS player BFS neighbour order: W, E, S, N, SW, SE, NW, NE. */
const BFS_ORDER: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/**
 * Breadth-first route for a 1×1 unit. Returns the tiles to step through (excluding `from`),
 * or an empty array when `to` is unreachable within `maxRadius`.
 */
export function findPath(collision: CollisionMap, from: Tile, to: Tile, maxRadius = 64): Tile[] {
  if (from.x === to.x && from.y === to.y) return [];
  const cameFrom = new Map<string, Tile | null>([[tileKey(from), null]]);
  const queue: Tile[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    if (cur.x === to.x && cur.y === to.y) {
      const path: Tile[] = [];
      for (let t: Tile | null = cur; t && !(t.x === from.x && t.y === from.y); t = cameFrom.get(tileKey(t)) ?? null) {
        path.push(t);
      }
      return path.reverse();
    }
    for (const [dx, dy] of BFS_ORDER) {
      const next = tile(cur.x + dx, cur.y + dy);
      if (Math.abs(next.x - from.x) > maxRadius || Math.abs(next.y - from.y) > maxRadius) continue;
      const key = tileKey(next);
      if (cameFrom.has(key) || !collision.canTravel(cur, 1, dx, dy)) continue;
      cameFrom.set(key, cur);
      queue.push(next);
    }
  }
  return [];
}
