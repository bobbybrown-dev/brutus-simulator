/*
 * Inventory icon renderer. The lighting, projection, face ordering, triangle fill, outline and
 * shadow below are ported from RuneLite's cache tool (net.runelite.cache.item.ItemSpriteFactory,
 * Model, Graphics3D and SpritePixels), which carries this notice:
 *
 * Copyright (c) 2018, Adam <Adam@sigterm.info>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import { jagexPalette } from './colour.ts';
import { type CacheContext, MissingAssetError, loadConfig, loadModel, recolour } from './models.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * At scale 1 this follows the client step for step: integer screen coordinates, 14-bit fixed-point
 * edges, a colour plane evaluated per pixel, depth buckets with the client's priority interleaving,
 * then a 1 px outline and a drop shadow, in a 36×32 sprite.
 *
 * A larger `scale` projects the same model onto a proportionally larger sprite (outline and shadow
 * thickened to match), for interfaces drawn larger than the game's native size. That is new detail
 * from the 3D model, not an enlargement of the small icon. Textured faces use their base colour.
 */

export const ICON_WIDTH = 36;
export const ICON_HEIGHT = 32;
const ZOOM = 512;
const CENTRE = 16;
const OUTLINE = 1;
const SHADOW = 0x302020;
const LIGHT = { x: -50, y: -10, z: -50 };

const SINE = new Int32Array(2048);
const COSINE = new Int32Array(2048);
for (let i = 0; i < 2048; i++) {
  SINE[i] = Math.trunc(65536 * Math.sin((i * Math.PI) / 1024));
  COSINE[i] = Math.trunc(65536 * Math.cos((i * Math.PI) / 1024));
}

/** Java integer division. */
const div = (a: number, b: number): number => Math.trunc(a / b);
const clampLight = (v: number): number => (v < 2 ? 2 : v > 126 ? 126 : v);
const shade = (hsl: number, light: number): number => (hsl & 0xff80) + clampLight(((hsl & 127) * light) >> 7);

export interface IconItem {
  zoom2d: number;
  xan2d: number;
  yan2d: number;
  zan2d: number;
  xOffset2d: number;
  yOffset2d: number;
  ambient: number;
  contrast: number;
}

export interface IconModel {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  z: ArrayLike<number>;
  a: ArrayLike<number>;
  b: ArrayLike<number>;
  c: ArrayLike<number>;
  /** Packed 16-bit HSL per face. */
  colours: ArrayLike<number>;
  /** 0 Gouraud, 1 flat, 2 hidden, 3 flat black. */
  renderTypes?: ArrayLike<number> | null;
  alphas?: ArrayLike<number> | null;
  /** Per-face priority 0–11, or null when the model has none. */
  priorities?: ArrayLike<number> | null;
}

interface Lit {
  c1: Int32Array;
  c2: Int32Array;
  /** -1: flat, colour in c1. -2: not drawn. */
  c3: Int32Array;
  alpha: Uint8Array;
}

function light(model: IconModel, ambient: number, contrast: number): Lit {
  const n = model.a.length;
  const vertices = model.x.length;
  const nx = new Int32Array(vertices), ny = new Int32Array(vertices), nz = new Int32Array(vertices), count = new Int32Array(vertices);
  const fx = new Int32Array(n), fy = new Int32Array(n), fz = new Int32Array(n);
  const type = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const alpha = (model.alphas?.[i] ?? 0) & 255;
    type[i] = alpha === 254 ? 3 : alpha === 255 ? 2 : (model.renderTypes?.[i] ?? 0) & 3;
    const a = model.a[i]!, b = model.b[i]!, c = model.c[i]!;
    const ux = model.x[b]! - model.x[a]!, uy = model.y[b]! - model.y[a]!, uz = model.z[b]! - model.z[a]!;
    const vx = model.x[c]! - model.x[a]!, vy = model.y[c]! - model.y[a]!, vz = model.z[c]! - model.z[a]!;
    let x = uy * vz - vy * uz, y = uz * vx - vz * ux, z = ux * vy - vx * uy;
    while (x > 8192 || y > 8192 || z > 8192 || x < -8192 || y < -8192 || z < -8192) (x >>= 1), (y >>= 1), (z >>= 1);
    const length = Math.max(1, Math.trunc(Math.sqrt(x * x + y * y + z * z)));
    x = div(x * 256, length);
    y = div(y * 256, length);
    z = div(z * 256, length);
    if (type[i] === 0) for (const v of [a, b, c]) (nx[v] = nx[v]! + x), (ny[v] = ny[v]! + y), (nz[v] = nz[v]! + z), (count[v] = count[v]! + 1);
    else if (type[i] === 1) (fx[i] = x), (fy[i] = y), (fz[i] = z);
  }
  const magnitude = Math.trunc(Math.sqrt(LIGHT.x * LIGHT.x + LIGHT.y * LIGHT.y + LIGHT.z * LIGHT.z));
  const scale = (magnitude * contrast) >> 8;
  const lit: Lit = { c1: new Int32Array(n), c2: new Int32Array(n), c3: new Int32Array(n), alpha: new Uint8Array(n) };
  const vertexLight = (v: number): number => div(LIGHT.x * nx[v]! + LIGHT.y * ny[v]! + LIGHT.z * nz[v]!, scale * Math.max(1, count[v]!)) + ambient;
  for (let i = 0; i < n; i++) {
    const colour = model.colours[i]! & 0xffff;
    if (type[i] === 0) {
      lit.c1[i] = shade(colour, vertexLight(model.a[i]!));
      lit.c2[i] = shade(colour, vertexLight(model.b[i]!));
      lit.c3[i] = shade(colour, vertexLight(model.c[i]!));
      lit.alpha[i] = (model.alphas?.[i] ?? 0) & 255;
    } else if (type[i] === 1) {
      lit.c1[i] = shade(colour, div(LIGHT.x * fx[i]! + LIGHT.y * fy[i]! + LIGHT.z * fz[i]!, scale + (scale >> 1)) + ambient);
      lit.c3[i] = -1;
      lit.alpha[i] = (model.alphas?.[i] ?? 0) & 255;
    } else if (type[i] === 3) {
      lit.c1[i] = 128;
      lit.c3[i] = -1;
    } else lit.c3[i] = -2;
  }
  return lit;
}

