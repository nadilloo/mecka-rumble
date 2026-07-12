/* ============================================================
 * boot_check.mjs — boots the REAL modules against the REAL index.html
 * in jsdom, stubbing only the GPU.  Exists because `node --check` and a
 * static DOM audit both passed the build that crashed on Danillo's phone:
 * UIManager's constructor reached for #stat-power, which no longer existed.
 * Syntax checks cannot catch that.  Booting can.
 *
 *   cd tools && node boot_check.mjs
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

const { UIManager } = await import('../src/ui/UIManager.js');
const { MeckaHangar } = await import('../src/game/MeckaHangar.js');
const { buildMeckaKnightScene } = await import('../src/game/MeckaKnightProcedural.js');
const { SLOTS, SLOT_IDS } = await import('../src/game/HangarCatalog.js');

/* ---- 1. UIManager must survive construction (this is what crashed) ---- */
let ui = null, err = null;
try { ui = new UIManager(); } catch (e) { err = e; }
ok(!err, `new UIManager() constructs ${err ? '-> ' + err.message : ''}`);
if (err) { console.log('\n1 FAILURE(S)'); process.exit(1); }

/* ---- 2. every screen must actually be showable ---- */
const shown = () => [...window.document.querySelectorAll('.screen.show')].map(e => e.id);
for (const name of ['menu', 'hangar', 'battle']) {
  ui.showScreen(name);
  const s = shown();
  ok(s.length === 1 && s[0] === `${name}-screen`,
     `showScreen('${name}') shows exactly #${name}-screen  [got: ${s.join(',') || 'NOTHING'}]`);
}

/* ---- 3. the Hangar, with only the GPU stubbed ---- */
class TestHangar extends MeckaHangar {
  _initThree() {                       // real model, real bones — fake renderer
    this.model = buildMeckaKnightScene({ equip: this.equipped });
    this.mecka = this.model.userData.mecka;
    this.bones = {};
    for (const s of SLOTS) this.bones[s.id] = this.model.getObjectByName(s.bone);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera();
    this.pivot = new THREE.Group();
    this.spinRing = new THREE.Group();
    this.rimL = this.rimR = { color: { copy() {} }, intensity: 0 };
    this.renderer = { setSize() {}, setPixelRatio() {}, render() {}, dispose() {}, shadowMap: {} };
    this._camTarget = new THREE.Vector3(); this._camDist = 5; this._modelH = 2;
    this._applyEye();
  }
}
let hangar = null; err = null;
try { hangar = new TestHangar(window.document.getElementById('hangar-screen')); }
catch (e) { err = e; }
ok(!err, `new MeckaHangar() constructs against the real DOM ${err ? '-> ' + err.message : ''}`);
if (err) { console.log('\n1 FAILURE(S)'); process.exit(1); }

const $ = (s) => window.document.querySelectorAll(s);
ok($('.hangar-node').length === 5, `5 anchor nodes rendered (${$('.hangar-node').length})`);
ok($('.stat-row').length === 3,    `3 stat bars rendered (${$('.stat-row').length})`);
ok($('.part-card').length === 32,  `inventory shows 32 helmet parts (${$('.part-card').length})`);
ok($('.eye-sw').length === 8,      `eye picker is a 2x4 grid (${$('.eye-sw').length})`);

/* ---- 4. drive the actual flow: filter -> preview -> confirm ---- */
$('.hangar-node')[4].dispatchEvent(new window.Event('click', { bubbles: true }));   // LEGS
ok(hangar.activeSlot === 'legs', `tapping the LEGS node filters to legs (${hangar.activeSlot})`);

const before = hangar.getLoadout().legs;
const card = [...$('.part-card')].find(c => c.dataset.set === 'titan');
card.dispatchEvent(new window.Event('click', { bubbles: true }));
ok(hangar.preview?.setKey === 'titan', `tapping TITAN previews it (${hangar.preview?.setKey})`);
ok(hangar.mecka.getEquipped('legs') === 'titan', `the 3D model swapped to TITAN legs`);
ok(hangar.getLoadout().legs === before, `preview does NOT commit yet (still ${before})`);

let fired = null;
hangar.onChange((lo) => { fired = lo; });
window.document.getElementById('hangar-confirm')
  .dispatchEvent(new window.Event('click', { bubbles: true }));
ok(hangar.getLoadout().legs === 'titan', `CONFIRM commits TITAN legs`);
ok(fired && fired.legs === 'titan', `onChange fires so App writes CONFIG.mecka.playerLoadout`);
ok(JSON.parse(window.localStorage.getItem('mecka.hangar.v1')).loadout.legs === 'titan',
   `loadout persisted to localStorage`);

const mixed = SLOT_IDS.map(s => `${s}=${hangar.getLoadout()[s]}`).join(' ');
ok(true, `final mixed loadout: ${mixed}`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — boots clean');
process.exit(fails ? 1 : 0);
