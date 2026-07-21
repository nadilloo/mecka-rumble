/* ============================================================
 * proceduralClips.js — animation clips authored in code.
 *
 * A THREE.AnimationClip is just keyframe tracks over bone transforms, and we
 * already have the skeleton's exact rest pose (meckaSkeletonData.js).  So a
 * pose-to-pose action like a crouch does not need Mixamo — we can solve it.
 *
 * Two things this module has to get right, both learned the hard way:
 *
 *   1. TRACK COVERAGE.  AnimationMixer only writes bones a clip has tracks
 *      for.  Blend in a clip that only moves the legs and every untracked
 *      bone falls back toward its BIND pose — which on a Mixamo rig is the
 *      T-pose.  The crouch would play with the arms flung out sideways.  So
 *      the clip is built FROM the idle pose and re-emits a track for every
 *      bone idle drives.
 *
 *   2. WHICH AXIS IS DOWN.  The Armature carries a +90 deg X rotation, so the
 *      Hips bone's LOCAL axes are not the world's:
 *          local +X  ->  world +X   (lateral)
 *          local +Y  ->  world +Z   (depth)
 *          local +Z  ->  world -Y   (DOWN)
 *      Dropping the hips means increasing Hips.position.Z, not decreasing Y.
 *      Measured, not assumed — see tools/crouch_check.mjs.
 *
 * Note AssetLoader zeroes hips local x/z on every LOADED clip.  Local z is the
 * vertical axis, so that strips vertical hip travel.  This clip is generated
 * AFTER that pass, which is why its drop survives.
 * ============================================================ */
import * as THREE from 'three';
import { JAMMO_SKELETON, ARMATURE } from './meckaSkeletonData.js';

const DEG = Math.PI / 180;
const AXIS_X = new THREE.Vector3(1, 0, 0);

/* Local +Z on the Hips maps to world -Y, scaled by the armature.  One local
 * unit therefore lowers the rig by ARMATURE.s world units. */
const HIPS_DOWN_PER_UNIT = ARMATURE.s;

/* Build a bare bone tree (no meshes) we can pose and measure. */
function buildRig() {
  const bones = {};
  const roots = [];
  for (const b of JAMMO_SKELETON) {
    const bone = new THREE.Bone();
    bone.name = b.n;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    bones[b.n] = bone;
  }
  for (const b of JAMMO_SKELETON) {
    if (b.p) bones[b.p].add(bones[b.n]);
    else roots.push(bones[b.n]);
  }
  const armature = new THREE.Group();
  armature.quaternion.fromArray(ARMATURE.r);
  armature.scale.setScalar(ARMATURE.s);
  for (const r of roots) armature.add(r);
  const scene = new THREE.Group();
  scene.add(armature);
  scene.updateMatrixWorld(true);
  return { scene, bones };
}

/* Three sanitises 'mixamorig:Hips' to 'mixamorigHips' when binding, so a clip
 * may carry either spelling.  Normalise before we compare. */
function splitTrack(name) {
  const dot = name.lastIndexOf('.');
  return { node: name.slice(0, dot).replace(/:/g, ''), prop: name.slice(dot + 1) };
}

/* Read the pose a clip holds at t = 0. */
function poseAtZero(clip) {
  const pose = {};
  if (!clip) return pose;
  for (const track of clip.tracks) {
    const { node, prop } = splitTrack(track.name);
    if (prop !== 'quaternion' && prop !== 'position') continue;
    const n = prop === 'quaternion' ? 4 : 3;
    (pose[node] ??= {})[prop] = Array.from(track.values.slice(0, n));
  }
  return pose;
}

/**
 * Generate the crouch.
 *
 * @param {THREE.AnimationClip|null} idleClip  drives the base pose + track
 *        coverage.  Pass null to fall back to the skeleton's rest pose (used
 *        by the test harness, which has no GLBs to load).
 * @param {object} [opts]
 * @param {number} [opts.depth=1]     0..1 — scales the whole crouch
 * @param {number} [opts.duration=0.16] seconds to reach the crouched pose
 */
