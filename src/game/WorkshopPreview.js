/* ============================================================
   WorkshopPreview.js
   A small 3D viewport mounted in the workshop screen.  Shows the
   player's Mecka in T-pose with the currently-selected loadout.
   Re-renders when the loadout changes (parts attach to bones the
   same way as the in-game Fighter).
   ============================================================ */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';

const ARMATURE_SCALE = 0.28;
const compensate = 1 / ARMATURE_SCALE;

export class WorkshopPreview {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.assets = assets;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    // Lights — single soft key + ambient so the colors read clearly.
    this.scene.add(new THREE.AmbientLight(0xaaaacc, 0.7));
    const key = new THREE.DirectionalLight(0xffffee, 1.1);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff6688, 0.5);
    rim.position.set(-3, 1, -2);
    this.scene.add(rim);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.set(0, 1.4, 5.8);
    this.camera.lookAt(0, 1.0, 0);

    // Pedestal disc.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.06, 36),
      new THREE.MeshStandardMaterial({
        color: 0x2a2050, roughness: 0.6, metalness: 0.3,
        emissive: 0x402070, emissiveIntensity: 0.3,
      })
    );
    disc.position.y = -0.03;
    this.scene.add(disc);

    this.character = null;
    this._loadout = { ...CONFIG.defaultLoadout };
    this._buildCharacter();

    this._loop = this._loop.bind(this);
    this._running = false;
    this._lastT = 0;
    this._spinTime = 0;

    // Resize on window changes.
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || 200;
    const h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.resize();
    this._lastT = performance.now();
    requestAnimationFrame(this._loop);
  }
  stop() { this._running = false; }

  setLoadout(loadout) {
    this._loadout = { ...loadout };
    this._buildCharacter();
  }

  _buildCharacter() {
    if (this.character) {
      this.scene.remove(this.character);
      // Dispose part overlays.
      this.character.traverse((o) => {
        if (o.userData?.isPartOverlay) {
          o.geometry?.dispose();
          o.material?.dispose();
        }
      });
    }

    const root = new THREE.Group();
    const cloned = cloneSkinned(this.assets.baseScene);
    // Workshop preview scales the character down so it fits in
    // the small viewport with breathing room.  Battle scene uses
    // CONFIG.fighter.meshScale unchanged.
    cloned.scale.setScalar(CONFIG.fighter.meshScale * 0.67);
    // Match the same ground lift the in-game Fighter applies, scaled
    // by the preview's reduced scale, so feet sit on the pedestal.
    root.position.y = CONFIG.fighter.groundLift * 0.67;

    // Player tint (red Mecka).
    const albedo = this.assets.textures.albedoRed;
    const normal = this.assets.textures.normalMap;
    cloned.traverse((obj) => {
      if (!obj.isSkinnedMesh && !obj.isMesh) return;
      const matName = (obj.material?.name || '').toLowerCase();
      if (matName.includes('eye')) {
        obj.material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x9fd7ff,
          emissiveIntensity: 1.4,
          roughness: 0.2, metalness: 0.1,
        });
      } else {
        obj.material = new THREE.MeshStandardMaterial({
          map: albedo, normalMap: normal,
          roughness: 0.55, metalness: 0.25,
        });
      }
    });
    root.add(cloned);

    // Attach part overlays to bones (same logic as Fighter).
    const bones = {};
    cloned.traverse((o) => { if (o.isBone) bones[o.name] = o; });

    const addOverlay = (def) => {
      if (!def) return;
      const bone = bones[def.bone];
      if (!bone) return;
      const s = def.size.map(v => v * compensate);
      let geo;
      switch (def.shape) {
        case 'box':    geo = new THREE.BoxGeometry(s[0], s[1], s[2]); break;
        case 'sphere': geo = new THREE.SphereGeometry(s[0], 16, 12); break;
        case 'cyl':    geo = new THREE.CylinderGeometry(s[0], s[1], s[2], 16); break;
        case 'cone':   geo = new THREE.ConeGeometry(s[0], s[1], 16); break;
        default: return;
      }
      const mat = new THREE.MeshStandardMaterial({
        color: def.color ?? 0x888888,
        roughness: 0.45, metalness: 0.4,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.isPartOverlay = true;

      // Counter-rotate the Mixamo armature's 90° X rotation so
      // offsets in CONFIG are interpreted as world axes (Y = up).
      const wrapper = new THREE.Group();
      wrapper.rotation.x = -Math.PI / 2;
      const o = (def.offset || [0, 0, 0]).map(v => v * compensate);
      mesh.position.set(o[0], o[1], o[2]);
      wrapper.add(mesh);
      bone.add(wrapper);
    };

    for (const [cat, id] of Object.entries(this._loadout)) {
      const part = (CONFIG.parts[cat] || []).find(p => p.id === id);
      if (!part) continue;
      addOverlay(part.overlay);
      addOverlay(part.overlay2);
    }

    this.character = root;
    this.scene.add(root);
  }

  _loop() {
    if (!this._running) return;
    const now = performance.now();
    const dt = (now - this._lastT) / 1000;
    this._lastT = now;
    this._spinTime += dt;
    if (this.character) this.character.rotation.y = this._spinTime * 0.5;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}
