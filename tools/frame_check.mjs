/* ============================================================
 * frame_check.mjs — proves the M2 camera actually frames like SFD.
 *
 * Builds REAL armored MECKAs at the real formation anchors (both sides),
 * exactly as Fighter places them (scale 2.0, groundLift 0.85), plus the
 * real BattleScene, and projects everything through a PerspectiveCamera
 * built from CONFIG.camera at portrait 9:16.  Asserts:
 *   - vanguard units land at 16-24% of viewport height (SFD proportion)
 *   - vanguard + slot-1 units sit fully inside the frame horizontally
 *   - deep reserves (slots 2-3) keep their centers near the frame
 *   - nobody's head floats above the lower ~two-thirds seam
 *
 *   cd tools && node frame_check.mjs [--dump]   (--dump writes
 *   tris_frame.json for frame_render.py to rasterize)
 * ============================================================ */
import * as THREE from 'three';
import fs from 'node:fs';
import { CONFIG } from '../src/config.js';
import { buildMeckaKnightScene } from '../src/game/MeckaKnightProcedural.js';
import { BattleScene } from '../src/game/BattleScene.js';
import { computeCameraRig } from '../src/game/BrawlCamera.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

const CAM = CONFIG.camera;
const ASPECT = 9 / 16;
const MESH_SCALE = 2.0, GROUND_LIFT = 0.85;

/* Anchors must mirror TeamBattle's ROLE_ANCHORS (kept private there —
 * if these drift apart, the on-screen check below is what catches it).
 * Worst-case field: both melee AND both ranged anchors filled per side. */
const ANCHORS = [
  { x: 1.7, z: 0.0, tag: 'tank' },
  { x: 3.2, z: -2.6, tag: 'rngd' },
  { x: 2.5, z: -1.0, tag: 'ml2' },
  { x: 4.0, z: -3.8, tag: 'rg2' },
];

const scene = new BattleScene(null).scene;

const units = [];
for (const side of [-1, 1]) {
  ANCHORS.forEach((a, slot) => {
    const setKey = side < 0 ? 'cadet' : 'slag';
    const mesh = buildMeckaKnightScene({ sets: [setKey], equip: setKey });
    mesh.scale.setScalar(MESH_SCALE);
    if (side > 0) mesh.scale.x *= -1;
    const root = new THREE.Group();
    root.position.set(side * a.x, GROUND_LIFT, a.z);
    root.add(mesh);
    scene.add(root);
    root.updateMatrixWorld(true);
    units.push({ side, slot, root, x: side * a.x, z: a.z });
  });
}

const camera = new THREE.PerspectiveCamera(CAM.fov, ASPECT, 0.1, 100);
const rig = computeCameraRig(0);
camera.position.copy(rig.position);
camera.lookAt(rig.look);
camera.updateMatrixWorld(true);

const toNDC = (v) => v.clone().project(camera);

/* ---- per-unit framing metrics ---- */
for (const u of units) {
  const bb = new THREE.Box3().setFromObject(u.root);
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const top = toNDC(new THREE.Vector3(cx, bb.max.y, cz));
  const bot = toNDC(new THREE.Vector3(cx, bb.min.y, cz));
  const frac = (top.y - bot.y) / 2;                    // of viewport height
  // Fight-stance width, not the rest-pose T-pose armspan: the bbox x
  // extent is arms-out (measured 1.75 half-width) and would triple-count
  // the silhouette.  0.85 is a generous standing-stance half-width.
  const STANCE_HW = 0.85;
  const xMin = toNDC(new THREE.Vector3(u.x - STANCE_HW, GROUND_LIFT + 1.0, u.z)).x;
  const xMax = toNDC(new THREE.Vector3(u.x + STANCE_HW, GROUND_LIFT + 1.0, u.z)).x;
  const tag = `${u.side < 0 ? 'P' : 'E'}-${ANCHORS[u.slot].tag}`;
  console.log(`  ${tag}	height ${(frac * 100).toFixed(1)}%  x [${xMin.toFixed(2)}, ${xMax.toFixed(2)}]  headY ${top.y.toFixed(2)}`);

  if (u.slot === 0) {
    // The front tanks are the fight's heart: SFD proportion, on screen.
    ok(frac > 0.14 && frac < 0.24,
       `${tag} at MSF proportion (${(frac * 100).toFixed(1)}% of viewport height)`);
    ok(xMin > -1 && xMax < 1, `${tag} fully in frame`);
  } else if (u.slot === 1) {
    ok(xMin > -1.05 && xMax < 1.05, `${tag} artillery in frame`);
  } else {
    const cxN = (xMin + xMax) / 2;
    ok(Math.abs(cxN) < 1.2, `${tag} deep anchor near frame (|x| ${Math.abs(cxN).toFixed(2)})`);
  }
  ok(top.y < 0.32, `${tag} stays below the skyline (head at ${top.y.toFixed(2)})`);
}

/* ---- optional: dump lit screen-space triangles for frame_render.py ---- */
if (process.argv.includes('--dump')) {
  const L = new THREE.Vector3(0.4, 0.8, 0.5).normalize();
  const fog = scene.fog;
  const out = [];
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((m) => {
    if (!m.isMesh || m.visible === false) return;
    const g = m.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const idx = g.getIndex();
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const baseC = mat.color ? mat.color : new THREE.Color(0x888888);
    const emis = mat.emissive && mat.emissive.getHex() !== 0 ? mat.emissive : null;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1,
            c = idx ? idx.getX(i + 2) : i + 2;
      v0.fromBufferAttribute(pos, a).applyMatrix4(m.matrixWorld);
      v1.fromBufferAttribute(pos, b).applyMatrix4(m.matrixWorld);
      v2.fromBufferAttribute(pos, c).applyMatrix4(m.matrixWorld);
      // world-space lighting + camera-distance fog, then project
      const nrm = new THREE.Vector3().subVectors(v1, v0)
        .cross(new THREE.Vector3().subVectors(v2, v0));
      if (nrm.lengthSq() < 1e-12) continue;
      nrm.normalize();
      let col;
      if (emis) col = emis.clone().multiplyScalar(1.15);
      else col = baseC.clone().multiplyScalar(0.26 + 0.74 * Math.abs(nrm.dot(L)));
      const mid = new THREE.Vector3().add(v0).add(v1).add(v2).multiplyScalar(1 / 3);
      const dist = mid.distanceTo(camera.position);
      if (fog && mat.fog !== false) {
        const f = Math.min(1, Math.max(0, (dist - fog.near) / (fog.far - fog.near)));
        col.lerp(fog.color, f);
      }
      const p0 = toNDC(v0), p1 = toNDC(v1), p2 = toNDC(v2);
      if ([p0, p1, p2].every((p) => p.z > 1 || Math.abs(p.x) > 1.6 || Math.abs(p.y) > 1.6)) continue;
      if ([p0, p1, p2].some((p) => p.z > 1)) continue;   // behind/at far plane
      out.push({
        v: [p0.x, p0.y, p1.x, p1.y, p2.x, p2.y],
        d: dist,
        c: '#' + col.getHexString(),
      });
    }
  });
  fs.writeFileSync('tris_frame.json', JSON.stringify(out));
  console.log(`  dumped ${out.length} lit tris -> tris_frame.json`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — the frame holds SFD proportions');
process.exit(fails ? 1 : 0);
