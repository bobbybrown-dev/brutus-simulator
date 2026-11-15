import { createPaletteCanvas } from './png.ts';
import type { Reader } from './reader.ts';

export class MissingAssetError extends Error {
  constructor(
    readonly kind: string,
    readonly id: number | string,
    detail: string,
  ) {
    super(`${kind} ${id}: ${detail}`);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CacheContext {
  reader: Reader;
  /** Directory of the reader checkout, for the few internals the pipeline reaches into. */
  readerDir: string;
  cache: any;
}

/** Load a config definition, turning "not in this cache" into an error that names the ID. */
export async function loadConfig(ctx: CacheContext, type: 'NPC' | 'ITEM' | 'SEQUENCE' | 'IDENTKIT' | 'SPOTANIM', id: number): Promise<any> {
  const { IndexType, ConfigType } = ctx.reader;
  let def: any;
  try {
    def = await ctx.cache.getDef(IndexType.CONFIGS, ConfigType[type], id);
  } catch (cause) {
    throw new MissingAssetError(type.toLowerCase(), id, `not readable from this cache (${(cause as Error).message})`);
  }
  if (!def) throw new MissingAssetError(type.toLowerCase(), id, 'not present in this cache');
  return def;
}

export async function loadModel(ctx: CacheContext, modelId: number, owner: string): Promise<any> {
  try {
    const model = await ctx.cache.getDef(ctx.reader.IndexType.MODELS, modelId);
    if (!model?.vertexPositionsX?.length) throw new Error('empty model');
    return model;
  } catch (cause) {
    throw new MissingAssetError('model', modelId, `needed by ${owner}, not readable from this cache (${(cause as Error).message})`);
  }
}

/** Apply a definition's recolour pairs (16-bit HSL) to a model's face colours, in place. */
export function recolour(model: any, find: readonly number[] = [], replace: readonly number[] = []): void {
  for (let i = 0; i < find.length; i++) {
    const from = find[i]! & 0xffff;
    for (let f = 0; f < model.faceColors.length; f++) if ((model.faceColors[f] & 0xffff) === from) model.faceColors[f] = replace[i]!;
  }
}

export interface ExportedModel {
  gltf: string;
  vertices: number;
  faces: number;
  /** Clip name → { ticks: duration in game ticks, frames } for every exported sequence. */
  clips: Record<string, { frames: number; seconds: number }>;
}

/**
 * Merge models and bake each sequence into a glTF animation clip named after its sequence ID.
 * The reader bakes animation as morph targets (one per frame, STEP interpolation), which is how
 * the client plays them: frame-exact, no skeleton needed.
 */
export async function exportAnimatedModel(ctx: CacheContext, models: any[], sequenceIds: readonly number[], owner: string): Promise<ExportedModel> {
  const { GLTFExporter, ModelGroup } = ctx.reader;
  const group = new ModelGroup();
  for (const model of models) group.addModel(model);
  const merged = group.getMergedModel();
  const exporter = new GLTFExporter(merged, createPaletteCanvas);
  const clips: ExportedModel['clips'] = {};

  for (const seqId of [...new Set(sequenceIds)]) {
    await loadConfig(ctx, 'SEQUENCE', seqId);
    let applied: any;
    try {
      applied = await merged.loadAnimation(ctx.cache, seqId, false, true);
    } catch (cause) {
      throw new MissingAssetError('sequence', seqId, `frames for ${owner} are not readable from this cache (${(cause as Error).message})`);
    }
    if (!applied?.vertexData?.length) throw new MissingAssetError('sequence', seqId, `has no frames for ${owner}`);
    const targets = applied.vertexData.map((frame: any) => exporter.addMorphTarget(frame));
    exporter.addAnimation(targets, applied.lengths, String(seqId), 'STEP');
    const cycles = applied.lengths.reduce((sum: number, n: number) => sum + n, 0);
    clips[String(seqId)] = { frames: applied.vertexData.length, seconds: cycles / 50 };
  }

  exporter.addColors(merged);
  return { gltf: exporter.export(), vertices: merged.vertexPositionsX.length, faces: merged.faceVertexIndices1.length, clips };
}
