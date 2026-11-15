import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Brutus } from '../src/content/brutus/Brutus.ts';
import { BrutusIds, BrutusTiming, DEFAULT_BRUTUS_CONFIG } from '../src/content/brutus/BrutusConstants.ts';
import { BrutusEncounter } from '../src/content/brutus/BrutusEncounter.ts';
import { CollisionFlag, CollisionMap, type RegionCollisionJson } from '../src/sdk/Collision.ts';
import { tile } from '../src/sdk/Location.ts';
import { findPath, naiveDestination, naiveStep } from '../src/sdk/Pathing.ts';
import { Player } from '../src/sdk/Player.ts';
import { SeededRandom } from '../src/sdk/Random.ts';
import { World } from '../src/sdk/World.ts';

/** Empty copies of the two arena regions, so tests control every flag themselves. */
function openArena(): CollisionMap {
  const blank = (region_id: number): RegionCollisionJson => ({
    region_id,
    width: 64,
    height: 64,
    tiles: Array.from({ length: 64 }, () => new Array<number>(64).fill(0)),
  });
  return CollisionMap.fromRegionJson([blank(12851), blank(13107)]);
}

const STOMP_FIRST = { ...DEFAULT_BRUTUS_CONFIG, firstSpecial: 'stomp' as const };
const CHARGE_FIRST = { ...DEFAULT_BRUTUS_CONFIG, firstSpecial: 'charge' as const };

function newWorld(playerAt = tile(3262, 3294), seed = 1, collision = openArena()): World {
  return new World({ collision, random: new SeededRandom(seed), player: new Player(playerAt, 99) });
}

const seqTicks = (world: World, seq: number): number[] =>
  world.events.all().filter((e) => e.type === 'npc_seq' && e.seq === seq).map((e) => e.tick);

test('collision: tiles outside loaded regions are solid by default', () => {
  const map = openArena();
  assert.ok(map.canTravel(tile(3263, 3290), 1, 1, 0), 'crossing into region 13107');
  assert.ok(!map.canTravel(tile(3200, 3290), 1, -1, 0), 'west edge of the loaded map');
});

test('collision: walls block the edge they sit on, solids block the tile, diagonals cannot cut corners', () => {
  const map = openArena();
  map.applyOverrides([
    { x: 3250, y: 3280, flags: CollisionFlag.WALL_WEST },
    { x: 3240, y: 3280, flags: CollisionFlag.OBJECT },
  ]);
  assert.ok(!map.canTravel(tile(3249, 3280), 1, 1, 0), 'east step into a west wall');
  assert.ok(map.canTravel(tile(3250, 3279), 1, 0, 1), 'north step is not affected by a west wall');
  assert.ok(!map.canTravel(tile(3239, 3279), 1, 1, 1), 'diagonal onto a solid');
  assert.ok(!map.canTravel(tile(3239, 3280), 1, 1, 1), 'diagonal past a solid corner');
  assert.ok(!map.canTravel(tile(3237, 3279), 3, 1, 0), '3x3 footprint clipping a solid');
});

test('collision loader: base_x/base_y must agree with the region id; a region cannot load twice', () => {
  const blank = (region_id: number, base_x?: number, base_y?: number): RegionCollisionJson => ({
    region_id, base_x, base_y, width: 64, height: 64,
    tiles: Array.from({ length: 64 }, () => new Array<number>(64).fill(0)),
  });
  const map = CollisionMap.fromRegionJson([blank(12851, 3200, 3264), blank(13107, 3264, 3264)]);
  assert.deepEqual(map.loadedRegionIds, [12851, 13107]);
  assert.throws(() => CollisionMap.fromRegionJson([blank(13107, 3200, 3264)]), /does not match its region id/);
  assert.throws(() => map.loadRegion(blank(12851)), /loaded twice/);
});

