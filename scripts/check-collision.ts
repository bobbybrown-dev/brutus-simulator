/**
 * Validate collision dumps against every capture timeline in `data/`.
 *
 *   npm run check-collision                      # the two dumps in the workspace root
 *   npm run check-collision -- a.json b.json     # any other dumps
 *
 * Reports (1) what the dumps contain, (2) solid tiles the recorded player or boss demonstrably
 * stood on, and (3) whether every recorded kill replays 1:1 on this collision. Exit code 0 only when
 * there are no contradictions and the replay is clean.
 */
import { buildBrutusArena, INSTANCE_GATE_WALLS } from '../src/content/brutus/BrutusArena.ts';
import { SOLID } from '../src/sdk/Collision.ts';
import { readBrutusArenaDumps, readCaptureTimelines, readRegionDump } from '../src/node/files.ts';
import { replayKill } from '../src/replay/BrutusReplay.ts';
import { groupByKill, parseTimeline } from '../src/replay/Timeline.ts';

const paths = process.argv.slice(2);
const dumps = paths.length > 0 ? paths.map(readRegionDump) : readBrutusArenaDumps();
const kills = groupByKill(readCaptureTimelines().flatMap(parseTimeline));

const arena = buildBrutusArena(dumps);
const flagged = arena.flaggedTiles();
const values = new Map<number, number>();
for (const t of flagged) values.set(t.flags, (values.get(t.flags) ?? 0) + 1);
console.log(`regions: ${arena.loadedRegionIds.join(', ')}`);
console.log(`flagged tiles: ${flagged.length} (includes ${INSTANCE_GATE_WALLS.length} instance gate-wall flags)`);
console.log(`distinct flag values: ${[...values].sort((a, b) => a[0] - b[0]).map(([v, n]) => `0x${v.toString(16)}×${n}`).join(', ') || 'none'}`);
if (values.size <= 2) console.log('WARNING: almost no variety in flag values — this does not look like a cache dump.');

const solid = new Set(flagged.filter((t) => (t.flags & SOLID) !== 0).map((t) => `${t.x},${t.y}`));
const contradicted = new Map<string, number>();
let ticks = 0;
for (const rows of kills.values()) {
  for (const r of rows) {
    ticks++;
    const occupied = new Set([`${r.player.x},${r.player.y}`]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) occupied.add(`${r.bossSw.x + i},${r.bossSw.y + j}`);
    for (const k of occupied) if (solid.has(k)) contradicted.set(k, (contradicted.get(k) ?? 0) + 1);
  }
}
console.log(
  contradicted.size === 0
    ? 'solid tiles occupied in the capture: none'
    : `solid tiles occupied in the capture: ${[...contradicted].map(([k, n]) => `${k} (${n} ticks)`).join(', ')}`,
);

let mismatches = 0;
for (const [name, rows] of kills) {
  const result = replayKill(rows, buildBrutusArena(dumps));
  mismatches += result.mismatches.length;
  console.log(`  ${name}: ${result.mismatches.length === 0 ? `match (${rows.length} ticks)` : `${result.mismatches.length} mismatches, first: ${result.mismatches[0]}`}`);
}
const ok = mismatches === 0 && contradicted.size === 0;
console.log(ok ? `CLEAN: ${ticks} ticks replay 1:1 on this collision` : 'DIVERGES: these dumps do not reproduce the capture');
process.exit(ok ? 0 : 1);
