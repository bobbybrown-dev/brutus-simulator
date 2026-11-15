# Combat module — accuracy, max hit and prayers

Date: 2026-11-15. Status: **implemented** in `src/sdk/combat/` (sections 1–5 are the design as built; section 8 lists what differs from the original proposal).

Replaces the placeholder damage ranges in `BrutusConstants.ts` with the standard OSRS formulas, for both directions (boss → player and player → boss).

## 1. Reference sources

| Source | Used for | Version |
|---|---|---|
| `weirdgloop/osrs-dps-calc` — `src/lib/NPCVsPlayerCalc.ts`, `PlayerVsNPCCalc.ts`, `BaseCalc.ts` | Formulas, integer rounding order | commit 74958b1 (2026-11-12) |
| `weirdgloop/osrs-dps-calc` — `cdn/json/monsters.json` | Brutus stat block | same commit |
| OSRS Wiki — Brutus, Protect from Melee, Protection prayers, Prayer penetration | Prayer behaviour, special damage range | fetched 2026-11-15 |
| `osrs-sdk` 0.1.6 (npm; the package InfernoTrainer depends on) | Interface shapes to stay compatible with | 0.1.6 |

## 2. Formulas

All integer; `trunc` is truncation toward zero. These are what the reference calculator does, line for line.

### 2.1 Hit chance (both directions)

```
if attackRoll > defenceRoll:  p = 1 − (defenceRoll + 2) / (2 · (attackRoll + 1))
else:                         p = attackRoll / (2 · (defenceRoll + 1))
```

This is the closed form of what the server does: roll `rand(0..attackRoll)` and `rand(0..defenceRoll)`; the attack lands if the first is greater. The engine should make the two rolls rather than compare a float to `p`, so results stay integer-exact.

### 2.2 NPC attacking a player

```
npcAttackRoll   = (npc.attackLevel + 9) · (npc.attackBonus + 64)
npcMaxHit       = trunc(((npc.strengthLevel + 9) · (npc.strengthBonus + 64) + 320) / 640)

effDefence      = trunc(player.defenceLevel(boosted) · prayerFactor) + stanceBonus + 8
                  stanceBonus: Defensive +3, Controlled +1, Longrange +3
playerDefRoll   = effDefence · (player.defenceBonus[npc.style] + 64)

damage on a hit = uniform integer 0..npcMaxHit   (a 0 shows as a block)
```

### 2.3 Player attacking an NPC

```
effAttack       = trunc(level(boosted) · prayerFactor) + stanceBonus + 8      (then void ×11/10 if worn)
                  melee:  Accurate +3, Controlled +1
                  ranged: Accurate +3
playerAttackRoll= effAttack · (attackBonus[style] + 64)

effStrength     = trunc(level(boosted) · prayerFactor) + stanceBonus + 8
                  melee:  Aggressive +3, Controlled +1      ranged: Accurate +3
playerMaxHit    = trunc((effStrength · (strengthBonus + 64) + 320) / 640)

npcDefenceRoll  = (npc.defenceLevel + 9) · (npc.defenceBonus[player.style] + 64)

damage on a hit = uniform integer 0..playerMaxHit
```

A landed player hit that rolls 0 deals 1. The reference code's general path does not show this, but our logs do: among 78 landed hits on Brutus the value 1 appears 12 times against about 4 for any other value. Implemented as `minimumOneOnHit` on the player's attack spec.

Out of scope for now: gear set effects, slayer/salve multipliers, special attacks, magic. The module leaves a hook for multipliers but ships none.

### 2.4 Protection prayers

- Against NPCs a protection prayer blocks **100%** of damage of its style unless the attack has prayer penetration. Accuracy is not involved: the attack is simply negated.
- "Typeless" = 100% prayer penetration. Partial penetration exists (0–100%).
- The prayer is read on the tick the damage is applied. For Brutus's swing that is the animation tick (T+0).

## 3. Brutus stat block

From `monsters.json`, id 15626 ("Post-quest"), matching the wiki infobox:

| Attack | Strength | Defence | Magic | Ranged | HP | Offensive bonuses | Defence bonuses | Style | Speed |
|---|---|---|---|---|---|---|---|---|---|
| 12 | 25 | 10 | 8 | 1 | 58 | all 0 | stab/slash/crush −7, magic −3, ranged −7 | Crush | 5 |

Derived:

