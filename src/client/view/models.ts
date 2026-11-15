import * as THREE from 'three';
import { PLAYER_SEQUENCES } from '../../assets.ts';
import type { AssetBundle } from '../assets/AssetBundle.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BrutusIds } from '../../content/brutus/BrutusConstants.ts';

/**
 * What the renderer needs from an entity's visual, whatever it is made of. Models are built
 * facing +z, standing on y = 0, centred on their footprint.
 */
export type Locomotion = 'idle' | 'walk' | 'run';

export interface EntityModel {
  readonly object: THREE.Object3D;
  /** Start an animation by OSRS sequence id (13783 attack, 13785 stomp, …). Unknown ids are ignored. */
  playSequence(sequenceId: number): void;
  /** Tell the model whether the entity is standing, walking or running, for its looping animation. */
  setLocomotion?(state: Locomotion): void;
  /** Advance animations by `dt` seconds of real time. */
  update(dt: number): void;
  dispose(): void;
}

export interface ModelProvider {
  createPlayer(): EntityModel;
  createNpc(npcId: number, size: number): EntityModel;
}

// ── Placeholders ───────────────────────────────────────────────────────────

const box = (w: number, h: number, d: number, colour: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.85 }));
  mesh.castShadow = true;
  return mesh;
};

/** How long each placeholder animation runs, in seconds, and what it does to the body. */
const PLACEHOLDER_ANIMATIONS: Record<number, { seconds: number; pose: (body: THREE.Object3D, t: number) => void }> = {
  [BrutusIds.SEQ_SPAWN]: { seconds: 1.2, pose: (b, t) => b.scale.setScalar(0.2 + 0.8 * t) },
  [BrutusIds.SEQ_ATTACK]: { seconds: 0.6, pose: (b, t) => { b.position.z = 0.5 * Math.sin(Math.PI * t); } },
  [BrutusIds.SEQ_STOMP]: { seconds: 2.4, pose: (b, t) => { b.position.y = t < 0.85 ? 0.9 * Math.sin((Math.PI * t) / 0.85) : 0; b.scale.y = t > 0.85 ? 0.8 : 1; } },
  [BrutusIds.SEQ_CHARGE]: { seconds: 2.4, pose: (b, t) => { b.rotation.x = 0.25 * Math.min(1, t * 2); b.position.z = -0.3 * Math.min(1, t * 2); } },
  [BrutusIds.SEQ_DEATH]: { seconds: 2.4, pose: (b, t) => { b.rotation.z = (Math.PI / 2) * Math.min(1, t * 1.5); b.position.y = -0.4 * Math.min(1, t * 1.5); } },
};

class PlaceholderModel implements EntityModel {
  readonly object = new THREE.Group();
  private readonly body = new THREE.Group();
  private playing: { id: number; elapsed: number } | null = null;

  constructor(parts: THREE.Object3D[]) {
    this.body.add(...parts);
    this.object.add(this.body);
  }

  playSequence(sequenceId: number): void {
    if (PLACEHOLDER_ANIMATIONS[sequenceId]) this.playing = { id: sequenceId, elapsed: 0 };
  }

  update(dt: number): void {
    if (!this.playing) return;
    const animation = PLACEHOLDER_ANIMATIONS[this.playing.id]!;
    this.playing.elapsed += dt;
    const t = Math.min(1, this.playing.elapsed / animation.seconds);
    this.resetPose();
    animation.pose(this.body, t);
    // Death holds its last frame; everything else returns to rest.
    if (t >= 1 && this.playing.id !== BrutusIds.SEQ_DEATH) {
      this.playing = null;
      this.resetPose();
    }
  }

  private resetPose(): void {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
  }

