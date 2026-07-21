/* ============================================================
 * ArenaOverlay.js — M3: the fight's UI lives IN the arena.
 *
 * A pointer-events-none DOM layer over the canvas.  Every frame it
 * projects world positions through the battle camera and places:
 *   - one micro-bar stack (HP + super meter) under each MECKA's feet,
 *     side-tinted, small footprint, lazily created so later waves get
 *     bars the moment they spawn;
 *   - floating damage numbers on every damaging hit — rise and fade,
 *     sized up for supers, dimmed for blocked chip.
 *
 * Purely presentational: reads units, writes DOM, touches no sim state.
 * The bottom console keeps only its inputs (speed toggle, wave label).
 * ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';

const DMG_POOL = 18;
const DMG_LIFE = 0.85;          // seconds on screen
const DMG_RISE = 56;            // px of float
const BAR_FOOT_Y = -0.12;       // world y of the bar anchor (under feet)

export class ArenaOverlay {
  /** @param {HTMLElement|null} el      the #arena-overlay layer
   *  @param {THREE.Camera}     camera  the live battle camera */
  constructor(el, camera) {
    this.el = el;
    this.camera = camera;
    this.bars = new Map();       // unit.id -> { root, hp, sp, unit }
    this.dmg = [];               // live floating numbers
    this._freeDmg = [];
    this._v = new THREE.Vector3();
  }

  _mkBar(unit) {
    const root = document.createElement('div');
    root.className = `ao-unit side-${unit.side}`;
    root.dataset.uid = String(unit.id);
    root.innerHTML =
      '<div class="ao-hp"><div class="ao-fill"></div></div>' +
      '<div class="ao-sp"><div class="ao-fill"></div></div>';
    this.el.appendChild(root);
    const rec = {
      root,
      hp: root.querySelector('.ao-hp .ao-fill'),
      sp: root.querySelector('.ao-sp .ao-fill'),
      unit,
    };
    this.bars.set(unit.id, rec);
    return rec;
  }

  /** Project a world point to overlay px.  Returns null when behind. */
  _toPx(wx, wy, wz) {
    const v = this._v.set(wx, wy, wz).project(this.camera);
    if (v.z > 1 || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
    const W = this.el.clientWidth, H = this.el.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  }

  /** Feed from the 'hit' log event: floats a number over the victim. */
  damage(victimUnit, amount, opts = {}) {
    if (!this.el || amount <= 0) return;
    let d = this._freeDmg.pop();
    if (!d) {
      if (this.dmg.length >= DMG_POOL) {
        d = this.dmg.shift();            // recycle the oldest mid-flight
      } else {
        d = { el: document.createElement('div') };
        this.el.appendChild(d.el);
      }
    }
    const p = victimUnit.fighter.root.position;
    d.t = 0;
    d.wx = p.x + (opts.jitter ?? 0);
    d.wy = p.y + 2.35;                   // above the chest
    d.wz = p.z;
    d.el.className = 'ao-dmg' +
      (opts.big ? ' big' : '') + (opts.blocked ? ' blk' : '');
    d.el.textContent = `-${Math.max(1, Math.round(amount))}`;
    d.el.style.opacity = '1';
    this.dmg.push(d);
  }

  update(units) {
    if (!this.el) return;
    this.camera.updateMatrixWorld();

    // ---- micro-bars under the feet ----
    const G = CONFIG.team.gauge.max;
    for (const u of units) {
      const rec = this.bars.get(u.id) || this._mkBar(u);
      if (u.dead) {
        if (!rec.root.classList.contains('dead')) rec.root.classList.add('dead');
        continue;
      }
      const p = u.fighter.root.position;
      const px = this._toPx(p.x, BAR_FOOT_Y, p.z);
      if (!px) { rec.root.style.opacity = '0'; continue; }
      rec.root.style.opacity = '1';
      rec.root.style.transform =
        `translate(${px.x.toFixed(1)}px, ${px.y.toFixed(1)}px) translate(-50%, 0)`;
      rec.hp.style.width = (clamp(u.fighter.hpFrac(), 0, 1) * 100).toFixed(1) + '%';
      rec.sp.style.width = (clamp(u.gauge / G, 0, 1) * 100).toFixed(1) + '%';
      rec.root.classList.toggle('full', !u.dead && u.gauge >= G - 0.001);
    }

    // ---- floating damage numbers ----
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.t += 1 / 60;                     // wall-ish; exactness irrelevant
      const u = Math.min(1, d.t / DMG_LIFE);
      const px = this._toPx(d.wx, d.wy, d.wz);
      if (!px || u >= 1) {
        d.el.style.opacity = '0';
        this.dmg.splice(i, 1);
        this._freeDmg.push(d);
        continue;
      }
      d.el.style.transform =
        `translate(${px.x.toFixed(1)}px, ${(px.y - u * DMG_RISE).toFixed(1)}px) translate(-50%, -100%)`;
      d.el.style.opacity = String(u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
    }
  }

  teardown() {
    if (!this.el) return;
    this.el.innerHTML = '';
    this.bars.clear();
    this.dmg.length = 0;
    this._freeDmg.length = 0;
  }
}
