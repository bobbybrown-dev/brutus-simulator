import * as THREE from 'three';
import type { Tile } from '../../sdk/Location.ts';

/**
 * World tiles → scene units. One tile is one unit; +x is east, −z is north, y is up.
 * The origin is an arbitrary tile near the middle of the field so coordinates stay small.
 */
export const SCENE_ORIGIN: Tile = { x: 3259, y: 3280 };

/** Scene position of the centre of a `size`×`size` footprint whose SW tile is `sw`. */
export function footprintCentre(sw: Tile, size = 1, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(sw.x - SCENE_ORIGIN.x + size / 2, 0, -(sw.y - SCENE_ORIGIN.y) - size / 2);
}

/** The tile under a point on the ground plane. */
export function tileAt(point: THREE.Vector3): Tile {
  return { x: Math.floor(point.x) + SCENE_ORIGIN.x, y: Math.floor(-point.z) + SCENE_ORIGIN.y };
}
