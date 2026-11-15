# Cache assets — pipeline notes

Date: 2026-11-15. Tested against the RuneLite live cache of that day (rev 242), which contains Brutus.

## How it is organised

Modelled on osrs-sdk's `osrs-sdk-assets` tool (branch `release/0.1.8`) and InfernoTrainer's `assets.md`:
requirements in a browser-safe module, a Node-only extractor, a generated git-ignored bundle with a
manifest, and a build that fails on anything missing. The extractor is our own, because our client
does not use the SDK's renderer and bundle format.

I could not find a repository called `ocellus-sim`; the structure here is taken from the two
projects above, which are what the SDK's own documentation points clients at.

| Piece | File | Runs in |
|---|---|---|
| What is needed, by cache ID | `src/assets.ts` (`BRUTUS_ASSETS`) | browser + Node |
| Manifest types and the pure checker | `src/assetBundle/manifest.ts` | browser + Node |
| Build gate | `src/assetBundle/check.ts` (`npm run assets:check`, part of `npm run build`) | Node |
| Cache source and output folder | `osrs-assets.config.ts` | Node |
| Extraction | `scripts/assets/*.ts` (`npm run assets`) | Node |
| Runtime loader | `src/client/assets/AssetBundle.ts` | browser |

To add an asset: add its ID to `src/assets.ts`, run `npm run assets`. A missing definition fails
with the ID; the client picks new entries up from the manifest.

## Cache reader

`scripts/assets/reader.ts` fetches github.com/Dezinater/osrscachereader at commit `8dbb297` into
`.cache-render/osrscachereader` (git, falling back to a source zip), installs its dependencies and
applies four exact-text patches. Each patch is asserted: if the pinned source changes, setup fails
instead of guessing.

| Patch | Why |
|---|---|
| `IndexType.js`: remove a duplicated import | Syntax error in Node at this commit |
| `NpcLoader.js`: store opcode 97 on the definition | Width scale was lost; Brutus is 170/128 in both width and height |
| `ItemLoader.js` (two lines): `stream` → `dataview` | An undefined variable aborted loading every item |

Other readers tried: the npm release 1.1.3 cannot parse current NPC definitions; the fork osrs-sdk
recommends (Supalosa, `feat/reader-only-entrypoint`) has a typo that fails on Brutus's definition.
Set `OSRS_CACHE_READER_PATH` to use a different checkout.

## What is extracted, and how faithfully

| Asset | Method | Fidelity |
|---|---|---|
| NPC and player models | Reader's model decoder and glTF exporter; recolours applied; one clip per sequence ID as morph targets, STEP interpolation | Geometry, colours and frame timing are the cache's. Smooth normals are computed in the client from the rest pose. Textured faces (none on Brutus) would lose their texture. |
| Player | Base kits 0, 10, 18, 26, 33, 36, 42, hidden where a worn item covers them, plus the worn items' male models | Default skin, hair and clothing colours. |
| Terrain | Reader's terrain decoder; the client's underlay blend (±5 tile box blur of pre-multiplied hue) reimplemented | Heights and blended colours follow the client. Ground lighting is a constant instead of per-vertex slope lighting. Overlay tiles are drawn as whole tiles; the partial-tile shapes are in the data but not rendered. |
| Ground textures | Texture definition → sprite | As in the cache; not animated. |
| Item icons | Port of RuneLite's `ItemSpriteFactory`, `Model.draw` and the Gouraud/flat fill of `Graphics3D` (BSD notice kept in `scripts/assets/itemIcons.ts`): integer screen coordinates, 14-bit fixed-point edges, a per-pixel colour plane, depth buckets with the client's priority interleaving, alpha blending, outline and shadow | The 36×32 icon follows the client's algorithm step for step; it has not been compared pixel by pixel with RuneLite's output. Textured faces use their base colour. The `@4x` icon is the same model projected onto 144×128 with outline and shadow thickened to match — new detail from the model, for frames drawn larger than native. |
| Sprites | Reader's sprite decoder, written on the group's full canvas. Includes the fixed-mode frame: chat background 1017, bottom strip 1018, minimap pieces 1037, 1038, 1182, 1611, top edge 1039, side panel 1031–1036 | As in the cache. These are 2D pixel art with no larger source, so they are exact only when the frame is at a whole multiple of its native size. |
| Sounds | Reader's synthesiser, 22,050 Hz 8-bit mono WAV | As synthesised by the reader; not compared with the game by ear. |

Not extracted: **scene objects** (the fences, gates, sign and plants). The reader's object loader
fails on a newer object in this cache. Fences and solid scenery are still drawn from the collision
map as boxes.

## Cache format findings (rev 242)

- Map data is no longer looked up by name (`m50_51`, `l50_51`). Index 5 has one group per region
  ID (12851, …) with numbered files; file 0 is the terrain, file 1 the object placements.
- Both files decoded without XTEA keys in this cache: region 12851 gave 2,359 object placements.
  That makes a local cache sufficient for terrain, and for scene objects once the object loader is fixed.
- Brutus (NPC 15626): model 60113, size 3, idle 13781, walk 13782, stats [12, 10, 25, 58, 1, 8],
  matching BOSS_SPEC §3. His five combat sequences are frame-based, not skeletal.
- A cache folder from 4 Feb 2026 predates Brutus (released 25 Feb 2026); extraction from it would
  fail on NPC 15626, which is what the missing-ID error is for.

## Not verified

- **Windows.** Everything was run on Linux against a copy of the Windows cache. Paths, `git` and
  `npm` invocation were written with Windows in mind but not executed there.
- **OpenRS2 download** (`--openrs2 <id>`) and the **zip fallback** for the reader: the sandbox could
  not reach archive.openrs2.org or codeload.github.com, so neither code path has run.
- A live cache only holds what the game has loaded. Everything listed in `src/assets.ts` was
  present; an ID added later may not be until it has been seen in game.

## Interface values

The prayer book (levels, drain effects, drain resistance 60 + 2 × prayer bonus), food and potion
effects, and the 3-tick eat and drink delays are standard OSRS values from the wiki and general
knowledge. None of them appears in the captures, and the log replay does not use them.

All RuneScape assets are property of Jagex.
