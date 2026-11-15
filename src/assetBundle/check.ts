/**
 * Node-only gate for builds: compares public/osrs-assets with the requirements in src/assets.ts and
 * exits non-zero with one line per problem. Run by `npm run build` before bundling, and on its own
 * as `npm run assets:check`.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hashRequirements } from './requirementsHash.ts';
import { BRUTUS_ASSETS } from '../assets.ts';
import { type AssetManifest, type BundleProblem, checkBundle } from './manifest.ts';

export function checkBundleOnDisk(bundleDir: string): BundleProblem[] {
  const manifestPath = join(bundleDir, 'manifest.json');
  let manifest: AssetManifest | null = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest;
    } catch {
      return [{ message: `${manifestPath} is not valid JSON.`, fix: 'Run `npm run assets`.' }];
    }
  }
  return checkBundle(BRUTUS_ASSETS, hashRequirements(BRUTUS_ASSETS), manifest, (file) => {
    const path = join(bundleDir, file);
    if (!existsSync(path)) return null;
    const bytes = readFileSync(path);
    return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const problems = checkBundleOnDisk(join(root, 'public', 'osrs-assets'));
  if (problems.length === 0) {
    console.log('Asset bundle OK: every required model, animation, icon, sprite, terrain file and sound is present.');
  } else {
    console.error(`\nAsset bundle check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
    for (const p of problems.slice(0, 25)) console.error(`  - ${p.message}\n    ${p.fix}`);
    if (problems.length > 25) console.error(`  … and ${problems.length - 25} more.`);
    console.error('');
    process.exit(1);
  }
}
