import { type CacheContext, MissingAssetError } from './models.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SAMPLE_RATE = 22050;

/** Synthesise a sound effect with the reader and wrap the 8-bit samples as a mono WAV file. */
export async function extractSound(ctx: CacheContext, id: number): Promise<{ wav: Buffer; seconds: number }> {
  let samples: ArrayLike<number> | undefined;
  try {
    const def: any = await ctx.cache.getDef(ctx.reader.IndexType.SOUNDEFFECTS, id);
    samples = def?.mix?.();
  } catch (cause) {
    throw new MissingAssetError('sound', id, `not readable from this cache (${(cause as Error).message})`);
  }
  if (!samples?.length) throw new MissingAssetError('sound', id, 'synthesised to no samples');
  const wav = Buffer.alloc(44 + samples.length);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + samples.length, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(samples.length, 40);
  for (let i = 0; i < samples.length; i++) wav[44 + i] = ((samples[i]! << 24) >> 24) + 128; // signed → unsigned 8-bit
  return { wav, seconds: samples.length / SAMPLE_RATE };
}
