import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';

/** The cache reader this pipeline is tested against. Change the commit deliberately, then re-run the build. */
export const READER_PIN = {
  repo: 'https://github.com/Dezinater/osrscachereader',
  commit: '8dbb297244af6a46c60558632fb55640c5dae284',
} as const;

/**
 * Source fixes applied to the pinned checkout. Each is an exact-text replacement; a patch whose
 * `before` text is missing and whose `after` text is missing too means the pin moved and the patch
 * list needs reviewing, so setup fails rather than guessing.
 */
const PATCHES = [
  {
    file: 'src/cacheReader/cacheTypes/IndexType.js',
    why: 'MusicTrackLoader is imported twice at this commit, which is a syntax error in Node',
    before: "import MusicTrackLoader from '../loaders/MusicTrackLoader.js';\n",
    after: '',
    appliedWhen: (text: string) => (text.match(/import MusicTrackLoader /g) ?? []).length === 1,
  },
  {
    file: 'src/cacheReader/loaders/NpcLoader.js',
    why: 'NPC opcode 97 (width scale) is stored on the loader instead of the definition',
    before: 'this.widthScale = dataview.readUint16();',
    after: 'def.widthScale = dataview.readUint16();',
    appliedWhen: (text: string) => text.includes('def.widthScale = dataview.readUint16();'),
  },
  {
    file: 'src/cacheReader/loaders/ItemLoader.js',
    why: 'item opcode for the holding whitelist reads from an undefined variable, which aborts loading any item',
    before: 'let len = stream.readUint16();',
    after: 'let len = dataview.readUint16();',
    appliedWhen: (text: string) => text.includes('let len = dataview.readUint16();'),
  },
  {
    file: 'src/cacheReader/loaders/ItemLoader.js',
    why: 'same block, second read',
    before: 'def.holdingWhitelist[i] = stream.readUint16();',
    after: 'def.holdingWhitelist[i] = dataview.readUint16();',
    appliedWhen: (text: string) => text.includes('def.holdingWhitelist[i] = dataview.readUint16();'),
  },
];

export class AssetSetupError extends Error {}

const shell = process.platform === 'win32';

function run(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell });
  return result.status === 0;
}

function fetchWithGit(dir: string): boolean {
  mkdirSync(dir, { recursive: true });
  return (
    run('git', ['init', '-q'], dir) &&
    run('git', ['fetch', '-q', '--depth', '1', READER_PIN.repo, READER_PIN.commit], dir) &&
    run('git', ['checkout', '-q', 'FETCH_HEAD'], dir)
  );
}

async function fetchZip(dir: string): Promise<void> {
  const url = `${READER_PIN.repo.replace('https://github.com', 'https://codeload.github.com')}/zip/${READER_PIN.commit}`;
  const response = await fetch(url);
  if (!response.ok) throw new AssetSetupError(`Could not download the cache reader: HTTP ${response.status} from ${url}`);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const root = resolve(dir);
  for (const [name, bytes] of Object.entries(files)) {
    const relative = name.split('/').slice(1).join('/'); // drop the "<repo>-<sha>/" prefix
    if (!relative || name.endsWith('/')) continue;
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep)) throw new AssetSetupError(`Unexpected path in reader archive: ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
}

function applyPatches(dir: string): void {
  for (const patch of PATCHES) {
    const path = join(dir, patch.file);
    const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    if (patch.appliedWhen(text)) continue;
    if (!text.includes(patch.before))
      throw new AssetSetupError(`Reader patch does not apply to ${patch.file} (${patch.why}). The pinned commit may have changed.`);
    writeFileSync(path, text.replace(patch.before, patch.after));
    console.log(`  patched ${patch.file}: ${patch.why}`);
  }
}

/** Make sure the pinned, patched reader checkout exists with its dependencies; returns its directory. */
export async function ensureReader(readerDir: string): Promise<string> {
  const dir = resolve(readerDir);
  const stamp = join(dir, '.brutus-reader.json');
  const wanted = JSON.stringify({ ...READER_PIN, patches: PATCHES.length });
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === wanted) return dir;

  console.log(`Setting up cache reader ${READER_PIN.commit.slice(0, 7)} in ${dir}`);
  rmSync(dir, { recursive: true, force: true });
  if (!fetchWithGit(dir)) {
    console.log('  git fetch failed or git is not installed; downloading the source archive instead');
    rmSync(dir, { recursive: true, force: true });
    await fetchZip(dir);
  }
  applyPatches(dir);
  // lodash is imported by the reader but missing from its package.json at this commit.
  const npm = ['install', '--omit=dev', '--no-audit', '--no-fund'];
  if (!run('npm', npm, dir) || !run('npm', [...npm, '--no-save', 'lodash@4.17.21'], dir))
    throw new AssetSetupError(`npm install failed in ${dir}`);
  writeFileSync(stamp, wanted);
  return dir;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Reader = any;

export async function loadReader(readerDir: string): Promise<Reader> {
  const entry = join(await ensureReader(readerDir), 'src', 'index.js');
  const reader = await import(pathToFileURL(entry).href);
  for (const name of ['RSCache', 'IndexType', 'ConfigType', 'GLTFExporter', 'ModelGroup'])
    if (!reader[name]) throw new AssetSetupError(`Cache reader at ${entry} has no export ${name}`);
  return reader;
}
