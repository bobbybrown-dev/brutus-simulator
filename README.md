# Brutus simulator

Tick-deterministic simulation of Brutus (OSRS NPC 15626): a headless engine with a log-replay test
against the ten captured kills (875 ticks) in `data/` (Phase 4), and a Three.js browser client on
top of it (Phase 5 scaffold, placeholder models).

Everything for this project lives in this folder (`brutus simulator/`): code, tests, data, docs.

```
npm install
npm test                  # 61 tests: 10 kill replays + combat, arena, engine, pathing, collision, geometry, client
npm run typecheck
npm run check-collision   # validate the collision dumps against the capture (CLEAN / DIVERGES)
npm run dev               # browser client with hot reload (Vite prints the local URL)
npm run build             # type-check, then bundle the client into dist/
```

Requires Node 22+. The engine has no runtime dependencies; the client's only one is `three`.
`vite`, `tsx` and `typescript` are dev-only.

## Layout

```
src/sdk/                 Engine core. No rendering, no I/O, no wall clock. Browser-safe.
  World.ts               tickOnce(): scheduled events → NPCs → players. One call = one 600 ms tick.
  Mob.ts                 SW-anchored footprint, hit queue, naive chase step.
  Player.ts              BFS movement (walk/run), takeHit, pluggable PlayerController.
  Collision.ts           Multi-region collision map (world coords), OSRS bit flags, size-N step rules.
  combat/                Accuracy, max-hit and prayer formulas (osrs-dps-calc 74958b1); AttackSpec +
                         resolveAttack; PlayerLoadout. See docs/COMBAT_PLAN.md.
  Pathing.ts             naiveDestination / naiveStep (NPC), findPath (player BFS).
  Random.ts              RandomSource interface + SeededRandom. All RNG is tagged.
  Events.ts              SimEvent stream — the engine's only output.
  TickClock.ts           Real-time driver for hosts: fixed 600 ms step + alpha (0..1) for interpolation.
src/content/loadouts/    CaptureLoadout.ts — the player's recorded stats and gear.
src/content/brutus/      Boss content.
  Brutus.ts              State machine.
  BrutusGeometry.ts      Stomp tiles, charge direction and hit box (pure functions).
  BrutusConstants.ts     IDs, tick timings, config.
  BrutusEncounter.ts     Spawn, kill records, 40-tick respawn.
  BrutusArena.ts         Builds the CollisionMap from the four region dumps; closes the instance gates.
src/client/              Browser client (Phase 5). The only place that imports three or touches the DOM.
  GameSession.ts         Free-play fight: seeded world + player intents + stats. No DOM, runs in Node.
  arenaLayout.ts         Floor tiles, fences, gates, scenery and the region seam, derived from the CollisionMap.
  telegraphTiles.ts      Stomp danger tiles / charge lane for a pending special.
  view/                  Three.js: ArenaView, EntityView, TelegraphView, BrutusView, sprites, models.
  hud/Hud.ts             DOM side panel: start/reset, toggles, tick counter, damage and DPS.
  main.ts, style.css     Entry point: wires TickClock → session.tick() → view + HUD.
index.html, vite.config.ts   Client entry and bundler config (workspace root).
src/replay/              Log-replay harness (Timeline CSV parser, ReplayOracle, replayKill).
src/node/                Node-only file helpers.
test/                    node:test suites.
scripts/                 check-collision.ts, convert_collision_map.py (rebuilds the region dumps),
                         extract_timeline.py (RSProx transcript → per-tick timeline CSV).
data/                    brutus_tick_timeline.csv (K1–K5), brutus_tick_timeline_capture2.csv (K6–K10),
                         brutus_ids.json.
logs/                    RSProx transcripts (capture 2; capture 1 is in the claude.ai project).
docs/                    BOSS_SPEC.md (revision 4), COMBAT_PLAN.md.
region_12851 / 13107 / 12850 / 13106 _collision.json     Arena collision (workspace root).
```

## Browser client (Phase 5 scaffold)

