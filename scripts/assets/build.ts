import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type AssetFile, type AssetManifest, type CacheAssets, MANIFEST_SCHEMA, spriteKey } from '../../src/assetBundle/manifest.ts';
import { hashRequirements } from '../../src/assetBundle/requirementsHash.ts';
import { type CacheSource, resolveCache } from './cache.ts';
import { renderItemIcon } from './itemIcons.ts';
import { type CacheContext, MissingAssetError, exportAnimatedModel, loadConfig, loadModel, recolour } from './models.ts';
import { encodePng } from './png.ts';
import { AssetSetupError, READER_PIN, loadReader } from './reader.ts';
import { extractSound } from './sounds.ts';
import { extractSprite, extractTexture } from './sprites.ts';
import { extractTerrain } from './terrain.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface AssetConfig {
  cache: CacheSource;
  assets: CacheAssets;
  /** Output folder, relative to the project root. Generated; never committed. */
  outDir: string;
  /** Scratch folder for the reader checkout and downloaded caches. */
  workDir: string;
}

/** Item icons are also rendered this many times larger, for interfaces scaled up from the native size. */
const HIRES_ICON_SCALE = 4;

/** Which equipment position each base body part is replaced by (kit bodyPartId → wearPos). */
const KIT_HIDDEN_BY = [8, 11, 4, 6, 9, 7, 10];

async function buildPlayer(ctx: CacheContext, requirement: CacheAssets['player']) {
  const models: any[] = [];
  const covered = new Set<number>();
  const worn: Record<string, string> = {};
  for (const [slot, itemId] of Object.entries(requirement.worn)) {
    const item = await loadConfig(ctx, 'ITEM', itemId);
    const modelIds = [item.maleModel0, item.maleModel1, item.maleModel2].filter((id) => id >= 0);
    if (modelIds.length === 0) throw new MissingAssetError('item', itemId, `(${slot}) has no worn model`);
    for (const pos of [item.wearPos1, item.wearPos2, item.wearPos3]) if (pos >= 0) covered.add(pos);
    for (const id of modelIds) {
      const model = await loadModel(ctx, id, `item ${itemId}`);
      recolour(model, item.recolorToFind, item.recolorToReplace);
      models.push(model);
    }
    worn[String(itemId)] = item.name;
  }
  for (const kitId of requirement.kits) {
    const kit = await loadConfig(ctx, 'IDENTKIT', kitId);
    if (covered.has(KIT_HIDDEN_BY[kit.bodyPartId] ?? -1)) continue;
    for (const id of kit.models ?? []) {
      const model = await loadModel(ctx, id, `kit ${kitId}`);
      recolour(model, kit.recolorToFind, kit.recolorToReplace);
      models.push(model);
    }
  }
  return { ...(await exportAnimatedModel(ctx, models, Object.values(requirement.animations), 'the player')), worn };
}

