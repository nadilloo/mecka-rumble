/* ============================================================
   BattleScene.js — v2
   Larger arena, slightly richer lighting and backdrop.
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class BattleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.Fog(0x0a0a1a, 18, 34);

    this._lights();
    this._arena();
    this._backdrop();
  }

  _lights() {
    this.scene.add(new THREE.AmbientLight(0x8888aa, 0.55));

    const key = new THREE.DirectionalLight(0xffeecc, 1.05);
    key.position.set(4, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.near = 1; key.shadow.camera.far = 30;
    key.shadow.camera.left = -10; key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;   key.shadow.camera.bottom = -10;
    key.shadow.bias = -0.0015;
    this.scene.add(key);

    // Pink rim on the opposite side.
    const rim = new THREE.DirectionalLight(0xff4d76, 0.45);
    rim.position.set(-5, 4, -5);
    this.scene.add(rim);

    // Cool fill from below for edge highlights.
    const fill = new THREE.DirectionalLight(0x4466ff, 0.18);
    fill.position.set(0, -2, 6);
    this.scene.add(fill);
  }

  _arena() {
    const R = CONFIG.stage.floorRadius;

    // Main arena platform.
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R + 0.3, 0.5, 56),
      new THREE.MeshStandardMaterial({
        color: CONFIG.stage.floorColor, roughness: 0.8, metalness: 0.12,
      })
    );
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Outer glow ring.
    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(R - 0.3, R - 0.05, 80),
      new THREE.MeshBasicMaterial({
        color: CONFIG.stage.ringColor, transparent: true, opacity: 0.95,
        side: THREE.DoubleSide,
      })
    );
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.02;
    this.scene.add(ring1);

    // Inner cyan ring.
    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(R * 0.55, R * 0.57, 80),
      new THREE.MeshBasicMaterial({
        color: 0x7afcff, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.025;
    this.scene.add(ring2);

    // Centerline (subtle).
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, R * 1.6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.12,
      })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    line.rotation.z = Math.PI / 2;
    this.scene.add(line);
  }

  _backdrop() {
    // A few rows of boxy "buildings" for parallax.
    const farMat = new THREE.MeshStandardMaterial({
      color: CONFIG.stage.backdropColor,
      roughness: 0.9,
      emissive: 0x2a1540,
      emissiveIntensity: 0.4,
    });
    const nearMat = new THREE.MeshStandardMaterial({
      color: 0x2a1f4a,
      roughness: 0.8,
      emissive: 0x361f5a,
      emissiveIntensity: 0.2,
    });

    const g = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const w = 1.2 + Math.random() * 2.8;
      const h = 3 + Math.random() * 6;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 1),
        i % 2 === 0 ? farMat : nearMat
      );
      box.position.set(-18 + i * 2.8, h / 2 - 1, -11 - Math.random() * 3);
      g.add(box);
    }
    this.scene.add(g);

    // Ground plane far behind for fog to fade into.
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 30),
      new THREE.MeshStandardMaterial({ color: 0x0a0a18, roughness: 1 })
    );
    far.rotation.x = -Math.PI / 2;
    far.position.set(0, -0.5, -13);
    this.scene.add(far);
  }

  add(obj) { this.scene.add(obj); }
}
