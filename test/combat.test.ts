import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Brutus } from '../src/content/brutus/Brutus.ts';
import {
  BRUTUS_BONUSES,
  BRUTUS_STATS,
  BRUTUS_SWING,
  BrutusIds,
  DEFAULT_BRUTUS_CONFIG,
  brutusStompSpec,
} from '../src/content/brutus/BrutusConstants.ts';
import { BrutusEncounter } from '../src/content/brutus/BrutusEncounter.ts';
import { CAPTURE_LOADOUT } from '../src/content/loadouts/CaptureLoadout.ts';
import { readCaptureTimelines } from '../src/node/files.ts';
import { parseTimeline } from '../src/replay/Timeline.ts';
import { CollisionMap, type RegionCollisionJson } from '../src/sdk/Collision.ts';
import { npcAttacker, npcDefender, playerAttacker, playerDefender, resolveAttack, type AttackSpec } from '../src/sdk/combat/Attack.ts';
import { hitChance, npcAttackRoll, npcDefenceRoll, npcMaxHit, playerEffectiveLevel, playerMaxHit } from '../src/sdk/combat/Formulas.ts';
import { BARE_LOADOUT, attackInterval, playerAttackRoll, playerDefenceRoll, playerMaxHitOf, type PlayerLoadout } from '../src/sdk/combat/Loadout.ts';
import type { PrayerName } from '../src/sdk/combat/Prayers.ts';
import { tile } from '../src/sdk/Location.ts';
import { Player } from '../src/sdk/Player.ts';
import { SeededRandom } from '../src/sdk/Random.ts';
import { World } from '../src/sdk/World.ts';

const NO_PRAYERS: ReadonlySet<PrayerName> = new Set();
const praying = (...names: PrayerName[]): ReadonlySet<PrayerName> => new Set(names);
const brutus = npcAttacker(BRUTUS_STATS, BRUTUS_BONUSES);
const capturePlayer = playerDefender(CAPTURE_LOADOUT, NO_PRAYERS);

function openArena(): CollisionMap {
  const blank = (region_id: number): RegionCollisionJson => ({
    region_id, width: 64, height: 64, tiles: Array.from({ length: 64 }, () => new Array<number>(64).fill(0)),
  });
  return CollisionMap.fromRegionJson([blank(12851), blank(13107)]);
}

// ── Golden values ────────────────────────────────────────────────────────────

test('formulas: Brutus stat block gives attack roll 1,344, max hit 3, defence rolls 1,083 / 1,037', () => {
  assert.equal(npcAttackRoll(12, 0), 1344);
  assert.equal(npcMaxHit(25, 0), 3);
  assert.equal(npcDefenceRoll(10, -7), 1083);
  assert.equal(brutus.attackRoll('crush'), 1344);
  assert.equal(brutus.maxHit('crush'), 3);
  const defender = npcDefender(BRUTUS_STATS, BRUTUS_BONUSES);
  assert.equal(defender.defenceRoll('range'), 1083);
  assert.equal(defender.defenceRoll('magic'), 1037, 'magic is defended with the Magic level: (8 + 9) · (−3 + 64)');
});

test('loadout: recorded gear totals', () => {
  const b = CAPTURE_LOADOUT.bonuses;
  assert.deepEqual(b.defence, { stab: 58, slash: 71, crush: 85, magic: 82, range: 81 });
  assert.deepEqual(b.attack, { stab: 10, slash: 10, crush: 10, magic: -40, range: 144 });
  assert.deepEqual(b.other, { meleeStrength: 6, rangedStrength: 49, magicDamage: 0, prayer: 3 });
  assert.equal(attackInterval(CAPTURE_LOADOUT), 3, 'magic shortbow on Rapid');
});

test('formulas: the recorded player vs. Brutus, both directions', () => {
  // Brutus → player: (80 + 8) · (85 + 64) = 13,112; chance 1,344 / (2 · 13,113).
  assert.equal(playerDefenceRoll(CAPTURE_LOADOUT, NO_PRAYERS, 'crush'), 13112);
  assert.equal(hitChance(1344, 13112), 1344 / 26226);
  assert.ok(Math.abs(hitChance(1344, 13112) - 0.05125) < 0.00001);
  // Player → Brutus: (85 + 8) · (144 + 64) = 19,344; max hit trunc((93 · 113 + 320) / 640) = 16.
  assert.equal(playerAttackRoll(CAPTURE_LOADOUT, NO_PRAYERS), 19344);
  assert.equal(playerMaxHitOf(CAPTURE_LOADOUT, NO_PRAYERS), 16);
  assert.ok(Math.abs(hitChance(19344, 1083) - 0.97196) < 0.00001);
});