test('collision: world coordinates resolve across the x = 3264 seam', () => {
  const map = openArena();
  map.applyOverrides([
    { x: 3263, y: 3280, flags: CollisionFlag.OBJECT }, // last column of 12851
    { x: 3264, y: 3285, flags: CollisionFlag.WALL_WEST }, // first column of 13107
  ]);
  assert.equal(map.flagsAt(3263, 3280), CollisionFlag.OBJECT);
  assert.equal(map.flagsAt(3264, 3280), 0);
  assert.equal(map.flagsAt(3264, 3285), CollisionFlag.WALL_WEST);
  assert.ok(map.canTravel(tile(3263, 3290), 1, 1, 0), 'open seam');
  assert.ok(!map.canTravel(tile(3263, 3285), 1, 1, 0), 'wall on the far side of the seam');
  assert.ok(!map.canTravel(tile(3264, 3280), 1, -1, 0), 'solid on the near side of the seam');
  // 3x3 footprint straddling the seam: x = 3262..3264, stepping east needs column 3265.
  assert.ok(map.canTravel(tile(3262, 3270), 3, 1, 0));
  map.applyOverrides([{ x: 3265, y: 3271, flags: CollisionFlag.OBJECT }]);
  assert.ok(!map.canTravel(tile(3262, 3270), 3, 1, 0));
  // Player BFS routes through the seam without special handling.
  assert.equal(findPath(map, tile(3261, 3290), tile(3266, 3290)).length, 5);
});

test('collision: a fence between two newly covered tiles blocks a large unit but not a 1x1', () => {
  const map = openArena();
  // Fence running north-south between x = 3259 and x = 3260 at y = 3294.
  map.applyOverrides([
    { x: 3259, y: 3294, flags: CollisionFlag.WALL_EAST },
    { x: 3260, y: 3294, flags: CollisionFlag.WALL_WEST },
  ]);
  assert.ok(!map.canTravel(tile(3260, 3291), 3, -1, 1), '3x3 north-west step would straddle the fence');
  assert.ok(map.canTravel(tile(3260, 3291), 3, -1, 0), '3x3 west step stays south of it');
  assert.ok(map.canTravel(tile(3260, 3293), 1, 0, 1), '1x1 walks north alongside it');
  assert.ok(!map.canTravel(tile(3260, 3294), 1, -1, 0), '1x1 cannot cross it');
});

test('pathing: naive destination puts a 3x3 chaser cardinally adjacent (cases from the capture)', () => {
  assert.deepEqual(naiveDestination(tile(3261, 3287), 3, 3, tile(3262, 3294)), tile(3262, 3291));
  assert.deepEqual(naiveDestination(tile(3260, 3288), 3, 3, tile(3259, 3291)), tile(3259, 3288));
  assert.deepEqual(naiveDestination(tile(3259, 3289), 3, 3, tile(3263, 3287)), tile(3261, 3288));
  assert.deepEqual(naiveDestination(tile(3262, 3291), 3, 3, tile(3260, 3290)), tile(3261, 3290));
});

test('pathing: naive step falls back from diagonal to x when the diagonal is blocked', () => {
  const map = openArena();
  assert.deepEqual(naiveStep(map, tile(3260, 3291), 3, tile(3259, 3292)), tile(3259, 3292));
  map.applyOverrides([{ x: 3259, y: 3294, flags: CollisionFlag.OBJECT }]);
  assert.deepEqual(naiveStep(map, tile(3260, 3291), 3, tile(3259, 3292)), tile(3259, 3291));
});

test('player: BFS routes around obstacles and runs two tiles per tick', () => {
  const map = openArena();
  map.applyOverrides([-1, 0, 1].map((dy) => ({ x: 3256, y: 3280 + dy, flags: CollisionFlag.OBJECT })));
  const path = findPath(map, tile(3254, 3280), tile(3258, 3280));
  assert.ok(path.length > 4, 'detours around the wall');
  assert.ok(path.every((t) => !(t.x === 3256 && Math.abs(t.y - 3280) <= 1)));

  const world = newWorld(tile(3254, 3270));
  world.player.moveTo(world, tile(3254, 3276));
  world.tickOnce();
  assert.deepEqual(world.player.location, tile(3254, 3272));
  world.run(2);
  assert.deepEqual(world.player.location, tile(3254, 3276));
});

