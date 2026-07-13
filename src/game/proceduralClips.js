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
