/* ============================================================
   FightCamera.js — v2
   Adds a `shake(amount)` method used by App when a damaging hit
   lands, plus natural decay of the shake each frame.
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../utils/math.js';

const C = CONFIG.camera;

export class FightCamera {
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

  /** Punch / shoot hits call this with a small amount; super with large. */
  shake(amount) {
    this.shakeAmount = Math.min(C.shakeMax, Math.max(this.shakeAmount, amount));
  }

  update(dt, player, cpu) {
    const midX = (player.root.position.x + cpu.root.position.x) * 0.5 + C.sidePan;
    const gap  = Math.abs(player.root.position.x - cpu.root.position.x);

    // Bigger arena + range: remap gap 0..16 → [min, max] distance, so
    // max zoom-out is only reached when the fighters are near the walls.
    const t = clamp((gap - 2.0) / 14.0, 0, 1);
    const desiredZ = C.minDistance + (C.maxDistance - C.minDistance) * t;

    // Smooth follow.
    this.camera.position.x = damp(this.camera.position.x, midX,       C.positionLerp, dt);
    this.camera.position.z = damp(this.camera.position.z, desiredZ,   C.distanceLerp, dt);
    this.camera.position.y = damp(this.camera.position.y, C.heightEye,C.positionLerp, dt);

    // Smooth look-at via quaternion slerp.
    const look = new THREE.Vector3(midX, C.heightLook, 0);
    const m = new THREE.Matrix4().lookAt(this.camera.position, look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    this.camera.quaternion.slerp(q, 1 - Math.exp(-C.lookLerp * dt));

    // Shake decays exponentially.
    this.shakeAmount = damp(this.shakeAmount, 0, C.shakeDecay, dt);
    if (this.shakeAmount > 0.005) {
      const sx = (Math.random() - 0.5) * this.shakeAmount;
      const sy = (Math.random() - 0.5) * this.shakeAmount;
      this.camera.position.x += sx;
      this.camera.position.y += sy;
    }

    // Never drop below floor.
    this.camera.position.y = Math.max(0.3, this.camera.position.y);
  }
}
