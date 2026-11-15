import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** Encode straight (non-premultiplied) RGBA pixels, row-major from the top-left, as a PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`encodePng: expected ${width * height * 4} bytes, got ${rgba.length}`);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/**
 * The small part of the canvas API the cache reader's glTF exporter uses to paint its colour
 * palette (fillStyle = "rgba(r, g, b, a)", fillRect, toDataURL), without the native `canvas` module.
 */
export function createPaletteCanvas(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const ctx = {
    fillStyle: 'rgba(0, 0, 0, 1)',
    fillRect(x: number, y: number, w: number, h: number) {
      const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(ctx.fillStyle);
      if (!m) throw new Error(`createPaletteCanvas: unsupported fillStyle ${ctx.fillStyle}`);
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const a = Math.round((m[4] === undefined ? 1 : Number(m[4])) * 255);
      for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++)
        for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++) pixels.set([r, g, b, a], (yy * width + xx) * 4);
    },
  };
  return {
    width,
    height,
    getContext: () => ctx,
    toDataURL: () => `data:image/png;base64,${encodePng(width, height, pixels).toString('base64')}`,
  };
}