test('formulas: ranged max hit matches every max-hit hitsplat (type 43) in the logs', () => {
  // [boosted Ranged level when the arrow was fired, damage on the max-hit hitsplat]
  const recorded: Array<[number, number]> = [
    [93, 18], // capture 1, tick 1359 (ranging potion)
    [92, 18], // capture 1, tick 1481
    [85, 16], // capture 2, tick 543
    [85, 16], // capture 2, tick 588
  ];
  for (const [level, damage] of recorded) {
    const loadout: PlayerLoadout = { ...CAPTURE_LOADOUT, boosts: { range: level - 85 } };
    assert.equal(playerMaxHitOf(loadout, NO_PRAYERS), damage, `Ranged ${level}`);
  }
});

// ── Rounding order ──────────────────────────────────────────────────────────

test('formulas: rounding happens where the reference does it', () => {
  // Max hit adds 320 before dividing by 640, i.e. rounds half up: Strength 25 → 3.9 → 3; 26 → 4.0 → 4.
  assert.equal(npcMaxHit(25, 0), 3);
  assert.equal(npcMaxHit(26, 0), 4);
  assert.equal(playerMaxHit(93, 49), 16, '16.92 truncates to 16');
  // Prayer multiplies the level before stance and +8, truncating: 80 · 1.15 = 92, then +8 = 100.
  assert.equal(playerEffectiveLevel(80, [[115, 100]], 0), 100);
  assert.notEqual(playerEffectiveLevel(80, [[115, 100]], 0), Math.trunc((80 + 8) * 1.15));
  assert.equal(playerDefenceRoll(CAPTURE_LOADOUT, praying('STEEL_SKIN'), 'crush'), 100 * 149);
  // Rigour: accuracy trunc(85 · 1.20) = 102 → 110 · 208; strength trunc(85 · 1.23) = 104 → 112 → max hit 20.
  assert.equal(playerAttackRoll(CAPTURE_LOADOUT, praying('RIGOUR')), 110 * 208);
  assert.equal(playerMaxHitOf(CAPTURE_LOADOUT, praying('RIGOUR')), 20);
  // Stance: Longrange adds 3 to Defence; Accurate adds 3 to ranged accuracy and strength.
  assert.equal(playerDefenceRoll({ ...CAPTURE_LOADOUT, stance: 'longrange' }, NO_PRAYERS, 'crush'), 91 * 149);
  assert.equal(playerAttackRoll({ ...CAPTURE_LOADOUT, stance: 'accurate' }, NO_PRAYERS), 96 * 208);
  // Magic defence blends 70% Magic with 30% Defence before the +8: trunc(56) + trunc(24) + 8 = 88.
  assert.equal(playerDefenceRoll(CAPTURE_LOADOUT, NO_PRAYERS, 'magic'), 88 * (82 + 64));
});

test('formulas: closed-form hit chance equals the two-roll check exactly', () => {
  for (const [atk, def] of [[5, 3], [3, 5], [4, 4], [0, 7], [9, 0], [40, 13], [13, 40]] as const) {
    let wins = 0;
    for (let a = 0; a <= atk; a++) for (let d = 0; d <= def; d++) if (a > d) wins++;
    assert.ok(Math.abs(hitChance(atk, def) - wins / ((atk + 1) * (def + 1))) < 1e-12, `${atk} vs ${def}`);
  }
});

// ── Seeded distributions ────────────────────────────────────────────────────

