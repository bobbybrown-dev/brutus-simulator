import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyLight, floorHsl, jagexHslToRgb, packHsl } from './colour.ts';
import type { TerrainData } from '../../src/assetBundle/manifest.ts';
import { type CacheContext, MissingAssetError } from './models.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Light level applied to flat ground. The client derives it per vertex from slope; this field is near-flat. */
const FLAT_GROUND_LIGHT = 100;
const BLEND_RADIUS = 5;
const NO_COLOUR = 0xff00ff;

interface RegionTiles {
  tiles: any[][];
  heights: number[][];
}

let mapLoaderClass: any = null;

/**
 * Map groups are keyed by region ID with numbered files in current caches (file 0 = terrain); the
 * reader still looks maps up by name hash, so fetch the raw file and hand it to the reader's decoder.
 */
async function loadRegion(ctx: CacheContext, regionId: number): Promise<RegionTiles> {
  if (!mapLoaderClass) {
    const module = await import(pathToFileURL(join(ctx.readerDir, 'src', 'cacheReader', 'loaders', 'MapLoader.js')).href);
    mapLoaderClass = module.default;
    mapLoaderClass.prototype.load = (bytes: Uint8Array, id: number) => ({ id, bytes });
  }
  let files: any[];
  try {
    files = await ctx.cache.getAllFiles(ctx.reader.IndexType.MAPS, regionId);
  } catch (cause) {
    throw new MissingAssetError('region', regionId, `map group not readable from this cache (${(cause as Error).message})`);
  }
  const terrain = files.find((f) => f?.id === 0)?.def?.bytes;
  if (!terrain?.length) throw new MissingAssetError('region', regionId, 'has no terrain file in this cache');
  const def = new mapLoaderClass().loadMapDef(terrain, regionId, regionId >> 8, regionId & 255);
  return { tiles: def.tiles[0], heights: def.getHeights()[0] };
}

async function floorBytes(ctx: CacheContext, type: 'UNDERLAY' | 'OVERLAY', id: number): Promise<Uint8Array> {
  const file = await ctx.cache.getFile(ctx.reader.IndexType.CONFIGS, ctx.reader.ConfigType[type], id).catch(() => null);
  if (!file?.content?.length) throw new MissingAssetError(type.toLowerCase(), id, 'not present in this cache');
  return file.content;
}

async function underlayRgb(ctx: CacheContext, id: number): Promise<number> {
  const b = await floorBytes(ctx, 'UNDERLAY', id);
  return b[0] === 1 ? (b[1]! << 16) | (b[2]! << 8) | b[3]! : 0;
}

async function overlayDef(ctx: CacheContext, id: number): Promise<{ rgb: number; texture: number }> {
  const b = await floorBytes(ctx, 'OVERLAY', id);
  let rgb = 0;
  let texture = -1;
  for (let i = 0; i < b.length; ) {
    const opcode = b[i++]!;
    if (opcode === 0) break;
    else if (opcode === 1) (rgb = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!), (i += 3);
    else if (opcode === 2) texture = b[i++]!;
    else if (opcode === 3) (texture = (b[i]! << 8) | b[i + 1]!), (i += 2);
    else if (opcode === 5) continue;
    else if (opcode === 7) i += 3;
    else throw new MissingAssetError('overlay', id, `unknown opcode ${opcode}`);
  }
  return { rgb, texture };
}

export async function extractTerrain(
  ctx: CacheContext,
  name: string,
  requirement: { regions: readonly number[]; bounds: { minX: number; maxX: number; minY: number; maxY: number } },
): Promise<TerrainData> {
  const regions = new Map<number, RegionTiles>();
  for (const id of requirement.regions) regions.set(id, await loadRegion(ctx, id));
  const at = (wx: number, wy: number): { tile: any; height: number } | null => {
    const region = regions.get(((wx >> 6) << 8) | (wy >> 6));
    return region ? { tile: region.tiles[wx & 63]![wy & 63], height: region.heights[wx & 63]![wy & 63]! } : null;
  };

  const { minX, maxX, minY, maxY } = requirement.bounds;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  for (const [x, y] of [[minX, minY], [maxX + 1, maxY + 1]] as const)
    if (!at(x, y)) throw new MissingAssetError('terrain', name, `bounds reach ${x},${y}, outside the listed regions`);

  const underlays = new Map<number, ReturnType<typeof floorHsl>>();
  const overlays = new Map<number, { rgb: number; texture: number }>();
  for (let y = minY - BLEND_RADIUS; y <= maxY + 1 + BLEND_RADIUS; y++)
    for (let x = minX - BLEND_RADIUS; x <= maxX + 1 + BLEND_RADIUS; x++) {
      const tile = at(x, y)?.tile;
      if (tile?.underlayId > 0 && !underlays.has(tile.underlayId)) underlays.set(tile.underlayId, floorHsl(await underlayRgb(ctx, tile.underlayId - 1)));
      if (tile?.overlayId > 0 && !overlays.has(tile.overlayId)) overlays.set(tile.overlayId, await overlayDef(ctx, tile.overlayId - 1));
    }

  const data: TerrainData = { origin: { x: minX, y: minY }, width, height, heights: [], underlay: [], overlay: [], overlayTexture: [], overlayShape: [], overlayRotation: [] };
  for (let y = minY; y <= maxY + 1; y++)
    for (let x = minX; x <= maxX + 1; x++) {
      data.heights.push(at(x, y)!.height / 128);
      // The client's underlay blend: a box blur over ±5 tiles of pre-multiplied hue, saturation and lightness.
      let hue = 0, saturation = 0, lightness = 0, multiplier = 0, count = 0;
      for (let dy = -BLEND_RADIUS; dy <= BLEND_RADIUS; dy++)
        for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx++) {
          const floor = underlays.get(at(x + dx, y + dy)?.tile?.underlayId ?? 0);
          if (!floor) continue;
          hue += floor.hue;
          saturation += floor.saturation;
          lightness += floor.lightness;
          multiplier += floor.hueMultiplier;
          count++;
        }
      const own = at(x, y)!.tile.underlayId > 0;
      data.underlay.push(
        own && count > 0 && multiplier > 0
          ? jagexHslToRgb(applyLight(packHsl(Math.floor((hue * 256) / multiplier) & 255, Math.floor(saturation / count), Math.floor(lightness / count)), FLAT_GROUND_LIGHT))
          : -1,
      );
    }
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const tile = at(x, y)!.tile;
      const overlay = overlays.get(tile.overlayId ?? 0);
      const visible = overlay && overlay.rgb !== NO_COLOUR;
      const hsl = visible ? floorHsl(overlay.rgb) : null;
      data.overlay.push(hsl ? jagexHslToRgb(applyLight(packHsl(hsl.hue256, hsl.saturation, hsl.lightness), FLAT_GROUND_LIGHT)) : -1);
      data.overlayTexture.push(overlay ? overlay.texture : -1);
      data.overlayShape.push(overlay ? Math.floor(tile.overlayPath ?? 0) : 0);
      data.overlayRotation.push(overlay ? (tile.overlayRotation ?? 0) & 3 : 0);
    }
  return data;
}
