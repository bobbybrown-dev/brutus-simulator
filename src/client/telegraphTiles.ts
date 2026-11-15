import type { BrutusTelegraph } from '../content/brutus/Brutus.ts';
import { BRUTUS_SIZE } from '../content/brutus/BrutusConstants.ts';
import type { Tile } from '../sdk/Location.ts';

/** Every tile the 3×3 footprint covers between its start and where the charge is aimed. */
export function chargeLane(from: Tile, target: Tile): Tile[] {
  const tiles: Tile[] = [];
  const minX = Math.min(from.x, target.x);
  const maxX = Math.max(from.x, target.x) + BRUTUS_SIZE - 1;
  const minY = Math.min(from.y, target.y);
  const maxY = Math.max(from.y, target.y) + BRUTUS_SIZE - 1;
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) tiles.push({ x, y });
  return tiles;
}

/**
 * Tiles to warn about for a pending special: a stomp's danger tiles, or a charge's lane. The lane
 * is where the charge is aimed; a fence may stop the dash short of the far end.
 */
export const telegraphTiles = (telegraph: BrutusTelegraph): Tile[] =>
  telegraph.kind === 'stomp' ? telegraph.danger : chargeLane(telegraph.from, telegraph.target);
