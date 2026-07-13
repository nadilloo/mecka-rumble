/* ============================================================
 * crouch_check.mjs — proves the procedurally generated crouch actually works.
 *
 * Runs the clip through a real AnimationMixer bound to the real skeleton, so a
 * mis-named track shows up as "nothing moved" rather than passing quietly.
 *
 *   cd tools && node crouch_check.mjs
 * ============================================================ */
import * as THREE from 'three';
import { buildMeckaKnightScene } from '../src/game/MeckaKnightProcedural.js';
import { JAMMO_SKELETON } from '../src/game/meckaSkeletonData.js';
import { buildCrouchClip } from '../src/game/proceduralClips.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

/* A stand-in for Mixamo's Idle: a full-coverage clip, one track per bone.
 * The point is to reproduce the coverage a real clip has, so we can check the
 * crouch re-emits all of it and can't leak a T-pose. */
const idleTracks = JAMMO_SKELETON.map(b => new THREE.QuaternionKeyframeTrack(
  `${b.n}.quaternion`, new Float32Array([0, 1]),
  new Float32Array([...b.r, ...b.r]),
));
idleTracks.push(new THREE.VectorKeyframeTrack(
  'mixamorigHips.position', new Float32Array([0, 1]),
  new Float32Array([...JAMMO_SKELETON[0].t, ...JAMMO_SKELETON[0].t]),
));
const idle = new THREE.AnimationClip('idle', 1, idleTracks);

const clip = buildCrouchClip(idle);

/* ---- 1. coverage: no bone may be left for the bind pose to claim ---- */
const idleBones = new Set(idle.tracks
  .filter(t => t.name.endsWith('.quaternion'))
  .map(t => t.name.replace('.quaternion', '')));
const clipBones = new Set(clip.tracks
  .filter(t => t.name.endsWith('.quaternion'))
  .map(t => t.name.replace('.quaternion', '')));
const uncovered = [...idleBones].filter(b => !clipBones.has(b));
ok(uncovered.length === 0,
   `every bone idle drives has a crouch track — no T-pose leak (${uncovered.length} missing)`);
ok(clip.tracks.some(t => t.name === 'mixamorigHips.position'),
   `hips carry a position track (the drop)`);
ok(clip.tracks.every(t => t.values.every(Number.isFinite)),
   `no NaN in any track`);

/* ---- 2. run it through a real mixer on the real rig ---- */
const root = buildMeckaKnightScene({ sets: [], equip: null });
root.updateMatrixWorld(true);
const B = {};
root.traverse(o => { if (o.isBone) B[o.name] = o; });
const wp = n => B[n].getWorldPosition(new THREE.Vector3());
const wq = n => B[n].getWorldQuaternion(new THREE.Quaternion());

const before = {
  head: wp('mixamorigHead'), hips: wp('mixamorigHips'),
  lToe: wp('mixamorigLeftToeBase'), rToe: wp('mixamorigRightToeBase'),
  lKnee: wp('mixamorigLeftLeg'), lFootQ: wq('mixamorigLeftFoot'),
  lHand: wp('mixamorigLeftHand'),
};

const mixer = new THREE.AnimationMixer(root);
const action = mixer.clipAction(clip);
action.setLoop(THREE.LoopOnce, 1);
action.clampWhenFinished = true;
action.play();
mixer.update(clip.duration + 0.02);
root.updateMatrixWorld(true);

const after = {
  head: wp('mixamorigHead'), hips: wp('mixamorigHips'),
  lToe: wp('mixamorigLeftToeBase'), rToe: wp('mixamorigRightToeBase'),
  lKnee: wp('mixamorigLeftLeg'), lFootQ: wq('mixamorigLeftFoot'),
  lHand: wp('mixamorigLeftHand'),
};

const headDrop = before.head.y - after.head.y;
const dropPct = (headDrop / before.head.y) * 100;
ok(headDrop > 0.10, `the mixer actually bound the tracks — head dropped ${headDrop.toFixed(3)}`);
ok(dropPct > 14 && dropPct < 32, `crouch depth is ${dropPct.toFixed(1)}% of standing height`);

const lFootErr = Math.abs(after.lToe.y - before.lToe.y);
const rFootErr = Math.abs(after.rToe.y - before.rToe.y);
ok(lFootErr < 0.012 && rFootErr < 0.012,
   `feet stay planted on the floor (L ${lFootErr.toFixed(4)}, R ${rFootErr.toFixed(4)})`);

const footTwist = before.lFootQ.angleTo(after.lFootQ) * (180 / Math.PI);
ok(footTwist < 3, `soles stay flat — foot rotated only ${footTwist.toFixed(2)} deg`);

const kneeFwd = after.lKnee.z - before.lKnee.z;
ok(kneeFwd > 0.04, `knees travel forward, as a squat does (+${kneeFwd.toFixed(3)} on world Z)`);

// The T-pose leak, checked directly: if the arms were untracked they'd fling
// out sideways. The hand should stay roughly where idle put it.
const handDrift = before.lHand.distanceTo(after.lHand);
ok(handDrift < 0.22, `arms follow the body, not the bind pose (hand moved ${handDrift.toFixed(3)})`);

console.log(`\n  hips drop: ${clip.userData.hipsDropWorld.toFixed(3)} world units ` +
            `(local z +${clip.userData.hipsDropLocal.toFixed(2)})`);
console.log(`  hip ${clip.userData.hipDeg}deg / knee ${clip.userData.kneeDeg}deg / ${clip.duration}s`);
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — crouch is real');
process.exit(fails ? 1 : 0);
