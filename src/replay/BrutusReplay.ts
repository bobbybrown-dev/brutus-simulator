import { Brutus } from '../content/brutus/Brutus.ts';
import {
  BrutusIds,
  BrutusSeqNames,
  BrutusSoundNames,
  type BrutusConfig,
  type SpecialKind,
} from '../content/brutus/BrutusConstants.ts';
import { BrutusEncounter } from '../content/brutus/BrutusEncounter.ts';
import { CAPTURE_LOADOUT } from '../content/loadouts/CaptureLoadout.ts';
import type { CollisionMap } from '../sdk/Collision.ts';
import type { SimEvent } from '../sdk/Events.ts';
import { Player } from '../sdk/Player.ts';
import { World } from '../sdk/World.ts';
import { ReplayOracle } from './ReplayOracle.ts';
import type { TimelineRow } from './Timeline.ts';

export interface ReplayResult {
  kill: string;
  ticksReplayed: number;
  /** Human-readable differences between engine output and the log. Empty means 1:1 parity. */
  mismatches: string[];
  fightDurationTicks: number;
  events: SimEvent[];
  /** Random outcomes read back from the log, by tag. */
  randomRolls: Map<string, number[]>;
}

/** The engine's output for one tick, reduced to the same fields the timeline CSV records. */
interface TickView {
  bossSw: string;
  bossSeq: string;
  bossSay: string;
  bossFace: string;
  stompTiles: string;
  bossExactMove: string;
  hitsOnPlayer: string;
  notes: string;
}

const COMPARED_NOTE = /^(boss_spawn|boss_despawn|spotanim3589_on_boss|sound:.*)$/;

function expectedView(row: TimelineRow): TickView {
  return {
    bossSw: `${row.bossSw.x},${row.bossSw.y}`,
    bossSeq: row.bossSeq,
    bossSay: row.bossSay,
    // Only fixed-coordinate facing is asserted; "player"/"reset" face-locks are client-side noise.
    bossFace: row.bossFace.startsWith('(') ? row.bossFace : '',
    stompTiles: [...row.stompTiles].sort().join(' '),
    bossExactMove: row.bossExactMove,
    hitsOnPlayer: row.hitsOnPlayer.map((h) => `${h.damage}(type${h.hitsplat})`).join(';'),
    notes: row.notes.filter((n) => COMPARED_NOTE.test(n)).sort().join('|'),
  };
}

function actualView(boss: Brutus, events: readonly SimEvent[]): TickView {
  const seqs: string[] = [];
  const says: string[] = [];
  const faces: string[] = [];
  const stomp: string[] = [];
  const exact: string[] = [];
  const hits: string[] = [];
  const notes: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'npc_spawn': notes.push('boss_spawn'); break;
      case 'npc_despawn': notes.push('boss_despawn'); break;
      case 'npc_seq': seqs.push(BrutusSeqNames[e.seq] ?? String(e.seq)); break;
      case 'npc_say': says.push(e.text); break;
      case 'npc_face_coord': faces.push(`(${e.at.x}, ${e.at.y})`); break;
      case 'npc_spotanim': notes.push(`spotanim${e.spotanim}_on_boss`); break;
      case 'map_anim':
        if (e.spotanim === BrutusIds.SPOTANIM_STOMP_TILE) stomp.push(`${e.at.x},${e.at.y}`);
        break;
      case 'npc_exact_move':
        exact.push(
          `to1=(${e.from.x}, ${e.from.y}, 0), delay1=${e.delay1}, to2=(${e.to.x}, ${e.to.y}, 0), delay2=${e.delay2}, angle=${e.angle}`,
        );
        break;
      case 'sound': notes.push(`sound:${BrutusSoundNames[e.id] ?? e.id}`); break;
      case 'hitsplat':
        if (e.target === 'player') hits.push(`${e.damage}(type${e.hitsplat})`);
        break;
      default: break;
    }
  }
  return {
    bossSw: `${boss.location.x},${boss.location.y}`,
    bossSeq: seqs.join(';'),
    bossSay: says.join(';'),
    bossFace: faces.join(';'),
    stompTiles: stomp.sort().join(' '),
    bossExactMove: exact.join(';'),
    hitsOnPlayer: hits.join(';'),
    notes: notes.sort().join('|'),
  };
}

function firstSpecialIn(rows: readonly TimelineRow[]): SpecialKind {
  for (const r of rows) {
    if (r.bossSeq === 'cow_boss_stomp') return 'stomp';
    if (r.bossSeq === 'cow_boss_charge') return 'charge';
  }
  return 'stomp';
}

/**
 * Replay one recorded kill through the headless engine.
 *
 * Inputs taken from the log: the player's tile and Protect from Melee state every tick, the
 * damage the player dealt to the boss and the tick it landed, which special opened the fight, and the outcomes of random rolls
 * (see `ReplayOracle`). Everything the boss does is produced by the engine and diffed against
 * the log tick by tick.
 */
export function replayKill(rows: readonly TimelineRow[], collision: CollisionMap): ReplayResult {
  const first = rows[0];
  if (!first) throw new Error('empty kill');
  const byTick = new Map(rows.map((r) => [r.tick, r]));

  // Damage ranges are opened up so the oracle's recorded values pass through unchanged.
  const open = { min: 0, max: 99 };
  const config: BrutusConfig = { firstSpecial: firstSpecialIn(rows), stompDamage: open, chargeDamage: open };

  const player = new Player(first.player, 10_000, CAPTURE_LOADOUT);
  let world!: World;
  const oracle = new ReplayOracle(rows, () => world.tick);
  world = new World({ collision, random: oracle, player, startTick: first.tick - 1 });
  player.controller = (w, p) => {
    const row = byTick.get(w.tick);
    if (!row) return;
    p.setLocation(row.player);
    if (row.protectMelee) p.prayers.add('PROTECT_FROM_MELEE');
    else p.prayers.delete('PROTECT_FROM_MELEE');
  };

  const encounter = new BrutusEncounter(world, { config, respawn: false });
  const boss = encounter.start();
  const mismatches: string[] = [];

  for (const row of rows) {
    for (const hit of row.hitsOnBoss) boss.queueHit(hit.damage, row.tick, hit.hitsplat);
    world.tickOnce();

    const expected = expectedView(row);
    const actual = actualView(boss, world.events.at(row.tick));
    for (const key of Object.keys(expected) as Array<keyof TickView>) {
      if (expected[key] !== actual[key]) {
        mismatches.push(`${row.kill} tick ${row.tick} (+${row.relTick}) ${key}: log "${expected[key]}" vs engine "${actual[key]}"`);
      }
    }
    if (row.hitsOnBoss.length > 0 && row.bossHp !== null && boss.hitpoints !== row.bossHp) {
      mismatches.push(`${row.kill} tick ${row.tick} bossHp: log ${row.bossHp} vs engine ${boss.hitpoints}`);
    }
  }
  mismatches.push(...oracle.violations.map((v) => `${first.kill} rng: ${v}`));

  return {
    kill: first.kill,
    ticksReplayed: rows.length,
    mismatches,
    fightDurationTicks: boss.fightDurationTicks,
    events: world.events.all(),
    randomRolls: oracle.served,
  };
}
