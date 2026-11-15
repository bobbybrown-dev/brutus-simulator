import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBrutusArena } from '../src/content/brutus/BrutusArena.ts';
import { SOLID } from '../src/sdk/Collision.ts';
import { tile } from '../src/sdk/Location.ts';
import { BrutusTiming } from '../src/content/brutus/BrutusConstants.ts';
import { readBrutusArenaDumps, readCaptureTimelines } from '../src/node/files.ts';
import { replayKill } from '../src/replay/BrutusReplay.ts';
import { groupByKill, parseTimeline } from '../src/replay/Timeline.ts';

const dumps = readBrutusArenaDumps();
const kills = groupByKill(readCaptureTimelines().flatMap(parseTimeline));

/** Fight timers from the in-game "Fight duration" messages (K1, the quest kill, prints none). */
const FIGHT_DURATION_TICKS: Record<string, number> = {
  K2: 38, K3: 20, K4: 232, K5: 63, K6: 175, K7: 38, K8: 43, K9: 105, K10: 71,
};

test('timelines contain the ten captured kills', () => {
  assert.deepEqual([...kills.keys()], ['K1_quest', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10']);
  assert.equal([...kills.values()].reduce((n, rows) => n + rows.length, 0), 875);
});

for (const [name, rows] of kills) {
  test(`log replay ${name}: ${rows.length} ticks match the capture 1:1`, () => {
    const result = replayKill(rows, buildBrutusArena(dumps));
    assert.deepEqual(result.mismatches, []);
    const expectedDuration = FIGHT_DURATION_TICKS[name];
    if (expectedDuration !== undefined) assert.equal(result.fightDurationTicks, expectedDuration);
  });
}

test('replay is deterministic: two runs emit identical event streams', () => {
  const rows = kills.get('K4')!;
  const a = replayKill(rows, buildBrutusArena(dumps));
  const b = replayKill(rows, buildBrutusArena(dumps));
  assert.deepEqual(a.events, b.events);
});

test('respawn interval in the capture equals the engine constant', () => {
  const despawnTick = (kill: string): number => kills.get(kill)!.find((r) => r.notes.includes('boss_despawn'))!.tick;
  const spawnTick = (kill: string): number => kills.get(kill)![0]!.tick;
  for (const [dead, next] of [['K2', 'K3'], ['K3', 'K4'], ['K6', 'K7'], ['K7', 'K8'], ['K8', 'K9'], ['K9', 'K10']] as const) {
    assert.equal(spawnTick(next) - despawnTick(dead), BrutusTiming.RESPAWN_AFTER_DESPAWN, `${dead} → ${next}`);
  }
});

test('K5 tick 1465: the north-west step is refused by real collision (solid at 3260,3294)', () => {
  const arena = buildBrutusArena(dumps);
  assert.notEqual(arena.flagsAt(3260, 3294) & SOLID, 0);
  assert.ok(!arena.canTravel(tile(3260, 3291), 3, -1, 1), 'north-west is blocked');
  assert.ok(arena.canTravel(tile(3260, 3291), 3, -1, 0), 'west is the fallback the boss took');
  // Same relative geometry one tile south-east (K2 tick 1020) is open.
  assert.ok(arena.canTravel(tile(3261, 3290), 3, -1, 1));
});
