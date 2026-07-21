/* ============================================================
   BattleScene.js — M2: the scrapyard.
   Arena platform + three depth bands of salvage (near props, the
   gantry, far silhouettes), bale walls at the lane corners, and a
   dusk sky.  Everything static, hardcoded, and merged into one draw
   call per material family.
   ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config.js';

export class BattleScene {
  constructor(renderer = null) {
    this.renderer = renderer;   // needed to bake the environment map (PMREM)
    this.scene = new THREE.Scene();
    this.scene.background = null;
    // Rust-dusk depth grading: fighters (camera dist 16) stay clear,
    // the mid band fades, the far band reads as silhouettes.
    this.scene.fog = new THREE.Fog(0x2a1c16, 20, 44);

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
    // ---- The scrapyard (M2) ----
    // Three depth bands + bale corner walls.  Native geometries only,
    // flat-shaded, low-saturation rust/steel/charcoal so the tinted
    // fighters pop.  Every placement is HARDCODED — deterministic, no
    // Math.random — and merges into ONE draw call per material family.
    const HW = CONFIG.stage.laneHalfWidth;
    const fam = { rust: [], steel: [], charcoal: [], dirt: [] };
    const E = new THREE.Euler(), M = new THREE.Matrix4(),
          Q = new THREE.Quaternion(), S = new THREE.Vector3(),
          P = new THREE.Vector3();
    const put = (f, geo, x, y, z, o = {}) => {
      E.set(o.rx || 0, o.ry || 0, o.rz || 0);
      Q.setFromEuler(E);
      S.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1);
      P.set(x, y, z);
      // Polyhedra (the mounds) are non-indexed; boxes/cylinders/tori are
      // indexed — mergeGeometries refuses to mix, so normalize here.
      let g = geo.clone();
      if (g.index) g = g.toNonIndexed();
      fam[f].push(g.applyMatrix4(M.compose(P, Q, S)));
    };

    // The kit — one base geometry per prop, cloned into placements.
    const bale   = new THREE.BoxGeometry(1.5, 0.75, 1.05);
    const drum   = new THREE.CylinderGeometry(0.33, 0.33, 0.78, 8);
    const tire   = new THREE.TorusGeometry(0.36, 0.15, 6, 10);
    const girder = new THREE.BoxGeometry(0.16, 3.4, 0.22);
    const mound  = new THREE.IcosahedronGeometry(1, 1);
    const box    = new THREE.BoxGeometry(1, 1, 1);
    const plane  = new THREE.PlaneGeometry(1, 1);

    // -- Corner walls: bale stacks just past the lane clamp (fighters
    //    stop at ±HW; the inner bale face sits ~0.25 beyond the line).
    for (const s of [-1, 1]) {
      const wx = s * (HW + 1.0);
      [[wx, 0.38, -0.8, 0.06], [wx + s * 0.12, 1.13, -0.8, -0.09],
       [wx - s * 0.06, 1.88, -0.85, 0.14],
       [wx + s * 0.3, 0.38, -2.15, -0.12], [wx + s * 0.18, 1.13, -2.2, 0.07]]
        .forEach(([x, y, z, ry]) => put('rust', bale, x, y, z, { ry }));
      put('steel', drum, s * (HW + 1.15), 1.9, -2.2);
      put('steel', girder, s * (HW + 0.55), 1.55, -1.5,
          { rz: s * 0.42, ry: s * 0.5 });
    }

    // -- Near band (z −2..−6): crushed bales, drums, tire stacks,
    //    leaning girders — all clear of the anchor diagonal.
    for (const [x, z, ry] of [[-7.4, -3.4, 0.35], [-6.7, -5.2, -0.2],
                              [6.9, -3.8, 0.5], [7.8, -5.4, 0.1]]) {
      put('rust', bale, x, 0.38, z, { ry });
      put('rust', bale, x + 0.2, 1.13, z - 0.15, { ry: ry - 0.3 });
    }
    [[-8.6, -2.6], [-8.1, -2.9], [8.4, -2.4], [6.1, -6.1], [-5.9, -6.3]]
      .forEach(([x, z], i) => put('steel', drum, x, 0.39, z, { ry: i * 0.7 }));
    put('steel', drum, 7.6, 0.33, -6.2, { rz: Math.PI / 2, ry: 0.4 });
    const tstack = (x, z, n, r0) => {
      for (let i = 0; i < n; i++) {
        put('charcoal', tire, x + (i % 2) * 0.07, 0.16 + i * 0.3, z,
            { rx: Math.PI / 2, ry: r0 + i * 0.9 });
      }
    };
    tstack(-8.9, -4.9, 4, 0.2); tstack(8.8, -4.6, 3, 1.1);
    tstack(-6.2, -1.9, 3, 2.0);
    [[-0.6, 0.5], [0.4, -0.62], [1.1, 0.3]].forEach(([dx, rz], i) =>
      put('steel', girder, -7.9 + dx, 1.5, -5.9, { rz, ry: i * 0.8 }));
    put('rust', mound, 0, 0.25, -6.3, { sx: 2.6, sy: 0.7, sz: 1.6 });

    // -- Mid band (z −8..−14): scrap mounds + the gantry crane that
    //    frames the stage (the SFD overhead-structure echo).
    [[-7.2, -9.6, 2.4, 1.0, 1.9, 'rust'],
     [6.6, -10.2, 2.9, 1.2, 2.1, 'charcoal'],
     [-1.8, -13.2, 3.4, 1.35, 2.4, 'rust'],
     [9.5, -13.6, 2.6, 1.0, 2.0, 'charcoal'],
     [-11.5, -12.4, 3.1, 1.2, 2.2, 'charcoal']]
      .forEach(([x, z, sx, sy, sz, f]) =>
        put(f, mound, x, sy * 0.55, z, { sx, sy, sz, ry: x }));
    [[-10.8, -8.9], [11.6, -9.4], [11.1, -10.1]].forEach(([x, z], i) => {
      put('rust', bale, x, 0.38, z, { ry: 0.4 + i });
      put('steel', drum, x + 0.9, 0.39, z + 0.4, { ry: i });
    });
    for (const s of [-1, 1]) {
      put('steel', box, s * 10.6, 4.6, -11.2, { sx: 0.55, sy: 9.2, sz: 0.6 });
      put('steel', box, s * 10.6, 1.1, -11.2, { sx: 1.4, sy: 0.35, sz: 1.5 });
      put('steel', box, s * 9.6, 7.0, -11.2,
          { sx: 2.6, sy: 0.28, sz: 0.4, rz: s * 0.45 });
    }
    put('steel', box, 0, 9.35, -11.2, { sx: 22.6, sy: 0.75, sz: 0.95 });
    put('steel', box, 0, 8.75, -11.2, { sx: 20.0, sy: 0.3, sz: 0.5 });
    put('steel', box, 2.4, 7.9, -11.2, { sx: 0.09, sy: 2.0, sz: 0.09 });
    put('rust', box, 2.4, 6.65, -11.2, { sx: 0.7, sy: 0.5, sz: 0.55 });

    // -- Far band (z −16..−24): salvage heaps + two tower cranes,
    //    mostly fog — silhouettes against the dusk.
    [[-9.5, -18.5, 5.5, 2.2, 4.0], [2.5, -21, 7.0, 2.8, 5.0],
     [13.5, -19, 5.0, 2.0, 3.6], [-16, -22, 6.0, 2.4, 4.4]]
      .forEach(([x, z, sx, sy, sz], i) =>
        put('charcoal', mound, x, sy * 0.5, z, { sx, sy, sz, ry: i * 1.3 }));
    const crane = (x, z, dir) => {
      put('charcoal', box, x, 7.75, z, { sx: 0.85, sy: 15.5, sz: 0.85 });
      put('charcoal', box, x + dir * 4.6, 15.6, z, { sx: 10.5, sy: 0.5, sz: 0.6 });
      put('charcoal', box, x - dir * 2.1, 15.6, z, { sx: 3.6, sy: 0.7, sz: 0.7 });
      put('charcoal', box, x, 16.7, z, { sx: 0.5, sy: 1.8, sz: 0.5 });
      put('charcoal', box, x + dir * 2.6, 16.4, z,
          { sx: 5.4, sy: 0.07, sz: 0.07, rz: -dir * 0.28 });
      put('charcoal', box, x + dir * 8.2, 13.7, z, { sx: 0.07, sy: 3.4, sz: 0.07 });
      put('charcoal', box, x + dir * 8.2, 11.8, z, { sx: 0.6, sy: 0.5, sz: 0.6 });
    };
    crane(-13.5, -21, 1);
    crane(11.5, -23, -1);

    // -- Dirt field the whole yard sits on.
    put('dirt', plane, 0, -0.45, -22, { rx: -Math.PI / 2, sx: 150, sy: 70 });

    const mats = {
      rust: new THREE.MeshStandardMaterial({
        color: 0x4a2f26, roughness: 0.95, metalness: 0.15, flatShading: true }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x3d4149, roughness: 0.85, metalness: 0.3, flatShading: true }),
      charcoal: new THREE.MeshStandardMaterial({
        color: 0x23262c, roughness: 1.0, metalness: 0.05, flatShading: true }),
      dirt: new THREE.MeshStandardMaterial({
        color: 0x241a15, roughness: 1.0, metalness: 0.0 }),
    };
    for (const [name, list] of Object.entries(fam)) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), mats[name]);
      mesh.castShadow = name === 'rust' || name === 'steel';
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // -- Dusk sky, exempt from fog so the far silhouettes have a
    //    backdrop to read against.
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(240, 110),
      new THREE.MeshBasicMaterial({ color: 0x151019, fog: false }));
    sky.position.set(0, 30, -70);
    this.scene.add(sky);
    const horizon = new THREE.Mesh(new THREE.PlaneGeometry(240, 15),
      new THREE.MeshBasicMaterial({ color: 0x33201a, fog: false }));
    horizon.position.set(0, 5.5, -69.5);
    this.scene.add(horizon);
    // (M3: no sun disk — at the isometric down-pitch the far sky sits
    // above the frame; the dusk read is carried by fog + the horizon.)
  }

  add(obj) { this.scene.add(obj); }
}
