/* ============================================================
   MeckaKnightProcedural.js  —  "MECKA" character
   ============================================================
   A chibi knight built 100% from Three.js primitives on top of
   Jammo's EXACT skeleton (extracted to meckaSkeletonData.js).

   Why copy Jammo's skeleton verbatim?
   - Mixamo clips bind to bones BY NAME and overwrite each bone's
     local quaternion every frame.  Bone child OFFSETS (lengths)
     and the hierarchy come from the rig.  Using Jammo's exact
     offsets + rest rotations means every existing animation
     (Idle, Jab, …, Victory) poses this rig identically to Jammo —
     including the Hips Y position track, so feet meet the floor
     with the same meshScale/groundLift as Jammo.
   - We saw with the Knight GLB what happens otherwise: bind-pose
     mismatch = stretched-spaghetti character.

   How the armor attaches:
   - Each armor piece is a rigid mesh parented to a bone.
   - LIMB pieces are cylinders aligned to the bone's actual
     child-offset vector (computed from the data, not assumed),
     so they always span exactly from joint to joint.
   - ORIENTED details (visor front, boot toe, chest emblem) use a
     per-bone local basis computed at build time from the rest
     pose: which local direction corresponds to world-forward (+Z)
     and world-up (+Y).  Convention-proof.

   The big head fix: Jammo's HeadTop_End sits 2.04 units above the
   Head bone (a giant head).  Our helmet is authored at ~1.35 units
   tall — proportionally smaller, matching the reference art.
   ============================================================ */
import * as THREE from 'three';
import { JAMMO_SKELETON, ARMATURE } from './meckaSkeletonData.js';

/* ---------- Palette (reference: navy armor, silver trim, green eyes) */
const P = {
  armor:     0x232c4a,
  armorDark: 0x161d36,
  silver:    0xb9bdc9,
  silverHi:  0xd8dce4,
  silverLo:  0x83879a,
  eye:       0x2bff55,
  dark:      0x0e0e12,
};

function buildMaterials() {
  const mk = (color, metalness, roughness, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
    return m;
  };
  const mats = {
    armor:     mk(P.armor,     0.55, 0.42),
    armorDark: mk(P.armorDark, 0.55, 0.52),
    silver:    mk(P.silver,    0.90, 0.28),
    silverHi:  mk(P.silverHi,  0.85, 0.30),
    silverLo:  mk(P.silverLo,  0.90, 0.40),
    eye:       mk(0xffffff, 0, 0.3, { emissive: P.eye, emissiveIntensity: 2.4 }),
    dark:      mk(P.dark,      0.70, 0.60),
  };
  // Tag the tintable ones so Fighter can recolor the CPU copy.
  mats.armor.userData.tintRole = 'armor';
  mats.armorDark.userData.tintRole = 'armorDark';
  return mats;
}

/* ---------- Tiny mesh helpers (sizes in armature units; ×0.56 = world) */
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
const box  = (w,h,d,mat)        => shadowed(new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat));
const cyl  = (rt,rb,h,mat,s=14) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s), mat));
const sph  = (r,mat,a=14,b=10)  => shadowed(new THREE.Mesh(new THREE.SphereGeometry(r,a,b), mat));
const cone = (r,h,mat,s=8)      => shadowed(new THREE.Mesh(new THREE.ConeGeometry(r,h,s), mat));
const ring = (r,t,mat,s=18)     => shadowed(new THREE.Mesh(new THREE.TorusGeometry(r,t,6,s), mat));

/* A cylinder spanning from the bone origin to `vec` (bone-local). */
function limbAlong(vec, rTop, rBot, mat, segments = 12) {
  const len = vec.length();
  const g = new THREE.CylinderGeometry(rTop, rBot, len, segments);
  g.translate(0, len / 2, 0);                       // base at origin
  const m = shadowed(new THREE.Mesh(g, mat));
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), vec.clone().normalize());
  return m;
}
/* A ring (torus) perpendicular to `vec`, at fraction f along it. */
function bandAlong(vec, f, radius, tube, mat) {
  const m = ring(radius, tube, mat);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), vec.clone().normalize());
  m.position.copy(vec).multiplyScalar(f);
  return m;
}

