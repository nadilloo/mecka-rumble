/* ============================================================
   BattleScene.js — v2
   Larger arena, slightly richer lighting and backdrop.
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from '../config.js';

export class BattleScene {
  constructor(renderer = null) {
    this.renderer = renderer;   // needed to bake the environment map (PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.Fog(0x0a0a1a, 18, 34);

    this._lights();
    this._arena();
    this._backdrop();
  }

  _lights() {
    // Filmic response so dark armour (KRAKEN, VOID, UMBRA) doesn't crush to
    // black.  Set on the shared renderer — see Renderer.js.
    // Image-based lighting: fills the shadow side with bounced light.  Without
    // it, a dark helmet in this arena is an unreadable silhouette.
    if (this.renderer) {
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
      } catch (e) {
        // IBL is a quality win, not a dependency.  If a device chokes on the
        // PMREM bake, the fight still has to start.
        console.warn('[BattleScene] environment map unavailable:', e);
      }
    }

    this.scene.add(new THREE.AmbientLight(0x9aa8cc, 0.85));
    this.scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x2a2f45, 0.9));

    const key = new THREE.DirectionalLight(0xfff0d8, 2.0);
    key.position.set(5, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -2;
    key.shadow.camera.left = -12; key.shadow.camera.right = 12;
    this.scene.add(key);

    // Warm rim from behind — carves fighters off the backdrop.
    const rim = new THREE.DirectionalLight(0xff8a6a, 1.15);
    rim.position.set(-6, 6, -9);
    this.scene.add(rim);

    // Cool counter-rim on the other shoulder.
    const rim2 = new THREE.DirectionalLight(0x8fc4ff, 1.0);
    rim2.position.set(7, 5, -8);
    this.scene.add(rim2);

    // Cool fill from below for edge highlights.
    const fill = new THREE.DirectionalLight(0x6688ff, 0.45);
    fill.position.set(-5, 2, 6);
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
