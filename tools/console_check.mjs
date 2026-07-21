/* ============================================================
 * console_check.mjs — drives the REAL BattleScreen against the REAL
 * index.html in jsdom, with no GPU at all.  BattleScreen was built
 * renderer-free precisely so this file can exist: everything the M1
 * screen does except put pixels on glass — Console cards, wave label,
 * speed toggle, hover-slide lean, thrusters, malfunction FX, the end
 * flow — is asserted here.  What it cannot judge is feel; that gate
 * is the phone.
 *
 *   cd tools && node console_check.mjs
 * ============================================================ */
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import fs from 'fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://localhost/' });
const { window } = dom;
for (const k of ['window','document','navigator','localStorage','HTMLElement','Element',
                 'SVGElement','requestAnimationFrame','cancelAnimationFrame','screen',
                 'devicePixelRatio','getComputedStyle','Node'])
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
globalThis.window.matchMedia ??= () => ({ matches: false, addListener(){}, removeListener(){} });

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

const { CONFIG } = await import('../src/config.js');
const { BattleScreen } = await import('../src/game/BattleScreen.js');
const { buildMeckaKnightScene } = await import('../src/game/MeckaKnightProcedural.js');
const { JAMMO_SKELETON } = await import('../src/game/meckaSkeletonData.js');

/* ---- assets fixture: same recipe as battle_check ---- */
const mkClip = (n, d) => new THREE.AnimationClip(n, d, JAMMO_SKELETON.slice(0, 8).map(b =>
  new THREE.QuaternionKeyframeTrack(`${b.n}.quaternion`,
    new Float32Array([0, d]), new Float32Array([...b.r, ...b.r]))));
const clips = {};
for (const n of ['idle','jab','cross','hook','uppercut','shield','dodge','dash','hit','ko','crouch','kick','roundhouse','victory'])
  clips[n] = mkClip(n, 1);
const assets = { clips, characters: { mecka: {
  procedural: true, meshScale: 2.0, groundLift: 0.85, autoFit: false,
  build: buildMeckaKnightScene,
} } };

const blue = { helmet: 'blue', torso: 'blue', armR: 'blue', armL: 'blue', legs: 'blue' };
const consoleEl = window.document.getElementById('console');
const overlayEl = window.document.getElementById('arena-overlay');
const announced = [];
let endResult = null;

const screen = new BattleScreen({
  assets, renderer: null, aspect: 0.5, consoleEl, overlayEl,
  announcer: (t) => announced.push(t),
  onEnd: (r) => { endResult = r; },
  seed: 42,
  playerTeam: [{ name: 'MECKA', loadout: blue, hpMax: 70 }],
  waves: [[{ set: 'red', hpMax: 70 }]],
});

/* ---- 1. Arena overlay skeleton (M3: bars live under the units) ---- */
screen.update(1 / 60);           // bars are lazily built on first update
ok(overlayEl.querySelectorAll('.ao-unit').length === 2, `one arena bar stack per unit`);
ok(overlayEl.querySelector('.ao-unit.side-player') !== null &&
   overlayEl.querySelector('.ao-unit.side-enemy') !== null, `bars are side-tinted`);
ok(overlayEl.querySelectorAll('.ao-hp').length === 2 &&
   overlayEl.querySelectorAll('.ao-sp').length === 2, `each stack carries HP + super`);
ok(consoleEl.querySelector('#console-cards') === null &&
   consoleEl.querySelectorAll('.ucard').length === 0,
   `the console carries no unit cards (inputs only)`);
ok(window.document.getElementById('console-wave').textContent === 'WAVE 1/1',
   `wave label reads WAVE 1/1`);
ok(window.document.getElementById('console-speed').textContent === 'x1', `speed starts at x1`);

/* ---- 2. malfunction FX, forced early (no immunity yet, deterministic) ---- */
const pUnit = screen.battle.units.find(u => u.side === 'player');
pUnit.stress = 100;
let sawStun = false, sawEyeDip = false;
const pVis = screen.vis.get(pUnit.id);
for (let i = 0; i < 45; i++) {
  screen.update(1 / 60);
  if (pUnit.fighter.stunTime > 0) sawStun = true;
  if (pVis.emissives.length && pVis.emissives.some(e => e.mat.emissiveIntensity < e.base * 0.5)) sawEyeDip = true;
}
ok(sawStun, `stress overload stuns the unit`);
ok(announced.includes('MALFUNCTION'), `announcer calls the malfunction`);
ok(pVis.emissives.length > 0, `unit has genuine emissive eyes to flicker (${pVis.emissives.length} mats)`);
ok(sawEyeDip, `eye emissive dips during the flicker`);
const eyesRestored = () => pVis.emissives.every(e => Math.abs(e.mat.emissiveIntensity - e.base) < 1e-6);
for (let i = 0; i < 90 && !eyesRestored(); i++) screen.update(1 / 60);
ok(eyesRestored(), `eye intensity restored after the malfunction ends`);

/* ---- 3. hover-slide: lean + thrusters while units close in ---- */
let maxLean = 0, maxThrust = 0;
for (let i = 0; i < 150; i++) {
  screen.update(1 / 60);
  for (const u of screen.battle.units) {
    const v = screen.vis.get(u.id);
    maxLean = Math.max(maxLean, Math.abs(u.fighter._animRoot.rotation.x));
    maxThrust = Math.max(maxThrust, v.thrusters[0].material.opacity);
  }
}
ok(maxLean > 0.02, `hover lean engages while sliding (peak ${maxLean.toFixed(3)} rad)`);
ok(maxLean <= CONFIG.team.screen.leanMax + 0.001,
   `lean respects the clamp (${maxLean.toFixed(3)} <= ${CONFIG.team.screen.leanMax})`);
