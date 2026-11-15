import { homedir } from 'node:os';
import { join } from 'node:path';
import { BRUTUS_ASSETS } from './src/assets.ts';
import type { AssetConfig } from './scripts/assets/build.ts';

/**
 * Where `npm run assets` reads the OSRS cache from and where it writes the bundle.
 *
 * cache.local   A folder holding main_file_cache.dat2 and the .idx files. The default is RuneLite's
 *               live cache, which already contains everything you have seen in game. First match wins.
 * cache.openrs2 A pinned OpenRS2 archive ID (https://archive.openrs2.org/caches), downloaded once
 *               into .cache-render/. Use this for repeatable builds on a machine without the game.
 *
 * Command-line overrides: `npm run assets -- --cache-dir <folder>` or `-- --openrs2 <id>`.
 */
const config: AssetConfig = {
  cache: {
    local: [join(homedir(), '.runelite', 'jagexcache', 'oldschool', 'LIVE'), join(homedir(), 'jagexcache', 'oldschool', 'LIVE')],
  },
  assets: BRUTUS_ASSETS,
  outDir: 'public/osrs-assets',
  workDir: '.cache-render',
};

export default config;
