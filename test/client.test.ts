import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { computeArenaLayout } from '../src/client/arenaLayout.ts';
import { GameSession } from '../src/client/GameSession.ts';
import { chargeLane, telegraphTiles } from '../src/client/telegraphTiles.ts';
import { buildBrutusArena } from '../src/content/brutus/BrutusArena.ts';
import { BRUTUS_SPAWN_TILE, BrutusIds } from '../src/content/brutus/BrutusConstants.ts';
import { readBrutusArenaDumps, workspacePath } from '../src/node/files.ts';
import { tile } from '../src/sdk/Location.ts';

const dumps = readBrutusArenaDumps();
const has = (tiles: { x: number; y: number }[], x: number, y: number): boolean => tiles.some((t) => t.x === x && t.y === y);

test('architecture: the engine and boss content never import Three.js or touch the DOM', () => {
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) {
        const source = readFileSync(path, 'utf8');
        if (/from ['"]three|\bdocument\.|\bwindow\.|HTMLElement|requestAnimationFrame\(|from ['"][./]+client\//.test(source)) offenders.push(path);
      }
    }
  };
  walk(workspacePath('src/sdk'));
  walk(workspacePath('src/content'));
  walk(workspacePath('src/replay'));
  assert.deepEqual(offenders, []);
});

test('arena layout: the fenced field, derived from collision alone', () => {
  const layout = computeArenaLayout(buildBrutusArena(dumps), BRUTUS_SPAWN_TILE);
  assert.equal(layout.floor.length, 743);
  assert.deepEqual(layout.bounds, { minX: 3240, maxX: 3265, minY: 3255, maxY: 3298 });
  assert.equal(layout.seamX, 3264, 'region 12851 meets 13107 inside the field');
  assert.ok(has(layout.floor, 3262, 3294), 'player entry tile');
  assert.ok(has(layout.floor, 3265, 3260), 'south-east corner, in region 13106');
  assert.ok(!has(layout.floor, 3262, 3295), 'the pen behind the closed gate is not part of the arena');
  assert.ok(!has(layout.floor, 3266, 3288), 'nothing beyond the east fence');
  assert.ok(has(layout.solids, 3257, 3289) && has(layout.solids, 3260, 3294), 'the two objects inside the field');

  const gates = layout.fences.filter((f) => f.gate);
  assert.deepEqual(
    gates.map((f) => `${f.tile.x},${f.tile.y} ${f.side}`).sort(),
    ['3253,3266 west', '3253,3267 west', '3262,3294 north', '3263,3294 north'],
  );
  assert.ok(layout.fences.some((f) => f.tile.x === 3265 && f.tile.y === 3288 && f.side === 'east' && !f.gate));
});

test('telegraph tiles: stomp danger tiles and the charge lane', () => {
  assert.equal(chargeLane(tile(3261, 3287), tile(3257, 3287)).length, 7 * 3, 'west: 4 tiles of travel + the 3-wide footprint');
  assert.equal(chargeLane(tile(3261, 3287), tile(3261, 3293)).length, 3 * 9, 'north: 6 tiles of travel');
  const stomp = { kind: 'stomp' as const, startTick: 1, resolveTick: 5, marked: [tile(1, 1)], danger: [tile(1, 1), tile(1, 2)] };
  assert.deepEqual(telegraphTiles(stomp), stomp.danger);
});

test('session: idle until started, then a seeded fight that is identical for the same inputs', () => {
  const play = (seed: number) => {
    const session = new GameSession({ regionDumps: dumps, seed });
    assert.equal(session.state, 'idle');
    for (let i = 0; i < 5; i++) session.tick();
    assert.equal(session.boss, null);
    session.start();
    session.moveTo(tile(3262, 3290));
    const seen: string[] = [];
    for (let i = 0; i < 300 && (session.state as string) !== 'dead'; i++) {
      for (const e of session.tick()) if (e.type === 'npc_seq' || e.type === 'hitsplat') seen.push(JSON.stringify(e));
    }
    return { session, seen };
  };
  const a = play(42);
  assert.deepEqual(a.seen, play(42).seen);
  assert.notDeepEqual(a.seen, play(43).seen);

  const stats = a.session.stats;
  assert.ok(a.seen.some((s) => s.includes(`"seq":${BrutusIds.SEQ_SPAWN}`)));
  assert.ok(stats.damageDealt > 0, 'auto-retaliate fought back after the first hit');
  assert.ok(stats.dps > 1 && stats.dps < 8, `plausible ranged DPS, got ${stats.dps}`);
  assert.ok(stats.kills >= 1 || stats.state === 'dead');
});

test('session: intents — ground click stops attacking, prayer toggle, reset, telegraph is exposed', () => {
  const session = new GameSession({ regionDumps: dumps, seed: 7 });
  session.autoRetaliate = false;
  session.setProtectFromMelee(true);
  session.start();
  session.tick();
  session.attackBoss();
  assert.equal(session.player.target, session.boss);
  session.moveTo(tile(3262, 3291));
  assert.equal(session.player.target, null);

  let sawStomp = false;
  let sawCharge = false;
  for (let i = 0; i < 400; i++) {
    session.tick();
    const t = session.boss?.telegraph;
    if (t?.kind === 'stomp') {
      sawStomp = true;
      assert.ok(t.danger.length >= 3 && t.resolveTick === t.startTick + 4);
    }
    if (t?.kind === 'charge') sawCharge = true;
  }
  assert.ok(sawStomp && sawCharge, 'both specials are visible to the renderer before they land');
  assert.equal(session.stats.damageDealt, 0, 'auto-retaliate off: the player never attacked');
  assert.ok(session.stats.damageTaken > 0, 'specials still hurt through Protect from Melee');

  session.reset(8);
  assert.equal(session.state, 'idle');
  assert.equal(session.world.tick, 0);
  assert.ok(session.protectFromMelee, 'the prayer toggle survives a reset');
  assert.deepEqual(session.player.location, tile(3262, 3294));
});