ok(maxThrust > 0.05, `thrusters glow while moving (peak opacity ${maxThrust.toFixed(2)})`);

/* ---- 4. speed toggle really doubles sim time per wall second ---- */
const speedBtn = window.document.getElementById('console-speed');
const t1 = screen.battle.t;
for (let i = 0; i < 60; i++) screen.update(1 / 60);
const rate1 = screen.battle.t - t1;
speedBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
ok(speedBtn.textContent === 'x2', `toggle label flips to x2`);
const t2 = screen.battle.t;
for (let i = 0; i < 60; i++) screen.update(1 / 60);
const rate2 = screen.battle.t - t2;
ok(Math.abs(rate1 - 1.0) < 0.05 && Math.abs(rate2 - 2.0) < 0.1,
   `x2 doubles the sim rate (${rate1.toFixed(2)}s -> ${rate2.toFixed(2)}s per wall second)`);

/* ---- 5. arena bars move; damage numbers float; battle ends ---- */
const stacks = [...overlayEl.querySelectorAll('.ao-unit')];
const width = (c, sel) => parseFloat(c.querySelector(sel).style.width) || 0;
let sawHpDrop = false, sawGauge = false, sawDmgNum = false, guard = 0;
while (screen.battle.state === 'running' && guard++ < 30000) {
  screen.update(1 / 60);
  for (const c of stacks) {
    if (width(c, '.ao-hp .ao-fill') < 99.9) sawHpDrop = true;
    if (width(c, '.ao-sp .ao-fill') > 1) sawGauge = true;
  }
  if (!sawDmgNum) {
    for (const d of overlayEl.querySelectorAll('.ao-dmg')) {
      if (/^-\d+/.test(d.textContent) && parseFloat(d.style.opacity) > 0) sawDmgNum = true;
    }
  }
}
ok(screen.battle.state !== 'running', `battle reaches an end (${guard} frames driven)`);
ok(sawHpDrop, `arena HP bars shrink as damage lands`);
ok(sawGauge, `arena super meters fill from combat`);
ok(sawDmgNum, `damage numbers float over the victims`);

/* ---- 6. end flow: celebration delay, then onEnd exactly once ---- */
ok(endResult === null, `onEnd waits out the end delay (not fired at KO)`);
for (let i = 0; i < 300 && !endResult; i++) screen.update(1 / 60);
ok(!!endResult && (endResult.winner === 'player' || endResult.winner === 'enemy'),
   `onEnd fires with a winner (${endResult && endResult.winner})`);
const loser = screen.battle.units.find(u => u.dead);
ok(!!loser, `someone is down`);
ok(overlayEl.querySelector(`.ao-unit[data-uid="${loser.id}"]`)?.classList.contains('dead'),
   `the fallen unit's arena bars fade (.dead)`);
ok(announced.includes('VICTORY') || announced.includes('DEFEAT'), `announcer calls the result`);

/* ---- 7. camera never went non-finite ---- */
const cp = screen.cam.camera.position;
ok(Number.isFinite(cp.x) && Number.isFinite(cp.y) && Number.isFinite(cp.z),
   `camera position finite after a full battle`);

/* ---- 7b. default roster: no teams given -> the shipped 2v2 shape ---- */
{
  const dConsole = window.document.createElement('div');
  const dOverlay = window.document.createElement('div');
  const d = new BattleScreen({
    assets, renderer: null, aspect: 0.5,
    consoleEl: dConsole, overlayEl: dOverlay,
    announcer: () => {}, onEnd: () => {}, seed: 7,
  });
  d.update(1 / 60);
  ok(d.battle.units.length === 4, `default battle spawns 2v2 (${d.battle.units.length} units)`);
  const roles = (side) => d.battle.units.filter(u => u.side === side).map(u => u.role);
  ok(JSON.stringify(roles('player')) === '["melee","ranged"]' &&
     JSON.stringify(roles('enemy')) === '["melee","ranged"]',
     `each side fields a melee tank up front and a ranged back line`);
  ok(dOverlay.querySelectorAll('.ao-unit').length === 4,
     `all four default units get arena bars`);
  d.teardown();
}

/* ---- 8. CSS CONTRACT for the battle screen + Console.
       Twice a regex meant to delete one CSS block ate its neighbor and the
       only symptom was a screenshot.  Walk the live DOM (plus the state
       classes the screen toggles) and demand a rule for each. ---- */
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const used = new Set();
window.document.getElementById('battle-screen')
  .querySelectorAll('*').forEach(el => el.classList.forEach(c => used.add(c)));
for (const c of ['dead', 'malf', 'full', 'side-player', 'side-enemy', 'show']) used.add(c);
const missing = [...used].filter(c => !new RegExp(`\\.${c}[\\s,{.:>]`).test(css));
ok(missing.length === 0, `every battle-screen class has a CSS rule (${missing.join(',') || 'clean'})`);

/* ---- 9. teardown clears the Console and the scene ---- */
const childrenBefore = screen.scene3.children.length;
screen.teardown();
ok(overlayEl.children.length === 0, `teardown clears the arena overlay`);
ok(screen.scene3.children.length < childrenBefore, `teardown removes fighter roots from the scene`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — the Console holds');
process.exit(fails ? 1 : 0);