| Quantity | Calculation | Value |
|---|---|---|
| Melee attack roll | (12 + 9) · (0 + 64) | **1,344** |
| Melee max hit | trunc((34 · 64 + 320) / 640) | **3** (wiki: 3) |
| Defence roll vs. any melee/ranged style | (10 + 9) · (−7 + 64) | **1,083** |
| Defence roll vs. magic | (8 + 9) · (−3 + 64) — NPCs defend magic with their Magic level | 1,037 |

Chance for a swing to land, by player defence roll:

| Player | Defence roll | Hit chance | Chance of a non-zero hit (×3/4) |
|---|---|---|---|
| Defence 1, no armour | 9 · 64 = 576 | 78.5% | 58.9% |
| Defence 40, no armour | 48 · 64 = 3,072 | 21.9% | 16.4% |
| Defence 70, +229 crush | 78 · 293 = 22,854 | 2.9% | 2.2% |
| Defence 99, +232 crush | 107 · 296 = 31,672 | 2.1% | 1.6% |
| **The recorded player:** Defence 80, +85 crush (black d'hide) | 88 · 149 = **13,112** | **5.1%** | **3.8%** |

**Check against our captures:** 1 damaging hit in 69 unprayed swings. With the actual loadout the model expects about 2.7; seeing 1 or fewer has probability 0.26, so the data is consistent with it but does not pin the hit rate down. The single damaging hit was a 2, inside 0–3.

**Player side check:** all four max-hit hitsplats (type 43) equal the formula's max hit for the Ranged level at the time (18 at 92–93 with a ranging potion, 16 at 85). Accuracy 97.2% predicted; 4 misses in 82 shots recorded.

### Specials

| Attack | Accuracy | Damage | Prayer |
|---|---|---|---|
| Stomp | Always lands if the player is on a danger tile | Uniform **15–17** (our 9 hits) | Not reduced (6 hits under Protect from Melee) |
| Charge | Always lands if the player is in the lane | Uniform **15–17** (our 5 hits) | Not reduced (2 hits under Protect from Melee) |

Discrepancy to keep visible: the wiki gives **15–19** for both. In 14 recorded hits we never saw 18 or 19; if the roll were uniform 15–19 that would happen about 1 time in 1,300. The range will be a config value, default 15–17, with the wiki range one line away.

Two things in the reference data we have not observed:
- A third variant, id 15627 "Charging" (Attack 15, Strength 30, HP 60). No transformation appears in any of our nine kills.
- The wiki says the quest version cannot kill the player with its standard attack. Not modelled.

## 4. What exists today

- **`brutus simulator/`:** no combat maths. Damage is `min + rng.int(max − min + 1)` from `DEFAULT_BRUTUS_CONFIG`; there is no accuracy roll, no stats, no bonuses, no prayers. `Player` has hitpoints and movement only. Damage to the boss is injected with `boss.queueHit`.
- **Dependencies:** `typescript`, `tsx`, `@types/node` only. The workspace is not built on the published `osrs-sdk` package; it is a headless engine written in the same layout.
- **Upstream `osrs-sdk` 0.1.6** does have this: `Weapon._attackRoll / _defenceRoll / _maxHit / _hitChance / isBlockable`, `UnitStats`, `UnitBonuses`, and prayer classes. It is not usable headless as-is: `Unit` extends `Renderable` and `Weapon` and `Unit` hold `HTMLImageElement` fields. Recommendation: do not depend on it; mirror its `UnitStats` / `UnitBonuses` field names so Brutus can be ported into the fork later without renaming.

## 5. Proposed module

Lives under `src/sdk/combat/` (the workspace's engine folder is `src/sdk`, not `src/engine`). Pure functions, no I/O, no rendering, all RNG through `RandomSource`.

```
src/sdk/combat/
  Stats.ts        CombatStats { attack, strength, defence, range, magic, hitpoint, prayer }
                  CombatBonuses { attack{stab,slash,crush,magic,range}, defence{…}, other{meleeStrength,rangedStrength,magicDamage,prayer} }
                  (same names as osrs-sdk UnitStats / UnitBonuses)
  Formulas.ts     effectiveLevel, npcAttackRoll, npcMaxHit, npcDefenceRoll,
                  playerAttackRoll, playerDefenceRoll, playerMaxHit, hitChance      ← §2, integer-exact
  Prayers.ts      Prayer table: overhead protections + stat boosts as [numerator, denominator] factors
  Attack.ts       AttackSpec + resolveAttack(attacker, defender, spec, rng) → { accurate, blocked, damage }
  Loadout.ts      PlayerLoadout { stats, boosts, bonuses, attackStyle, stance, weaponSpeed, prayers }
```

`AttackSpec` is the one new concept. It separates *what kind of attack this is* from the formulas:

```ts
interface AttackSpec {
  style: 'stab' | 'slash' | 'crush' | 'ranged' | 'magic' | 'typeless';
  accuracy: 'roll' | 'always';                      // 'always' skips the attack/defence rolls
  damage: { kind: 'maxHit' } | { kind: 'range'; min: number; max: number };
  prayerPenetration: number;                        // 0 = fully blocked by the matching overhead, 1 = typeless
}
```

Brutus then declares three specs and nothing else:

| Attack | style | accuracy | damage | prayerPenetration |
|---|---|---|---|---|
| Swing | crush | roll | maxHit (3) | 0 — per the wiki; **not yet confirmed by our data** |
| Stomp | typeless | always | range 15–17 | 1 |
| Charge | typeless | always | range 15–17 | 1 |

### Changes to existing files

- `Player.ts`: gains a `loadout` and an `activePrayers` set; `takeHit` is unchanged (resolution happens before it).
- `Mob.ts`: gains `stats` and `bonuses`.
- `Brutus.ts`: `swing`, `resolveStomp`, `resolveCharge` call `resolveAttack` with their spec instead of `roll(range)`.
- `BrutusConstants.ts`: `BRUTUS_STATS`, `BRUTUS_BONUSES`, the three specs; the `meleeDamage` placeholder is deleted.
- New `Player.attack(target)` for RL use: weapon speed, ranged hit delay `1 + floor((3 + distance) / 6)`, which matches the 2- and 3-tick hitsplat delays in BOSS_SPEC §8. `queueHit` stays for the replay.

### Random rolls and the replay

A swing will now consume three tagged rolls (attack roll, defence roll, damage) instead of one. The log only shows the result, and a miss and a landed 0 look identical (both are a block hitsplat). `ReplayOracle` will answer consistently with the recording: recorded damage > 0 → attack roll wins and damage = recorded value; recorded 0 → attack roll loses. The 797-tick replay must stay green with no other change.

### Tests

1. Golden values: Brutus 1,344 / 3 / 1,083, and the four hit chances in §3, against numbers computed by the reference calculator.
2. Rounding order: cases where `trunc` placement matters (prayer factor before the +8, void after).
3. Seeded distribution: 100,000 swings at a known defence roll land within tolerance of the closed-form chance; damage is uniform 0–3.
4. Prayer: Protect from Melee zeroes the swing and leaves stomp and charge untouched.
5. Replay: all nine kills still 1:1.

## 6. Open items

1. **Your Defence level and worn gear in the captures.** With them, the accuracy model can be checked against 63 swings instead of merely being consistent with them.
2. **Does Protect from Melee block the swing?** The wiki says yes. Our K6 data cannot tell (zeros with or without it). One kill with no armour, alternating the prayer, settles it.
3. **Special damage 15–17 vs. the wiki's 15–19.** More tanked specials, ideally on a different account, to see whether 18–19 ever appear or the range scales with something.
4. **Id 15627 "Charging".** If a capture ever shows a transformation, the charge may use that stat block.

## 7. Order of work

1. `Stats.ts`, `Formulas.ts` + golden tests (no behaviour change).
2. `Prayers.ts`, `Attack.ts`, wire Brutus's three specs, update `ReplayOracle`; replay green.
3. `Loadout.ts`, `Player.attack`, seeded-distribution tests.
4. Fold open items 1–3 into config once the data exists.

## 8. As built

- Files: `src/sdk/combat/{Stats,Formulas,Prayers,Loadout,Attack}.ts`, `src/content/loadouts/CaptureLoadout.ts`, tests in `test/combat.test.ts`.
- Brutus's specs live in `BrutusConstants.ts` (`BRUTUS_SWING`, `brutusStompSpec`, `brutusChargeSpec`); `Brutus.ts` calls `resolveAttack` for all three.
- `Player` has `loadout`, `prayers`, `asDefender()` and `attack(target)`. The default loadout is a level-1 character with nothing equipped, so pass one explicitly.
- `ReplayOracle` answers the swing's attack and defence rolls from the recorded outcome; the replay also feeds the recorded Protect from Melee state each tick. All ten kills (875 ticks) still replay 1:1.
- Not built: magic attacks, gear set effects, special attacks, prayer drain, the player walking toward its target, line of sight.
- Open item 1 (loadout) is closed. Items 2–4 stand.
- Sections 4–7 describe the workspace and plan as they were before implementation and are kept for the record.
