/** What using an item does. Items with no effect can be carried but not used. */
export type ItemEffect =
  | { kind: 'food'; heal: number }
  | {
      kind: 'potion';
      /** Item left in the slot after a dose (the next dose, or an empty vial). */
      becomes: number;
      /** Temporary level boost, from the base level. Does not stack; a new dose refreshes it. */
      boost?: { stat: BoostableStat; amount: (baseLevel: number) => number };
      /** Prayer points restored, from the base Prayer level. */
      restorePrayer?: (prayerLevel: number) => number;
    };

export type BoostableStat = 'attack' | 'strength' | 'defence' | 'range' | 'magic';

export interface ItemDefinition {
  id: number;
  name: string;
  effect?: ItemEffect;
}

export const INVENTORY_SIZE = 28;

/** A 28-slot inventory of item IDs. Knows nothing about what the items do. */
export class Inventory {
  readonly slots: Array<number | null>;

  constructor(items: ReadonlyArray<number | null> = []) {
    if (items.length > INVENTORY_SIZE) throw new Error(`an inventory holds ${INVENTORY_SIZE} items, got ${items.length}`);
    this.slots = Array.from({ length: INVENTORY_SIZE }, (_, i) => items[i] ?? null);
  }

  get(slot: number): number | null {
    return this.slots[slot] ?? null;
  }

  set(slot: number, itemId: number | null): void {
    if (slot < 0 || slot >= INVENTORY_SIZE) throw new Error(`no inventory slot ${slot}`);
    this.slots[slot] = itemId;
  }

  count(itemId: number): number {
    return this.slots.filter((id) => id === itemId).length;
  }
}
