#!/usr/bin/env python3
"""
Turn an RSProx transcript into the per-tick Brutus timeline CSV the replay tests consume.

    python scripts/extract_timeline.py logs/<transcript>.txt data/<out>.csv --first-kill 6

One row per server tick for every Brutus (NPC 15626) lifetime in the transcript, from the tick the
NPC is added to the tick it is deleted (or the end of the log). Kills are named K<n> starting at
--first-kill. Columns match data/brutus_tick_timeline.csv, plus `protect_melee` (1 while the
Protect from Melee varbit is set at the end of the tick).
"""
import argparse
import csv
import re

BOSS = 'cowboss (15626)'
COORD = r'\((\d+), (\d+), \d+\)'
ENTITY = re.compile(
    r'\[(idle|walk|run|add|del|teleport|telejump|crawl)\] (player|npc)=\(index=(\d+), (?:name|id)=[^,]+?,'
    r'(?: multinpc=[^,]+,)? coord=' + COORD + r'\)(?:, newcoord=' + COORD + ')?')


def indent(line):
    return len(line) - len(line.lstrip())


def parse(path):
    lines = open(path, encoding='utf8').read().split('\n')
    local = next(int(l.split(':')[1]) for l in lines[:20] if l.startswith('local player index'))
    ticks, cur = {}, None
    for l in lines:
        m = re.match(r'^\[(\d+)\]\s*$', l)
        if m:
            cur = int(m.group(1)); ticks[cur] = []
        elif cur is not None:
            ticks[cur].append(l)
    return local, ticks


def extract(path):
    local, ticks = parse(path)
    player = boss = None
    prayer = 0
    out = []
    for t in sorted(ticks):
        L = ticks[t]
        row = dict(tick=t, seq='', say='', face='', hp='', hit_boss=[], hit_player=[], php='', pseq='',
                   stomp=[], exact='', notes=[], spawn=False, despawn=False)
        i = 0
        while i < len(L):
            l = L[i]; s = l.strip()
            m = ENTITY.match(s)
            mine = m and ((m.group(2) == 'player' and int(m.group(3)) == local) or
                          (m.group(2) == 'npc' and re.search(r'id=cowboss \(15626\)', s)))
            if mine:
                kind, who = m.group(1), m.group(2)
                pos = (int(m.group(6)), int(m.group(7))) if m.group(6) else (int(m.group(4)), int(m.group(5)))
                if who == 'player':
                    player = pos
                elif kind == 'del':
                    row['despawn'] = True
                else:
                    boss = pos
                    if kind == 'add': row['spawn'] = True
                base = indent(l); i += 1
                while i < len(L) and L[i].strip() and indent(L[i]) > base:
                    c = L[i].strip(); i += 1
                    if c.startswith('[hit]'):
                        h = re.search(r'id=(\d+), value=(\d+)', c)
                        row['hit_boss' if who == 'npc' else 'hit_player'].append(f'{h.group(2)}(type{h.group(1)})')
                    elif c.startswith('[sequence]'):
                        name = re.search(r'id=(\S+)', c).group(1).rstrip(',')
                        if who == 'npc': row['seq'] = name
                        elif name != '-1': row['pseq'] = name
                    elif who == 'npc' and c.startswith('[say]'):
                        row['say'] = re.search(r'text="(.*)"', c).group(1)
                    elif who == 'npc' and c.startswith('[spotanim]') and '3589' in c:
                        row['notes'].append('spotanim3589_on_boss')
                    elif who == 'npc' and c.startswith('[exact_move]'):
                        row['exact'] = c[len('[exact_move] '):]
                    elif who == 'npc' and c.startswith('[facing]'):
                        fm = re.search(r'coord=(\(\d+, \d+), \d+\)', c)
                        if 'player=' in c: row['face'] = 'player'
                        elif fm: row['face'] = fm.group(1) + ')'
                        elif 'type=reset' in c: row['face'] = 'type=reset'
                continue
            if s.startswith('[map_anim]') and '(3588)' in s:
                c = re.search(r'coord=' + COORD, s); row['stomp'].append(f'{c.group(1)},{c.group(2)}')
            elif 'hpbar_hud_hp' in s and s.startswith('[varbit]'):
                row['hp'] = re.search(r'new=(\d+)', s).group(1)
            elif s.startswith('[update_stat_v2] stat=hitpoints'):
                row['php'] = re.search(r'level=(\d+)', s).group(1)
            elif s.startswith('[synth_sound]') and 'cb_boss' in s:
                row['notes'].append('sound:' + re.search(r'id=(\w+)', s).group(1))
            elif s.startswith('[varbit] id=prayer_protectfrommelee'):
                prayer = int(re.search(r'new=(\d+)', s).group(1))
            elif s.startswith('[message_game]') and 'You eat' in s:
                row['notes'].append('player_eats')
            elif s.startswith('[map_projanim') and 'rune_arrow' in s:
                row['notes'].append('player_fires_arrow')
            i += 1
        row['player'], row['boss'], row['prayer'] = player, boss, prayer
        out.append(row)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('log'); ap.add_argument('out'); ap.add_argument('--first-kill', type=int, default=1)
    a = ap.parse_args()
    rows = extract(a.log)
    header = ['kill', 'tick', 'rel_tick', 'player_x', 'player_y', 'boss_sw_x', 'boss_sw_y', 'boss_seq', 'boss_say',
              'boss_face', 'boss_hp', 'hit_on_boss', 'hit_on_player', 'player_hp', 'player_seq', 'stomp_tiles',
              'boss_exact_move', 'notes', 'protect_melee']
    kill, start, alive, written = a.first_kill - 1, None, False, 0
    with open(a.out, 'w', newline='') as f:
        w = csv.writer(f); w.writerow(header)
        for r in rows:
            if r['spawn']:
                kill += 1; start = r['tick']; alive = True
            if not alive:
                continue
            notes = (['boss_spawn'] if r['spawn'] else []) + (['boss_despawn'] if r['despawn'] else []) + r['notes']
            w.writerow([f'K{kill}', r['tick'], r['tick'] - start, r['player'][0], r['player'][1], r['boss'][0], r['boss'][1],
                        r['seq'], r['say'], r['face'], r['hp'], ';'.join(r['hit_boss']), ';'.join(r['hit_player']),
                        r['php'], r['pseq'], ' '.join(r['stomp']), r['exact'], '|'.join(notes), r['prayer']])
            written += 1
            if r['despawn']:
                alive = False
    print(f'{a.out}: {written} ticks, kills K{a.first_kill}..K{kill}' + (' (last kill runs past the end of the log)' if alive else ''))


if __name__ == '__main__':
    main()
