import { BrutusRandomTag, OVERLAP_STEP_DIRECTIONS } from '../content/brutus/BrutusConstants.ts';
import type { RandomSource } from '../sdk/Random.ts';
import type { RecordedHit, TimelineRow } from './Timeline.ts';

/**
 * A `RandomSource` that answers the engine's random decisions from a recording.
 *
 * The capture cannot tell us the server's RNG state, so the genuinely random things in the fight —
 * whether a swing lands, damage values, and which way the boss shuffles when it is standing on the
 * player — are read back from the log. Everything else (when a roll is requested, and for what) is still the
 * engine's own decision: a request on a tick where the log has nothing to offer is a violation.
 */
export class ReplayOracle implements RandomSource {
  readonly violations: string[] = [];
  /** Every answer given, by tag, for reporting what the recording contained. */
  readonly served = new Map<string, number[]>();
  private readonly rows = new Map<number, TimelineRow>();
  private readonly damageServed = new Map<number, number>();

  constructor(
    rows: readonly TimelineRow[],
    private readonly currentTick: () => number,
  ) {
    for (const r of rows) this.rows.set(r.tick, r);
  }

  int(maxExclusive: number, tag: string): number {
    const value = this.answer(maxExclusive, tag);
    const list = this.served.get(tag);
    if (list) list.push(value);
    else this.served.set(tag, [value]);
    return value;
  }

  private nextHit(t: number, row: TimelineRow | undefined, tag: string): RecordedHit | undefined {
    const hit = row?.hitsOnPlayer[this.damageServed.get(t) ?? 0];
    if (!hit) this.violations.push(`tick ${t}: engine rolled ${tag} but the log has no hit on the player`);
    return hit;
  }

  private consumeHit(t: number): void {
    this.damageServed.set(t, (this.damageServed.get(t) ?? 0) + 1);
  }

  private answer(maxExclusive: number, tag: string): number {
    const t = this.currentTick();
    const row = this.rows.get(t);
    switch (tag) {
      // A swing asks for an attack roll, a defence roll and, if it lands, a damage roll. The log
      // shows only the outcome, and a miss looks the same as a landed 0. Recorded damage > 0 is
      // replayed as a winning attack roll with that damage; a recorded 0 as a losing attack roll.
      case BrutusRandomTag.SWING_ATTACK_ROLL: {
        const hit = this.nextHit(t, row, tag);
        return hit && hit.damage > 0 ? maxExclusive - 1 : 0;
      }
      case BrutusRandomTag.SWING_DEFENCE_ROLL: {
        const hit = this.nextHit(t, row, tag);
        if (!hit) return maxExclusive - 1;
        if (hit.damage > 0) return 0;
        this.consumeHit(t);
        return maxExclusive - 1;
      }
      case BrutusRandomTag.SWING_DAMAGE:
      case BrutusRandomTag.STOMP_DAMAGE:
      case BrutusRandomTag.CHARGE_DAMAGE: {
        const hit = this.nextHit(t, row, tag);
        if (!hit) return 0;
        this.consumeHit(t);
        return hit.damage;
      }
      case BrutusRandomTag.OVERLAP_STEP: {
        const prev = this.rows.get(t - 1);
        if (!row || !prev) {
          this.violations.push(`tick ${t}: engine rolled ${tag} outside the recording`);
          return 0;
        }
        const dx = row.bossSw.x - prev.bossSw.x;
        const dy = row.bossSw.y - prev.bossSw.y;
        const index = OVERLAP_STEP_DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
        if (index < 0) {
          this.violations.push(`tick ${t}: engine rolled ${tag} but the logged boss step was (${dx}, ${dy})`);
          return 0;
        }
        return index;
      }
      default:
        this.violations.push(`tick ${t}: no recording for random tag ${tag}`);
        return 0;
    }
  }
}
