import * as THREE from "three";
import { OUTLINE_MAT, hasOutline, type UnitRig } from "./rigs";

interface Batch { mesh: THREE.InstancedMesh; outline: THREE.InstancedMesh | null }
interface Slot { group: THREE.Group; batch: Batch }
interface Entry { rig: UnitRig; slots: Slot[]; flash: number }
const TINT = new THREE.Color();

/**
 * Draws baked rig parts with InstancedMesh. One instance per (unit, bone, material class),
 * so per-frame CPU work is ~10 matrix copies per unit regardless of how detailed the model is.
 */
export class UnitBatchRenderer {
  private entries = new Map<number, Entry>();
  private batches = new Map<string, Batch>();

  constructor(private scene: THREE.Scene) {}

  get drawCalls() {
    let n = 0;
    for (const { mesh } of this.batches.values()) if (mesh.visible && mesh.count > 0) n++;
    return n;
  }

  add(id: number, rig: UnitRig) {
    const slots: Slot[] = [];
    for (const part of rig.parts) {
      const key = `${part.geometry.uuid}:${part.material.uuid}`;
      let batch = this.batches.get(key);
      if (!batch) {
        const mesh = this.createMesh(part.geometry, part.material, 32);
        batch = { mesh, outline: this.createOutline(mesh) };
        this.batches.set(key, batch);
      }
      slots.push({ group: part.group, batch });
    }
    this.entries.set(id, { rig, slots, flash: 0 });
  }

  private createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.setColorAt(0, TINT.setRGB(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = !(material instanceof THREE.MeshBasicMaterial);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  /** The outline shares the unit mesh's instance matrices, so it costs no extra CPU per frame. */
  private createOutline(mesh: THREE.InstancedMesh) {
    if (!hasOutline(mesh.material as THREE.Material)) return null;
    const outline = new THREE.InstancedMesh(mesh.geometry, OUTLINE_MAT, 1);
    outline.instanceMatrix = mesh.instanceMatrix;
    outline.count = 0;
    outline.frustumCulled = false;
    outline.visible = this.outlines;
    this.scene.add(outline);
    return outline;
  }

  private outlines = true;
  /** Outlines double the triangles drawn; the light graphics setting turns them off. */
  setOutlines(on: boolean) {
    this.outlines = on;
    for (const { outline } of this.batches.values()) if (outline) outline.visible = on && outline.count > 0;
  }

  private grow(batch: Batch) {
    const old = batch.mesh;
    const next = this.createMesh(old.geometry, old.material as THREE.Material, old.instanceMatrix.count * 2);
    next.instanceMatrix.array.set(old.instanceMatrix.array);
    next.count = old.count;
    this.scene.remove(old);
    old.dispose();
    batch.mesh = next;
    if (batch.outline) { this.scene.remove(batch.outline); batch.outline.dispose(); batch.outline = this.createOutline(next); }
  }

  sync() {
    for (const batch of this.batches.values()) batch.mesh.count = 0;
    for (const entry of this.entries.values()) {
      entry.rig.root.updateMatrixWorld(true);
      // A struck unit flashes white-hot for a few frames: instance colour multiplies the baked vertex colours.
      const f = 1 + entry.flash * 1.5;
      TINT.setRGB(f, f, f);
      for (const slot of entry.slots) {
        const mesh = slot.batch.mesh;
        const index = mesh.count;
        if (index >= mesh.instanceMatrix.count) this.grow(slot.batch);
        const target = slot.batch.mesh;
        target.setMatrixAt(index, slot.group.matrixWorld);
        target.setColorAt(index, TINT);
        target.count = index + 1;
      }
    }
    for (const { mesh, outline } of this.batches.values()) {
      if (outline) { outline.count = mesh.count; outline.visible = this.outlines && mesh.count > 0; }
      mesh.visible = mesh.count > 0;
      if (mesh.count > 0) {
        mesh.instanceMatrix.clearUpdateRanges();
        mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
        mesh.instanceMatrix.needsUpdate = true;
        const colors = mesh.instanceColor!;
        colors.clearUpdateRanges();
        colors.addUpdateRange(0, mesh.count * 3);
        colors.needsUpdate = true;
      }
    }
  }

  /** 0 = normal, 1 = the brightest frame of a hit flash. */
  setFlash(id: number, amount: number) {
    const entry = this.entries.get(id);
    if (entry) entry.flash = amount;
  }

  remove(id: number) { this.entries.delete(id); }

  clear() {
    this.entries.clear();
    for (const { mesh, outline } of this.batches.values()) { mesh.count = 0; mesh.visible = false; if (outline) { outline.count = 0; outline.visible = false; } }
  }

  dispose() {
    this.clear();
    for (const { mesh, outline } of this.batches.values()) {
      this.scene.remove(mesh); mesh.dispose();
      if (outline) { this.scene.remove(outline); outline.dispose(); }
    }
    this.batches.clear();
  }
}
