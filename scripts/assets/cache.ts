import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { unzipSync } from 'fflate';
import { AssetSetupError } from './reader.ts';

export interface CacheSource {
  /** Candidate folders holding main_file_cache.dat2; the first that exists is used. */
  local?: string | readonly string[];
  /** A pinned OpenRS2 cache ID. */
  openrs2?: number;
}

export interface ResolvedCache {
  /** Folder with main_file_cache.dat2 and the index files, with a trailing separator (the reader concatenates). */
  dir: string;
  source: string;
  /** Hash of the master index and data-file size: identifies the cache build the bundle came from. */
  fingerprint: string;
}

const hasCache = (dir: string): boolean => existsSync(join(dir, 'main_file_cache.dat2')) && existsSync(join(dir, 'main_file_cache.idx255'));

function describe(dir: string, source: string): ResolvedCache {
  const hash = createHash('sha256').update(readFileSync(join(dir, 'main_file_cache.idx255')));
  hash.update(String(statSync(join(dir, 'main_file_cache.dat2')).size));
  for (const name of readdirSync(dir).filter((n) => /^main_file_cache\.idx\d+$/.test(n)).sort()) hash.update(`${name}:${statSync(join(dir, name)).size}`);
  return { dir: resolve(dir) + sep, source, fingerprint: hash.digest('hex').slice(0, 16) };
}

async function downloadOpenRs2(id: number, workDir: string): Promise<string> {
  if (!Number.isSafeInteger(id) || id < 1) throw new AssetSetupError('cache.openrs2 must be a positive OpenRS2 cache ID');
  const root = resolve(workDir, 'openrs2', String(id));
  const cacheDir = join(root, 'cache');
  if (hasCache(cacheDir)) return cacheDir;
  const url = `https://archive.openrs2.org/caches/runescape/${id}/disk.zip`;
  console.log(`Downloading OpenRS2 cache ${id} (several hundred MB) from ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new AssetSetupError(`OpenRS2 cache ${id}: HTTP ${response.status} from ${url}`);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const target = resolve(root, name);
    if (!name.startsWith('cache/') || !target.startsWith(root + sep)) throw new AssetSetupError(`Unexpected path in OpenRS2 archive: ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  if (!hasCache(cacheDir)) throw new AssetSetupError(`OpenRS2 cache ${id} did not contain main_file_cache.dat2`);
  return cacheDir;
}

export async function resolveCache(source: CacheSource, workDir: string): Promise<ResolvedCache> {
  if (source.openrs2 !== undefined) return describe(await downloadOpenRs2(source.openrs2, workDir), `openrs2:${source.openrs2}`);
  const candidates = source.local === undefined ? [] : typeof source.local === 'string' ? [source.local] : [...source.local];
  const found = candidates.find(hasCache);
  if (!found)
    throw new AssetSetupError(
      `No OSRS cache found. Looked for main_file_cache.dat2 in:\n${candidates.map((c) => `  ${c}`).join('\n') || '  (no folders configured)'}\n` +
        'Start RuneLite once so it downloads the cache, pass --cache-dir <folder>, or pass --openrs2 <id>.',
    );
  return describe(found, `local:${resolve(found)}`);
}