export function buildCrouchClip(idleClip = null, opts = {}) {
  const depth = opts.depth ?? 1;
  const duration = opts.duration ?? 0.16;

  const HIP_DEG = 60 * depth;    // thigh swings forward: +X flexes the hip
  const KNEE_DEG = -120 * depth; // shin swings back:     -X flexes the knee
  const SPINE_DEG = 9 * depth;   // slight forward lean, as a real squat does

  const { scene, bones } = buildRig();

  // ---- 1. base pose (idle at t=0, or the rest pose) ----
  const base = poseAtZero(idleClip);
  for (const name of Object.keys(bones)) {
    const p = base[name];
    if (p?.quaternion) bones[name].quaternion.fromArray(p.quaternion);
    if (p?.position) bones[name].position.fromArray(p.position);
  }
  scene.updateMatrixWorld(true);

  // Snapshot the base so the crouch is a delta ON TOP of it, and so we know
  // where the feet started.
  const baseQ = {}, baseP = {};
  for (const [n, b] of Object.entries(bones)) {
    baseQ[n] = b.quaternion.clone();
    baseP[n] = b.position.clone();
  }
  const worldOf = (n) => bones[n].getWorldPosition(new THREE.Vector3());
  const baseToeY = (worldOf('mixamorigLeftToeBase').y + worldOf('mixamorigRightToeBase').y) / 2;
  const baseFootQ = {
    Left: bones.mixamorigLeftFoot.getWorldQuaternion(new THREE.Quaternion()),
    Right: bones.mixamorigRightFoot.getWorldQuaternion(new THREE.Quaternion()),
  };

  // ---- 2. bend the legs, lean the spine ----
  const bend = (name, deg) => bones[name].quaternion.copy(baseQ[name])
    .multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, deg * DEG));

  for (const side of ['Left', 'Right']) {
    bend(`mixamorig${side}UpLeg`, HIP_DEG);
    bend(`mixamorig${side}Leg`, KNEE_DEG);
  }
  bend('mixamorigSpine', SPINE_DEG);
  scene.updateMatrixWorld(true);

  // ---- 3. keep the soles flat ----
  // The leg chain has rotated the foot with it.  Rather than guess a
  // counter-angle, cancel it exactly: choose the local rotation that restores
  // the foot's ORIGINAL world orientation.
  for (const side of ['Left', 'Right']) {
    const foot = bones[`mixamorig${side}Foot`];
    const parentQ = foot.parent.getWorldQuaternion(new THREE.Quaternion());
    foot.quaternion.copy(parentQ.invert().multiply(baseFootQ[side]));
  }
  scene.updateMatrixWorld(true);

  // ---- 4. plant the feet ----
  // Bending the legs lifted the toes off the floor.  Lower the hips by exactly
  // that much.  Local +Z is down (see header), so we ADD.
  const liftedToeY = (worldOf('mixamorigLeftToeBase').y + worldOf('mixamorigRightToeBase').y) / 2;
  const hips = bones.mixamorigHips;
  hips.position.copy(baseP.mixamorigHips);
  hips.position.z += (liftedToeY - baseToeY) / HIPS_DOWN_PER_UNIT;
  scene.updateMatrixWorld(true);

  // ---- 5. emit ----
  // A track for EVERY bone the base pose drives, or the untracked ones snap
  // back to the T-pose the moment this clip takes weight.
  const times = new Float32Array([0, duration]);
  const tracks = [];
  const covered = idleClip ? Object.keys(base) : Object.keys(bones);

  for (const name of covered) {
    const b = bones[name];
    if (!b) continue;
    const q0 = baseQ[name], q1 = b.quaternion;
    tracks.push(new THREE.QuaternionKeyframeTrack(
      `${name}.quaternion`,
      times,
      new Float32Array([q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w]),
    ));
  }

  const p0 = baseP.mixamorigHips, p1 = hips.position;
  tracks.push(new THREE.VectorKeyframeTrack(
    'mixamorigHips.position',
    times,
    new Float32Array([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z]),
  ));

  const clip = new THREE.AnimationClip('crouch', duration, tracks);
  clip.userData = {
    generated: true,
    hipDeg: HIP_DEG,
    kneeDeg: KNEE_DEG,
    hipsDropLocal: p1.z - p0.z,
    hipsDropWorld: (p1.z - p0.z) * HIPS_DOWN_PER_UNIT,
  };
  return clip;
}