/** Faces in the order the client draws them: far to near, with the priority layers interleaved its way. */
function drawOrder(model: IconModel, lit: Lit, sx: Int32Array, sy: Int32Array, depth: Int32Array, radius: number, diameter: number): number[] {
  const buckets: number[][] = Array.from({ length: diameter + 1 }, () => []);
  for (let f = 0; f < model.a.length; f++) {
    if (lit.c3[f] === -2) continue;
    const a = model.a[f]!, b = model.b[f]!, c = model.c[f]!;
    if ((sx[a]! - sx[b]!) * (sy[c]! - sy[b]!) - (sx[c]! - sx[b]!) * (sy[a]! - sy[b]!) <= 0) continue; // back-facing
    const bucket = div(depth[a]! + depth[b]! + depth[c]!, 3) + radius;
    if (bucket >= 0 && bucket < buckets.length) buckets[bucket]!.push(f);
  }
  const order: number[] = [];
  if (!model.priorities) {
    for (let d = buckets.length - 1; d >= 0; d--) order.push(...buckets[d]!);
    return order;
  }

  const layers: number[][] = Array.from({ length: 12 }, () => []);
  const sums = new Array<number>(12).fill(0);
  const late: Array<Array<{ face: number; distance: number }>> = [[], []];
  for (let d = buckets.length - 1; d >= 0; d--)
    for (const face of buckets[d]!) {
      const priority = Math.min(11, Math.max(0, model.priorities[face]!));
      layers[priority]!.push(face);
      if (priority < 10) sums[priority] = sums[priority]! + d;
      else late[priority - 10]!.push({ face, distance: d });
    }
  const average = (p: number, q: number): number => (layers[p]!.length > 0 || layers[q]!.length > 0 ? div(sums[p]! + sums[q]!, layers[p]!.length + layers[q]!.length) : 0);
  // Priorities 10 then 11 are drawn before layers 0, 3 and 5 while they are farther than those layers' average.
  const thresholds = new Map([[0, average(1, 2)], [3, average(3, 4)], [5, average(6, 8)]]);
  const pending = [...late[0]!, ...late[1]!];
  let next = 0;
  for (let priority = 0; priority < 10; priority++) {
    const threshold = thresholds.get(priority);
    if (threshold !== undefined) while (next < pending.length && pending[next]!.distance > threshold) order.push(pending[next++]!.face);
    order.push(...layers[priority]!);
  }
  while (next < pending.length) order.push(pending[next++]!.face);
  return order;
}

/**
 * The client's triangle fill: integer corners, edges stepped in 14-bit fixed point, and colour
 * taken from a plane over the triangle (so flat faces are the same routine with no slope).
 */
