import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chargeDirection,
  chargeHits,
  chargeTargetTile,
  facingAngle,
  specialFaceTile,
  stompDangerTiles,
  stompDirection,
  stompTiles,
} from '../src/content/brutus/BrutusGeometry.ts';
import { isCardinallyAdjacent, tile } from '../src/sdk/Location.ts';

const sw = tile(100, 100);
const rel = (tiles: { x: number; y: number }[]): string =>
  tiles.map((t) => `${t.x - sw.x},${t.y - sw.y}`).sort().join(' ');

test('3x3 melee reach is the four edges only', () => {
  assert.ok(isCardinallyAdjacent(sw, 3, tile(99, 101)));
  assert.ok(isCardinallyAdjacent(sw, 3, tile(102, 103)));
  assert.ok(!isCardinallyAdjacent(sw, 3, tile(99, 99)), 'diagonal corner');
  assert.ok(!isCardinallyAdjacent(sw, 3, tile(101, 101)), 'under the boss');
  assert.ok(!isCardinallyAdjacent(sw, 3, tile(98, 101)), 'two tiles away');
});

test('stomp direction is the sign of the offset from the centre tile', () => {
  assert.deepEqual(stompDirection(sw, tile(99, 100)), { dx: -1, dy: -1 }); // west side, bottom row → L
  assert.deepEqual(stompDirection(sw, tile(99, 101)), { dx: -1, dy: 0 }); // west side, middle row → line
  assert.deepEqual(stompDirection(sw, tile(101, 103)), { dx: 0, dy: 1 });
  assert.deepEqual(stompDirection(sw, tile(100, 100)), { dx: -1, dy: -1 }); // under the SW tile
});

test('stomp tiles: recorded shapes (BOSS_SPEC 5.2)', () => {
  assert.equal(rel(stompTiles(sw, { dx: 0, dy: 1 })), '0,3 1,3 2,3');
  assert.equal(rel(stompTiles(sw, { dx: 0, dy: -1 })), '0,-1 1,-1 2,-1');
  assert.equal(rel(stompTiles(sw, { dx: -1, dy: 0 })), '-1,0 -1,1 -1,2');
  assert.equal(rel(stompTiles(sw, { dx: -1, dy: -1 })), '-1,-1 -1,0 -1,1 0,-1 1,-1');
  assert.equal(rel(stompTiles(sw, { dx: 1, dy: -1 })), '1,-1 2,-1 3,-1 3,0 3,1');
  assert.equal(rel(stompTiles(sw, { dx: -1, dy: 1 })), '-1,1 -1,2 -1,3 0,3 1,3');
});

test('stomp tiles: east and north-east mirror the recorded shapes', () => {
  assert.equal(rel(stompTiles(sw, { dx: 1, dy: 0 })), '3,0 3,1 3,2');
  assert.equal(rel(stompTiles(sw, { dx: 1, dy: 1 })), '1,3 2,3 3,1 3,2 3,3');
});

test('stomp also hurts footprint tiles that border a marked tile (K4 tick 1305)', () => {
  const danger = rel(stompDangerTiles(sw, { dx: -1, dy: 1 }));
  assert.ok(danger.split(' ').includes('0,1'));
  assert.ok(!danger.split(' ').includes('2,0'));
});

test('charge direction is cardinal along the dominant axis', () => {
  assert.deepEqual(chargeDirection(sw, tile(99, 100)), { dx: -1, dy: 0 }); // K1: offset (-2,-1) → west
  assert.deepEqual(chargeDirection(sw, tile(101, 99)), { dx: 0, dy: -1 });
  assert.deepEqual(chargeDirection(sw, tile(103, 102)), { dx: 1, dy: 0 });
});

test('charge target: SW tile lands 3 past the player on the charge axis', () => {
  assert.deepEqual(chargeTargetTile(sw, { dx: -1, dy: 0 }, tile(99, 101)), tile(96, 100));
  assert.deepEqual(chargeTargetTile(sw, { dx: 0, dy: 1 }, tile(101, 103)), tile(100, 106));
});

test('charge hit box and wind-up facing', () => {
  const to = tile(96, 100);
  assert.ok(chargeHits(sw, to, tile(99, 100)));
  assert.ok(!chargeHits(sw, to, tile(101, 99)));
  assert.deepEqual(specialFaceTile(sw, { dx: -1, dy: 0 }), tile(96, 101));
  assert.equal(facingAngle({ dx: -1, dy: 0 }), 512);
  assert.equal(facingAngle({ dx: 0, dy: -1 }), 0);
});