  dispose(): void {
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/** Boxes: enough to read position, footprint and facing. */
export class PlaceholderModelProvider implements ModelProvider {
  createPlayer(): EntityModel {
    const torso = box(0.5, 1.0, 0.3, 0x3b6fd4);
    torso.position.y = 0.9;
    const head = box(0.32, 0.32, 0.32, 0xe0b48c);
    head.position.y = 1.6;
    const nose = box(0.1, 0.1, 0.2, 0xffffff);
    nose.position.set(0, 1.6, 0.25);
    const legs = box(0.4, 0.4, 0.25, 0x2a2a35);
    legs.position.y = 0.2;
    return new PlaceholderModel([torso, head, nose, legs]);
  }

  createNpc(_npcId: number, size: number): EntityModel {
    const s = size;
    const body = box(s * 0.62, s * 0.5, s * 0.86, 0x6b3f22);
    body.position.y = s * 0.42;
    const head = box(s * 0.36, s * 0.32, s * 0.3, 0x4f2d17);
    head.position.set(0, s * 0.5, s * 0.5);
    const hornL = box(s * 0.07, s * 0.07, s * 0.26, 0xf0e6d0);
    hornL.position.set(s * 0.2, s * 0.68, s * 0.56);
    const hornR = hornL.clone();
    hornR.position.x = -s * 0.2;
    const legs = [-1, 1].flatMap((x) => [-1, 1].map((z) => {
      const leg = box(s * 0.12, s * 0.2, s * 0.12, 0x3a2414);
      leg.position.set(x * s * 0.22, s * 0.1, z * s * 0.3);
      return leg;
    }));
    return new PlaceholderModel([body, head, hornL, hornR, ...legs]);
  }
}

// ── glTF ───────────────────────────────────────────────────────────────────

export interface GltfAsset {
  /** URL of a .glb / .gltf exported from the cache (e.g. with RuneLite's model exporter). */
  url: string;
  /** Scale that makes one tile one unit (OSRS model units are 128 per tile); [x, y, z] for NPCs with separate width and height scales. */
  scale?: number | readonly [number, number, number];
  /** Extra yaw in radians if the export does not face +z. */
  yaw?: number;
  /** OSRS sequence id → name of the animation clip inside the file. A sequence not listed here is looked up by its ID as the clip name. */
  clips: Record<number, string>;
  /** Clips to loop while walking / running. */
  walkClip?: string;
  runClip?: string;
  /** Sequences that hold their last frame instead of returning to idle (death). */
  hold?: readonly number[];
  /** Clip to loop when nothing else is playing. */
  idleClip?: string;
}

export interface GltfManifest {
  player?: GltfAsset;
  npcs: Record<number, GltfAsset>;
}

/**
 * Real models. Each entity starts as its placeholder and swaps to the glTF scene when the file
 * arrives, so a missing or broken asset degrades to boxes instead of an empty scene.
 * Tested with the glTF files `npm run assets` writes (morph-target animation, one clip per sequence ID).
 */
export class GltfModelProvider implements ModelProvider {
  private readonly loader = new GLTFLoader();

  constructor(
    private readonly manifest: GltfManifest,
    private readonly fallback: ModelProvider = new PlaceholderModelProvider(),
  ) {}

  createPlayer(): EntityModel {
    const placeholder = this.fallback.createPlayer();
    return this.manifest.player ? new GltfModel(this.loader, this.manifest.player, placeholder) : placeholder;
  }

  createNpc(npcId: number, size: number): EntityModel {
    const placeholder = this.fallback.createNpc(npcId, size);
    const asset = this.manifest.npcs[npcId];
    return asset ? new GltfModel(this.loader, asset, placeholder) : placeholder;
  }
}

class GltfModel implements EntityModel {
  readonly object = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private current: THREE.AnimationAction | null = null;
  private locomotion: Locomotion = 'idle';
  private oneShot = false;
  private holding = false;

  constructor(loader: GLTFLoader, private readonly asset: GltfAsset, private placeholder: EntityModel | null) {
    this.object.add(placeholder!.object);
    loader.load(
      asset.url,
      (gltf) => {
        const scale = asset.scale ?? 1 / 128;
        if (typeof scale === 'number') gltf.scene.scale.setScalar(scale);
        else gltf.scene.scale.set(scale[0], scale[1], scale[2]);
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.frustumCulled = false; // morph targets move vertices outside the rest-pose bounds
          const material = mesh.material as THREE.MeshStandardMaterial;
          // The export has no normals, which three renders faceted. The game shades smoothly, so
          // compute rest-pose normals; they are not re-derived per animation frame.
          if (!mesh.geometry.getAttribute('normal')) {
            mesh.geometry.computeVertexNormals();
            material.flatShading = false;
            material.needsUpdate = true;
          }
          material.roughness = 1;
          material.metalness = 0;
          const map = material.map;
          if (map) map.magFilter = map.minFilter = THREE.NearestFilter; // the texture is a colour palette
        });
        gltf.scene.rotation.y = asset.yaw ?? 0;
        this.object.remove(this.placeholder!.object);
        this.placeholder!.dispose();
        this.placeholder = null;
        this.object.add(gltf.scene);
        this.mixer = new THREE.AnimationMixer(gltf.scene);
        for (const clip of gltf.animations) this.clips.set(clip.name, clip);
        this.mixer.addEventListener('finished', () => {
          if (this.holding) return;
          this.oneShot = false;
          this.playLoop();
        });
        this.playLoop();
      },
      undefined,
      (error) => console.warn(`model ${asset.url} failed to load; keeping the placeholder`, error),
    );
  }

