import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameSession } from '../src/client/GameSession.ts';
import { ItemIds } from '../src/content/items/Items.ts';
import { readBrutusArenaDumps } from '../src/node/files.ts';
import { attackInterval, attackReach } from '../src/sdk/combat/Loadout.ts';
import { PRAYER_BOOK, conflictsWith, drainResistance, prayerInfo } from '../src/sdk/combat/PrayerBook.ts';
import { Player } from '../src/sdk/Player.ts';
import { tile } from '../src/sdk/Location.ts';

const dumps = readBrutusArenaDumps();
const session = (options: Partial<ConstructorParameters<typeof GameSession>[0]> = {}): GameSession => new GameSession({ regionDumps: dumps, seed: 5, ...options });
const ticks = (s: GameSession, n: number): void => {
  for (let i = 0; i < n; i++) s.tick();
};

test('prayer book: 29 prayers in interface order with the documented drain effects', () => {
  assert.equal(PRAYER_BOOK.length, 29);
  assert.equal(PRAYER_BOOK[0]!.name, 'THICK_SKIN');
  assert.deepEqual([prayerInfo('PROTECT_FROM_MELEE').level, prayerInfo('PROTECT_FROM_MELEE').drain], [43, 12]);
  assert.deepEqual([prayerInfo('RIGOUR').level, prayerInfo('RIGOUR').drain, prayerInfo('RIGOUR').requiresUnlock], [74, 24, true]);
  assert.equal(drainResistance(3), 66);
  assert.deepEqual(conflictsWith('SMITE', new Set(['PROTECT_FROM_MELEE', 'EAGLE_EYE'])), ['PROTECT_FROM_MELEE']);
  assert.deepEqual(conflictsWith('EAGLE_EYE', new Set(['ULTIMATE_STRENGTH', 'INCREDIBLE_REFLEXES', 'STEEL_SKIN'])), ['ULTIMATE_STRENGTH', 'INCREDIBLE_REFLEXES']);
});

test('prayers: toggling, conflicts, level and unlock checks', () => {
  const s = session();
  assert.equal(s.togglePrayer('PROTECT_FROM_MELEE'), null);
  assert.equal(s.togglePrayer('EAGLE_EYE'), null);
  assert.equal(s.togglePrayer('PROTECT_FROM_MISSILES'), null);
  assert.deepEqual([...s.player.prayers].sort(), ['EAGLE_EYE', 'PROTECT_FROM_MISSILES'], 'one overhead at a time');
  assert.equal(s.togglePrayer('RIGOUR'), 'locked');
  assert.equal(s.togglePrayer('AUGURY'), 'level', 'Prayer 74 is below 77');
  assert.equal(s.togglePrayer('EAGLE_EYE'), null);
  assert.ok(!s.player.prayers.has('EAGLE_EYE'), 'a second click switches it off');

  const unlocked = session({ unlockedPrayers: ['RIGOUR'] });
  unlocked.togglePrayer('EAGLE_EYE');
  assert.equal(unlocked.togglePrayer('RIGOUR'), null);
  assert.deepEqual([...unlocked.player.prayers], ['RIGOUR']);
  assert.equal(unlocked.prayerBook.find((p) => p.info.name === 'PIETY')!.refusal, 'locked');
});

test('prayer drain: Protect from Melee with +3 prayer bonus loses a point about every 5.5 ticks, then switches off at 0', () => {
  const s = session();
  s.togglePrayer('PROTECT_FROM_MELEE');
  ticks(s, 5);
  assert.equal(s.stats.prayerPoints, 74, 'counter 60 has not passed the resistance of 66');
  ticks(s, 1);
  assert.equal(s.stats.prayerPoints, 73);
  ticks(s, 61);
  assert.equal(s.stats.prayerPoints, 62, 'the 12th point goes on tick 67, when the counter first exceeds 12 × 66');
  ticks(s, 400);
  assert.equal(s.stats.prayerPoints, 0);
  assert.equal(s.protectFromMelee, false, 'prayers drop when the points run out');
  assert.equal(s.togglePrayer('PROTECT_FROM_MELEE'), 'no-points');

  const free = session({ prayerDrain: false });
  free.togglePrayer('PROTECT_FROM_MELEE');
  ticks(free, 200);
  assert.equal(free.stats.prayerPoints, 74);
  assert.equal(new Player(tile(0, 0)).prayerDrain, false, 'the engine default (used by the log replay) does not drain');
});

