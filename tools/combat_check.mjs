/* ============================================================
 * combat_check.mjs — drives a REAL Fighter, frame by frame.
 *
 * Fighter needs no renderer: the mesh is procedural THREE geometry and the
 * AnimationController is just a mixer.  So the combat state machine is fully
 * testable headlessly, and the punch buffer is exactly the kind of thing that
 * looks right in the diff and behaves wrong at 60fps.
 *
 *   cd tools && node combat_check.mjs
 * ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { Fighter } from '../src/game/Fighter.js';
import { buildMeckaKnightScene } from '../src/game/MeckaKnightProcedural.js';
import { JAMMO_SKELETON } from '../src/game/meckaSkeletonData.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

/* Synthetic clips: full bone coverage, like the real Mixamo ones. */
const mkClip = (name, dur) => new THREE.AnimationClip(name, dur,
  JAMMO_SKELETON.slice(0, 8).map(b => new THREE.QuaternionKeyframeTrack(
    `${b.n}.quaternion`, new Float32Array([0, dur]),
    new Float32Array([...b.r, ...b.r]))));
const clips = {};
for (const n of ['idle', 'jab', 'cross', 'hook', 'uppercut', 'shield', 'dodge',
                 'dash', 'hit', 'ko', 'crouch', 'kick', 'roundhouse', 'victory'])
  clips[n] = mkClip(n, 1);

const assets = {
  clips,
  characters: {
    mecka: { procedural: true, meshScale: 2.0, groundLift: 0.85, autoFit: false,
             build: buildMeckaKnightScene },
  },
};

const scene = new THREE.Group();
const mk = (isPlayer, x) => new Fighter({
  scene, assets, character: 'mecka', isPlayer, startX: x,
});
const F = CONFIG.fighter;
const ACT = F.actions;
const LINK = F.linkWindowFrames;
const FR = 1 / 60;

function fresh() {
  const a = mk(true, -2), b = mk(false, 2);
  return [a, b];
}
const tick = (a, b, n = 1) => { for (let i = 0; i < n; i++) { a.update(FR, b); b.update(FR, a); } };

/* ---- 1. a punch mid-swing is BUFFERED, not started ---- */
let [p, o] = fresh();
p.jab();
ok(p.action?.name === 'jab', `jab starts (${p.action?.name})`);
tick(p, o, 3);                                    // 3 frames in — still swinging
const wasElapsed = p.action.elapsedFrames;
p.hook();                                         // throw a hook mid-jab
ok(p.action?.name === 'jab', `hook thrown mid-jab does NOT cancel it (still ${p.action?.name})`);
ok(p._queuedAttack === 'hook', `...it is buffered (${p._queuedAttack})`);
ok(p.action.elapsedFrames === wasElapsed, `the jab's clip was not restarted`);

/* ---- 2. the buffered punch fires inside the link window, not before ---- */
const jabTotal = ACT.jab.startup + ACT.jab.active + ACT.jab.recovery;
const link = Math.min(LINK, Math.max(0, ACT.jab.recovery - 1));
const releaseAt = jabTotal - link;
let firedAt = null;
for (let f = wasElapsed; f < jabTotal + 4 && firedAt === null; f++) {
  tick(p, o, 1);
  if (p.action?.name === 'hook') firedAt = p.action.elapsedFrames === 0 ? f + 1 : null;
}
ok(p.action?.name === 'hook', `the buffered hook fires by itself (${p.action?.name})`);
const pct = Math.round((releaseAt / jabTotal) * 100);
ok(pct >= 75, `the jab played ${pct}% of its animation first (was 43% under cancels)`);

/* ---- 3. latest input wins — mashing can't stack a script ---- */
[p, o] = fresh();
p.jab(); tick(p, o, 2);
p.cross(); p.hook(); p.uppercut();
ok(p._queuedAttack === 'uppercut', `buffer is one deep, latest wins (${p._queuedAttack})`);

/* ---- 4. getting hit throws the buffer away ---- */
[p, o] = fresh();
p.jab(); tick(p, o, 2);
p.hook();
ok(p._queuedAttack === 'hook', `hook buffered`);
p.takeHit(8, 2, true, 'hook');
ok(p._queuedAttack === null, `a hit clears the buffer — no ghost punch out of stun`);

/* ---- 5. defensive options still cancel recovery.  That is the point of them. ---- */
[p, o] = fresh();
p.jab();
tick(p, o, ACT.jab.startup + ACT.jab.active + 1);   // into recovery
ok(p.action?.name === 'jab', `jab is in recovery`);
const dodged = p.dodgeBack(o.root.position.x);
ok(dodged && p.action?.name === 'dodge',
   `dodge STILL cancels a whiffed punch (${p.action?.name})`);

/* ---- 6. the combo he actually plays ---- */
[p, o] = fresh();
const hitStunEnds = ACT.jab.startup + 1 + ACT.jab.hitStun;
const hookLands = releaseAt + ACT.hook.startup + 1;
ok(hookLands <= hitStunEnds,
   `jab -> hook still LINKS: hook lands f${hookLands}, jab's hitstun ends f${hitStunEnds}`);

console.log(`\n  link window: ${LINK} frames (CONFIG.fighter.linkWindowFrames)`);
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — punches queue, they do not cancel');
process.exit(fails ? 1 : 0);
