/* ============================================================
   BrawlCamera.js — the sidescroll-brawl camera (M1).

   FightCamera generalized: instead of framing exactly two fighters it
   frames an ARRAY of them — midpoint of the x-extent, distance mapped
   from the spread — so the same camera carries 1v1 today and 4v4 waves
   in M3 without touching this file again.

   The Chrome-Mobile NaN guards are inherited verbatim from FightCamera:
   that browser's WebGL blanks the whole canvas on a single non-finite
   matrix and won't recover until reload, so both the inputs and the
   final camera state self-heal.
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../utils/math.js';

const C = CONFIG.camera;

export class BrawlCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(C.fov, aspect, 0.1, 100);
    this.camera.position.set(0, C.heightEye, C.zBase);
    this.camera.lookAt(0, C.heightLook, 0);
    this.shakeAmount = 0;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Hits call this small; supers / KOs call it large. */
  shake(amount) {
    this.shakeAmount = Math.min(C.shakeMax, Math.max(this.shakeAmount, amount));
  }

  /** @param {Fighter[]} fighters — everyone worth keeping in frame
   *  (the screen passes all units, corpses included, so the camera
   *  doesn't snap away from a fresh KO). */
  update(dt, fighters) {
    let minX = Infinity, maxX = -Infinity;
    for (const f of fighters) {
      const x = f.root.position.x;
      if (!Number.isFinite(x)) {
        console.warn('[BrawlCamera] non-finite fighter position, skipping frame');
        return;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

    const midX = (minX + maxX) * 0.5 + C.sidePan;
    const gap = maxX - minX;

    // Same mapping the duel used: spread 0..16 -> [min, max] distance.
    const t = clamp((gap - 2.0) / 14.0, 0, 1);
    const desiredZ = C.minDistance + (C.maxDistance - C.minDistance) * t;

    this.camera.position.x = damp(this.camera.position.x, midX, C.positionLerp, dt);
    this.camera.position.z = damp(this.camera.position.z, desiredZ, C.distanceLerp, dt);
    this.camera.position.y = damp(this.camera.position.y, C.heightEye, C.positionLerp, dt);

    const look = new THREE.Vector3(midX, C.heightLook, 0);
    const m = new THREE.Matrix4().lookAt(this.camera.position, look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.camera.quaternion.slerp(q, 1 - Math.exp(-C.lookLerp * dt));

    this.shakeAmount = damp(this.shakeAmount, 0, C.shakeDecay, dt);
    if (this.shakeAmount > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount;
    }

    this.camera.position.y = Math.max(0.3, this.camera.position.y);

    // Final self-heal (Chrome Mobile).
    const cp = this.camera.position, cq = this.camera.quaternion;
    if (!Number.isFinite(cp.x) || !Number.isFinite(cp.y) || !Number.isFinite(cp.z) ||
        !Number.isFinite(cq.x) || !Number.isFinite(cq.y) ||
        !Number.isFinite(cq.z) || !Number.isFinite(cq.w)) {
      console.warn('[BrawlCamera] non-finite camera state, resetting');
      this.camera.position.set(0, C.heightEye, C.zBase);
      this.camera.quaternion.identity();
      this.camera.lookAt(0, C.heightLook, 0);
    }
  }
}
