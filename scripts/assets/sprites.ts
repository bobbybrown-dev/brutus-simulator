import { type CacheContext, MissingAssetError } from './models.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Decode one frame of a sprite group onto its full canvas (so every frame of a group has the same size). */
export async function extractSprite(ctx: CacheContext, id: number, frame: number): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  let def: any;
  try {
    def = await ctx.cache.getDef(ctx.reader.IndexType.SPRITES, id);
  } catch (cause) {
    throw new MissingAssetError('sprite', id, `not readable from this cache (${(cause as Error).message})`);
  }
  const sprite = def?.sprites?.[frame];
  if (!sprite) throw new MissingAssetError('sprite', `${id}:${frame}`, `group has ${def?.sprites?.length ?? 0} frame(s)`);
  const width = sprite.maxWidth ?? sprite.width;
  const height = sprite.maxHeight ?? sprite.height;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < sprite.height; y++)
    for (let x = 0; x < sprite.width; x++) {
      const pixel = sprite.pixels[y * sprite.width + x] >>> 0;
      const rgb = pixel & 0xffffff;
      if (rgb === 0) continue;
      const alpha = pixel >>> 24 || 255;
      const tx = x + (sprite.offsetX ?? 0);
      const ty = y + (sprite.offsetY ?? 0);
      if (tx < width && ty < height) rgba.set([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, alpha], (ty * width + tx) * 4);
    }
  return { width, height, rgba };
}

/** A ground/model texture: the sprite its texture definition points at, opaque. */
export async function extractTexture(ctx: CacheContext, textureId: number): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  let def: any;
  try {
    def = await ctx.cache.getDef(ctx.reader.IndexType.TEXTURES, 0, textureId);
  } catch (cause) {
    throw new MissingAssetError('texture', textureId, `not readable from this cache (${(cause as Error).message})`);
  }
  const spriteId = def?.fileIds?.[0];
  if (spriteId === undefined) throw new MissingAssetError('texture', textureId, 'not present in this cache');
  const image = await extractSprite(ctx, spriteId, 0);
  for (let i = 3; i < image.rgba.length; i += 4) image.rgba[i] = 255;
  return image;
}
