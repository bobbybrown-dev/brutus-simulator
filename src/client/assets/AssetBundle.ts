import type { AssetManifest, TerrainData } from '../../assetBundle/manifest.ts';
import { MANIFEST_SCHEMA, spriteKey } from '../../assetBundle/manifest.ts';

/**
 * The cache-asset bundle served next to the page (osrs-assets/). `load` resolves to null when no
 * bundle is deployed, and the client then runs on placeholders.
 */
export class AssetBundle {
  private constructor(
    private readonly baseUrl: string,
    readonly manifest: AssetManifest,
  ) {}

  static async load(baseUrl = new URL('osrs-assets/', document.baseURI).href): Promise<AssetBundle | null> {
    try {
      const response = await fetch(`${baseUrl}manifest.json`, { cache: 'no-cache' });
      if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
      const manifest = (await response.json()) as AssetManifest;
      if (manifest.schema !== MANIFEST_SCHEMA) {
        console.warn(`osrs-assets manifest has schema ${manifest.schema}, expected ${MANIFEST_SCHEMA}; ignoring the bundle`);
        return null;
      }
      return new AssetBundle(baseUrl, manifest);
    } catch {
      return null;
    }
  }

  /** URL of a bundle file; the hash makes a rebuilt file bypass the browser cache. */
  url(asset: { file: string; sha256: string }): string {
    return `${this.baseUrl}${asset.file}?v=${asset.sha256.slice(0, 8)}`;
  }

  /** `large` picks the higher-resolution render, for interfaces drawn bigger than the game's native size. */
  itemIcon(itemId: number, large = false): string | null {
    const asset = this.manifest.items[String(itemId)];
    return asset ? this.url(large ? asset.hires : asset) : null;
  }

  sprite(id: number, frame = 0): string | null {
    const asset = this.manifest.sprites[spriteKey({ id, frame })];
    return asset ? this.url(asset) : null;
  }

  texture(id: number): string | null {
    const asset = this.manifest.textures?.[String(id)];
    return asset ? this.url(asset) : null;
  }

  sound(id: number): string | null {
    const asset = this.manifest.sounds[String(id)];
    return asset ? this.url(asset) : null;
  }

  async terrain(name: string): Promise<TerrainData | null> {
    const asset = this.manifest.terrain[name];
    if (!asset) return null;
    const response = await fetch(this.url(asset));
    return response.ok ? ((await response.json()) as TerrainData) : null;
  }
}