/* ============================================================
 * Authored one-shot attack clips (M2): kicks.
 *
 * Same discipline as the crouch — base pose from idle, deltas on top,
 * a track for every covered bone — but MULTI-KEYFRAME: base ->
 * chamber -> strike -> retract -> base.  Only the SUPPORT foot is
 * planted (world orientation restored + hips re-lowered so its toe
 * holds baseline height); the kicking foot flies.
 *
 * Axes, measured 2026-07-20 (tools axis probe):
 *   UpLeg local +X  flexes the hip (thigh forward/up)   [from crouch]
 *   Leg   local -X  bends the knee                      [from crouch]
 *   UpLeg local -Z  ABDUCTS (right leg swings out); +Z sweeps ACROSS
 *   Hips  local +Z  yaws the whole body (vertical axis)
 * ============================================================ */

const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** Shared authoring core.  `keys` = [{ t, pose(ctx) }] with pose applying
 *  quaternion deltas via ctx helpers.  First/last emitted keys are the base
 *  pose so the one-shot starts and ends where idle left the body. */
function authorActionClip(name, idleClip, duration, keys, meta = {}) {
  const { scene, bones } = buildRig();

  const base = poseAtZero(idleClip);
  for (const n of Object.keys(bones)) {
    const p = base[n];
    if (p?.quaternion) bones[n].quaternion.fromArray(p.quaternion);
    if (p?.position) bones[n].position.fromArray(p.position);
  }
  scene.updateMatrixWorld(true);

  const baseQ = {}, baseP = {};
  for (const [n, b] of Object.entries(bones)) {
    baseQ[n] = b.quaternion.clone();
    baseP[n] = b.position.clone();
  }
  const worldOf = (n) => bones[n].getWorldPosition(new THREE.Vector3());
  const support = meta.support || 'Left';           // the planted leg
  const baseSupToeY = worldOf(`mixamorig${support}ToeBase`).y;
  const baseSupFootQ = bones[`mixamorig${support}Foot`]
    .getWorldQuaternion(new THREE.Quaternion());

  const ctx = {
    bones, baseQ,
    rot(n, axis, deg) {
      bones[n].quaternion.copy(baseQ[n])
        .multiply(new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG));
    },
    rot2(n, axisA, degA, axisB, degB) {              // composed delta
      bones[n].quaternion.copy(baseQ[n])
        .multiply(new THREE.Quaternion().setFromAxisAngle(axisA, degA * DEG))
        .multiply(new THREE.Quaternion().setFromAxisAngle(axisB, degB * DEG));
    },
  };

  // Pose every key, planting the support foot each time, snapshotting all.
  const covered = idleClip ? Object.keys(base) : Object.keys(bones);
  const snaps = [];                                   // per key: {q:{}, hipsP}
  const resetToBase = () => {
    for (const [n, b] of Object.entries(bones)) {
      b.quaternion.copy(baseQ[n]);
      b.position.copy(baseP[n]);
    }
  };
  const snapshot = () => {
    const q = {};
    for (const n of covered) if (bones[n]) q[n] = bones[n].quaternion.clone();
    return { q, hipsP: bones.mixamorigHips.position.clone() };
  };

  const emitted = [{ t: 0 }, ...keys, { t: duration }];   // base bookends
  for (const key of emitted) {
    resetToBase();
    scene.updateMatrixWorld(true);
    if (key.pose) {
      key.pose(ctx);
      scene.updateMatrixWorld(true);
      // Plant the support foot: restore its world orientation exactly...
      const foot = bones[`mixamorig${support}Foot`];
      const parentQ = foot.parent.getWorldQuaternion(new THREE.Quaternion());
      foot.quaternion.copy(parentQ.invert().multiply(baseSupFootQ));
      scene.updateMatrixWorld(true);
      // ...then re-plant its toe at baseline height (local +Z is down).
      const toeY = worldOf(`mixamorig${support}ToeBase`).y;
      bones.mixamorigHips.position.z += (toeY - baseSupToeY) / HIPS_DOWN_PER_UNIT;
      scene.updateMatrixWorld(true);
    }
    snaps.push(snapshot());
  }

  const times = new Float32Array(emitted.map(k => k.t));
  const tracks = [];
  for (const n of covered) {
    if (!bones[n]) continue;
    const vals = new Float32Array(snaps.length * 4);
    snaps.forEach((s, i) => {
      const q = s.q[n];
      vals[i * 4] = q.x; vals[i * 4 + 1] = q.y; vals[i * 4 + 2] = q.z; vals[i * 4 + 3] = q.w;
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, vals));
  }
  const pvals = new Float32Array(snaps.length * 3);
  snaps.forEach((s, i) => {
    pvals[i * 3] = s.hipsP.x; pvals[i * 3 + 1] = s.hipsP.y; pvals[i * 3 + 2] = s.hipsP.z;
  });
  tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, pvals));

  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.userData = { generated: true, ...meta };
  return clip;
}

