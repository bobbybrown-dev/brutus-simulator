import { tile, type Tile } from '../sdk/Location.ts';

/** One row of `brutus_tick_timeline.csv`: the recorded state of one server tick. */
export interface TimelineRow {
  kill: string;
  tick: number;
  relTick: number;
  player: Tile;
  bossSw: Tile;
  bossSeq: string;
  bossSay: string;
  /** "(x, y)" for a fixed coordinate, "player", "type=reset", or "". */
  bossFace: string;
  bossHp: number | null;
  hitsOnBoss: RecordedHit[];
  hitsOnPlayer: RecordedHit[];
  stompTiles: string[];
  bossExactMove: string;
  notes: string[];
  /** Protect from Melee was on at the end of this tick. False when the capture has no such column. */
  protectMelee: boolean;
}

export interface RecordedHit {
  damage: number;
  hitsplat: number;
}

/** Minimal RFC 4180 line splitter (quoted fields, no embedded newlines). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseHits(field: string): RecordedHit[] {
  if (!field) return [];
  return field.split(';').map((h) => {
    const m = /^(\d+)\(type(\d+)\)$/.exec(h);
    if (!m) throw new Error(`bad hit field: ${h}`);
    return { damage: Number(m[1]), hitsplat: Number(m[2]) };
  });
}

export function parseTimeline(csv: string): TimelineRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]!);
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`timeline is missing column ${name}`);
    return i;
  };
  const c = {
    kill: col('kill'), tick: col('tick'), rel: col('rel_tick'),
    px: col('player_x'), py: col('player_y'), bx: col('boss_sw_x'), by: col('boss_sw_y'),
    seq: col('boss_seq'), say: col('boss_say'), face: col('boss_face'), hp: col('boss_hp'),
    hitBoss: col('hit_on_boss'), hitPlayer: col('hit_on_player'),
    stomp: col('stomp_tiles'), exact: col('boss_exact_move'), notes: col('notes'),
    prayer: header.indexOf('protect_melee'),
  };
  return lines.slice(1).map((line) => {
    const f = splitCsvLine(line);
    const get = (i: number): string => f[i] ?? '';
    return {
      kill: get(c.kill),
      tick: Number(get(c.tick)),
      relTick: Number(get(c.rel)),
      player: tile(Number(get(c.px)), Number(get(c.py))),
      bossSw: tile(Number(get(c.bx)), Number(get(c.by))),
      bossSeq: get(c.seq),
      bossSay: get(c.say),
      bossFace: get(c.face),
      bossHp: get(c.hp) === '' ? null : Number(get(c.hp)),
      hitsOnBoss: parseHits(get(c.hitBoss)),
      hitsOnPlayer: parseHits(get(c.hitPlayer)),
      stompTiles: get(c.stomp) ? get(c.stomp).split(' ') : [],
      bossExactMove: get(c.exact),
      notes: get(c.notes) ? get(c.notes).split('|') : [],
      protectMelee: c.prayer >= 0 && get(c.prayer) === '1',
    };
  });
}

export function groupByKill(rows: readonly TimelineRow[]): Map<string, TimelineRow[]> {
  const kills = new Map<string, TimelineRow[]>();
  for (const r of rows) {
    const list = kills.get(r.kill);
    if (list) list.push(r);
    else kills.set(r.kill, [r]);
  }
  return kills;
}