test('swing vs. the recorded loadout: 5.1% land, damage uniform 0–3, 3.8% deal damage', () => {
  const random = new SeededRandom(2026);
  const n = 200_000;
  const byDamage = [0, 0, 0, 0];
  let landed = 0;
  for (let i = 0; i < n; i++) {
    const r = resolveAttack(brutus, capturePlayer, BRUTUS_SWING, random);
    if (r.accurate) {
      landed++;
      byDamage[r.damage]!++;
    } else {
      assert.equal(r.damage, 0);
    }
  }
  const expected = hitChance(1344, 13112);
  assert.ok(Math.abs(landed / n - expected) < 0.002, `landed ${landed / n} vs ${expected}`);
  for (const count of byDamage) assert.ok(Math.abs(count / landed - 0.25) < 0.02, `damage share ${count / landed}`);
  const damaging = (landed - byDamage[0]!) / n;
  assert.ok(Math.abs(damaging - expected * 0.75) < 0.002, `damaging ${damaging}`);
});

test('the same swing against an unarmoured level-1 player lands 78.5% of the time', () => {
  const random = new SeededRandom(7);
  const bare = playerDefender(BARE_LOADOUT, NO_PRAYERS);
  let landed = 0;
  for (let i = 0; i < 50_000; i++) if (resolveAttack(brutus, bare, BRUTUS_SWING, random).accurate) landed++;
  assert.ok(Math.abs(landed / 50_000 - hitChance(1344, 576)) < 0.006);
  assert.ok(Math.abs(hitChance(1344, 576) - 0.785) < 0.001);
});

test('capture check: the recorded swings are what this loadout predicts', () => {
  const rows = readCaptureTimelines().flatMap(parseTimeline).filter((r) => r.bossSeq === 'cow_boss_attack');
  const unprayed = rows.filter((r) => !r.protectMelee);
  const damaging = unprayed.filter((r) => r.hitsOnPlayer.some((h) => h.damage > 0)).length;
  assert.equal(rows.length, 84);
  assert.equal(unprayed.length, 69);
  assert.equal(damaging, 1);
  assert.ok(unprayed.every((r) => r.hitsOnPlayer.every((h) => h.damage <= brutus.maxHit('crush'))), 'never above max hit 3');

  // Under the model each swing deals damage with p = 0.05125 · 3/4 = 3.84%: about 2.7 expected.
  const p = hitChance(1344, 13112) * 0.75;
  const binomial = (k: number): number => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (unprayed.length - i)) / (i + 1);
    return c * p ** k * (1 - p) ** (unprayed.length - k);
  };
  const atMostObserved = binomial(0) + binomial(1);
  assert.ok(Math.abs(unprayed.length * p - 2.65) < 0.01);
  assert.ok(atMostObserved > 0.2, `P(≤1 damaging swing in 69) = ${atMostObserved.toFixed(3)}; the data does not contradict the model`);
});

// ── Attack specs and prayers ────────────────────────────────────────────────

test('Protect from Melee negates the swing and does nothing to stomp or charge', () => {
  const random = new SeededRandom(1);
  const bareAndPraying = playerDefender(BARE_LOADOUT, praying('PROTECT_FROM_MELEE'));
  let swingDamage = 0;
  let prayedHits = 0;
  for (let i = 0; i < 5_000; i++) {
    const r = resolveAttack(brutus, bareAndPraying, BRUTUS_SWING, random);
    swingDamage += r.damage;
    if (r.prayed) prayedHits++;
  }
  assert.equal(swingDamage, 0);
  assert.ok(prayedHits > 3_000, 'most swings land on a level-1 player and are then negated');

  const stomp = brutusStompSpec(DEFAULT_BRUTUS_CONFIG);
  const seen = new Set<number>();
  for (let i = 0; i < 2_000; i++) {
    const r = resolveAttack(brutus, bareAndPraying, stomp, random);
    assert.ok(r.accurate && !r.prayed);
    seen.add(r.damage);
  }
  assert.deepEqual([...seen].sort(), [15, 16, 17, 18, 19]);
  assert.equal(resolveAttack(brutus, playerDefender(BARE_LOADOUT, praying('PROTECT_FROM_MAGIC')), BRUTUS_SWING, new SeededRandom(3)).prayed, false);
});

