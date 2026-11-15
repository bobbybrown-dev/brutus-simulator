import { createHash } from 'node:crypto';
import type { CacheAssets } from './manifest.ts';

/** Stable hash of the requirements (Node-only), so a stale bundle is detected without re-extracting. */
export function hashRequirements(assets: CacheAssets): string {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]))
        : value;
  return createHash('sha256').update(JSON.stringify(stable(assets))).digest('hex').slice(0, 16);
}
