import { footprintContains, sign, tile, tileKey, type Tile } from '../../sdk/Location.ts';
import { BRUTUS_SIZE, BrutusTiming } from './BrutusConstants.ts';

export interface Direction {
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

const S = BRUTUS_SIZE;

/** Offset of the player from the boss's centre tile (SW + 1,1). */
function offsetFromCentre(sw: Tile, player: Tile): { dx: number; dy: number } {
  return { dx: player.x - (sw.x + 1), dy: player.y - (sw.y + 1) };
}

/**
 * Stomp direction: sign of the player's offset from the centre tile, in all 8 directions.
 * Matches every recorded stomp. A player standing exactly on the centre tile gets a west stomp
 * (K10 tick 574, one sample).
 */
export function stompDirection(sw: Tile, player: Tile): Direction {
  const { dx, dy } = offsetFromCentre(sw, player);
  if (dx === 0 && dy === 0) return { dx: -1, dy: 0 };
  return { dx: sign(dx), dy: sign(dy) };
}

/**
 * Tiles marked by a stomp. Cardinal: the full 3-tile edge. Diagonal: the corner tile plus the
 * two nearest tiles along each adjoining edge (5-tile L). East and north-east are inferred by
 * symmetry; the other six shapes are recorded.
 */
export function stompTiles(sw: Tile, dir: Direction): Tile[] {
  const tiles: Tile[] = [];
  const edgeX = dir.dx > 0 ? sw.x + S : sw.x - 1;
  const edgeY = dir.dy > 0 ? sw.y + S : sw.y - 1;
  if (dir.dx !== 0 && dir.dy !== 0) {
    tiles.push(tile(edgeX, edgeY));
    for (let i = 0; i < 2; i++) {
      tiles.push(tile(edgeX, dir.dy > 0 ? sw.y + S - 1 - i : sw.y + i));
      tiles.push(tile(dir.dx > 0 ? sw.x + S - 1 - i : sw.x + i, edgeY));
    }
  } else if (dir.dx !== 0) {
    for (let i = 0; i < S; i++) tiles.push(tile(edgeX, sw.y + i));
  } else {
    for (let i = 0; i < S; i++) tiles.push(tile(sw.x + i, edgeY));
  }
  return tiles;
}

/**
 * Tiles that take stomp damage: the marked tiles plus footprint tiles sharing an edge with one.
 * The under-boss part rests on a single recorded hit (K4 tick 1305) — INFERRED extent.
 */
export function stompDangerTiles(sw: Tile, dir: Direction): Tile[] {
  const marked = stompTiles(sw, dir);
  const seen = new Set(marked.map(tileKey));
  const danger = [...marked];
  for (const m of marked) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = tile(m.x + dx, m.y + dy);
      if (footprintContains(sw, S, n) && !seen.has(tileKey(n))) {
        seen.add(tileKey(n));
        danger.push(n);
      }
    }
  }
  return danger;
}

/**
 * Charge direction: cardinal, along the dominant axis of the player's offset from the centre.
 * Matches 4/4 recorded charges. Ties (player on a diagonal corner or the centre tile) are
 * UNVERIFIED; the x axis wins, and the centre tile charges south.
 */
export function chargeDirection(sw: Tile, player: Tile): Direction {
  const { dx, dy } = offsetFromCentre(sw, player);
  if (dx === 0 && dy === 0) return { dx: 0, dy: -1 };
  if (Math.abs(dx) >= Math.abs(dy)) return { dx: sign(dx), dy: 0 };
  return { dx: 0, dy: sign(dy) };
}

/**
 * Where a charge is aimed: the boss's SW tile ends 3 tiles past the player's tile along the
 * charge axis, keeping its own coordinate on the other axis. Because the anchor is the SW tile,
 * a west or south charge stops with the boss touching the far side of the player's tile (4 tiles
 * for an adjacent player), while a north or east charge overshoots by two more (6 tiles).
 * Fits 9/9 recorded charges once collision is applied.
 */
export function chargeTargetTile(sw: Tile, dir: Direction, player: Tile): Tile {
  const past = BrutusTiming.CHARGE_PAST_PLAYER;
  if (dir.dx !== 0) return tile(player.x + past * dir.dx, sw.y);
  return tile(sw.x, player.y + past * dir.dy);
}

/**
 * Is `player` hit by a charge from SW `from` to SW `to`? The hit area is the bounding box of the
 * start and end footprints. All five recorded hits were in the newly swept tiles and all four
 * misses were beside the path; whether the start footprint itself hurts is INFERRED.
 */
export function chargeHits(from: Tile, to: Tile, player: Tile): boolean {
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x) + S - 1;
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y) + S - 1;
  return player.x >= minX && player.x <= maxX && player.y >= minY && player.y <= maxY;
}

/** OSRS facing angle (0 = south, 512 = west, 1024 = north, 1536 = east). */
export function facingAngle(dir: Direction): number {
  if (dir.dy < 0) return 0;
  if (dir.dx < 0) return 512;
  if (dir.dy > 0) return 1024;
  return 1536;
}

/** The fixed coordinate the boss faces while winding up a special: centre + 5·dir. */
export function specialFaceTile(sw: Tile, dir: Direction): Tile {
  return tile(sw.x + 1 + 5 * dir.dx, sw.y + 1 + 5 * dir.dy);
}
