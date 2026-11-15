/** A tile on the OSRS world grid. The engine is single-plane; plane is carried by the region. */
export interface Tile {
  readonly x: number;
  readonly y: number;
}

export const tile = (x: number, y: number): Tile => ({ x, y });
export const tileEquals = (a: Tile, b: Tile): boolean => a.x === b.x && a.y === b.y;
export const tileKey = (t: Tile): string => `${t.x},${t.y}`;
export const sign = (v: number): -1 | 0 | 1 => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** True when `t` lies inside the `size`×`size` footprint anchored at SW tile `sw`. */
export function footprintContains(sw: Tile, size: number, t: Tile): boolean {
  return t.x >= sw.x && t.x < sw.x + size && t.y >= sw.y && t.y < sw.y + size;
}

/**
 * OSRS melee reach for a `size`×`size` unit against a 1×1 target: the target must touch
 * one of the four edges of the footprint. Diagonal corners and tiles under the unit do not count.
 */
export function isCardinallyAdjacent(sw: Tile, size: number, t: Tile): boolean {
  const inX = t.x >= sw.x && t.x < sw.x + size;
  const inY = t.y >= sw.y && t.y < sw.y + size;
  if (inX && (t.y === sw.y - 1 || t.y === sw.y + size)) return true;
  if (inY && (t.x === sw.x - 1 || t.x === sw.x + size)) return true;
  return false;
}

/** Chebyshev distance from a 1×1 tile to the nearest tile of a footprint. */
export function distanceToFootprint(sw: Tile, size: number, t: Tile): number {
  const dx = t.x < sw.x ? sw.x - t.x : t.x >= sw.x + size ? t.x - (sw.x + size - 1) : 0;
  const dy = t.y < sw.y ? sw.y - t.y : t.y >= sw.y + size ? t.y - (sw.y + size - 1) : 0;
  return Math.max(dx, dy);
}
