import * as THREE from 'three';
import type { BrutusTelegraph } from '../../content/brutus/Brutus.ts';
import type { Tile } from '../../sdk/Location.ts';
import { telegraphTiles } from '../telegraphTiles.ts';
import { footprintCentre } from './coords.ts';
import { FLAT_GROUND, type Ground } from './Ground.ts';

const STOMP_COLOUR = 0xff3b30;
const CHARGE_COLOUR = 0xff9f0a;
const IMPACT_COLOUR = 0xffffff;

/**
 * Ground highlights: where a stomp will land (from the snort to the impact), the lane a charge
 * will sweep, a flash on the tiles a stomp actually hit, and the player's click marker.
 */
export class TelegraphView {
  readonly group = new THREE.Group();
  private readonly pool: THREE.Mesh[] = [];
  private used = 0;
  private flashes: Array<{ tiles: Tile[]; until: number }> = [];
  private marker: { tile: Tile; until: number } | null = null;

  /** `isFloor` keeps highlights inside the arena (a charge can be aimed past a fence). */
  constructor(
    private readonly isFloor: (t: Tile) => boolean,
    private readonly ground: Ground = FLAT_GROUND,
  ) {}

  private tile(t: Tile, colour: number, opacity: number): void {
    let mesh = this.pool[this.used];
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
      );
      mesh.renderOrder = 2;
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    this.used++;
    footprintCentre(t, 1, mesh.position);
    mesh.position.y = this.ground.heightAt(mesh.position.x, mesh.position.z) + 0.06;
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.set(colour);
    material.opacity = opacity;
    mesh.visible = true;
  }

  /** Tiles a stomp's map graphics appeared on this tick. */
  flash(tiles: Tile[], atTick: number): void {
    this.flashes.push({ tiles, until: atTick + 1 });
  }

  markClick(tile: Tile, atTick: number): void {
    this.marker = { tile, until: atTick + 1.5 };
  }

  update(telegraph: BrutusTelegraph | null, tickTime: number): void {
    this.used = 0;
    if (telegraph) {
      // Fill in as the impact approaches, pulsing faster near the end.
      const progress = Math.min(1, Math.max(0, (tickTime - telegraph.startTick) / (telegraph.resolveTick - telegraph.startTick)));
      const pulse = 0.5 + 0.5 * Math.sin(tickTime * Math.PI * (2 + 4 * progress));
      const opacity = 0.25 + 0.45 * progress + 0.15 * pulse;
      const colour = telegraph.kind === 'stomp' ? STOMP_COLOUR : CHARGE_COLOUR;
      for (const t of telegraphTiles(telegraph)) if (this.isFloor(t)) this.tile(t, colour, opacity);
    }
    this.flashes = this.flashes.filter((f) => f.until > tickTime);
    for (const f of this.flashes) for (const t of f.tiles) this.tile(t, IMPACT_COLOUR, 0.8 * (f.until - tickTime));
    if (this.marker && this.marker.until > tickTime) this.tile(this.marker.tile, 0xffe14d, 0.6 * ((this.marker.until - tickTime) / 1.5));
    for (let i = this.used; i < this.pool.length; i++) this.pool[i]!.visible = false;
  }
}