test('brutus: wakes on S+5, acts from S+6, opens with two swings then the stomp set', () => {
  const world = newWorld(tile(3261, 3290)); // already adjacent to the spawn footprint
  new BrutusEncounter(world, { config: STOMP_FIRST }).start();
  world.run(60);
  const S = 1;
  assert.deepEqual(world.events.at(S).map((e) => e.type), ['npc_spawn', 'npc_seq', 'npc_face_coord', 'sound']);
  assert.ok(world.events.at(S + 5).some((e) => e.type === 'npc_say' && e.text === 'Moo'));
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_ATTACK).slice(0, 2), [S + 6, S + 11]);
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_STOMP), [S + 16, S + 24, S + 32]);
  // Three stomps, then a block of four swings starting 8 ticks after the last stomp, then the charge.
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_ATTACK).slice(2, 6), [S + 40, S + 45, S + 50, S + 55]);
  world.run(5);
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_CHARGE), [S + 60]);
});

test('brutus: a standing player is hit by the stomp on T+4 and by the charge on T+4', () => {
  const world = newWorld(tile(3261, 3290));
  new BrutusEncounter(world, { config: STOMP_FIRST }).start();
  world.run(70);
  const hits = world.events.all().filter((e) => e.type === 'hitsplat' && e.target === 'player' && e.source !== 'brutus.melee');
  assert.deepEqual(hits.map((e) => [e.tick, e.type === 'hitsplat' ? e.source : '']), [
    [21, 'brutus.stomp'], [29, 'brutus.stomp'], [37, 'brutus.stomp'], [65, 'brutus.charge'],
  ]);
});

test('brutus: charge aims 3 tiles past the player — 4 tiles west/south, 6 tiles north/east when adjacent', () => {
  const dash = (playerAt: ReturnType<typeof tile>) => {
    const world = newWorld(playerAt);
    new BrutusEncounter(world, { config: CHARGE_FIRST }).start();
    world.run(25);
    const e = world.events.all().find((ev) => ev.type === 'npc_exact_move');
    assert.ok(e && e.type === 'npc_exact_move');
    return [e.from, e.to];
  };
  // Spawn footprint is x 3261..3263, y 3287..3289.
  assert.deepEqual(dash(tile(3260, 3288)), [tile(3261, 3287), tile(3257, 3287)], 'west: 4');
  assert.deepEqual(dash(tile(3262, 3286)), [tile(3261, 3287), tile(3261, 3283)], 'south: 4');
  assert.deepEqual(dash(tile(3262, 3290)), [tile(3261, 3287), tile(3261, 3293)], 'north: 6');
  assert.deepEqual(dash(tile(3264, 3288)), [tile(3261, 3287), tile(3267, 3287)], 'east: 6');
});

test('brutus: charge is stopped by a fence but passes scenery and will not come to rest on it', () => {
  const fenced = openArena();
  // Fence along the north edge of y = 3291.
  for (let x = 3255; x <= 3270; x++) {
    fenced.applyOverrides([
      { x, y: 3291, flags: CollisionFlag.WALL_NORTH },
      { x, y: 3292, flags: CollisionFlag.WALL_SOUTH },
    ]);
  }
  const a = newWorld(tile(3262, 3290), 1, fenced);
  new BrutusEncounter(a, { config: CHARGE_FIRST }).start();
  a.run(25);
  const stopped = a.events.all().find((e) => e.type === 'npc_exact_move');
  assert.ok(stopped && stopped.type === 'npc_exact_move');
  assert.deepEqual(stopped.to, tile(3261, 3289), 'two tiles: top row flush with the fence');

  const scenery = openArena();
  // An object where a 4-tile west dash would land (target footprint x 3257..3259).
  scenery.applyOverrides([{ x: 3258, y: 3288, flags: CollisionFlag.OBJECT }]);
  const b = newWorld(tile(3260, 3288), 1, scenery);
  new BrutusEncounter(b, { config: CHARGE_FIRST }).start();
  b.run(25);
  const overran = b.events.all().find((e) => e.type === 'npc_exact_move');
  assert.ok(overran && overran.type === 'npc_exact_move');
  assert.deepEqual(overran.to, tile(3255, 3287), 'six tiles: first clear footprint past the object');
});

