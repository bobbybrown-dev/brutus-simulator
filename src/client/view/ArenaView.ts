import * as THREE from 'three';
import type { ArenaLayout, FenceSegment } from '../arenaLayout.ts';
import { footprintCentre, SCENE_ORIGIN } from './coords.ts';

const FENCE_HEIGHT = 0.7;

/** Static scenery built from the collision-derived layout: grass, fences, gates, solids, seam. */
export class ArenaView {
  readonly group = new THREE.Group();
  /** Grid lines and the region seam; toggled from the HUD. */
  readonly debug = new THREE.Group();

  constructor(layout: ArenaLayout) {
    this.group.add(this.buildSurround(layout), this.buildFloor(layout), this.buildFences(layout), this.buildSolids(layout), this.debug);
    this.debug.add(this.buildGrid(layout));
    if (layout.seamX !== null) this.debug.add(this.buildSeam(layout, layout.seamX));
  }

  /** Plain ground outside the fences so the field does not float in the sky. */
  private buildSurround(layout: ArenaLayout): THREE.Object3D {
    const { minX, maxX, minY, maxY } = layout.bounds;
    const width = maxX - minX + 41;
    const depth = maxY - minY + 41;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3a5f33, roughness: 1 }),
    );
    mesh.position.set((minX + maxX + 1) / 2 - SCENE_ORIGIN.x, -0.02, -((minY + maxY + 1) / 2 - SCENE_ORIGIN.y));
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildFloor(layout: ArenaLayout): THREE.Object3D {
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 1 }), layout.floor.length);
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    layout.floor.forEach((t, i) => {
      matrix.setPosition(footprintCentre(t));
      mesh.setMatrixAt(i, matrix);
      // Two alternating greens so individual tiles can be counted.
      mesh.setColorAt(i, colour.set((t.x + t.y) % 2 === 0 ? 0x4f8a3c : 0x477f36));
    });
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildFences(layout: ArenaLayout): THREE.Object3D {
    const group = new THREE.Group();
    const add = (segments: FenceSegment[], colour: number, height: number, thickness: number): void => {
      if (segments.length === 0) return;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, height, thickness),
        new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9 }),
        segments.length,
      );
      const dummy = new THREE.Object3D();
      segments.forEach((s, i) => {
        footprintCentre(s.tile, 1, dummy.position);
        dummy.position.y = height / 2;
        const northSouth = s.side === 'north' || s.side === 'south';
        dummy.rotation.y = northSouth ? 0 : Math.PI / 2;
        if (s.side === 'north') dummy.position.z -= 0.5;
        if (s.side === 'south') dummy.position.z += 0.5;
        if (s.side === 'east') dummy.position.x += 0.5;
        if (s.side === 'west') dummy.position.x -= 0.5;
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = true;
      group.add(mesh);
    };
    add(layout.fences.filter((f) => !f.gate), 0x8a6a45, FENCE_HEIGHT, 0.08);
    add(layout.fences.filter((f) => f.gate), 0xd9b36a, FENCE_HEIGHT * 1.15, 0.12);
    return group;
  }

  private buildSolids(layout: ArenaLayout): THREE.Object3D {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.9, 1),
      new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: 1 }),
      layout.solids.length,
    );
    const matrix = new THREE.Matrix4();
    layout.solids.forEach((t, i) => {
      const p = footprintCentre(t);
      p.y = 0.45;
      matrix.setPosition(p);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.castShadow = true;
    return mesh;
  }

  private buildGrid(layout: ArenaLayout): THREE.Object3D {
    const points: number[] = [];
    for (const t of layout.floor) {
      const x = t.x - SCENE_ORIGIN.x;
      const z = -(t.y - SCENE_ORIGIN.y);
      points.push(x, 0.01, z, x + 1, 0.01, z, x, 0.01, z, x, 0.01, z - 1);
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x1f3a16, transparent: true, opacity: 0.45 }));
  }

  /** The line where region 12851 meets 13107. Nothing in the engine treats it specially. */
  private buildSeam(layout: ArenaLayout, seamX: number): THREE.Object3D {
    const length = layout.bounds.maxY - layout.bounds.minY + 1;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, length).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.8 }),
    );
    strip.position.set(seamX - SCENE_ORIGIN.x, 0.02, -(layout.bounds.minY - SCENE_ORIGIN.y) - length / 2);
    return strip;
  }
}