`npm run dev` opens the fight in a browser; `npm run build` writes a static site to `dist/`
(`index.html` plus one JS and one CSS file, relative paths, so the folder can be dropped into any
directory of a website).

- **Decoupling.** `src/sdk`, `src/content` and `src/replay` never import `three`, the DOM or
  `src/client`; `test/client.test.ts` fails if they do. The client drives the engine through
  `GameSession.tick()` once per 600 ms (`TickClock`) and only reads state and the `SimEvent`
  stream. Rendering runs on `requestAnimationFrame` and interpolates between the last two ticks
  with `clock.alpha`; nothing in the simulation depends on frame rate.
- **Arena.** Floor, fences, the two closed gates and the solid scenery are drawn from the loaded
  `CollisionMap` (`arenaLayout.ts`), not from a hand-made map. "Debug overlay" shows the tile grid
  and the x = 3264 region seam.
- **Entities.** Player (1×1) and Brutus (3×3, SW-anchored) are placeholder primitives with a
  facing marker, HP bar, overhead text, a Protect from Melee icon and hitsplats (red = damage,
  blue = 0).
- **Telegraphs.** Stomp danger tiles in red and the charge lane in orange from the tick the
  special starts until it lands (T → T+4); the charge dash follows the `exact_move` event.
- **Controls.** Click the ground to walk, click Brutus to attack; drag to orbit, wheel to zoom.
  The HUD has start / reset, Protect from Melee, auto-retaliate, click-to-move, run and the debug
  overlay, plus tick, HP, damage dealt/taken, DPS and kills. `window.brutus` exposes
  `{ session, clock, view }` in the console.
- **Swapping in real models.** `view/models.ts` defines `ModelProvider`
  (`createPlayer()`, `createNpc(npcId, size)`) returning an `EntityModel` with
  `playSequence(seqId)`. `PlaceholderModelProvider` is the default. `GltfModelProvider` takes a
  manifest `{ npcs: { 15626: { url, scale, yaw, clips: { 13790: 'spawn', 13783: 'attack',
  13785: 'stomp', 13778: 'charge', 13784: 'death' } } } }` and maps engine sequence IDs to glTF
  clip names. It type-checks but has **not been run against a real RuneLite export yet** — expect
  to adjust scale, yaw and clip names with the first model.

Not in the scaffold: real models/animations/terrain (Phase 3 assets), sound, eating, the other
cows, and an inventory or prayer-point model (the prayer toggle never drains).

## What the replay test does

For each kill, per tick:

| Fed in from the log | Produced by the engine and asserted against the log |
|---|---|
| Player tile and Protect from Melee state | Boss SW tile |
| Damage the player dealt to the boss, and its landing tick | Animation (spawn / attack / stomp / charge / death) |
| Which special opened the fight (K1 charge, others stomp) | Overhead text, sounds, boss spotanim |
| Outcomes of random rolls (below) | Wind-up facing coordinate |
| | Stomp tile set, charge `exact_move` (from, to, delays, angle) |
| | Tick and hitsplat type of every hit on the player |
| | Boss HP after each hit, despawn tick, fight timer |

875 ticks, every field equal in both directions (the engine may not emit anything the log lacks).

**Random rolls.** The server's RNG state is not in the capture, so two things are read back
through `ReplayOracle`: whether a swing lands, damage values, and what the boss does when it is
standing on the player (17 occurrences: a step W/E/S/N, or no step). The engine still decides *when* to roll; a roll on a tick where the
log shows nothing fails the test.

## Adding a capture

```
python scripts/extract_timeline.py logs/<transcript>.txt data/brutus_tick_timeline_capture3.csv --first-kill 10
```

Add the CSV to `CAPTURE_TIMELINES` in `src/node/files.ts`, then `npm test`. Any mismatch lines name
the kill, tick and field, which is how the capture 2 rules below were found.

## What capture 2 changed (K6–K9)

The capture 1 engine diverged on three of the four new kills. Fixed rules, all in `Brutus.ts`:

