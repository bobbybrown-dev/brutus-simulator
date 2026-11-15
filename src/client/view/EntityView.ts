import * as THREE from 'three';
import type { Tile } from '../../sdk/Location.ts';
import { footprintCentre } from './coords.ts';
import type { EntityModel } from './models.ts';
import { FLAT_GROUND, type Ground } from './Ground.ts';
import { CanvasSprite, drawHealthBar, drawHitsplat, drawProtectMelee, drawText } from './sprites.ts';

interface Motion {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Tick (fractional) at which the move starts and how many ticks it takes. */
  start: number;
  ticks: number;
  /** Tiles per tick of the current glide; 0 when standing. */
  speed: number;
}

interface FloatingSplat {
  sprite: CanvasSprite;
  bornAt: number;
  slot: number;
}

const SPLAT_LIFETIME_TICKS = 2;
const OVERHEAD_TEXT_TICKS = 5;

/**
 * One entity on screen: its model plus everything that floats over it. The engine moves entities
 * a whole tile (or more) per tick; this glides between those positions and eases the facing.
 */
export class EntityView {
  readonly group = new THREE.Group();
  private readonly motion: Motion;
  private targetYaw = 0;
  private readonly healthBar: CanvasSprite;
  private readonly text: CanvasSprite;
  private readonly prayer: CanvasSprite;
  private textUntil = -1;
  private splats: FloatingSplat[] = [];
  private lastFraction = -1;

  constructor(
    private readonly model: EntityModel,
    private readonly size: number,
    private readonly height: number,
    start: Tile,
    private readonly ground: Ground = FLAT_GROUND,
    prayerIcon: string | null = null,
  ) {
    const at = footprintCentre(start, size);
    this.motion = { from: at.clone(), to: at.clone(), start: 0, ticks: 1, speed: 0 };
    this.group.position.copy(at);
    this.group.add(model.object);

    this.healthBar = new CanvasSprite(128, 16, 0.14 * Math.max(1, size * 0.6));
    this.healthBar.sprite.position.y = height + 0.25;
    this.text = new CanvasSprite(512, 96, 0.55);
    this.text.sprite.position.y = height + 0.75;
    this.text.sprite.visible = false;
    this.prayer = new CanvasSprite(96, 96, 0.45);
    this.prayer.sprite.position.y = height + 0.7;
    this.prayer.sprite.visible = false;
    if (prayerIcon) this.prayer.drawImage(prayerIcon);
    else this.prayer.draw(drawProtectMelee);
    this.group.add(this.healthBar.sprite, this.text.sprite, this.prayer.sprite);
    this.setHealth(1);
  }

  /** Called once per tick with the entity's new SW tile. `ticks` > 1 for a multi-tick slide. */
  moveTo(sw: Tile, atTick: number, ticks = 1): void {
    this.motion.from.copy(this.group.position);
    footprintCentre(sw, this.size, this.motion.to);
    this.motion.start = atTick;
    this.motion.ticks = ticks;
    this.motion.from.y = this.motion.to.y = 0;
    const dx = this.motion.to.x - this.motion.from.x;
    const dz = this.motion.to.z - this.motion.from.z;
    this.motion.speed = Math.max(Math.abs(dx), Math.abs(dz)) / ticks;
    if (Math.abs(dx) + Math.abs(dz) > 1e-6) this.targetYaw = Math.atan2(dx, dz);
  }

  /** Jump straight to a tile with no glide (spawns, resets). */
  snapTo(sw: Tile): void {
    footprintCentre(sw, this.size, this.motion.to);
    this.motion.from.copy(this.motion.to);
    this.motion.speed = 0;
    this.group.position.copy(this.motion.to);
  }

  /** Turn to look at a point on the ground (scene coordinates). */
  face(point: THREE.Vector3): void {
    const dx = point.x - this.motion.to.x;
    const dz = point.z - this.motion.to.z;
    if (Math.abs(dx) + Math.abs(dz) > 1e-6) this.targetYaw = Math.atan2(dx, dz);
  }

  get scenePosition(): THREE.Vector3 {
    return this.group.position;
  }

  playSequence(id: number): void {
    this.model.playSequence(id);
  }

  setHealth(fraction: number): void {
    if (fraction === this.lastFraction) return;
    this.lastFraction = fraction;
    this.healthBar.draw((ctx, w, h) => drawHealthBar(ctx, w, h, fraction));
  }

  say(text: string, atTick: number): void {
    this.text.draw((ctx, w, h) => drawText(ctx, w, h, text, '#ffff00'));
    this.text.sprite.visible = true;
    this.textUntil = atTick + OVERHEAD_TEXT_TICKS;
  }

  setProtectMelee(on: boolean): void {
    this.prayer.sprite.visible = on;
  }

  hitsplat(damage: number, atTick: number): void {
    const sprite = new CanvasSprite(96, 96, 0.5);
    sprite.draw((ctx, w, h) => drawHitsplat(ctx, w, h, damage));
    const slot = this.splats.length % 3;
    this.group.add(sprite.sprite);
    this.splats.push({ sprite, bornAt: atTick, slot });
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  /** Per frame. `tickTime` is the current tick plus the fraction elapsed toward the next. */
  update(tickTime: number, dt: number): void {
    const t = Math.min(1, Math.max(0, (tickTime - this.motion.start) / this.motion.ticks));
    this.group.position.lerpVectors(this.motion.from, this.motion.to, t);
    this.group.position.y = this.ground.heightAt(this.group.position.x, this.group.position.z);
    this.model.setLocomotion?.(t < 1 && this.motion.speed > 0 ? (this.motion.speed > 1.5 ? 'run' : 'walk') : 'idle');

    let delta = this.targetYaw - this.model.object.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.model.object.rotation.y += delta * Math.min(1, dt * 12);
    this.model.update(dt);

    if (this.text.sprite.visible && tickTime >= this.textUntil) this.text.sprite.visible = false;
    this.splats = this.splats.filter((s) => {
      const age = (tickTime - s.bornAt) / SPLAT_LIFETIME_TICKS;
      if (age >= 1) {
        this.group.remove(s.sprite.sprite);
        s.sprite.dispose();
        return false;
      }
      s.sprite.sprite.position.set((s.slot - 1) * 0.45, this.height * 0.55 + age * 0.5, 0);
      s.sprite.sprite.material.opacity = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;
      return true;
    });
  }

  dispose(): void {
    this.model.dispose();
    this.healthBar.dispose();
    this.text.dispose();
    this.prayer.dispose();
    for (const s of this.splats) s.sprite.dispose();
  }
}
