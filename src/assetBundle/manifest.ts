/**
 * Cache-asset requirements and the manifest the build writes. Browser-safe and Node-free:
 * the client reads the manifest with these types, and the checker below is a pure function.
 */

export interface CacheAssets {
  /** NPC models, baked with the listed sequences plus the definition's idle and walk. */
  npcs: Record<string, { id: number; animations: Record<string, number> }>;
  /** One player model: base body kits, hidden where worn items cover them, plus the worn items. */
  player: { kits: readonly number[]; worn: Record<string, number>; animations: Record<string, number> };
  /** Ground tiles (heights, blended underlay colours, overlays) for a world-coordinate box. */
  terrain: Record<string, { regions: readonly number[]; bounds: { minX: number; maxX: number; minY: number; maxY: number } }>;
  /** Inventory icons, rendered from each item's inventory model. */
  items: Record<string, number>;
  /** 2D sprites by sprite-group ID and frame. */
  sprites: Record<string, { id: number; frame?: number }>;
  /** Synthesised sound effects. */
  sounds: Record<string, number>;
}

export interface AssetFile {
  /** Path relative to the manifest. */
  file: string;
  bytes: number;
  sha256: string;
}

export interface ClipInfo {
  frames: number;
  seconds: number;
}

export interface NpcAsset extends AssetFile {
  name: string;
  size: number;
  widthScale: number;
  heightScale: number;
  idleSequence: number;
  walkSequence: number;
  clips: Record<string, ClipInfo>;
}

/** Contents of a terrain file. */
export interface TerrainData {
  origin: { x: number; y: number };
  /** Size in tiles. Vertex arrays are (width + 1) × (height + 1), indexed x + y × (width + 1). */
  width: number;
  height: number;
  /** Ground height at each tile corner, in tiles (cache units / 128), up positive. */
  heights: number[];
  /** Blended underlay colour (0xRRGGBB) at each tile corner; -1 where the map has no underlay. */
  underlay: number[];
  /** Per tile, indexed x + y × width: overlay colour or -1, texture ID or -1, shape 0–11, rotation 0–3. */
  overlay: number[];
  overlayTexture: number[];
  overlayShape: number[];
  overlayRotation: number[];
}

export const MANIFEST_SCHEMA = 2;

export interface AssetManifest {
  schema: number;
  builtAt: string;
  /** Hash of the requirements the bundle was built for; a mismatch means the bundle is stale. */
  requirementsHash: string;
  cache: { source: string; fingerprint: string };
  reader: { repo: string; commit: string };
  npcs: Record<string, NpcAsset>;
  player: (AssetFile & { clips: Record<string, ClipInfo>; worn: Record<string, string> }) | null;
  terrain: Record<string, AssetFile>;
  /** Ground textures used by the terrain files, by texture ID. */
  textures: Record<string, AssetFile>;
  /** Inventory icons: the game's 36×32 sprite, and the same render at a larger size for scaled-up interfaces. */
  items: Record<string, AssetFile & { name: string; hires: AssetFile }>;
  sprites: Record<string, AssetFile & { width: number; height: number }>;
  sounds: Record<string, AssetFile & { seconds: number }>;
}

export const spriteKey = (sprite: { id: number; frame?: number }): string => `${sprite.id}:${sprite.frame ?? 0}`;

export interface BundleProblem {
  /** What is wrong, naming the cache ID. */
  message: string;
  /** What to do about it. */
  fix: string;
}

const REBUILD = 'Run `npm run assets`.';

/**
 * Compare a bundle with what the application needs. `statFile` returns the size and hash of a
 * file in the bundle, or null when it does not exist. Returns every problem found, not just the first.
 */
export function checkBundle(
  requirements: CacheAssets,
  requirementsHash: string,
  manifest: AssetManifest | null,
  statFile: (file: string) => { bytes: number; sha256: string } | null,
): BundleProblem[] {
  if (!manifest) return [{ message: 'No asset bundle found (osrs-assets/manifest.json is missing).', fix: REBUILD }];
  if (manifest.schema !== MANIFEST_SCHEMA)
    return [{ message: `Asset manifest has schema ${manifest.schema}; this build reads schema ${MANIFEST_SCHEMA}.`, fix: REBUILD }];

  const problems: BundleProblem[] = [];
  const stale = manifest.requirementsHash !== requirementsHash;
  const missing = (what: string): void => {
    problems.push({
      message: `${what} is required but not in the bundle.`,
      fix: stale ? REBUILD : `${REBUILD} If it fails, the ID is not in the cache the bundle is built from.`,
    });
  };
  const verify = (what: string, asset: AssetFile | null | undefined): boolean => {
    if (!asset) {
      missing(what);
      return false;
    }
    const actual = statFile(asset.file);
    if (!actual) problems.push({ message: `${what}: file ${asset.file} is listed in the manifest but missing on disk.`, fix: REBUILD });
    else if (actual.bytes !== asset.bytes || actual.sha256 !== asset.sha256)
      problems.push({ message: `${what}: file ${asset.file} does not match the manifest (changed or truncated).`, fix: REBUILD });
    return true;
  };

  for (const [name, npc] of Object.entries(requirements.npcs)) {
    const asset = manifest.npcs[String(npc.id)];
    if (!verify(`NPC model ${npc.id} (${name})`, asset)) continue;
    for (const [animation, seq] of Object.entries(npc.animations))
      if (!asset!.clips[String(seq)]) missing(`Animation sequence ${seq} (${name}.${animation})`);
  }

  if (verify('Player model', manifest.player)) {
    for (const [animation, seq] of Object.entries(requirements.player.animations))
      if (!manifest.player!.clips[String(seq)]) missing(`Animation sequence ${seq} (player.${animation})`);
    for (const [slot, item] of Object.entries(requirements.player.worn))
      if (!(String(item) in manifest.player!.worn)) missing(`Worn item ${item} (player ${slot})`);
  }

  for (const name of Object.keys(requirements.terrain)) verify(`Terrain "${name}"`, manifest.terrain[name]);
  for (const [id, texture] of Object.entries(manifest.textures ?? {})) verify(`Ground texture ${id}`, texture);
  for (const [name, id] of Object.entries(requirements.items))
    if (verify(`Item icon ${id} (${name})`, manifest.items[String(id)])) verify(`Large item icon ${id} (${name})`, manifest.items[String(id)]!.hires);
  for (const [name, sprite] of Object.entries(requirements.sprites)) verify(`Sprite ${spriteKey(sprite)} (${name})`, manifest.sprites[spriteKey(sprite)]);
  for (const [name, id] of Object.entries(requirements.sounds)) verify(`Sound effect ${id} (${name})`, manifest.sounds[String(id)]);

  if (stale && problems.length === 0)
    problems.push({ message: 'The asset requirements changed after the bundle was built.', fix: REBUILD });
  return problems;
}