test('attack spec: partial prayer penetration truncates; a landed player 0 becomes 1', () => {
  const half: AttackSpec = { name: 't', style: 'crush', accuracy: 'always', damage: { kind: 'range', min: 15, max: 15 }, prayerPenetration: 0.5 };
  const r = resolveAttack(brutus, playerDefender(BARE_LOADOUT, praying('PROTECT_FROM_MELEE')), half, new SeededRandom(1));
  assert.deepEqual(r, { accurate: true, prayed: true, damage: 7 });

  const shot: AttackSpec = { name: 'p', style: 'range', accuracy: 'roll', damage: { kind: 'maxHit' }, prayerPenetration: 0, minimumOneOnHit: true };
  const random = new SeededRandom(5);
  const attacker = playerAttacker(CAPTURE_LOADOUT, NO_PRAYERS);
  const target = npcDefender(BRUTUS_STATS, BRUTUS_BONUSES);
  const counts = new Array<number>(17).fill(0);
  let misses = 0;
  for (let i = 0; i < 100_000; i++) {
    const hit = resolveAttack(attacker, target, shot, random);
    if (hit.accurate) counts[hit.damage]!++;
    else misses++;
  }
  assert.ok(Math.abs(misses / 100_000 - (1 - hitChance(19344, 1083))) < 0.002);
  assert.equal(counts[0], 0, 'no landed zeros');
  // 1 is twice as likely as any other value, as in the logs (12 ones among 78 landed hits).
  assert.ok(Math.abs(counts[1]! / counts[2]! - 2) < 0.1);
});

// ── In the engine ───────────────────────────────────────────────────────────

test('engine: Brutus resolves its attacks through the combat module', () => {
  const run = (prayers: PrayerName[]) => {
    const player = new Player(tile(3261, 3290), 10_000, BARE_LOADOUT);
    for (const p of prayers) player.prayers.add(p);
    const world = new World({ collision: openArena(), random: new SeededRandom(11), player });
    new BrutusEncounter(world, { config: { ...DEFAULT_BRUTUS_CONFIG, firstSpecial: 'stomp' } }).start();
    world.run(600);
    const hits = world.events.all().flatMap((e) => (e.type === 'hitsplat' && e.target === 'player' ? [e] : []));
    return {
      melee: hits.filter((h) => h.source === 'brutus.melee').map((h) => h.damage),
      special: hits.filter((h) => h.source !== 'brutus.melee').map((h) => h.damage),
    };
  };
  const open = run([]);
  assert.ok(open.melee.length > 40);
  assert.ok(open.melee.every((d) => d >= 0 && d <= 3));
  assert.ok(open.melee.filter((d) => d > 0).length > open.melee.length / 2, 'a level-1 player is hit most of the time');
  assert.ok(open.special.length > 10 && open.special.every((d) => d >= 15 && d <= 19));
  assert.ok(open.special.some((d) => d >= 18), 'the top of the 15–19 range is reachable');

  const prayed = run(['PROTECT_FROM_MELEE']);
  assert.ok(prayed.melee.every((d) => d === 0));
  assert.ok(prayed.special.length > 10 && prayed.special.every((d) => d >= 15 && d <= 19));
});

test('engine: player.attack fires every 3 ticks, hitsplats land 2–3 ticks later, and Brutus dies', () => {
  const player = new Player(tile(3262, 3294), 10_000, CAPTURE_LOADOUT);
  const world = new World({ collision: openArena(), random: new SeededRandom(3), player });
  const boss: Brutus = new BrutusEncounter(world, { respawn: false }).start();
  player.attack(boss);
  world.run(120);

  const shots = world.events.all().flatMap((e) => (e.type === 'player_attack' ? [e] : []));
  assert.ok(shots.length >= 4);
  assert.equal(shots[0]!.tick, 1, 'first shot on the spawn tick: 5 tiles from the footprint, within reach 7');
  assert.equal(shots[0]!.landTick, 4, 'distance 5 → 3 ticks, as in the logs (fired 755, hitsplat 758)');
  for (let i = 1; i < shots.length; i++) assert.equal(shots[i]!.tick - shots[i - 1]!.tick, 3);
  assert.ok(shots.every((s) => s.damage <= 16 && (!s.accurate || s.damage >= 1)));
  const adjacent = shots.find((s) => s.landTick - s.tick === 2);
  assert.ok(adjacent, 'once Brutus is next to the player the delay drops to 2 ticks');

  assert.ok(boss.deathTick > 0, 'killed');
  assert.ok(world.events.all().some((e) => e.type === 'npc_seq' && e.seq === BrutusIds.SEQ_DEATH));
  assert.equal(world.events.all().filter((e) => e.type === 'player_attack' && e.tick > boss.deathTick + 5).length, 0);
});