/** Front kick, right leg: chamber -> snap-extend at hip height -> retract. */
export function buildKickClip(idleClip = null) {
  const sink = (c) => {                       // support-leg balance sink
    c.rot('mixamorigLeftUpLeg', AXIS_X, 10);
    c.rot('mixamorigLeftLeg', AXIS_X, -18);
  };
  return authorActionClip('kick', idleClip, 0.50, [
    { t: 0.12, pose: (c) => {                 // chamber
      c.rot('mixamorigRightUpLeg', AXIS_X, 75);
      c.rot('mixamorigRightLeg', AXIS_X, -110);
      c.rot('mixamorigSpine', AXIS_X, -6);
      sink(c);
    } },
    { t: 0.20, pose: (c) => {                 // strike: knee snaps straight
      c.rot('mixamorigRightUpLeg', AXIS_X, 85);
      c.rot('mixamorigRightLeg', AXIS_X, -8);
      c.rot('mixamorigSpine', AXIS_X, -10);
      sink(c);
    } },
    { t: 0.32, pose: (c) => {                 // retract to chamber
      c.rot('mixamorigRightUpLeg', AXIS_X, 70);
      c.rot('mixamorigRightLeg', AXIS_X, -100);
      c.rot('mixamorigSpine', AXIS_X, -5);
      sink(c);
    } },
  ], { support: 'Left', kind: 'front-kick' });
}

/** Roundhouse, right leg: coil out -> horizontal sweep across with body
 *  pivot -> retract.  Composed from measured flex/abduct/yaw axes. */
export function buildRoundhouseClip(idleClip = null) {
  const sink = (c) => {
    c.rot('mixamorigLeftUpLeg', AXIS_X, 8);
    c.rot('mixamorigLeftLeg', AXIS_X, -14);
  };
  return authorActionClip('roundhouse', idleClip, 0.70, [
    { t: 0.16, pose: (c) => {                 // chamber: thigh up + OUT, coil
      c.rot2('mixamorigRightUpLeg', AXIS_X, 55, AXIS_Z, -38);
      c.rot('mixamorigRightLeg', AXIS_X, -105);
      c.rot('mixamorigHips', AXIS_Z, -12);
      c.rot('mixamorigSpine', AXIS_X, 6);
      sink(c);
    } },
    { t: 0.30, pose: (c) => {                 // strike: sweep ACROSS, pivot in
      c.rot2('mixamorigRightUpLeg', AXIS_X, 70, AXIS_Z, 22);
      c.rot('mixamorigRightLeg', AXIS_X, -18);
      c.rot('mixamorigHips', AXIS_Z, 28);
      c.rot('mixamorigSpine', AXIS_X, 10);
      sink(c);
    } },
    { t: 0.44, pose: (c) => {                 // retract
      c.rot2('mixamorigRightUpLeg', AXIS_X, 50, AXIS_Z, -20);
      c.rot('mixamorigRightLeg', AXIS_X, -90);
      c.rot('mixamorigSpine', AXIS_X, 4);
      sink(c);
    } },
  ], { support: 'Left', kind: 'roundhouse' });
}