export async function buildBundle(config: AssetConfig, root: string, log: (line: string) => void = console.log): Promise<AssetManifest> {
  const cacheInfo = await resolveCache(config.cache, resolve(root, config.workDir));
  log(`Cache: ${cacheInfo.source} (fingerprint ${cacheInfo.fingerprint})`);
  const readerDir = resolve(root, config.workDir, 'osrscachereader');
  const reader = await loadReader(process.env.OSRS_CACHE_READER_PATH ?? readerDir);
  const cache = new reader.RSCache(cacheInfo.dir);
  // The reader logs every index it cannot parse; indexes this build does not use are irrelevant noise.
  const quiet = console.log;
  console.log = () => {};
  try {
    await cache.onload;
  } finally {
    console.log = quiet;
  }
  const ctx: CacheContext = { reader, readerDir: process.env.OSRS_CACHE_READER_PATH ?? readerDir, cache };

  // Build into a staging folder and swap at the end, so a failed build never leaves half a bundle.
  const outDir = resolve(root, config.outDir);
  const staging = `${outDir}.building`;
  rmSync(staging, { recursive: true, force: true });
  const write = (file: string, bytes: Buffer | string): AssetFile => {
    const data = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
    mkdirSync(dirname(join(staging, file)), { recursive: true });
    writeFileSync(join(staging, file), data);
    return { file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  };

  const manifest: AssetManifest = {
    schema: MANIFEST_SCHEMA,
    builtAt: new Date().toISOString(),
    requirementsHash: hashRequirements(config.assets),
    cache: { source: cacheInfo.source.startsWith('local:') ? 'local' : cacheInfo.source, fingerprint: cacheInfo.fingerprint },
    reader: { ...READER_PIN },
    npcs: {},
    player: null,
    terrain: {},
    textures: {},
    items: {},
    sprites: {},
    sounds: {},
  };
  const failures: string[] = [];
  const attempt = async (label: string, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      if (!(error instanceof MissingAssetError)) throw error;
      failures.push(`${label}: ${error.message}`);
    }
  };

  for (const [name, requirement] of Object.entries(config.assets.npcs))
    await attempt(`npcs.${name}`, async () => {
      const npc = await loadConfig(ctx, 'NPC', requirement.id);
      const models = [];
      for (const id of npc.models ?? []) {
        const model = await loadModel(ctx, id, `npc ${requirement.id}`);
        recolour(model, npc.recolorToFind, npc.recolorToReplace);
        models.push(model);
      }
      if (models.length === 0) throw new MissingAssetError('npc', requirement.id, 'has no models');
      const sequences = [npc.standingAnimation, npc.walkingAnimation, ...Object.values(requirement.animations)].filter((id) => id >= 0);
      const exported = await exportAnimatedModel(ctx, models, sequences, `npc ${requirement.id}`);
      manifest.npcs[String(requirement.id)] = {
        ...write(`models/npc-${requirement.id}.gltf`, exported.gltf),
        name: npc.name,
        size: npc.size ?? 1,
        widthScale: npc.widthScale ?? 128,
        heightScale: npc.heightScale ?? 128,
        idleSequence: npc.standingAnimation ?? -1,
        walkSequence: npc.walkingAnimation ?? -1,
        clips: exported.clips,
      };
      log(`  npc ${requirement.id} ${npc.name}: ${exported.vertices} vertices, ${exported.faces} faces, ${Object.keys(exported.clips).length} clips`);
    });

  await attempt('player', async () => {
    const exported = await buildPlayer(ctx, config.assets.player);
    manifest.player = { ...write('models/player.gltf', exported.gltf), clips: exported.clips, worn: exported.worn };
    log(`  player: ${exported.vertices} vertices, ${Object.keys(exported.clips).length} clips, wearing ${Object.values(exported.worn).join(', ')}`);
  });

  for (const [name, requirement] of Object.entries(config.assets.terrain))
    await attempt(`terrain.${name}`, async () => {
      const terrain = await extractTerrain(ctx, name, requirement);
      manifest.terrain[name] = write(`terrain/${name}.json`, JSON.stringify(terrain));
      for (const textureId of new Set(terrain.overlayTexture.filter((t) => t >= 0))) {
        if (manifest.textures[String(textureId)]) continue;
        const texture = await extractTexture(ctx, textureId);
        manifest.textures[String(textureId)] = write(`textures/${textureId}.png`, encodePng(texture.width, texture.height, texture.rgba));
      }
      log(`  terrain ${name}: ${terrain.width}×${terrain.height} tiles, ${terrain.overlay.filter((c) => c >= 0).length} overlay tiles`);
    });

  for (const [name, id] of Object.entries(config.assets.items))
    await attempt(`items.${name}`, async () => {
      const { name: itemName, icons } = await renderItemIcon(ctx, id, [1, HIRES_ICON_SCALE]);
      const [native, hires] = icons.map((icon) => write(`item-icons/${id}${icon.scale === 1 ? '' : `@${icon.scale}x`}.png`, encodePng(icon.width, icon.height, icon.rgba)));
      manifest.items[String(id)] = { ...native!, name: itemName, hires: hires! };
    });
  log(`  item icons: ${Object.values(manifest.items).map((i) => i.name).join(', ')}`);

  for (const [name, sprite] of Object.entries(config.assets.sprites))
    await attempt(`sprites.${name}`, async () => {
      if (manifest.sprites[spriteKey(sprite)]) return;
      const image = await extractSprite(ctx, sprite.id, sprite.frame ?? 0);
      manifest.sprites[spriteKey(sprite)] = { ...write(`sprites/${sprite.id}_${sprite.frame ?? 0}.png`, encodePng(image.width, image.height, image.rgba)), width: image.width, height: image.height };
    });
  log(`  sprites: ${Object.keys(manifest.sprites).length}`);

  for (const [name, id] of Object.entries(config.assets.sounds))
    await attempt(`sounds.${name}`, async () => {
      const sound = await extractSound(ctx, id);
      manifest.sounds[String(id)] = { ...write(`sounds/${id}.wav`, sound.wav), seconds: Math.round(sound.seconds * 1000) / 1000 };
    });
  log(`  sounds: ${Object.keys(manifest.sounds).length}`);

  if (failures.length > 0) {
    rmSync(staging, { recursive: true, force: true });
    throw new AssetSetupError(
      `${failures.length} required asset(s) could not be extracted from this cache:\n${failures.map((f) => `  - ${f}`).join('\n')}\n` +
        'The existing bundle was left untouched. Check the IDs in src/assets.ts, or use a cache that contains them\n' +
        '(a live RuneLite cache only holds what the game has loaded; --openrs2 <id> gives a complete one).',
    );
  }

  write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(outDir, { recursive: true, force: true });
  renameSync(staging, outDir);
  return manifest;
}

function parseArgs(argv: string[]): { cacheDir?: string; openrs2?: number } {
  const args: { cacheDir?: string; openrs2?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cache-dir' && argv[i + 1]) args.cacheDir = argv[++i];
    else if (argv[i] === '--openrs2' && argv[i + 1]) args.openrs2 = Number(argv[++i]);
    else throw new AssetSetupError(`Unknown argument ${argv[i]}. Usage: npm run assets -- [--cache-dir <folder> | --openrs2 <id>]`);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(process.argv[1]), '..', '..');
  try {
    const config: AssetConfig = (await import(pathToFileURL(join(root, 'osrs-assets.config.ts')).href)).default;
    const args = parseArgs(process.argv.slice(2));
    if (args.openrs2 !== undefined) config.cache = { openrs2: args.openrs2 };
    else if (args.cacheDir) config.cache = { local: args.cacheDir };
    const started = Date.now();
    const manifest = await buildBundle(config, root);
    const files = [...Object.values(manifest.npcs), manifest.player!, ...Object.values(manifest.terrain), ...Object.values(manifest.textures), ...Object.values(manifest.items), ...Object.values(manifest.items).map((i) => i.hires), ...Object.values(manifest.sprites), ...Object.values(manifest.sounds)];
    const bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    console.log(`Wrote ${files.length} files (${(bytes / 1e6).toFixed(1)} MB) to ${config.outDir} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    process.exit(0);
  } catch (error) {
    if (error instanceof AssetSetupError) {
      console.error(`\nAsset build failed.\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

