/* ============================================================
   CharSelectPreview.js
   Small 3D viewport on the character-select screen.  Shows the
   currently-selected character (Jammo or Knight) on a pedestal,
   slowly rotating, with the idle animation playing.

   Lighter-weight than WorkshopPreview: no parts overlays, no
   loadout, no per-frame bone tracking.  Just a clone of the
   character pack's base scene with the idle clip on a mixer.
   ============================================================ */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export class CharSelectPreview {
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
    this.scene.add(new THREE.AmbientLight(0xaaaacc, 0.6));
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

    this._currentCharId = null;
    this._charRoot = null;
    this._mixer = null;

    this._loop = this._loop.bind(this);
    this._running = false;
    this._lastT = 0;
    this._spinTime = 0;

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

  setCharacter(charId) {
    if (this._currentCharId === charId) return;
    this._currentCharId = charId;

    // Tear down previous character.
    if (this._charRoot) {
      this.scene.remove(this._charRoot);
      this._charRoot = null;
      this._mixer = null;
    }

    const pack = this.assets.characters[charId];
    if (!pack) return;

    const root = new THREE.Group();
    const cloned = cloneSkinned(pack.baseScene);
    // Slightly smaller in preview so the character fits.
    cloned.scale.setScalar(pack.meshScale * 0.67);
    root.position.y = pack.groundLift * 0.67;

    // Apply the character's albedo + (optional) normal map.
    const t = pack.textures;
    // For the preview we always show the player-side albedo
    // (Jammo gets red, Knight gets its single shared albedo).
    const albedo = t.albedo || t.albedoRed;
    const normal = t.normal || null;

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
        const matOpts = {
          map: albedo,
          roughness: 0.55, metalness: 0.25,
        };
        if (normal) matOpts.normalMap = normal;
        obj.material = new THREE.MeshStandardMaterial(matOpts);
      }
    });

    root.add(cloned);
    this.scene.add(root);
    this._charRoot = root;

    // Play idle on a fresh mixer.
    if (this.assets.clips.idle) {
      this._mixer = new THREE.AnimationMixer(cloned);
      const action = this._mixer.clipAction(this.assets.clips.idle);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    }
  }

  _loop() {
    if (!this._running) return;
    const now = performance.now();
    const dt = (now - this._lastT) / 1000;
    this._lastT = now;
    this._spinTime += dt;

    if (this._charRoot) this._charRoot.rotation.y = this._spinTime * 0.5;
    if (this._mixer)    this._mixer.update(dt);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}
