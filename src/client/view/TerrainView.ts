import * as THREE from 'three';
import type { TerrainData } from '../../assetBundle/manifest.ts';
import type { Tile } from '../../sdk/Location.ts';
import { SCENE_ORIGIN } from './coords.ts';
import type { Ground } from './Ground.ts';

/**
 * Ground mesh from the cache terrain: real heights, the client's blended underlay colours at each
 * tile corner, and overlays (paths, water) on top. Overlay tiles are drawn as whole tiles; the
 * client's partial-tile overlay shapes are in the data (`overlayShape`) but not rendered yet.
 */
export class TerrainView implements Ground {
  readonly group = new THREE.Group();
  private readonly base: number;

  constructor(
    private readonly data: TerrainData,
    /** Tile whose ground height becomes y = 0, so the fight stays around the scene origin. */
    reference: Tile,
    textureUrl: (textureId: number) => string | null,
  ) {
    this.base = this.vertexHeight(reference.x - data.origin.x, reference.y - data.origin.y);
    const coloured = { position: [] as number[], colour: [] as number[] };
    const textured = new Map<number, { position: number[]; uv: number[] }>();
    const c = new THREE.Color();
    const pushColour = (rgb: number): void => {
      c.setHex(rgb, THREE.SRGBColorSpace);
      coloured.colour.push(c.r, c.g, c.b);
    };

    for (let ty = 0; ty < data.height; ty++)
      for (let tx = 0; tx < data.width; tx++) {
        const corners = [[tx, ty], [tx + 1, ty], [tx + 1, ty + 1], [tx, ty + 1]] as const;
        const points = corners.map(([vx, vy]) => [vx + data.origin.x - SCENE_ORIGIN.x, this.vertexHeight(vx, vy) - this.base, -(vy + data.origin.y - SCENE_ORIGIN.y)]);
        const index = tx + ty * data.width;
        const texture = data.overlayTexture[index]!;
        const overlay = data.overlay[index]!;
        const own = data.underlay[tx + ty * (data.width + 1)]!;
        const order = [0, 1, 2, 0, 2, 3];
        if (texture >= 0 && textureUrl(texture)) {
          const mesh = textured.get(texture) ?? { position: [], uv: [] };
          textured.set(texture, mesh);
          const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
          for (const i of order) mesh.position.push(...points[i]!), mesh.uv.push(...uvs[i]!);
        } else if (overlay >= 0 || own >= 0) {
          for (const i of order) {
            coloured.position.push(...points[i]!);
            const corner = data.underlay[corners[i]![0] + corners[i]![1] * (data.width + 1)]!;
            pushColour(overlay >= 0 ? overlay : corner >= 0 ? corner : own);
          }
        }
      }

    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(coloured.position, 3));
    ground.setAttribute('color', new THREE.Float32BufferAttribute(coloured.colour, 3));
    // The cache colours already carry the game's ground lighting; a uniform up normal keeps them even
    // while still receiving shadows.
    ground.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(coloured.position.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const mesh = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const loader = new THREE.TextureLoader();
    for (const [textureId, parts] of textured) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.position, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(parts.uv, 2));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(parts.position.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      const map = loader.load(textureUrl(textureId)!);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.NearestFilter;
      const texturedMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 1 }));
      texturedMesh.receiveShadow = true;
      this.group.add(texturedMesh);
    }
  }

  private vertexHeight(vx: number, vy: number): number {
    const x = Math.min(this.data.width, Math.max(0, vx));
    const y = Math.min(this.data.height, Math.max(0, vy));
    return this.data.heights[x + y * (this.data.width + 1)]!;
  }

  /** Bilinear height at a scene position; 0 outside the terrain. */
  heightAt(x: number, z: number): number {
    const fx = x + SCENE_ORIGIN.x - this.data.origin.x;
    const fy = -z + SCENE_ORIGIN.y - this.data.origin.y;
    if (fx < 0 || fy < 0 || fx > this.data.width || fy > this.data.height) return 0;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    const h = (dx: number, dy: number): number => this.vertexHeight(x0 + dx, y0 + dy);
    return h(0, 0) * (1 - u) * (1 - v) + h(1, 0) * u * (1 - v) + h(0, 1) * (1 - u) * v + h(1, 1) * u * v - this.base;
  }
}
