/* ============================================================
   BrawlCamera.js — the sidescroll-brawl camera (M1).

   M3: a mostly-fixed ISOMETRIC frame — elevated pitch plus a fixed
   diagonal yaw (CONFIG.camera.pitchDeg/yawDeg), camera on the player's
   side so the player column reads foreground-left and the enemies
   background-right, the lane running lower-left -> upper-right (the
   MSF diagonal).  The only motion is a slow look-x drift toward the
   weighted action centroid, clamped to panMax, plus shake.  The rig
   math lives in computeCameraRig so tools/frame_check.mjs verifies the
   EXACT same frame the game renders.

   The Chrome-Mobile NaN guards are inherited verbatim from FightCamera:
   that browser's WebGL blanks the whole canvas on a single non-finite
   matrix and won't recover until reload, so both the inputs and the
   final camera state self-heal.
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../utils/math.js';

const C = CONFIG.camera;

/** The one true camera placement: orbit offset from the look point by
 *  yaw/pitch at zBase distance.  Pure — used by the class below AND by
 *  tools/frame_check.mjs, so the verified frame IS the shipped frame. */
export function computeCameraRig(focusX) {
  const yaw = (C.yawDeg * Math.PI) / 180;
  const pitch = (C.pitchDeg * Math.PI) / 180;
  const look = new THREE.Vector3(focusX, C.heightLook, C.lookZ);
  const off = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).multiplyScalar(C.zBase);
  return { look, position: off.add(look) };
}

export class BrawlCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(C.fov, aspect, 0.1, 100);
    const rig = computeCameraRig(0);
    this.camera.position.copy(rig.position);
    this.camera.lookAt(rig.look);
    this.shakeAmount = 0;
    this._lookX = 0;
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
    // M2: mostly-FIXED frame.  No spread-zoom, no chase.  A weighted
    // action centroid — engaged units (near z=0) pull hard, depth-
    // staggered reserves barely — drives a slow, clamped look-x drift.
    let sumWX = 0, sumW = 0;
    for (const f of fighters) {
      const x = f.root.position.x, z = f.root.position.z;
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        console.warn('[BrawlCamera] non-finite fighter position, skipping frame');
        return;
      }
      const w = Math.abs(z) < 0.8 ? 1 : C.backlineWeight;
      sumWX += x * w; sumW += w;
    }
    if (!(sumW > 0)) return;

    const focusX = clamp(sumWX / sumW, -C.panMax, C.panMax);
    this._lookX = damp(this._lookX ?? 0, focusX, C.lookLerp, dt);

    const rig = computeCameraRig(this._lookX);
    this.camera.position.x = damp(this.camera.position.x, rig.position.x, C.posLerp, dt);
    this.camera.position.y = rig.position.y;
    this.camera.position.z = rig.position.z;

    const look = rig.look;
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
      const safe = computeCameraRig(0);
      this.camera.position.copy(safe.position);
      this.camera.quaternion.identity();
      this.camera.lookAt(safe.look);
      this._lookX = 0;
    }
  }
}
