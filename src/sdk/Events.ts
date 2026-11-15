import type { Tile } from './Location.ts';

/**
 * Everything observable that the simulation produces. These mirror the server→client packets
 * seen in RSProx, so the visual layer can render from them and the replay test can diff them.
 * The engine never reads events back; they are output only.
 */
export type SimEventBody =
  | { type: 'npc_spawn'; npcId: number; at: Tile }
  | { type: 'npc_despawn'; npcId: number; at: Tile }
  | { type: 'npc_move'; npcId: number; from: Tile; to: Tile }
  | { type: 'npc_seq'; npcId: number; seq: number; delayCycles: number }
  | { type: 'npc_say'; npcId: number; text: string }
  | { type: 'npc_face_coord'; npcId: number; at: Tile }
  | { type: 'npc_spotanim'; npcId: number; spotanim: number }
  | { type: 'npc_exact_move'; npcId: number; from: Tile; to: Tile; delay1: number; delay2: number; angle: number }
  | { type: 'npc_hp'; npcId: number; hp: number }
  | { type: 'map_anim'; spotanim: number; at: Tile }
  | { type: 'sound'; id: number }
  | { type: 'hitsplat'; target: 'player' | 'npc'; damage: number; hitsplat: number; source: string }
  | { type: 'player_attack'; npcId: number; accurate: boolean; damage: number; landTick: number }
  | { type: 'player_prayer'; prayer: string; on: boolean }
  | { type: 'player_consume'; itemId: number; kind: 'food' | 'potion'; healed: number }
  | { type: 'player_death' };

export type SimEvent = SimEventBody & { tick: number };

export class EventLog {
  private readonly byTick = new Map<number, SimEvent[]>();

  push(event: SimEvent): void {
    const list = this.byTick.get(event.tick);
    if (list) list.push(event);
    else this.byTick.set(event.tick, [event]);
  }

  at(tick: number): readonly SimEvent[] {
    return this.byTick.get(tick) ?? [];
  }

  all(): SimEvent[] {
    return [...this.byTick.keys()].sort((a, b) => a - b).flatMap((t) => this.byTick.get(t)!);
  }
}

export const HITSPLAT_BLOCK = 12;
export const HITSPLAT_DAMAGE = 16;