/* Gear emblem: silver disc + teeth + hub, facing local +Z. */
function gear(mats, radius, teeth, depth) {
  const g = new THREE.Group();
  const disc = cyl(radius, radius, depth, mats.silver, 24);
  disc.rotation.x = Math.PI / 2; g.add(disc);
  const inner = cyl(radius*0.55, radius*0.55, depth+0.01, mats.silverLo, 20);
  inner.rotation.x = Math.PI / 2; g.add(inner);
  const hub = cyl(radius*0.2, radius*0.2, depth+0.02, mats.silverHi, 12);
  hub.rotation.x = Math.PI / 2; g.add(hub);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = box(radius*0.33, radius*0.33, depth, mats.silver);
    t.position.set(Math.cos(a)*(radius+radius*0.11), Math.sin(a)*(radius+radius*0.11), 0);
    t.rotation.z = a;
    g.add(t);
  }
  return g;
}

/* ============================================================ */
export function buildMeckaKnightScene() {
  const mats = buildMaterials();

  // ---- 1. Rebuild Jammo's skeleton exactly ----
  const bones = {};
  for (const b of JAMMO_SKELETON) {
    const bone = new THREE.Bone();
    bone.name = b.n;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    bones[b.n] = bone;
    if (b.p) bones[b.p].add(bone);
  }
  const hips = bones['mixamorigHips'];

  // Armature wrapper carries the GLB's 90°-X rotation + 0.28 scale,
  // exactly like Jammo's Armature.001 node.
  const armature = new THREE.Group();
  armature.name = 'Armature';
  armature.quaternion.fromArray(ARMATURE.r);
  armature.scale.setScalar(ARMATURE.s);
  armature.add(hips);

  const sceneRoot = new THREE.Group();   // mirrors gltf.scene wrapper
  sceneRoot.name = 'MeckaScene';
  sceneRoot.add(armature);
  sceneRoot.userData.procedural = true;

  // ---- 2. Per-bone helpers: child offsets + local basis ----
  sceneRoot.updateMatrixWorld(true);
  const childOff = (parent, child) =>
    bones[child].position.clone();        // child offset IS parent-local
  const _q = new THREE.Quaternion();
  const localDir = (boneName, worldVec) => {
    bones[boneName].getWorldQuaternion(_q).invert();
    return worldVec.clone().applyQuaternion(_q).normalize();
  };
  // Character faces +Z in scene space (Mixamo standard; Fighter
  // yaw-rotates the root to face the opponent, same as Jammo).
  const WORLD_FWD = new THREE.Vector3(0, 0, 1);
  const WORLD_UP  = new THREE.Vector3(0, 1, 0);
  /* Returns a Group whose local axes map to character fwd/up/right
     in this bone's local frame.  Author parts inside it in canonical
     space: +Z = forward, +Y = up. */
  function orientedGroup(boneName) {
    const fwd = localDir(boneName, WORLD_FWD);
    const up  = localDir(boneName, WORLD_UP);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const upOrtho = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, upOrtho, fwd));
    bones[boneName].add(g);
    return g;
  }

  /* ---- 3. HELMET (Head bone) — the big-head fix lives here ---- */
  {
    const g = orientedGroup('mixamorigHead');
    // Bucket: main box + dome, ~1.35 tall total vs Jammo's 2.04 head.
    const main = box(1.30, 1.00, 1.30, mats.armor);  main.position.y = 0.55; g.add(main);
    const dome = sph(0.66, mats.armor); dome.scale.y = 0.62; dome.position.y = 1.05; g.add(dome);
    // Brow trim band
    const brow = box(1.36, 0.09, 1.36, mats.silver); brow.position.y = 0.86; g.add(brow);
    // Crest: mount + blade + tip
    const mount = box(0.20, 0.14, 0.66, mats.silver); mount.position.y = 1.32; g.add(mount);
    const blade = box(0.16, 0.55, 0.50, mats.silver); blade.position.set(0, 1.62, -0.05); g.add(blade);
    const tip   = cone(0.20, 0.34, mats.silver); tip.position.set(0, 1.98, -0.05); g.add(tip);
    // Visor: dark slit + frame + glowing eyes (front = +Z)
    const zF = 0.655;
    const slit = box(1.10, 0.26, 0.06, mats.dark); slit.position.set(0, 0.66, zF); g.add(slit);
    const fT = box(1.18, 0.06, 0.07, mats.silver); fT.position.set(0, 0.82, zF); g.add(fT);
    const fB = box(1.18, 0.06, 0.07, mats.silver); fB.position.set(0, 0.50, zF); g.add(fB);
    const eL = box(0.32, 0.13, 0.05, mats.eye); eL.position.set( 0.27, 0.66, zF + 0.03); g.add(eL);
    const eR = box(0.32, 0.13, 0.05, mats.eye); eR.position.set(-0.27, 0.66, zF + 0.03); g.add(eR);
    // Breather slits
    for (let i = 0; i < 4; i++) {
      const s = box(0.07, 0.20, 0.05, mats.dark);
      s.position.set(-0.27 + i * 0.18, 0.22, zF); g.add(s);
    }
    // Center nose strip
    const strip = box(0.09, 0.62, 0.06, mats.silver);
    strip.position.set(0, 0.30, zF + 0.005); g.add(strip);
    // Cheek rivets
    for (const sx of [0.67, -0.67]) {
      const plate = box(0.07, 0.55, 0.75, mats.silver);
      plate.position.set(sx, 0.50, 0); g.add(plate);
      for (let i = 0; i < 2; i++) {
        const r = sph(0.06, mats.silverHi, 10, 8);
        r.position.set(sx * 1.06, 0.68 - i * 0.36, 0.18); g.add(r);
      }
    }
    // Neck rim
    const rim = ring(0.62, 0.06, mats.silver);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; g.add(rim);
  }

  /* ---- 4. CHEST (Spine1 bone, spans up toward Neck base) ---- */
  {
    const g = orientedGroup('mixamorigSpine1');
    const chest = box(1.74, 1.10, 1.05, mats.armor); chest.position.y = 0.50; g.add(chest);
    const collar = box(1.50, 0.18, 0.95, mats.armorDark); collar.position.y = 1.06; g.add(collar);
    const eTop = box(1.80, 0.07, 1.10, mats.silver); eTop.position.y = 1.12; g.add(eTop);
    const eBot = box(1.80, 0.07, 1.10, mats.silver); eBot.position.y = -0.06; g.add(eBot);
    for (const sx of [0.82, -0.82]) {
      const strip = box(0.07, 1.10, 1.00, mats.silver);
      strip.position.set(sx, 0.50, 0); g.add(strip);
    }
    const seam = box(0.08, 1.10, 0.06, mats.silver);
    seam.position.set(0, 0.50, 0.545); g.add(seam);
    const gr = gear(mats, 0.30, 8, 0.07);
    gr.position.set(0, 0.45, 0.56); g.add(gr);
    for (let i = 0; i < 2; i++) {
      const band = box(1.70, 0.04, 1.06, mats.armorDark);
      band.position.y = 0.12 + i * 0.40; g.add(band);
    }
  }

  /* ---- 5. PELVIS / BELT (Hips bone) ---- */
  {
    const g = orientedGroup('mixamorigHips');
    const belt = box(1.62, 0.36, 1.00, mats.armor); g.add(belt);
    const bT = box(1.68, 0.06, 1.06, mats.silver); bT.position.y = 0.19; g.add(bT);
    const bB = box(1.68, 0.06, 1.06, mats.silver); bB.position.y = -0.19; g.add(bB);
    const buckle = gear(mats, 0.22, 6, 0.07); buckle.position.set(0, 0, 0.53); g.add(buckle);
    for (const sx of [0.72, -0.72]) {
      const tas = box(0.58, 0.55, 0.66, mats.armor);
      tas.position.set(sx, -0.42, 0); tas.rotation.z = (sx > 0 ? -1 : 1) * 0.16; g.add(tas);
      const trim = box(0.62, 0.06, 0.70, mats.silver);
      trim.position.set(sx * 1.03, -0.68, 0); trim.rotation.z = (sx > 0 ? -1 : 1) * 0.16; g.add(trim);
    }
    const front = box(0.95, 0.55, 0.18, mats.armor);
    front.position.set(0, -0.42, 0.44); g.add(front);
  }

  /* ---- 6. ARMS (data-driven limb cylinders) ---- */
  for (const side of ['Left', 'Right']) {
    const sArm   = `mixamorig${side}Arm`;
    const sFore  = `mixamorig${side}ForeArm`;
    const sHand  = `mixamorig${side}Hand`;
    const sShoul = `mixamorig${side}Shoulder`;

    // Pauldron on the shoulder, bulging out along Shoulder→Arm.
    {
      const toArm = childOff(sShoul, sArm);
      const podG = new THREE.Group();
      bones[sShoul].add(podG);
      const pod = sph(0.52, mats.armor); pod.scale.set(1.1, 0.86, 1.1);
      pod.position.copy(toArm).multiplyScalar(0.9); podG.add(pod);
      const rg = bandAlong(toArm, 1.05, 0.44, 0.05, mats.silver); podG.add(rg);
      const stud = sph(0.09, mats.silverHi, 10, 8);
      stud.position.copy(toArm).multiplyScalar(0.9).add(localDir(sShoul, WORLD_UP).multiplyScalar(0.42));
      podG.add(stud);
    }
    // Upper arm sleeve: Arm → ForeArm
    {
      const v = childOff(sArm, sFore);
      bones[sArm].add(limbAlong(v, 0.245, 0.225, mats.armor));
      bones[sArm].add(bandAlong(v, 0.35, 0.25, 0.045, mats.silver));
      bones[sArm].add(bandAlong(v, 0.70, 0.245, 0.045, mats.silver));
    }
    // Forearm gauntlet: ForeArm → Hand (slightly thicker, cuff at wrist)
    {
      const v = childOff(sFore, sHand);
      bones[sFore].add(limbAlong(v, 0.255, 0.30, mats.armor));
      bones[sFore].add(bandAlong(v, 0.10, 0.265, 0.05, mats.silver));   // elbow
      bones[sFore].add(bandAlong(v, 0.94, 0.32, 0.055, mats.silver));   // cuff
    }
    // Fist: chunky mace-head along the hand's middle-finger direction.
    {
      const mid = `mixamorig${side}HandMiddle1`;
      const dir = bones[mid] ? bones[mid].position.clone().normalize()
                             : new THREE.Vector3(0, 1, 0);
      const fistVec = dir.multiplyScalar(0.62);
      bones[sHand].add(limbAlong(fistVec, 0.36, 0.33, mats.armor, 14));
      bones[sHand].add(bandAlong(fistVec, 0.04, 0.30, 0.05, mats.silver));   // wrist ring
      const cap = cyl(0.34, 0.34, 0.09, mats.silverLo, 14);                  // punch face
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), fistVec.clone().normalize());
      cap.position.copy(fistVec);
      bones[sHand].add(cap);
      // Knuckle studs along the top
      const up = localDir(sHand, WORLD_UP).multiplyScalar(0.34);
      for (let i = 0; i < 3; i++) {
        const k = sph(0.07, mats.silverHi, 10, 8);
        k.position.copy(fistVec).multiplyScalar(0.30 + i * 0.25).add(up);
        bones[sHand].add(k);
      }
    }
  }

  /* ---- 7. LEGS ---- */
  for (const side of ['Left', 'Right']) {
    const sUp   = `mixamorig${side}UpLeg`;
    const sLeg  = `mixamorig${side}Leg`;
    const sFoot = `mixamorig${side}Foot`;
    const sToe  = `mixamorig${side}ToeBase`;

    // Thigh: UpLeg → Leg
    {
      const v = childOff(sUp, sLeg);
      bones[sUp].add(limbAlong(v, 0.32, 0.285, mats.armor));
      bones[sUp].add(bandAlong(v, 0.12, 0.33, 0.05, mats.silver));  // hip cuff
      bones[sUp].add(bandAlong(v, 0.95, 0.30, 0.055, mats.silver)); // knee
    }
    // Shin: Leg → Foot
    {
      const v = childOff(sLeg, sFoot);
      bones[sLeg].add(limbAlong(v, 0.285, 0.33, mats.armor));
      const knee = sph(0.30, mats.silver, 12, 9);
      knee.scale.y = 0.7; bones[sLeg].add(knee);
      bones[sLeg].add(bandAlong(v, 0.92, 0.34, 0.05, mats.silver)); // ankle cuff
    }
    // Boot: chunky box along Foot → ToeBase, plus toe cap & sole
    {
      const v = childOff(sFoot, sToe);              // points toward toes
      const len = v.length();
      const dir = v.clone().normalize();
      const up  = localDir(sFoot, WORLD_UP);
      // Boot body: oriented group with +Z = toe direction, +Y = up
      const right = new THREE.Vector3().crossVectors(up, dir).normalize();
      const upO = new THREE.Vector3().crossVectors(dir, right).normalize();
      const g = new THREE.Group();
      g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upO, dir));
      bones[sFoot].add(g);
      const body = box(0.52, 0.42, len * 1.1, mats.armor);
      body.position.set(0, 0.02, len * 0.45); g.add(body);
      const toe = box(0.50, 0.40, 0.30, mats.silver);
      toe.position.set(0, 0.0, len * 1.02); g.add(toe);
      const sole = box(0.56, 0.10, len * 1.25, mats.silverLo);
      sole.position.set(0, -0.20, len * 0.50); g.add(sole);
      const ankle = box(0.50, 0.10, 0.55, mats.silver);
      ankle.position.set(0, 0.26, 0.05); g.add(ankle);
    }
  }

  /* ---- 8. NECK collar (Neck bone, small) ---- */
  {
    const v = childOff('mixamorigNeck', 'mixamorigHead');
    bones['mixamorigNeck'].add(limbAlong(v, 0.24, 0.27, mats.armorDark, 10));
    bones['mixamorigNeck'].add(bandAlong(v, 0.85, 0.28, 0.05, mats.silver));
  }

  return sceneRoot;
}
