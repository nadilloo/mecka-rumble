/* ============================================================
 * kick_check.mjs — proves the procedural kick + roundhouse clips.
 *
 * Mirrors crouch_check.mjs: runs each clip through a real AnimationMixer
 * bound to the real rig, so a mis-named track shows up as "nothing moved"
 * rather than passing quietly.  Per clip it asserts:
 *   - every bone the idle drives has a track (no T-pose leak), no NaN
 *   - base-pose bookends exist at t=0 and t=end
 *   - the support (Left) toe holds baseline height at EVERY authored key
 *   - the support sole stays flat (world orientation restored at keys)
 *   - the kicking (Right) foot actually travels, and comes back home
 *   - the roundhouse sweeps ACROSS (lateral) more than the front kick does
 *
 *   cd tools && node kick_check.mjs
 * ============================================================ */
import * as THREE from 'three';
import { buildMeckaKnightScene } from '../src/game/MeckaKnightProcedural.js';
import { JAMMO_SKELETON } from '../src/game/meckaSkeletonData.js';
import { buildKickClip, buildRoundhouseClip } from '../src/game/proceduralClips.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

/* Stand-in for Mixamo's Idle: full coverage, one track per bone (same
 * construction as crouch_check — reproduces a real clip's coverage). */
const idleTracks = JAMMO_SKELETON.map(b => new THREE.QuaternionKeyframeTrack(
  `${b.n}.quaternion`, new Float32Array([0, 1]),
  new Float32Array([...b.r, ...b.r]),
));
idleTracks.push(new THREE.VectorKeyframeTrack(
  'mixamorigHips.position', new Float32Array([0, 1]),
  new Float32Array([...JAMMO_SKELETON[0].t, ...JAMMO_SKELETON[0].t]),
));
const idle = new THREE.AnimationClip('idle', 1, idleTracks);

/* ---- the real rig, and its baseline (rest == synthetic idle pose) ---- */
const root = buildMeckaKnightScene({ sets: [], equip: null });
root.updateMatrixWorld(true);
const B = {};
root.traverse(o => { if (o.isBone) B[o.name] = o; });
const wp = n => B[n].getWorldPosition(new THREE.Vector3());
const wq = n => B[n].getWorldQuaternion(new THREE.Quaternion());

const base = {
  supToeY:  wp('mixamorigLeftToeBase').y,
  supFootQ: wq('mixamorigLeftFoot'),
  kickToe:  wp('mixamorigRightToeBase'),
  head:     wp('mixamorigHead'),
  hips:     wp('mixamorigHips'),
  rHand:    wp('mixamorigRightHand'),
};

/* Pose the rig at time t of a clip (fresh mixer per sample; every sampled
 * bone has a track, so each sample fully determines the pose). */
function sampleAt(clip, t) {
  const mixer = new THREE.AnimationMixer(root);
  const a = mixer.clipAction(clip);
  a.setLoop(THREE.LoopOnce, 1);
  a.clampWhenFinished = true;
  a.play();
  mixer.update(t);
  root.updateMatrixWorld(true);
}

function checkClip(clip, label) {
  console.log(`\n== ${label} (${clip.duration}s) ==`);

  /* 1. coverage: no bone left for the bind pose to claim */
  const idleBones = new Set(idle.tracks
    .filter(t => t.name.endsWith('.quaternion'))
    .map(t => t.name.replace('.quaternion', '')));
  const clipBones = new Set(clip.tracks
    .filter(t => t.name.endsWith('.quaternion'))
    .map(t => t.name.replace('.quaternion', '')));
  const uncovered = [...idleBones].filter(b => !clipBones.has(b));
  ok(uncovered.length === 0,
     `every idle-driven bone has a track — no T-pose leak (${uncovered.length} missing)`);
  ok(clip.tracks.some(t => t.name === 'mixamorigHips.position'),
     'hips carry a position track (support re-lowering)');
  ok(clip.tracks.every(t => t.values.every(Number.isFinite)), 'no NaN in any track');

  /* 2. authored key times, straight off a support-leg track (robust to
   * future re-timing).  Bookends at 0 and duration must be present. */
  const supTrack = clip.tracks.find(t => t.name === 'mixamorigLeftUpLeg.quaternion');
  const keys = Array.from(supTrack.times);
  ok(keys[0] === 0 && Math.abs(keys[keys.length - 1] - clip.duration) < 1e-6,
     `base-pose bookends at t=0 and t=end (keys: ${keys.map(k => k.toFixed(2)).join(', ')})`);

  /* 3. support toe holds baseline height + sole stays flat at every key */
  let worstToe = 0, worstTwist = 0;
  for (const t of keys) {
    sampleAt(clip, t);
    worstToe = Math.max(worstToe, Math.abs(wp('mixamorigLeftToeBase').y - base.supToeY));
    worstTwist = Math.max(worstTwist,
      wq('mixamorigLeftFoot').angleTo(base.supFootQ) * (180 / Math.PI));
  }
  ok(worstToe < 0.012,
     `support toe holds baseline height at every key (worst ${worstToe.toFixed(4)})`);
  ok(worstTwist < 3,
     `support sole stays flat at every key (worst ${worstTwist.toFixed(2)} deg)`);

  /* 4. the kicking foot actually travels — dense sweep */
  let maxDisp = 0, peakY = -Infinity, maxLat = 0, maxFwd = 0;
  const N = 50;
  for (let i = 0; i <= N; i++) {
    sampleAt(clip, (i / N) * clip.duration);
    const p = wp('mixamorigRightToeBase');
    maxDisp = Math.max(maxDisp, p.distanceTo(base.kickToe));
    peakY = Math.max(peakY, p.y);
    maxLat = Math.max(maxLat, Math.abs(p.x - base.kickToe.x));
    maxFwd = Math.max(maxFwd, p.z - base.kickToe.z);
  }
  ok(maxDisp > 0.35, `kicking foot travels (max ${maxDisp.toFixed(3)} from rest)`);
  ok(peakY > base.hips.y * 0.5,
     `kick reaches height (toe peak ${peakY.toFixed(3)}, hips at ${base.hips.y.toFixed(3)})`);

  /* 5. base pose restored at t=end */
  sampleAt(clip, clip.duration + 0.02);
  const endErr = Math.max(
    wp('mixamorigHead').distanceTo(base.head),
    wp('mixamorigHips').distanceTo(base.hips),
    wp('mixamorigRightToeBase').distanceTo(base.kickToe),
    wp('mixamorigRightHand').distanceTo(base.rHand),
  );
  ok(endErr < 0.025, `returns to base pose at end (worst joint off by ${endErr.toFixed(4)})`);

  console.log(`  measured: disp ${maxDisp.toFixed(3)}  peakY ${peakY.toFixed(3)}  ` +
              `lateral ${maxLat.toFixed(3)}  forward ${maxFwd.toFixed(3)}`);
  return { maxDisp, peakY, maxLat, maxFwd };
}

const kick = checkClip(buildKickClip(idle), 'front kick');
const round = checkClip(buildRoundhouseClip(idle), 'roundhouse');

/* The two clips must read differently: the kick drives FORWARD, the
 * roundhouse sweeps ACROSS. */
console.log('');
ok(kick.maxFwd > 0.30, `front kick strikes forward (+${kick.maxFwd.toFixed(3)} world Z)`);
ok(round.maxLat > kick.maxLat,
   `roundhouse sweeps wider than the kick (${round.maxLat.toFixed(3)} vs ${kick.maxLat.toFixed(3)} lateral)`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — kicks are real');
process.exit(fails ? 1 : 0);