function fillTriangle(pixels: Int32Array, width: number, height: number, palette: Int32Array, xs: readonly number[], ys: readonly number[], cs: readonly number[], alpha: number): void {
  const [x0, x1, x2] = xs as [number, number, number];
  const [y0, y1, y2] = ys as [number, number, number];
  const [c0, c1, c2] = cs as [number, number, number];
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (det === 0) return;
  const dcdx = div(((c1 - c0) * (y2 - y0) - (c2 - c0) * (y1 - y0)) * 256, det);
  const dcdy = div(((c2 - c0) * (x1 - x0) - (c1 - c0) * (x2 - x0)) * 256, det);

  const top = y0 <= y1 && y0 <= y2 ? 0 : y1 <= y2 ? 1 : 2;
  const following = (top + 1) % 3;
  const previous = (top + 2) % 3;
  const [middle, bottom] = ys[following]! < ys[previous]! ? [following, previous] : [previous, following];
  const slope = (from: number, to: number): number => (ys[from] === ys[to] ? 0 : div((xs[to]! - xs[from]!) * 16384, ys[to]! - ys[from]!));
  const long = slope(top, bottom);
  const upper = slope(top, middle);
  const lower = slope(middle, bottom);
  const longOnLeft = (ys[top] !== ys[middle] && long < upper) || (ys[top] === ys[middle] && long > lower);
  // Row colour at x = 0, as the client seeds it from vertex 0.
  const rowColour = (y: number): number => dcdx + c0 * 256 - x0 * dcdx + (y - y0) * dcdy;

  for (let y = Math.max(0, ys[top]!); y < Math.min(height, ys[bottom]!); y++) {
    const longX = xs[top]! * 16384 + long * (y - ys[top]!);
    const shortX = y < ys[middle]! ? xs[top]! * 16384 + upper * (y - ys[top]!) : xs[middle]! * 16384 + lower * (y - ys[middle]!);
    const from = Math.max(0, (longOnLeft ? longX : shortX) >> 14);
    const to = Math.min(width, (longOnLeft ? shortX : longX) >> 14);
    let colour = rowColour(y) + from * dcdx;
    for (let x = from, index = y * width + from; x < to; x++, index++, colour += dcdx) {
      let rgb = palette[(colour >> 8) & 0xffff]!;
      if (alpha !== 0) {
        const keep = 256 - alpha;
        const dst = pixels[index]!;
        rgb = ((((rgb & 0xff00) * keep) >> 8) & 0xff00) + ((((rgb & 0xff00ff) * keep) >> 8) & 0xff00ff) + ((((dst & 0xff00ff) * alpha) >> 8) & 0xff00ff) + ((((dst & 0xff00) * alpha) >> 8) & 0xff00);
      }
      pixels[index] = rgb;
    }
  }
}

function outline(pixels: Int32Array, width: number, height: number, colour: number): Int32Array {
  const out = new Int32Array(pixels.length);
  for (let y = 0, i = 0; y < height; y++)
    for (let x = 0; x < width; x++, i++) {
      let pixel = pixels[i]!;
      if (pixel === 0) {
        if (x > 0 && pixels[i - 1] !== 0) pixel = colour;
        else if (y > 0 && pixels[i - width] !== 0) pixel = colour;
        else if (x < width - 1 && pixels[i + 1] !== 0) pixel = colour;
        else if (y < height - 1 && pixels[i + width] !== 0) pixel = colour;
      }
      out[i] = pixel;
    }
  return out;
}

