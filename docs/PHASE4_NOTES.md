# Phase 4 notes — Brutus headless engine and log replay

Date: 2026-11-15 (final constants). Workspace: `Desktop/brutus simulator/` (TypeScript, Node 22+). All project files live in that folder.

Commands: `npm test` (61 tests), `npm run check-collision` (validates the collision dumps against every capture), `npm run dev` / `npm run build` (Phase 5 browser client).

## Result

The headless engine reproduces all ten captured kills tick for tick: 875 ticks (capture 1: K1–K5, 416 ticks; capture 2: K6–K10, 459 ticks), on real collision data, with no collision override, and with the standard OSRS combat formulas in place. This still holds with the final constants below.

Asserted per tick: boss SW tile, animation, overhead text, sounds, wind-up facing coordinate, stomp tile set, charge `exact_move`, tick and hitsplat type of every hit on the player, boss HP, despawn tick, fight timer.

Inputs taken from the log: player tile and Protect from Melee state per tick, damage dealt to the boss and its landing tick, which special opened the fight, and random outcomes (whether a swing lands, damage values, what the boss does when standing on the player).

The mechanics are in `BOSS_SPEC.md` (revision 4); the combat design is in `COMBAT_PLAN.md`. This file records engine status and data provenance.

## Final constants (2026-11-15)

Two values are now fixed from the OSRS Wiki rather than from the captures. Neither changes the replay, which takes hit outcomes and damage from the recording.

| Constant | Value | Basis |
|---|---|---|
| Swing vs. Protect from Melee | Fully blocked (`prayerPenetration: 0`) | Wiki. The captures cannot show it: 15 prayed swings were all 0, but so were 68 of 69 unprayed ones. |
| Stomp and charge vs. Protect from Melee | Not reduced (`prayerPenetration: 1`, typeless) | Observed, 8 of 8 hits under the prayer in K6. |
| Stomp and charge damage | Uniform **15–19** (`stompDamage` / `chargeDamage` in `DEFAULT_BRUTUS_CONFIG`, configurable) | Wiki max hit 19. The 14 recorded hits were all 15–17. The seeded tests in `test/combat.test.ts` were changed to 15–19. |

## Documented, not implemented (future hooks)

Neither is in any capture, so there is nothing to verify an implementation against. Details in BOSS_SPEC §10.

- **Cowbell amulet respawn.** Ringing the amulet right after a kill makes the next Brutus appear after 13 ticks instead of 35. `BrutusTiming.RESPAWN_AFTER_COWBELL = 13` is defined and unused. The wiki notes that a late ring can lengthen the wait; the tick the 13 is counted from is not known.
- **Anti-safespot stomp** (game update of 4 March 2026). Brutus stomps if he is safespotted with the player one tile away. The engine has no such trigger: a special still needs an attack opportunity, so a blocked Brutus never starts one.

## Combat module

- `src/sdk/combat/`: `Stats`, `Formulas`, `Prayers`, `Loadout`, `Attack`. Formulas ported from weirdgloop/osrs-dps-calc commit 74958b1, integer-exact. Field names follow `osrs-sdk` (`UnitStats` / `UnitBonuses`).
- Brutus: Attack 12, Strength 25, Defence 10; swing = crush accuracy roll (1,344), max hit 3, blocked by Protect from Melee. Stomp and charge = typeless, always land, 15–19.
- Recorded player (`CAPTURE_LOADOUT`): Attack 82, Strength 80, Defence 80, Ranged 85, Magic 80, HP 85, Prayer 74; snakeskin bandana and boots, amulet of glory, black d'hide body/chaps/vambraces, magic shortbow on Rapid, rune arrows. Gear confirmed by the worn-inventory packet in capture 2. Crush defence +85 → defence roll 13,112 → swing lands 5.1%.
- Checks against the logs: 1 damaging swing in 69 unprayed (model expects ~2.7; P(≤1) = 0.26). All four max-hit hitsplats match the ranged max-hit formula (18 at Ranged 92–93, 16 at 85). Landed player hits that roll 0 deal 1 (12 ones among 78 landed hits).
- `Player.attack(target)` exists for RL use and the browser client (melee and ranged, no magic, no specials, no prayer drain, no line of sight). The player does not attack on a tick where it still has a path queued.

