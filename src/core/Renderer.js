/* ============================================================
   Renderer.js
   Thin wrapper around Three.js WebGLRenderer.
   - Clamps device pixel ratio for mobile perf
   - Resizes to the combat viewport element
   - Tracks aspect ratio for the FightCamera
   ============================================================ */
import * as THREE from 'three';

export class Renderer {
  constructor(canvas, viewportEl) {
    this.canvas = canvas;
    this.viewportEl = viewportEl;

    this.three = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    // IMPORTANT: mobile perf. Don't render at full retina.
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.three.setClearColor(0x000000, 0);
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFSoftShadowMap;
    this.three.outputColorSpace = THREE.SRGBColorSpace;

    this.aspect = 1;
    this.resize();

    // Debounced resize (orientation / keyboard / window).
    let t = null;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => this.resize(), 60);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  resize() {
    const w = this.viewportEl.clientWidth || window.innerWidth;
    const h = this.viewportEl.clientHeight || Math.floor(window.innerHeight * 0.6);
    this.three.setSize(w, h, false);
    this.aspect = w / Math.max(1, h);
  }

  render(scene, camera) {
    this.three.render(scene, camera);
  }
}