  playSequence(sequenceId: number): void {
    if (this.placeholder) return this.placeholder.playSequence(sequenceId);
    const name = this.asset.clips[sequenceId] ?? String(sequenceId);
    if (!this.clips.has(name)) return;
    this.oneShot = true;
    this.holding = this.asset.hold?.includes(sequenceId) ?? false;
    this.play(name, false);
  }

  setLocomotion(state: Locomotion): void {
    if (this.placeholder) return this.placeholder.setLocomotion?.(state);
    if (state === this.locomotion) return;
    this.locomotion = state;
    if (!this.oneShot) this.playLoop();
  }

  private playLoop(): void {
    const name = (this.locomotion === 'run' ? (this.asset.runClip ?? this.asset.walkClip) : this.locomotion === 'walk' ? this.asset.walkClip : undefined) ?? this.asset.idleClip;
    if (name) this.play(name, true);
  }

  private play(name: string, loop: boolean): void {
    const clip = this.clips.get(name);
    if (!clip || !this.mixer) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = true;
    // Frames are baked morph targets: cut between clips instead of blending two poses.
    if (this.current && this.current !== action) this.current.stop();
    action.play();
    this.current = action;
  }

  update(dt: number): void {
    this.placeholder?.update(dt);
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.placeholder?.dispose();
    this.mixer?.stopAllAction();
  }
}

/** Model manifest for the bundle `npm run assets` writes: clips are named by sequence ID. */
export function cacheModelManifest(bundle: AssetBundle, holdSequences: readonly number[] = []): GltfManifest {
  const manifest: GltfManifest = { npcs: {} };
  for (const [id, npc] of Object.entries(bundle.manifest.npcs)) {
    const width = npc.widthScale / 128 / 128;
    manifest.npcs[Number(id)] = {
      url: bundle.url(npc),
      scale: [width, npc.heightScale / 128 / 128, width],
      clips: {},
      idleClip: String(npc.idleSequence),
      walkClip: String(npc.walkSequence),
      hold: holdSequences,
    };
  }
  const player = bundle.manifest.player;
  if (player)
    manifest.player = {
      url: bundle.url(player),
      clips: {},
      idleClip: String(PLAYER_SEQUENCES.idle),
      walkClip: String(PLAYER_SEQUENCES.walk),
      runClip: String(PLAYER_SEQUENCES.run),
      hold: [PLAYER_SEQUENCES.death, ...holdSequences],
    };
  return manifest;
}