## Capture 2 (20261114T233858, K6–K10)

The first upload of this transcript was truncated at tick 500; the full file (2,784 ticks) completes K9 and adds K10. Rules found from capture 2, all in BOSS_SPEC:

- Charge destination: SW tile aimed 3 tiles past the player on the charge axis (4 tiles W/S, 6 tiles N/E for an adjacent player). Fence stops it (K8). Passes scenery but will not rest on it (K9).
- A special is an attack opportunity and needs melee range (K7 waited 6 ticks).
- Stomps 2 and 3 of a set also wait for the player to be adjacent or under the boss, chasing meanwhile, and do not step and stomp on the same tick (K10).
- A player on the exact centre tile gets a west stomp (K10, one sample).
- Boss can step and start the first special of a set on the same tick; facing coordinate then arrives one tick later.
- Boss can step on its death tick; death animation is then D+3 instead of D+1 (one sample).
- First special is random (stomp 7, charge 3).
- Under-player shuffle can result in no step (1 of 17).
- Protect from Melee does not reduce stomp or charge damage.
- Respawn is 35 ticks after the despawn (6/6).

## Collision

- **Source.** Four region files in the workspace root — `region_12851`, `region_13107`, `region_12850`, `region_13106` (`_collision.json`) — built by `scripts/convert_collision_map.py` from the cache-derived collision map published by the RuneLite shortest-path plugin (github.com/Skretzo/shortest-path, commit 3e22de7, map dated 2026-10-29). Plane 0, OSRS bit flags, `tiles[localX][localY]`.
- **Why four.** Every captured tick is inside 12851 and 13107. The fenced field continues south of y = 3264 into 12850 and 13106; with those unloaded the engine treated y < 3264 as solid, which put a wall across the field in free play. With all four the field is 743 tiles (x 3240–3265, y 3255–3298). The replay is unaffected.
- **Instance gates.** Both gates are passable in the cache; `INSTANCE_GATE_WALLS` closes them at the coordinates and orientations of the closed-gate objects in the capture.
- **Two solids inside the field are confirmed by boss behaviour:** 3260,3294 (refused north-west step, K5 1465) and 3257,3289 (refused south step in K7; charge overrun in K9).
- **Rejected dumps.** (1) 12851 with one non-zero tile. (2) 13 tiles of value 1 on x = 3259, contradicting the capture. (3) All-zero grids from `dump_brutus_maps.py`, a stub that never reads the cache.

## Engine changes made for Phase 5

Small, all covered by tests, none affecting the replay:

- `Brutus.telegraph` — read-only description of the pending special (stomp: marked and danger tiles; charge: start, target, direction; both with start and resolve ticks), so a renderer does not have to re-derive it from events.
- `TickClock` — takes a step callback, exposes `alpha` (0..1 progress through the current tick) for interpolation, `start()` / `stop()`.
- `Player.target` getter; no attack while a path is queued.

## Tooling

- `scripts/extract_timeline.py <log> <csv> --first-kill N` — RSProx transcript → per-tick timeline. Reproduces the capture 1 CSV exactly.
- New captures: extract, add the CSV to `CAPTURE_TIMELINES` in `src/node/files.ts`, run `npm test`.

## Open problems

1. Implemented by assumption: charge tie-break, east charges, charge hurting the start footprint, 50/50 first special, uniform under-player shuffle, a special falling due while the player is under the boss.
2. The two documented mechanics above have no capture and no implementation.
3. Other NPCs (cows) share the instance and are not simulated.

See BOSS_SPEC §7 for the test kills that would close these.