test('brutus: a special waits for melee range, and the boss can step into range on the same tick', () => {
  // Player two tiles north of the footprint for the whole opening, then steps adjacent.
  const world = newWorld(tile(3262, 3291));
  world.collision.applyOverrides([
    // Fence the boss in so it cannot close the gap on its own.
    ...[3260, 3261, 3262, 3263, 3264].flatMap((x) => [
      { x, y: 3289, flags: CollisionFlag.WALL_NORTH },
      { x, y: 3290, flags: CollisionFlag.WALL_SOUTH },
    ]),
  ]);
  new BrutusEncounter(world, { config: STOMP_FIRST }).start();
  world.run(40);
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_ATTACK), [], 'never in range, never swings');
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_STOMP), [], 'and never starts a special');
});

test('brutus: when it walks into range on the special tick, the facing coordinate follows a tick later', () => {
  const world = newWorld(tile(3261, 3290));
  new BrutusEncounter(world, { config: STOMP_FIRST }).start();
  // Swings land on ticks 7 and 12; the special is due on 17. Step away on 16, after the boss has acted.
  world.player.controller = (w, p) => {
    if (w.tick === 16) p.setLocation(tile(3261, 3291));
  };
  world.run(20);
  const [stompTick] = seqTicks(world, BrutusIds.SEQ_STOMP);
  assert.equal(stompTick, 17);
  assert.ok(world.events.at(17).some((e) => e.type === 'npc_move'), 'stepped north into range');
  assert.ok(!world.events.at(17).some((e) => e.type === 'npc_face_coord'));
  assert.ok(world.events.at(18).some((e) => e.type === 'npc_face_coord'));
});

test('brutus: a step on the tick it dies delays the death animation to D+3 (despawn D+7)', () => {
  const world = newWorld(tile(3261, 3290));
  const boss = new BrutusEncounter(world, { respawn: false }).start();
  const D = 10;
  world.player.controller = (w, p) => {
    if (w.tick === D - 1) p.setLocation(tile(3261, 3291)); // out of range, so the boss steps on D
  };
  boss.queueHit(58, D);
  world.run(20);
  assert.ok(world.events.at(D).some((e) => e.type === 'npc_move'));
  assert.ok(world.events.at(D + 1).some((e) => e.type === 'npc_say' && e.text === 'm-moo...'));
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_DEATH), [D + 3]);
  assert.equal(world.events.all().find((e) => e.type === 'npc_despawn')?.tick, D + 7);
  assert.equal(boss.fightDurationTicks, D + 1 - 1, 'timer still stops at D+1');
});

test('brutus: killing blow pre-empts the swing; death anim D+1, despawn D+5, respawn 35 ticks later', () => {
  const world = newWorld(tile(3261, 3290));
  const encounter = new BrutusEncounter(world);
  const boss = encounter.start();
  const D = 12; // S = 1, so a swing would be due on tick 12 (S + 11)
  boss.queueHit(58, D);
  world.run(60);
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_ATTACK).filter((t) => t <= D + 5), [7]);
  assert.deepEqual(seqTicks(world, BrutusIds.SEQ_DEATH), [D + BrutusTiming.DEATH_ANIM]);
  const despawn = world.events.all().find((e) => e.type === 'npc_despawn');
  assert.equal(despawn?.tick, D + BrutusTiming.DEATH_ANIM + BrutusTiming.DESPAWN_AFTER_ANIM);
  assert.deepEqual(encounter.kills, [{ spawnTick: 1, deathTick: D, fightDurationTicks: 12 }]);
  const spawns = world.events.all().filter((e) => e.type === 'npc_spawn').map((e) => e.tick);
  assert.deepEqual(spawns, [1, D + 5 + BrutusTiming.RESPAWN_AFTER_DESPAWN]);
  assert.ok(encounter.boss instanceof Brutus && encounter.boss !== boss);
});

test('engine: same seed and inputs give identical event streams; ticks need no wall clock', () => {
  const run = (seed: number) => {
    const world = newWorld(tile(3262, 3294), seed);
    new BrutusEncounter(world).start();
    // Scripted player: walk a loop that takes it under and around the boss.
    const route = [tile(3262, 3290), tile(3259, 3289), tile(3264, 3288), tile(3261, 3285)];
    world.player.controller = (w, p) => {
      if (w.tick % 9 === 0) p.moveTo(w, route[(w.tick / 9) % route.length]!);
    };
    world.run(400);
    return world.events.all();
  };
  const started = Date.now();
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
  assert.ok(Date.now() - started < 600, '1,200 simulated ticks in under one real tick');
});
