import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrutusIds, DEFAULT_BRUTUS_CONFIG } from '../src/content/brutus/BrutusConstants.ts';
import { buildBrutusArena } from '../src/content/brutus/BrutusArena.ts';
import { BrutusEncounter } from '../src/content/brutus/BrutusEncounter.ts';
import { readBrutusArenaDumps } from '../src/node/files.ts';
import { tile } from '../src/sdk/Location.ts';
import { findPath } from '../src/sdk/Pathing.ts';
import { Player } from '../src/sdk/Player.ts';
import { SeededRandom } from '../src/sdk/Random.ts';
import { World } from '../src/sdk/World.ts';

const dumps = readBrutusArenaDumps();

test('arena: both regions are required', () => {
  assert.throws(() => buildBrutusArena(dumps.slice(0, 1)), /missing collision for region\(s\) 13107/);
});

test('arena: the field is fenced on the east (x = 3265) and beside the exit gate (x = 3253) across the region seam', () => {
  const arena = buildBrutusArena(dumps);
  assert.ok(arena.canTravel(tile(3263, 3285), 1, 1, 0), 'walk east over the x = 3264 seam');
  assert.ok(arena.canTravel(tile(3264, 3285), 1, 1, 0), 'up to the fence');
  assert.ok(!arena.canTravel(tile(3265, 3285), 1, 1, 0), 'east fence');
  assert.ok(!arena.canTravel(tile(3253, 3268), 1, -1, 0), 'west fence beside the exit gate');
  assert.ok(!arena.canTravel(tile(3263, 3285), 3, 1, 0), '3x3 at x = 3263..3265 cannot step east');
});

test('arena: pen and exit gates are shut during the fight', () => {
  const arena = buildBrutusArena(dumps);
  assert.ok(!arena.canTravel(tile(3262, 3294), 1, 0, 1), 'pen gate, left half');
  assert.ok(!arena.canTravel(tile(3263, 3294), 1, 0, 1), 'pen gate, right half');
  assert.ok(!arena.canTravel(tile(3253, 3266), 1, -1, 0), 'exit gate');
  assert.deepEqual(findPath(arena, tile(3262, 3294), tile(3262, 3296), 20), [], 'no route into the pen');
});

test('arena: a charge toward the east fence stops against it', () => {
  const arena = buildBrutusArena(dumps);
  // Player east of the spawn footprint (x = 3261..3263), so the opening charge goes east.
  const world = new World({ collision: arena, random: new SeededRandom(1), player: new Player(tile(3264, 3288), 99) });
  new BrutusEncounter(world, { config: { ...DEFAULT_BRUTUS_CONFIG, firstSpecial: 'charge' } }).start();
  world.run(25);
  const dash = world.events.all().find((e) => e.type === 'npc_exact_move');
  assert.ok(dash && dash.type === 'npc_exact_move');
  assert.deepEqual(dash.from, tile(3261, 3287));
  assert.deepEqual(dash.to, tile(3263, 3287), 'footprint ends flush with the fence at x = 3265');
  const seqs = world.events.all().filter((e) => e.type === 'npc_seq' && e.seq === BrutusIds.SEQ_CHARGE);
  assert.equal(seqs.length, 1);
});
