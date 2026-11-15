# Brutus simulator

Tick-deterministic simulation of Brutus (OSRS NPC 15626): a headless engine with a log-replay test
against the ten captured kills (875 ticks) in `data/` (Phase 4), and a Three.js browser client on
top of it (Phase 5) that uses models, animations, terrain, icons and interface sprites extracted
from your own OSRS cache.

Everything for this project lives in this folder (`brutus simulator/`): code, tests, data, docs.

```
npm install
npm test                  # 79 tests: 10 kill replays, combat, arena, engine, geometry, client, assets, interface
npm run typecheck
npm run check-collision   # validate the collision dumps against the capture (CLEAN / DIVERGES)
npm run assets            # extract cache assets into public/osrs-assets/ (see "Cache assets")
npm run assets:check      # verify the bundle against src/assets.ts
npm run dev               # browser client with hot reload (Vite prints the local URL)
npm run build             # type-check, check the asset bundle, then bundle the client into dist/
npm run build:placeholders  # build without cache assets (boxes and a flat field)
```

Requires Node 22+. The engine has no runtime dependencies; the client's only one is `three`.
`vite`, `tsx`, `typescript` and `fflate` are dev-only. `npm run assets` also needs `git` (or access
to codeload.github.com) the first time, to fetch the cache reader.

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
src/assets.ts            Every cache ID the simulator uses (NPC, sequences, items, sprites, sounds, terrain box).
src/assetBundle/         manifest.ts (manifest types + pure checker), check.ts (build gate), requirementsHash.ts.
scripts/assets/          The extraction pipeline (Node-only): reader setup, models, terrain, item icons, sprites, sounds.
osrs-assets.config.ts    Cache source and output folder for `npm run assets`.
public/osrs-assets/      Generated bundle. Git-ignored; Jagex assets are never committed.
src/client/              Browser client (Phase 5). The only place that imports three or touches the DOM.
  GameSession.ts         Free-play fight: seeded world + player intents + stats. No DOM, runs in Node.
  arenaLayout.ts         Floor tiles, fences, gates, scenery and the region seam, derived from the CollisionMap.
  telegraphTiles.ts      Stomp danger tiles / charge lane for a pending special.
  view/                  Three.js: ArenaView, EntityView, TelegraphView, BrutusView, sprites, models.
  assets/AssetBundle.ts  Loads osrs-assets/manifest.json at runtime; null when no bundle is deployed.
  hud/GameFrame.ts       The fixed-mode game frame: viewport, minimap, chatbox, side panel and tabs. Intents only.
  hud/Hud.ts             Simulator controls and fight statistics, shown in the chatbox.
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
docs/                    BOSS_SPEC.md (revision 4), COMBAT_PLAN.md, PHASE4_NOTES.md, ASSETS.md.
region_12851 / 13107 / 12850 / 13106 _collision.json     Arena collision (workspace root).
```

## Browser client (Phase 5)

`npm run dev` opens the fight in a browser, inside the classic fixed-mode game frame: a 765×503
layout with the 512×334 game viewport, the minimap surround and orbs, the chatbox and the side
panel, scaled as one block to fit the window. With a bundle in `public/osrs-assets/` it shows the
real Brutus and player models with their animations, the cow field's terrain and the game's own
frame art. Without one the same layout is drawn in flat colours with boxes on a flat field.

- **Frame.** `hud/GameFrame.ts` lays everything out in native pixels and scales the block
  (`fit()`); the 3D view renders at the scaled resolution, so it stays sharp. The simulator's own
  controls and statistics sit in the chatbox. "Pixel-perfect scaling" snaps to whole multiples of
  765×503: cache sprites are pixel art and are only exact at whole multiples, so in between they
  are smoothed. Item icons do not have that limit: each is also rendered at 4× from its 3D model
  and the frame uses that version whenever it is not at native size.

- **Decoupling.** `src/sdk`, `src/content` and `src/replay` never import `three`, the DOM or
  `src/client`. The side panel (`hud/GameFrame.ts`) renders a snapshot and emits intents
  (`togglePrayer`, `useItem`, `setStance`, …); prayer drain, eating, potions and stances are all
  engine code (`src/sdk/Player.ts`, `combat/PrayerBook.ts`, `Inventory.ts`) covered by Node tests.
  Tests fail if either boundary is crossed.
- **Controls.** Click the ground to walk, click Brutus to attack; drag to orbit, wheel to zoom.
  F1–F7 switch tabs (`DEFAULT_TAB_KEYS`), Esc opens the inventory, the prayer orb toggles Protect
  from Melee. Click food or a potion to use it.
- **Interface.** Prayer book (29 prayers, level and unlock checks, conflicts, live drain),
  inventory (food and potion doses), worn equipment with bonuses, combat styles and auto-retaliate.
  Skills shows live levels; the quest, magic and bottom-row tabs are placeholders.
- **Telegraphs and debug overlay** as before: red stomp tiles, orange charge lane, optional tile
  grid and x = 3264 region seam.

## Cache assets

```
npm run assets                                  # RuneLite's live cache (default)
npm run assets -- --cache-dir "D:\some\cache"   # any folder with main_file_cache.dat2 + .idx files
npm run assets -- --openrs2 <id>                # a pinned archive from archive.openrs2.org
```

The layout follows osrs-sdk's asset tooling (`osrs-sdk-assets`): a browser-safe requirements
module (`src/assets.ts`), a Node-only build configured by `osrs-assets.config.ts`, a generated and
git-ignored `public/osrs-assets/` with a `manifest.json`, and a check that fails the build.
Details, limits and the cache-format notes are in `docs/ASSETS.md`.

What it writes (about 4 MB, 150 files):

| Folder | Contents |
|---|---|
| `models/` | `npc-15626.gltf` (Brutus) and `player.gltf` (base body + the captured gear). One animation clip per sequence ID, baked as morph targets. |
| `terrain/` | `arena.json`: heights, blended underlay colours and overlays for the field and its surroundings. |
| `textures/` | Ground textures the terrain uses (water, in this area). |
| `item-icons/` | Inventory icons rendered from the item models: the game's 36×32 sprite (`<id>.png`) and a 144×128 render (`<id>@4x.png`). |
| `sprites/` | Prayer icons, overhead icons, the fixed-mode frame (chatbox, minimap surround, side panel), tab and equipment-slot icons. |
| `sounds/` | Brutus's three sound effects as WAV. |

`osrs-assets-prebuilt.zip` (git-ignored) is the bundle built from your RuneLite cache on 2026-11-15.
If `npm run assets` cannot run on your machine, unzip it into `public/` so that
`public/osrs-assets/manifest.json` exists.

**Build errors.** `npm run assets` fails, listing every ID it could not extract, and leaves the
previous bundle untouched. `npm run build` runs `assets:check` first and stops if the bundle is
missing, stale (requirements changed since it was built), incomplete, or a file was altered.

**Publishing.** `npm run build` copies the bundle into `dist/osrs-assets/`. Those files are Jagex's
property; whether to host them on a public site is your decision. `npm run build:placeholders`
gives a build with none of them. A CI build (GitHub Pages, Vercel) has no cache, so either run
`npm run assets -- --openrs2 <id>` in CI or build locally and deploy `dist/`.

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
   attacks, gear set effects, line of sight, or walking toward the target. Prayer drain, eating,
   potions and stance switching exist for free play and use standard OSRS values, not captured
   ones; the log replay does not use them.
4. **Other NPCs are not simulated.** Cows share the instance and would block the boss's path;
   none came near it in the capture.
