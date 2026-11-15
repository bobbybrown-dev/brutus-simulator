import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BRUTUS_SIZE, BRUTUS_SPAWN_TILE, BrutusIds } from '../../content/brutus/BrutusConstants.ts';
import type { SimEvent } from '../../sdk/Events.ts';
import type { Tile } from '../../sdk/Location.ts';
import type { TickClock } from '../../sdk/TickClock.ts';
import { computeArenaLayout, type ArenaLayout } from '../arenaLayout.ts';
import type { GameSession } from '../GameSession.ts';
import { ArenaView } from './ArenaView.ts';
import { footprintCentre, tileAt } from './coords.ts';
import { EntityView } from './EntityView.ts';
import type { ModelProvider } from './models.ts';
import { TelegraphView } from './TelegraphView.ts';

interface Projectile {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  firedAt: number;
  landsAt: number;
}

/**
 * The Three.js scene. Reads the session's state and the event stream; never writes game state
 * except by calling the session's intent methods on a click.
 */
export class BrutusView {
  /** Ground clicks walk the player. Clicking Brutus always attacks. */
  clickToMove = true;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly layout: ArenaLayout;
  private readonly floorKeys: Set<string>;
  private readonly arena: ArenaView;
  private readonly telegraphs: TelegraphView;
  private readonly entities = new THREE.Group();
  private player!: EntityView;
  private boss: EntityView | null = null;
  private projectiles: Projectile[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private lastFrame = performance.now();
  private frameHandle = 0;
  private pointerDown: { x: number; y: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly session: GameSession,
    private readonly clock: TickClock,
    private readonly models: ModelProvider,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9fc9e8);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x47603a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
    this.scene.add(sun);

    this.layout = computeArenaLayout(session.collision, BRUTUS_SPAWN_TILE);
    this.floorKeys = new Set(this.layout.floor.map((t) => `${t.x},${t.y}`));
    this.arena = new ArenaView(this.layout);
    this.telegraphs = new TelegraphView((t) => this.floorKeys.has(`${t.x},${t.y}`));
    this.scene.add(this.arena.group, this.telegraphs.group, this.entities);

    const focus = footprintCentre({ x: 3260, y: 3287 }, 3);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(focus.x, 15, focus.z + 13);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(focus);
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 70;
    this.controls.update();

    this.reset();
    this.resize();
    window.addEventListener('resize', this.resize);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointerup', this.onPointerUp);
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  set debugVisible(visible: boolean) {
    this.arena.debug.visible = visible;
  }

  /** Rebuild the entities after the session was reset. */
  reset(): void {
    this.player?.dispose();
    this.boss?.dispose();
    this.entities.clear();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    this.boss = null;
    this.player = new EntityView(this.models.createPlayer(), 1, 1.8, this.session.player.location);
    this.entities.add(this.player.group);
  }

  /** Feed one tick's events. Call right after `session.tick()`. */
  onTick(events: readonly SimEvent[]): void {
    const tick = this.session.world.tick;
    const stompTiles: Tile[] = [];
    for (const e of events) {
      switch (e.type) {
        case 'npc_spawn':
          this.boss?.dispose();
          if (this.boss) this.entities.remove(this.boss.group);
          this.boss = new EntityView(this.models.createNpc(e.npcId, BRUTUS_SIZE), BRUTUS_SIZE, 2.2, e.at);
          this.entities.add(this.boss.group);
          break;
        case 'npc_despawn':
          if (this.boss) this.boss.visible = false;
          break;
        case 'npc_move':
          this.boss?.moveTo(e.to, tick);
          break;
        case 'npc_exact_move':
          // 60 client cycles = 2 ticks, whatever the distance.
          this.boss?.moveTo(e.to, tick, e.delay2 / 30);
          break;
        case 'npc_seq':
          this.boss?.playSequence(e.seq);
          break;
        case 'npc_say':
          this.boss?.say(e.text, tick);
          break;
        case 'map_anim':
          if (e.spotanim === BrutusIds.SPOTANIM_STOMP_TILE) stompTiles.push(e.at);
          break;
        case 'hitsplat':
          (e.target === 'player' ? this.player : this.boss)?.hitsplat(e.damage, tick);
          break;
        case 'player_attack':
          this.fireProjectile(tick, e.landTick);
          break;
        default:
          break;
      }
    }
    if (stompTiles.length > 0) this.telegraphs.flash(stompTiles, tick);

    this.player.moveTo(this.session.player.location, tick);
    this.player.setHealth(this.session.player.hitpoints / this.session.player.maxHitpoints);

    const boss = this.session.boss;
    if (boss && this.boss) {
      this.boss.setHealth(boss.hitpoints / boss.maxHitpoints);
      const telegraph = boss.telegraph;
      if (telegraph) {
        const d = boss.lockedDirection;
        const centre = footprintCentre(boss.location, BRUTUS_SIZE);
        this.boss.face(new THREE.Vector3(centre.x + 5 * d.dx, 0, centre.z - 5 * d.dy));
      } else if (boss.alive && boss.phase !== 'charge') {
        this.boss.face(footprintCentre(this.session.player.location));
      }
      if (this.session.player.target === boss) this.player.face(footprintCentre(boss.location, BRUTUS_SIZE));
    }
  }

  private fireProjectile(tick: number, landTick: number): void {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xe8e2cf }));
    this.scene.add(mesh);
    // The hitsplat is applied the tick after the arrow arrives.
    this.projectiles.push({ mesh, from: this.player.scenePosition.clone().setY(1.2), firedAt: tick, landsAt: landTick - 1 });
  }

  private readonly frame = (now: number): void => {
    this.frameHandle = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const tickTime = this.session.world.tick + this.clock.alpha;

    this.player.setProtectMelee(this.session.protectFromMelee);
    this.player.update(tickTime, dt);
    this.boss?.update(tickTime, dt);
    this.telegraphs.update(this.session.boss?.telegraph ?? null, tickTime);

    this.projectiles = this.projectiles.filter((p) => {
      const t = (tickTime - p.firedAt) / Math.max(1, p.landsAt - p.firedAt);
      if (t >= 1 || !this.boss) {
        this.scene.remove(p.mesh);
        return false;
      }
      p.mesh.position.lerpVectors(p.from, this.boss.scenePosition.clone().setY(1.1), t);
      return true;
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    // A drag is the camera, not a click.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    if (this.boss && this.boss.group.visible && this.session.boss?.alive) {
      if (this.raycaster.intersectObject(this.boss.group, true).length > 0) {
        this.session.attackBoss();
        return;
      }
    }
    if (!this.clickToMove) return;
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, point)) return;
    const tile = tileAt(point);
    if (!this.floorKeys.has(`${tile.x},${tile.y}`)) return;
    this.session.moveTo(tile);
    this.telegraphs.markClick(tile, this.session.world.tick + this.clock.alpha);
  };

  private readonly resize = (): void => {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
