/* ============================================================
 * MeckaHangar.js — the customisation screen.
 *
 *   top 40%  · THREE viewport: pedestal, sway, drag-to-spin, rarity flash,
 *              five anchor nodes wired to the mecka's real bones by live
 *              SVG leader lines.
 *   btm 60%  · datapad DOM: stat bars with ghost/delta preview, filtered
 *              inventory grid, eye-colour picker, confirm/equip actions.
 *
 * The model is built ONCE with all 32 sets present (hidden), because the
 * Hangar swaps live — same trade the offline viewer makes.  In battle,
 * Fighter builds only the 1–5 sets its loadout actually names.
 * ============================================================ */
import * as THREE from 'three';
import { buildMeckaKnightScene, SET_CATALOG } from './MeckaKnightProcedural.js';
import {
  SLOTS, SLOT_IDS, RARITY, STATS, STAT_MAX,
  buildCatalog, indexParts, totalStats,
  EYE_PRIMARY, EYE_EXTRA, DEFAULT_LOADOUT,
} from './HangarCatalog.js';

const LS_KEY = 'mecka.hangar.v1';

/* Fixed screen anchors, as fractions of the stage box.  Deliberately NOT
 * glued to the joints: thin-mesh raycasting is miserable on a phone, so the
 * node stays put with a fat hitbox and a leader line does the pointing. */
const NODE_POS = {
  helmet: [0.50, 0.09],
  armR:   [0.11, 0.40],   // character's right arm renders on SCREEN LEFT
  armL:   [0.89, 0.40],
  torso:  [0.11, 0.76],
  legs:   [0.89, 0.76],
};

const SLOT_GLYPH = {
  helmet: 'M12 3 5 6v5c0 4 3 6.6 7 8 4-1.4 7-4 7-8V6z',
  torso:  'M6 4h12l-1 6 2 9H7l2-9z',
  armR:   'M9 3h5l1 6-2 12h-4l1-12z',
  armL:   'M10 3h5l1 12-1 6h-4l-2-12z',
  legs:   'M7 3h10l-1 8-1 10h-3l-1-8-1 8H7l1-10z',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* Read the saved loadout WITHOUT constructing the Hangar.  App needs this at
 * boot so Fighter knows what to wear, but building the Hangar means building
 * all 32 sets (~3,150 meshes) — too expensive to pay for on a launch that
 * goes straight to BATTLE. */
export function readHangarState() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (raw && raw.loadout) {
      const valid = new Set(SET_CATALOG.map((s) => s.key));
      const lo = { ...DEFAULT_LOADOUT };
      for (const s of SLOT_IDS) if (valid.has(raw.loadout[s])) lo[s] = raw.loadout[s];
      return { loadout: lo, eye: raw.eye ?? null };
    }
  } catch (e) { /* corrupt or blocked — fall through to defaults */ }
  return { loadout: { ...DEFAULT_LOADOUT }, eye: { hex: '#8ee9ff', level: 2 } };
}

export class MeckaHangar {
  constructor(rootEl) {
    this.root = rootEl;
    this.stage = rootEl.querySelector('.hangar-stage');
    this.canvas = rootEl.querySelector('#hangar-canvas');
    this.svg = rootEl.querySelector('#hangar-lines');
    this.nodeLayer = rootEl.querySelector('#hangar-nodes');
    this.flashEl = rootEl.querySelector('#hangar-flash');

    const { parts, sets } = buildCatalog(SET_CATALOG);
    this.parts = parts;
    this.sets = sets;
    this.partIndex = indexParts(parts);

    const saved = this._load();
    this.equipped = saved.loadout;
    this.eye = saved.eye;                     // {hex, level} | null (= branded)
    this.preview = null;                      // {kind:'part'|'set', slot?, setKey}
    this.activeSlot = 'helmet';
    this.mode = 'components';                 // 'components' | 'sets'
    this.eyeExpanded = false;

    this._running = false;
    this._changeCb = null;
    this._backCb = null;
    this._t = 0;
    this._userYaw = 0;
    this._spin = 0;
    this._flash = { t: 0, color: new THREE.Color() };
    this._proj = new THREE.Vector3();

    this._initThree();
    this._buildNodes();
    this._buildDOM();
    this._render();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  onChange(cb) { this._changeCb = cb; }
  onBack(cb)   { this._backCb = cb; }
  getLoadout() { return { ...this.equipped }; }
  getEye()     { return this.eye ? { ...this.eye } : null; }

  /* ---------------- Three ---------------- */
  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1730);
    this.scene.fog = new THREE.Fog(0x0a1730, 9, 20);

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