/** Render an icon to straight RGBA. `scale` 1 is the game's 36×32 sprite. */
export function renderIcon(item: IconItem, model: IconModel, scale = 1): { width: number; height: number; rgba: Uint8Array } {
  const width = ICON_WIDTH * scale;
  const height = ICON_HEIGHT * scale;
  const lit = light(model, item.ambient + 64, item.contrast + 768);
  const xan = item.xan2d & 2047, yan = item.yan2d & 2047, zan = item.zan2d & 2047;

  let modelHeight = 0, bottomY = 0, flatRadius = 0;
  for (let i = 0; i < model.x.length; i++) {
    modelHeight = Math.max(modelHeight, -model.y[i]!);
    bottomY = Math.max(bottomY, model.y[i]!);
    flatRadius = Math.max(flatRadius, model.x[i]! * model.x[i]! + model.z[i]! * model.z[i]!);
  }
  flatRadius = Math.trunc(Math.sqrt(flatRadius) + 0.99);
  const radius = Math.trunc(Math.sqrt(flatRadius * flatRadius + modelHeight * modelHeight) + 0.99);
  const diameter = radius + Math.trunc(Math.sqrt(flatRadius * flatRadius + bottomY * bottomY) + 0.99);

  const xOffset = item.xOffset2d;
  const yOffset = (modelHeight >> 1) + ((item.zoom2d * SINE[xan]!) >> 16) + item.yOffset2d;
  const zOffset = ((item.zoom2d * COSINE[xan]!) >> 16) + item.yOffset2d;
  const eye = (SINE[xan]! * yOffset + COSINE[xan]! * zOffset) >> 16;

  const sx = new Int32Array(model.x.length), sy = new Int32Array(model.x.length), depth = new Int32Array(model.x.length);
  for (let i = 0; i < model.x.length; i++) {
    let x = model.x[i]!, y = model.y[i]!, z = model.z[i]!;
    if (zan !== 0) {
      const t = (y * SINE[zan]! + x * COSINE[zan]!) >> 16;
      y = (y * COSINE[zan]! - x * SINE[zan]!) >> 16;
      x = t;
    }
    if (yan !== 0) {
      const t = (z * SINE[yan]! + x * COSINE[yan]!) >> 16;
      z = (z * COSINE[yan]! - x * SINE[yan]!) >> 16;
      x = t;
    }
    x += xOffset;
    y += yOffset;
    z += zOffset;
    const t = (y * COSINE[xan]! - z * SINE[xan]!) >> 16;
    z = (y * SINE[xan]! + z * COSINE[xan]!) >> 16;
    depth[i] = z - eye;
    const safeZ = z === 0 ? 1 : z;
    sx[i] = div(x * ZOOM * scale, safeZ) + CENTRE * scale;
    sy[i] = div(t * ZOOM * scale, safeZ) + CENTRE * scale;
  }

  let pixels: Int32Array = new Int32Array(width * height);
  const palette = jagexPalette();
  for (const f of drawOrder(model, lit, sx, sy, depth, radius, diameter)) {
    const corners = [model.a[f]!, model.b[f]!, model.c[f]!];
    const flat = lit.c3[f] === -1;
    fillTriangle(pixels, width, height, palette, corners.map((v) => sx[v]!), corners.map((v) => sy[v]!), flat ? [lit.c1[f]!, lit.c1[f]!, lit.c1[f]!] : [lit.c1[f]!, lit.c2[f]!, lit.c3[f]!], lit.alpha[f]!);
  }

  // One outline pass and a one-pixel shadow step per unit of scale keep both at their native proportions.
  for (let i = 0; i < scale; i++) pixels = outline(pixels, width, height, OUTLINE);
  for (let y = height - 1; y >= scale; y--)
    for (let x = width - 1; x >= scale; x--) {
      const i = y * width + x;
      if (pixels[i] === 0 && pixels[i - scale - scale * width] !== 0 && pixels[i - scale - scale * width] !== SHADOW) pixels[i] = SHADOW;
    }

  const rgba = new Uint8Array(width * height * 4);
  pixels.forEach((p, i) => {
    if (p !== 0) rgba.set([(p >> 16) & 255, (p >> 8) & 255, p & 255, 255], i * 4);
  });
  return { width, height, rgba };
}

/** Load an item and its inventory model from the cache and render its icon at the given scales. */
export async function renderItemIcon(ctx: CacheContext, itemId: number, scales: readonly number[] = [1]): Promise<{ name: string; icons: Array<{ scale: number; width: number; height: number; rgba: Uint8Array }> }> {
  const item = await loadConfig(ctx, 'ITEM', itemId);
  if (!(item.inventoryModel > 0)) throw new MissingAssetError('item', itemId, 'has no inventory model');
  const model = await loadModel(ctx, item.inventoryModel, `item ${itemId}`);
  recolour(model, item.recolorToFind, item.recolorToReplace);
  const resize = (values: ArrayLike<number>, factor: number): Int32Array => Int32Array.from(values as ArrayLike<number>, (v) => div(v * factor, 128));
  const iconModel: IconModel = {
    x: resize(model.vertexPositionsX, item.resizeX ?? 128),
    y: resize(model.vertexPositionsY, item.resizeY ?? 128),
    z: resize(model.vertexPositionsZ, item.resizeZ ?? 128),
    a: model.faceVertexIndices1,
    b: model.faceVertexIndices2,
    c: model.faceVertexIndices3,
    colours: model.faceColors,
    renderTypes: model.faceRenderTypes,
    alphas: model.faceAlphas,
    priorities: model.faceRenderPriorities?.length ? model.faceRenderPriorities : null,
  };
  const iconItem: IconItem = {
    zoom2d: item.zoom2d ?? 2000,
    xan2d: item.xan2d ?? 0,
    yan2d: item.yan2d ?? 0,
    zan2d: item.zan2d ?? 0,
    xOffset2d: item.xOffset2d ?? 0,
    yOffset2d: item.yOffset2d ?? 0,
    ambient: item.ambient ?? 0,
    contrast: item.contrast ?? 0,
  };
  const icons = scales.map((scale) => ({ scale, ...renderIcon(iconItem, iconModel, scale) }));
  if (!icons[0]!.rgba.some((v) => v !== 0)) throw new MissingAssetError('item', itemId, 'rendered to an empty icon');
  return { name: item.name ?? `item ${itemId}`, icons };
}