- **Charge distance is not 4.** The SW tile is aimed 3 tiles past the player on the charge axis:
  4 tiles going west/south, 6 going north/east for an adjacent player. A fence stops it short
  (K8); it passes over scenery but will not stop on it (K9, 5 tiles).
- **Specials need melee range**, like a swing. Out of range, the special waits (K7: 6 ticks).
- **The boss can step and start a special on the same tick**; the facing coordinate then arrives
  one tick late.
- **The boss can step on the tick it dies**; if it does, the death animation is at D+3, not D+1.
- **First special is random** (stomp 6, charge 3 across nine kills). Default config is now `random`.
- **Under-player shuffle can be "no step"** (1 of 15).
- **Protect from Melee does not reduce stomp or charge damage** (K6). Special damage is 15–17.

## Combat

Boss → player and player → boss both go through `resolveAttack(attacker, defender, spec, random)`.

- **Swing:** crush, accuracy roll (1,344 vs. the player's crush defence roll), damage 0–3, negated
  by Protect from Melee (per the wiki; our data cannot confirm it).
- **Stomp, charge:** typeless, always land, 15–17, ignore prayers.
- **Player:** `new Player(tile, hp, CAPTURE_LOADOUT)`, then `player.attack(boss)`. Ranged shots land
  2–3 ticks later by distance; a landed 0 deals 1.

With the recorded gear the swing lands 5.1% of the time, which is why 83 of 84 recorded swings
show 0. A level-1 unarmoured player is hit 78.5% of the time.

The second full capture also showed that **stomps 2 and 3 wait for the player to be within reach**
(K10), chasing in the meantime, and that a player on the boss's exact centre tile gets a west stomp.

## Collision data

`region_12851_collision.json` and `region_13107_collision.json` hold OSRS collision bit flags for
plane 0, `tiles[localX][localY]`. They were built by `scripts/convert_collision_map.py` from the
cache-derived collision map that the RuneLite shortest-path plugin regenerates weekly
(github.com/Skretzo/shortest-path, commit 3e22de7, map dated 2026-10-29).

- 2,200 flagged tiles: 1,863 solid, the rest fence edges. The field is fenced at x = 3265/3266
  on the east; the arena crosses the region seam at x = 3264.
- The source stores edge passability, so diagonal-only pillar flags are not present.
- Both gates are passable in the cache. `INSTANCE_GATE_WALLS` shuts them for the fight, at the
  coordinates and orientations of the closed-gate objects seen in the capture.
- `dump_brutus_maps.py` in this folder is a stub: it never reads the cache and writes all-zero
  grids. Do not run it over the real files.

`npm run check-collision` prints CLEAN for these files: no solid tile was ever stood on in either
capture, and all 875 ticks replay 1:1 with no override. The step that needed the old inferred
override (K5 tick 1465) is now refused by a real solid at 3260,3294.

## Known gaps — read before trusting RL results

1. **Two constants come from the OSRS Wiki, not the captures:** Protect from Melee blocking the
   swing, and special damage 15–19 (the 14 recorded hits were all 15–17). Both are configurable
   (`stompDamage` / `chargeDamage`). **Documented but not implemented:** the cowbell-amulet
   13-tick respawn and the March 2026 one-tile anti-safespot stomp (BOSS_SPEC §10).
2. **Implemented by assumption** (each marked UNVERIFIED/INFERRED in code): charge direction on a
   tie; east charges; charge hurting the start footprint; under-boss stomp damage beyond the one
   recorded tile; 50/50 first special; uniform under-player shuffle; the D+3 death delay; the two
   collision rules of the charge (one sample each); a special falling due while the player is
   under the boss.
3. **Player combat is minimal.** Melee and ranged with the standard formulas; no magic, special
   attacks, gear set effects, prayer drain, line of sight, or walking toward the target.
4. **Other NPCs are not simulated.** Cows share the instance and would block the boss's path;
   none came near it in the capture.