    this.scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x141c2e, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x5f8fd8, 0.5);
    fill.position.set(-4, 2, 3);
    this.scene.add(fill);

    // Rarity flash rims — dark until a part is confirmed, then they pulse.
    this.rimL = new THREE.PointLight(0xffffff, 0, 12, 2);
    this.rimR = new THREE.PointLight(0xffffff, 0, 12, 2);
    this.rimL.position.set(-2.4, 2.0, 1.4);
    this.rimR.position.set(2.4, 2.0, 1.4);
    this.scene.add(this.rimL, this.rimR);

    // Pedestal.
    this.pedestal = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.75, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x2c3a52, metalness: 0.5, roughness: 0.55, flatShading: true }),
    );
    disc.position.y = -0.08;
    disc.receiveShadow = true;
    this.pedestal.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.035, 6, 64),
      new THREE.MeshStandardMaterial({ color: 0x0d1a2e, emissive: 0x46d8ff, emissiveIntensity: 1.6 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    this.pedestal.add(ring);
    this.spinRing = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.02, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x0d1a2e, emissive: 0x46d8ff, emissiveIntensity: 1.1 }),
      );
      const a = (i / 8) * Math.PI * 2;
      spoke.position.set(Math.cos(a) * 1.38, 0.02, Math.sin(a) * 1.38);
      spoke.rotation.y = -a;
      this.spinRing.add(spoke);
    }
    this.pedestal.add(this.spinRing);
    this.scene.add(this.pedestal);

    // The mecka.  All 32 sets built (hidden) so equip() can swap instantly.
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.model = buildMeckaKnightScene({ equip: this.equipped });
    this.mecka = this.model.userData.mecka;
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.pivot.add(this.model);
    this._applyEye();
    this._frameModel();

    this.bones = {};
    for (const s of SLOTS) this.bones[s.id] = this.model.getObjectByName(s.bone) || null;

    // Drag to spin.
    let dragging = false, lastX = 0;
    const down = (e) => { dragging = true; lastX = (e.touches ? e.touches[0] : e).clientX; };
    const move = (e) => {
      if (!dragging) return;
      const x = (e.touches ? e.touches[0] : e).clientX;
      this._spin = (x - lastX) * 0.012;
      this._userYaw += this._spin;
      lastX = x;
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { dragging = false; };
    this.canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    this._dragTeardown = () => {
      this.canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  /* Fit the camera to whatever the model actually measures — the armature
   * carries a 0.28 scale and every tier has its own bulk multiplier, so
   * hard-coding a camera distance would drift the moment a set changes. */
  _frameModel() {
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    this.model.position.y -= box.min.y;          // stand it on the pedestal
    const h = size.y;
    const dist = (h * 1.28) / Math.tan((this.camera.fov * Math.PI) / 360);
    this._camTarget = new THREE.Vector3(0, h * 0.52, 0);
    this._camDist = dist;
    this.camera.position.set(0, h * 0.60, dist);
    this.camera.lookAt(this._camTarget);
    this._modelH = h;
    void centre;
  }

  /* ---------------- anchor nodes ---------------- */
  _buildNodes() {
    this.nodeLayer.innerHTML = '';
    this.svg.innerHTML = '';
    this.nodeEls = {};
    this.lineEls = {};
    for (const s of SLOTS) {
      const [fx, fy] = NODE_POS[s.id];
      const btn = document.createElement('button');
      btn.className = 'hangar-node';
      btn.dataset.slot = s.id;
      btn.style.left = `${fx * 100}%`;
      btn.style.top = `${fy * 100}%`;
      btn.innerHTML =
        `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SLOT_GLYPH[s.id]}"/></svg>` +
        `<span class="node-label">${s.label}</span>`;
      btn.addEventListener('click', () => this._setActiveSlot(s.id));
      this.nodeLayer.appendChild(btn);
      this.nodeEls[s.id] = btn;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('class', 'hangar-leader');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('class', 'hangar-joint');
      dot.setAttribute('r', '3');
      g.appendChild(line); g.appendChild(dot);
      this.svg.appendChild(g);
      this.lineEls[s.id] = { line, dot, g };
    }
  }

  /* Runs every frame: project each bone to screen space and redraw the
   * elbowed leader line from the fixed node to the moving joint. */
  _updateLeaders(w, h) {
    for (const s of SLOTS) {
      const bone = this.bones[s.id];
      const els = this.lineEls[s.id];
      if (!bone) { els.g.style.display = 'none'; continue; }
      bone.getWorldPosition(this._proj);
      this._proj.project(this.camera);
      const behind = this._proj.z > 1;
      els.g.style.opacity = behind ? '0.22' : '1';
      const jx = (this._proj.x * 0.5 + 0.5) * w;
      const jy = (-this._proj.y * 0.5 + 0.5) * h;
      const [fx, fy] = NODE_POS[s.id];
      const nx = fx * w, ny = fy * h;
      const mx = nx + (jx - nx) * 0.42;         // elbow: out horizontally, then in
      els.line.setAttribute('points', `${nx},${ny} ${mx},${ny} ${jx},${jy}`);
      els.dot.setAttribute('cx', jx);
      els.dot.setAttribute('cy', jy);
    }
  }

  /* ---------------- DOM ---------------- */
  _buildDOM() {
    // Stat bars.
    const statWrap = this.root.querySelector('#hangar-stats');
    statWrap.innerHTML = STATS.map((s) => `
      <div class="stat-row" data-stat="${s.id}">
        <div class="stat-head">
          <span class="stat-icon" style="--c:${s.color}"></span>
          <span class="stat-label">${s.label}</span>
          <span class="stat-value">0</span>
          <span class="stat-delta"></span>
        </div>
        <div class="stat-track">
          <div class="stat-fill" style="--c:${s.color}"></div>
          <div class="stat-ghost"></div>
        </div>
      </div>`).join('');

    // Mode tabs.
    this.root.querySelector('#hangar-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (!b) return;
      this.mode = b.dataset.mode;
      this._clearPreview();
      this._render();
    });

    // Inventory (delegated).
    this.gridEl = this.root.querySelector('#hangar-grid');
    this.gridEl.addEventListener('click', (e) => {
      const card = e.target.closest('.part-card');
      if (!card) return;
      if (this.mode === 'sets') this._previewSet(card.dataset.set);
      else this._previewPart(card.dataset.set, card.dataset.slot);
    });

    // Eyes.
    this.eyeEl = this.root.querySelector('#hangar-eyes');
    this.eyeEl.addEventListener('click', (e) => {
      const more = e.target.closest('[data-eye-more]');
      if (more) { this.eyeExpanded = !this.eyeExpanded; this._renderEyes(); return; }
      const brand = e.target.closest('[data-eye-brand]');
      if (brand) { this.eye = null; this._applyEye(); this._save(); this._renderEyes(); return; }
      const sw = e.target.closest('[data-eye-hex]');
      if (sw) {
        this.eye = { hex: sw.dataset.eyeHex, level: this.eye ? this.eye.level : 2 };
        this._applyEye(); this._save(); this._renderEyes(); return;
      }
      const pip = e.target.closest('[data-eye-level]');
      if (pip) {
        const hex = this.eye ? this.eye.hex : EYE_PRIMARY[1][1];
        this.eye = { hex, level: +pip.dataset.eyeLevel };
        this._applyEye(); this._save(); this._renderEyes();
      }
    });

    // Actions.
    this.confirmBtn = this.root.querySelector('#hangar-confirm');
    this.confirmBtn.addEventListener('click', () => this._confirm());
    this.root.querySelector('#hangar-fullset').addEventListener('click', () => {
      const key = this.preview ? this.preview.setKey : this.equipped[this.activeSlot];
      this._previewSet(key);
      this._confirm();
    });
    this.root.querySelector('#hangar-back').addEventListener('click', () => this._backCb?.());
  }

  _setActiveSlot(slot) {
    this.activeSlot = slot;
    if (this.mode === 'sets') this.mode = 'components';
    this._clearPreview();
    this._render();
    this.gridEl.scrollTop = 0;
  }

  /* ---------------- preview / confirm ---------------- */
  _effectiveLoadout() {
    const lo = { ...this.equipped };
    if (!this.preview) return lo;
    if (this.preview.kind === 'set') for (const s of SLOT_IDS) lo[s] = this.preview.setKey;
    else lo[this.preview.slot] = this.preview.setKey;
    return lo;
  }

  _applyLoadoutToModel(lo) {
    for (const s of SLOT_IDS) this.mecka.equip(s, lo[s]);
  }

  _previewPart(setKey, slot) {
    if (this.equipped[slot] === setKey && !this.preview) return;
    this.preview = { kind: 'part', slot, setKey };
    this._applyLoadoutToModel(this._effectiveLoadout());
    this._render();
  }

  _previewSet(setKey) {
    this.preview = { kind: 'set', setKey };
    this._applyLoadoutToModel(this._effectiveLoadout());
    this._render();
  }

  _clearPreview() {
    if (!this.preview) return;
    this.preview = null;
    this._applyLoadoutToModel(this.equipped);
  }

  _confirm() {
    if (!this.preview) return;
    const tier = this.sets.find((s) => s.key === this.preview.setKey)?.tier || 'common';
    this.equipped = this._effectiveLoadout();
    this.preview = null;
    this._applyLoadoutToModel(this.equipped);
    this._flashRarity(tier);
    this._save();
    this._render();
    this._changeCb?.(this.getLoadout(), this.getEye());
  }

  _flashRarity(tier) {
    this._flash.color.set(RARITY[tier].color);
    this._flash.t = 1;
    this.flashEl.style.setProperty('--flash', RARITY[tier].color);
    this.flashEl.classList.remove('fire');
    void this.flashEl.offsetWidth;              // restart the CSS animation
    this.flashEl.classList.add('fire');
  }

  _applyEye() {
    if (this.eye) this.mecka.setEyeColor(this.eye.hex, this.eye.level);
    else this.mecka.setEyeColor(null);          // back to each set's branded eyes
  }

  /* ---------------- rendering ---------------- */
  _render() {
    this._renderStats();
    this._renderTabs();
    this._renderGrid();
    this._renderEyes();
    this._renderNodes();

    const p = this.preview;
    const set = p ? this.sets.find((s) => s.key === p.setKey) : null;
    this.confirmBtn.disabled = !p;
    this.confirmBtn.textContent = p
      ? (p.kind === 'set' ? `EQUIP ${set.label} SET` : `EQUIP ${set.label}`)
      : 'CONFIRM LOADOUT';
    this.root.querySelector('#hangar-blurb').textContent =
      set ? set.blurb : 'Tap a node to filter. Tap a part to preview.';
  }

  _renderStats() {
    const now = totalStats(this.equipped, this.partIndex);
    const next = totalStats(this._effectiveLoadout(), this.partIndex);
    for (const s of STATS) {
      const row = this.root.querySelector(`.stat-row[data-stat="${s.id}"]`);
      const a = now[s.id], b = next[s.id];
      const max = STAT_MAX[s.id];
      const gain = b > a;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      row.querySelector('.stat-value').textContent = this.preview ? b : a;
      row.querySelector('.stat-fill').style.width = `${clamp((lo / max) * 100, 0, 100)}%`;
      const ghost = row.querySelector('.stat-ghost');
      const show = this.preview && a !== b;
      ghost.style.left = `${clamp((lo / max) * 100, 0, 100)}%`;
      ghost.style.width = show ? `${clamp(((hi - lo) / max) * 100, 0, 100)}%` : '0%';
      ghost.style.setProperty('--g', gain ? '#7dff9c' : '#ff4d5a');
      ghost.classList.toggle('on', !!show);
      const d = row.querySelector('.stat-delta');
      d.textContent = show ? `${gain ? '+' : ''}${b - a}` : '';
      d.className = `stat-delta${show ? (gain ? ' up' : ' down') : ''}`;
    }
  }

  _renderTabs() {
    this.root.querySelectorAll('#hangar-tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === this.mode);
    });
  }

  _renderGrid() {
    const eff = this._effectiveLoadout();
    let items;
    if (this.mode === 'sets') {
      items = this.sets.map((s) => ({
        setKey: s.key, label: s.label, tier: s.tier, slot: '',
        on: SLOT_IDS.every((sl) => this.equipped[sl] === s.key),
        prev: this.preview?.kind === 'set' && this.preview.setKey === s.key,
        glyph: SLOT_GLYPH.torso,
      }));
    } else {
      const slot = this.activeSlot;
      items = this.parts.filter((p) => p.slot === slot).map((p) => ({
        setKey: p.setKey, label: p.setLabel, tier: p.tier, slot,
        on: this.equipped[slot] === p.setKey,
        prev: this.preview?.kind !== 'set' && eff[slot] === p.setKey && this.equipped[slot] !== p.setKey,
        glyph: SLOT_GLYPH[slot],
      }));
    }
    this.gridEl.innerHTML = items.map((i) => `
      <button class="part-card${i.on ? ' equipped' : ''}${i.prev ? ' previewing' : ''}"
              data-set="${i.setKey}" data-slot="${i.slot}"
              style="--r:${RARITY[i.tier].color}">
        <span class="card-art"><svg viewBox="0 0 24 24"><path d="${i.glyph}"/></svg></span>
        <span class="card-name">${i.label}</span>
        <span class="card-tier"></span>
        ${i.on ? '<span class="card-flag">EQUIPPED</span>' : ''}
      </button>`).join('');
  }

  _renderEyes() {
    const list = this.eyeExpanded ? EYE_PRIMARY.concat(EYE_EXTRA) : EYE_PRIMARY;
    const sw = list.map(([name, hex]) => `
      <button class="eye-sw${this.eye?.hex === hex ? ' on' : ''}" data-eye-hex="${hex}"
              style="--e:${hex}" title="${name}" aria-label="${name}"></button>`).join('');
    const pips = [0, 1, 2, 3, 4].map((l) => `
      <button class="eye-pip${this.eye?.level === l ? ' on' : ''}" data-eye-level="${l}"
              aria-label="Brightness ${l + 1}"></button>`).join('');
    this.eyeEl.innerHTML = `
      <div class="eye-head">
        <span>OPTICS</span>
        <button class="eye-brand${this.eye ? '' : ' on'}" data-eye-brand>SET DEFAULT</button>
      </div>
      <div class="eye-grid">${sw}</div>
      <div class="eye-foot">
        <button class="eye-more" data-eye-more>${this.eyeExpanded ? '− LESS' : '+8 MORE'}</button>
        <div class="eye-pips">${pips}</div>
      </div>`;
  }

  _renderNodes() {
    for (const s of SLOTS) {
      const el = this.nodeEls[s.id];
      el.classList.toggle('active', this.activeSlot === s.id && this.mode === 'components');
      const eff = this._effectiveLoadout()[s.id];
      const tier = this.sets.find((x) => x.key === eff)?.tier || 'common';
      el.style.setProperty('--r', RARITY[tier].color);
    }
  }

  /* ---------------- loop ---------------- */
  start() {
    if (this._running) return;
    this._running = true;
    this.resize();
    const tick = () => {
      if (!this._running) return;
      this._frame();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  _frame() {
    const dt = 1 / 60;
    this._t += dt;
    this._userYaw += this._spin;
    this._spin *= 0.90;                                   // drag inertia
    this.pivot.rotation.y = this._userYaw + Math.sin(this._t * 0.55) * 0.30;
    this.spinRing.rotation.y += dt * 0.35;

    if (this._flash.t > 0) {
      this._flash.t = Math.max(0, this._flash.t - dt * 1.6);
      const k = Math.sin(this._flash.t * Math.PI) * 5.5;   // ease in and back out
      this.rimL.color.copy(this._flash.color); this.rimR.color.copy(this._flash.color);
      this.rimL.intensity = k; this.rimR.intensity = k;
    }

    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this._updateLeaders(w, h);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // A 9:16 phone's top 40% is a WIDE box (~1.4:1).  Pull back on narrow
    // aspects so a TITAN never clips its own pauldrons off-screen.
    const fit = clamp(1.45 / this.camera.aspect, 1, 1.9);
    this.camera.position.set(0, this._modelH * 0.60, this._camDist * fit);
    this.camera.lookAt(this._camTarget);
    this.camera.updateProjectionMatrix();
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  /* ---------------- persistence ---------------- */
  _load() { return readHangarState(); }

  _save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ loadout: this.equipped, eye: this.eye }));
    } catch (e) { /* private mode — the loadout just won't persist */ }
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this._dragTeardown?.();
    this.renderer.dispose();
  }
}
