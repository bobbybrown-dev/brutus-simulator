import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BRUTUS_ARENA_REGIONS } from '../content/brutus/BrutusArena.ts';
import type { RegionCollisionJson } from '../sdk/Collision.ts';

/** Node-only helpers. Kept out of `sdk/` and `content/` so those stay browser-safe. */

/** Absolute path of a file relative to the workspace root (`brutus simulator/`). */
export const workspacePath = (relative: string): string =>
  fileURLToPath(new URL(`../../${relative}`, import.meta.url));

export function readRegionDump(path: string): RegionCollisionJson {
  return JSON.parse(readFileSync(path, 'utf8')) as RegionCollisionJson;
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

/** The arena's collision dumps, `region_<id>_collision.json` in the workspace root. */
export function readBrutusArenaDumps(): RegionCollisionJson[] {
  return BRUTUS_ARENA_REGIONS.map((id) => readRegionDump(workspacePath(`region_${id}_collision.json`)));
}

/** Per-tick timelines, one CSV per RSProx capture (see `scripts/extract_timeline.py`). */
export const CAPTURE_TIMELINES = ['data/brutus_tick_timeline.csv', 'data/brutus_tick_timeline_capture2.csv'] as const;

export function readCaptureTimelines(): string[] {
  return CAPTURE_TIMELINES.map((file) => readText(workspacePath(file)));
}
