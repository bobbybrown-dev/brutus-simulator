/** Brightness used by the client's item sprites and the cache reader's glTF palette. */
export const BRIGHTNESS_MAX = 0.6;

const adjust = (channel: number, brightness: number): number => Math.round(Math.pow(channel, brightness) * 255);

/** 16-bit Jagex HSL (6 bits hue, 3 saturation, 7 lightness) → 0xRRGGBB. */
export function jagexHslToRgb(hsl: number, brightness = BRIGHTNESS_MAX): number {
  const hue = ((hsl >> 10) & 63) / 64 + 0.0078125;
  const saturation = ((hsl >> 7) & 7) / 8 + 0.0625;
  const lightness = (hsl & 127) / 128;
  let r = lightness;
  let g = lightness;
  let b = lightness;
  if (saturation !== 0) {
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    const channel = (t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (6 * t < 1) return p + (q - p) * 6 * t;
      if (2 * t < 1) return q;
      if (3 * t < 2) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = channel(hue + 1 / 3);
    g = channel(hue);
    b = channel(hue - 1 / 3);
  }
  const rgb = (adjust(r, brightness) << 16) | (adjust(g, brightness) << 8) | adjust(b, brightness);
  return rgb === 0 ? 1 : rgb; // 0 means "transparent" to the client's rasteriser
}

let palette: Int32Array | null = null;

export function jagexPalette(): Int32Array {
  if (!palette) {
    palette = new Int32Array(65536);
    for (let i = 0; i < 65536; i++) palette[i] = jagexHslToRgb(i);
  }
  return palette;
}

export interface FloorHsl {
  /** Hue pre-multiplied by `hueMultiplier`, as the client accumulates it when blending. */
  hue: number;
  saturation: number;
  lightness: number;
  hueMultiplier: number;
  /** Plain hue on a 0–255 scale, for colours that are not blended (overlays). */
  hue256: number;
}

/** The client's RGB → blend-ready HSL conversion for floor (underlay/overlay) colours. */
export function floorHsl(rgb: number): FloorHsl {
  const r = ((rgb >> 16) & 255) / 256;
  const g = ((rgb >> 8) & 255) / 256;
  const b = (rgb & 255) / 256;
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (min !== max) {
    s = l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
    if (r === max) h = (g - b) / (max - min);
    else if (g === max) h = 2 + (b - r) / (max - min);
    else h = 4 + (r - g) / (max - min);
  }
  h /= 6;
  const hueMultiplier = Math.max(1, Math.floor(l > 0.5 ? s * (1 - l) * 512 : l * s * 512));
  return {
    hue: Math.floor(hueMultiplier * h),
    saturation: Math.min(256, Math.max(0, Math.floor(s * 256))),
    lightness: Math.min(256, Math.max(0, Math.floor(l * 256))),
    hueMultiplier,
    hue256: Math.floor(h * 256) & 255,
  };
}

/** Pack 0–255 hue/saturation/lightness into 16-bit Jagex HSL, desaturating bright colours as the client does. */
export function packHsl(hue: number, saturation: number, lightness: number): number {
  if (lightness > 179) saturation >>= 1;
  if (lightness > 192) saturation >>= 1;
  if (lightness > 217) saturation >>= 1;
  if (lightness > 243) saturation >>= 1;
  return ((hue >> 2) << 10) + ((saturation >> 5) << 7) + (lightness >> 1);
}

/** Scale the lightness of a packed HSL colour by `light`/128, clamped the way the client clamps it. */
export function applyLight(hsl: number, light: number): number {
  const lightness = Math.min(126, Math.max(2, ((hsl & 127) * light) >> 7));
  return (hsl & 0xff80) + lightness;
}