test('inventory: food heals with a 3-tick delay; potions step through their doses', () => {
  const s = session({ supplies: [ItemIds.shark, ItemIds.shark, ItemIds.rangingPotion4, ItemIds.prayerPotion1, ItemIds.runeArrow] });
  s.player.hitpoints = 40;
  assert.equal(s.useItem(0), true);
  assert.equal(s.player.hitpoints, 60);
  assert.equal(s.inventory[0]!.item, null);
  assert.equal(s.useItem(1), false, 'cannot eat again on the same tick');
  ticks(s, 2);
  assert.equal(s.useItem(1), false, 'nor two ticks later');
  ticks(s, 1);
  s.player.hitpoints = 80;
  assert.equal(s.useItem(1), true);
  assert.equal(s.player.hitpoints, 85, 'healing stops at the maximum');

  assert.equal(s.useItem(2), true);
  assert.equal(s.stats.rangedLevel, 97, '85 + 4 + 10%');
  assert.equal(s.inventory[2]!.item!.id, ItemIds.rangingPotion3);
  assert.equal(s.useItem(2), false, 'potion delay');
  ticks(s, 3);
  s.player.prayerPoints = 10;
  assert.equal(s.useItem(3), true);
  assert.equal(s.stats.prayerPoints, 35, '7 + 25% of 74');
  assert.equal(s.inventory[3]!.item!.id, ItemIds.vial);
  assert.equal(s.useItem(3), false, 'an empty vial does nothing');
  assert.equal(s.useItem(4), false, 'arrows are not usable');
  assert.equal(s.inventory[4]!.usable, false);

  ticks(s, 100);
  assert.equal(s.stats.rangedLevel, 96, 'the boost decays one level a minute');
});

test('inventory: eating pushes the next attack back three ticks', () => {
  const attackTicks = (eatAt: number | null): number[] => {
    const s = session({ supplies: [ItemIds.shark], config: { firstSpecial: 'stomp', stompDamage: { min: 0, max: 0 }, chargeDamage: { min: 0, max: 0 } } });
    s.autoRetaliate = false;
    s.start();
    const seen: number[] = [];
    for (let i = 0; i < 24; i++) {
      if (i === 8) s.attackBoss();
      if (s.world.tick === eatAt) s.useItem(0);
      for (const e of s.tick()) if (e.type === 'player_attack') seen.push(s.world.tick);
    }
    return seen;
  };
  const normal = attackTicks(null);
  assert.ok(normal.length >= 3);
  assert.equal(normal[1]! - normal[0]!, 3, 'Rapid shortbow: 3 ticks');
  const delayed = attackTicks(normal[0]!);
  assert.equal(delayed[0], normal[0]);
  assert.equal(delayed[1]! - delayed[0]!, 6, 'eating right after a shot adds 3 ticks before the next');
});

test('stances: the bow offers Accurate, Rapid and Longrange, and the engine uses the choice', () => {
  const s = session();
  assert.deepEqual(s.stances, ['accurate', 'rapid', 'longrange']);
  assert.equal(attackInterval(s.player.loadout), 3);
  assert.equal(s.setStance('accurate'), true);
  assert.equal(attackInterval(s.player.loadout), 4);
  assert.equal(s.setStance('longrange'), true);
  assert.equal(attackReach(s.player.loadout), 9);
  assert.equal(s.setStance('aggressive'), false);
  assert.equal(s.stats.stance, 'longrange');
  s.reset(6);
  assert.equal(s.stats.stance, 'longrange', 'the stance survives a reset, like the prayers');
});

test('intents between ticks: their events arrive with the next tick', () => {
  const s = session();
  s.togglePrayer('PROTECT_FROM_MELEE');
  s.useItem(0);
  const events = s
    .tick()
    .filter((e) => e.type === 'player_prayer' || e.type === 'player_consume')
    .map(({ tick: _tick, ...body }) => body);
  assert.deepEqual(events, [
    { type: 'player_prayer', prayer: 'PROTECT_FROM_MELEE', on: true },
    { type: 'player_consume', itemId: ItemIds.rangingPotion4, kind: 'potion', healed: 0 },
  ]);
  assert.deepEqual(s.tick().filter((e) => e.type === 'player_prayer'), []);
});
