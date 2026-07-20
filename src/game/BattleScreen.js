/* ============================================================
   BattleScreen.js — M1: the sidescroll auto-battle presentation.

   Owns one battle from spawn to end modal:
     - a TeamBattle stepped on a fixed 60Hz accumulator (x1 / x2)
     - the 3D side: BattleScene + BrawlCamera + every unit's mesh
     - the Console (bottom 45%): unit cards with HP + gauge bars,
       wave counter, AUTO badge, speed toggle
     - presentation-only layers the headless sim knows nothing about:
       hover-slide lean + thrusters, malfunction FX (bone jitter,
       sparks, eye flicker), camera shake fed from the event log,
       KO/celebration anim ticking, the end sequence

   Deliberately renderer-free: App renders `screen.scene3` through
   `screen.cam.camera`.  That is what lets console_check.mjs drive the
   whole screen in jsdom with no GPU at all.

   Sim/presentation contract: nothing in here writes sim state except
   the speed toggle (which only changes how much sim time a wall-second
   buys).  Bone jitter is undone before every batch of sim steps, so
   the mixer, the FX, and determinism never fight.
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp, damp } from '../utils/math.js';
import { TeamBattle } from './TeamBattle.js';
import { BattleScene } from './BattleScene.js';
import { BrawlCamera } from './BrawlCamera.js';

const FRAME = 1 / 60;
const S = () => CONFIG.team.screen;

/* Bones worth jittering / sparking during a malfunction. */
const MALF_BONES = ['mixamorigSpine', 'mixamorigSpine2', 'mixamorigHead',
                    'mixamorigLeftArm', 'mixamorigRightArm'];

export class BattleScreen {
  /**
   * @param {object} opts
   *   assets      loaded asset pack (clips + characters)
   *   renderer    WebGLRenderer or null (headless) — only for the IBL bake
   *   aspect      initial camera aspect
   *   consoleEl   the #console section
   *   announcer   fn(text, ms)
   *   onEnd       fn(result) — fired once, after the end delay
   *   seed        battle seed
   *   playerTeam / waves — optional overrides (defaults: Hangar loadout
   *   vs one CONFIG.team.screen.enemySet)
   */
  constructor(opts) {
    this.assets = opts.assets;
    this.announcer = opts.announcer || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.speed = 1;

    this.battle = new TeamBattle({
      seed: opts.seed ?? 1,
      assets: opts.assets,
      overrides: opts.overrides,
      playerTeam: opts.playerTeam ||
        [{ name: 'MECKA', loadout: { ...CONFIG.mecka.playerLoadout } }],
      waves: opts.waves || [[{ set: S().enemySet }]],
    });

    // ---- 3D side ----
    this.scene = new BattleScene(opts.renderer || null);
    this.scene3 = this.scene.scene;
    this.cam = new BrawlCamera(opts.aspect || 0.5);

    // ---- Per-unit presentation state ----
    this.vis = new Map();
    for (const u of this.battle.units) this._initUnitVisual(u);

    // ---- Console DOM ----
    this.consoleEl = opts.consoleEl;
    this._buildConsole();

    // ---- Runtime state ----
    this._acc = 0;
    this._logCursor = 0;
    this._sparks = [];
    this._sparkGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this._jitterUndo = [];
    this._endT = -1;
    this._endResult = null;
    this._endFired = false;
    this._wallT = 0;
    this._fps = 60; this._fpsN = 0; this._fpsT = 0;
    this.debugEl = document.getElementById('debug');

    this.announcer('WAVE 1', 1100);
  }

  /* ================= per-unit visual rig ================= */

  _initUnitVisual(u) {
    const root = u.fighter.root;
    this.scene3.add(root);

    // Thrusters: two additive cones under the boots.  Children of the
    // fighter ROOT (not bones) — hover-slide is root motion, the legs
    // don't animate, so the flames ride the slide exactly.
    const mkThruster = (x) => {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.55, 8),
        new THREE.MeshBasicMaterial({
          color: 0x6fe0ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
      m.rotation.x = Math.PI;          // point down
      m.position.set(x, 0.30, 0);
      root.add(m);
      return m;
    };

    // Emissive materials (the eyes) — genuine emissives only, detected
    // by emissive colour, never by intensity (every default material
    // has intensity > 0).
    const emissives = [];
    root.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const mat of mats) {
        if (mat.emissive && mat.emissive.getHex() !== 0) {
          emissives.push({ mat, base: mat.emissiveIntensity });
        }
      }
    });

    const bones = [];
    root.traverse((o) => { if (o.isBone && MALF_BONES.includes(o.name)) bones.push(o); });

    this.vis.set(u.id, {
      prevX: root.position.x,
      vx: 0, lean: 0, thrust: 0,
      thrusters: [mkThruster(-0.24), mkThruster(0.24)],
      emissives, bones,
      malfUntil: -1, malfWasActive: false, sparkAt: 0,
      deadHandled: false,
    });
  }

  /* ================= Console DOM ================= */

  _buildConsole() {
    const el = this.consoleEl;
    if (!el) return;
    this.waveEl = el.querySelector('#console-wave');
    this.speedBtn = el.querySelector('#console-speed');
    const cardsEl = el.querySelector('#console-cards');
    cardsEl.innerHTML = '';
    this.cards = new Map();

    for (const u of this.battle.units) {
      const card = document.createElement('div');
      card.className = `ucard side-${u.side}`;
      card.id = `ucard-${u.id}`;
      card.innerHTML =
        `<div class="ucard-name">${u.name}</div>` +
        `<div class="ubar hp"><div class="fill"></div></div>` +
        `<div class="ubar gauge"><div class="fill"></div></div>`;
      cardsEl.appendChild(card);
      this.cards.set(u.id, {
        card,
        hp: card.querySelector('.ubar.hp .fill'),
        gauge: card.querySelector('.ubar.gauge .fill'),
      });
    }

    if (this.speedBtn) {
      this._onSpeedClick = () => {
        this.speed = this.speed === 1 ? 2 : 1;
        this.speedBtn.textContent = `x${this.speed}`;
      };
      this.speedBtn.textContent = 'x1';
      this.speedBtn.addEventListener('click', this._onSpeedClick);
    }
  }

  _updateConsole() {
    if (!this.consoleEl) return;
    if (this.waveEl) {
      const w = Math.min(this.battle._nextWave, this.battle.waves.length);
      this.waveEl.textContent = `WAVE ${w}/${this.battle.waves.length}`;
    }
    for (const u of this.battle.units) {
      const c = this.cards.get(u.id);
      if (!c) continue;
      c.hp.style.width = (u.fighter.hpFrac() * 100) + '%';
      c.gauge.style.width = (clamp(u.gauge / CONFIG.team.gauge.max, 0, 1) * 100) + '%';
      c.card.classList.toggle('dead', u.dead);
      c.card.classList.toggle('malf',
        this._wallT < (this.vis.get(u.id)?.malfUntil ?? -1));
      c.card.classList.toggle('full',
        !u.dead && u.gauge >= CONFIG.team.gauge.max - 0.001);
    }
  }

  /* ================= frame update ================= */

  update(dt) {
    this._wallT += dt;

    // Undo last frame's cosmetic bone jitter BEFORE the sim advances,
    // so the mixer never blends against jittered poses.
    for (const [bone, q] of this._jitterUndo) bone.quaternion.copy(q);
    this._jitterUndo.length = 0;

    // ---- Fixed-step sim drive ----
    let stepped = 0;
    if (this.battle.state === 'running') {
      this._acc += dt * this.speed;
      const maxSteps = 8;
      while (this._acc >= FRAME && stepped < maxSteps &&
             this.battle.state === 'running') {
        this.battle.step();
        this._acc -= FRAME;
        stepped++;
      }
      if (this._acc >= FRAME) this._acc = 0;    // dropped a stall, don't spiral
    }
    const simDt = stepped * FRAME;

    this._pumpLog();

    // ---- Per-unit presentation ----
    for (const u of this.battle.units) {
      const v = this.vis.get(u.id);
      const f = u.fighter;
      const x = f.root.position.x;

      // Sim-time velocity: identical lean at x1 and x2.
      if (simDt > 0) v.vx = (x - v.prevX) / simDt;
      else v.vx = damp(v.vx, 0, 6, dt);
      v.prevX = x;

      // Hover-slide lean.  Measured 2026-07-20: +animRoot.rotation.x
      // tips the body toward its OWN facing on both sides, so
      // vx * facing gives forward-lean advancing, lean-back retreating.
      const targetLean = u.dead ? 0 :
        clamp(v.vx * f.facing * S().leanPerSpeed, -S().leanMax, S().leanMax);
      v.lean = damp(v.lean, targetLean, S().leanDamp, dt);
      f._animRoot.rotation.x = v.lean;

      // Thrusters.
      const targetThrust = u.dead ? 0 : clamp(Math.abs(v.vx) / S().thrusterFull, 0, 1);
      v.thrust = damp(v.thrust, targetThrust, S().thrusterDamp, dt);
      const flick = 0.72 + 0.28 * Math.sin(this._wallT * 47 + u.id * 2.1);
      for (const th of v.thrusters) {
        th.material.opacity = v.thrust * 0.8 * flick;
        th.scale.set(1, 0.55 + v.thrust * 0.9, 1);
        th.visible = v.thrust > 0.03;
      }

      // Dead units: the sim stops updating them, so the KO clip would
      // freeze on frame one.  Tick their mixer here, visual-only.
      if (u.dead) {
        if (!v.deadHandled) { v.deadHandled = true; f.anim.setPaused(false); }
        f.anim.update(dt * this.speed);
      } else if (this.battle.state !== 'running') {
        // After the battle ends the sim stops for everyone — keep the
        // survivors' celebration playing.
        f.anim.setPaused(false);
        f.anim.update(dt * this.speed);
      }

      this._malfFx(u, v, dt);
    }

    this._updateSparks(dt);
    this.cam.update(dt, this.battle.units.map(u => u.fighter));
    this._updateConsole();
    this._updateDebug(dt);

    // ---- End sequence ----
    if (this._endT >= 0) {
      this._endT -= dt;
      if (this._endT < 0 && !this._endFired) {
        this._endFired = true;
        this.onEnd(this._endResult);
      }
    }
  }

  /* ================= event log -> presentation ================= */

  _pumpLog() {
    const log = this.battle.log;
    for (; this._logCursor < log.length; this._logCursor++) {
      const e = log[this._logCursor];
      switch (e.type) {
        case 'hit': {
          if (e.dmg <= 0) break;
          const big = e.act === 'super' || e.act === 'uppercut';
          this.cam.shake(e.blocked ? 0.10 :
            big ? CONFIG.impact.shakeLarge : CONFIG.impact.shakeSmall);
          break;
        }
        case 'supercast':
          this.announcer('SUPER!', 900);
          break;
        case 'malfunction': {
          const v = this.vis.get(e.u);
          if (v) v.malfUntil = this._wallT + CONFIG.team.malfunction.duration / this.speed;
          this.announcer('MALFUNCTION', 1000);
          this.cam.shake(0.25);
          break;
        }
        case 'wave':
          if (e.i > 0) this.announcer(`WAVE ${e.i + 1}`, 1200);
          break;
        case 'ko':
          this.cam.shake(CONFIG.impact.shakeLarge);
          break;
        case 'end': {
          this._endResult = this.battle.result();
          const won = e.winner === 'player';
          this.announcer(won ? 'VICTORY' : 'DEFEAT', 2600);
          for (const u of this.battle.units) {
            if (!u.dead && u.side === e.winner) u.fighter.celebrate();
          }
          this._endT = S().endDelaySec;
          break;
        }
      }
    }
  }

  /* ================= malfunction FX ================= */

  _malfFx(u, v, dt) {
    const active = this._wallT < v.malfUntil && !u.dead;
    if (active) {
      // Bone jitter — cosmetic, undone at the top of the next update.
      for (const bone of v.bones) {
        this._jitterUndo.push([bone, bone.quaternion.clone()]);
        bone.rotation.x += (Math.random() - 0.5) * 0.09;
        bone.rotation.z += (Math.random() - 0.5) * 0.09;
      }
      // Eye flicker.
      for (const em of v.emissives) {
        em.mat.emissiveIntensity = em.base * (Math.random() < 0.45 ? 0.08 : 1.9);
      }
      // Sparks.
      if (this._wallT >= v.sparkAt && v.bones.length) {
        v.sparkAt = this._wallT + S().sparkInterval;
        const bone = v.bones[(Math.random() * v.bones.length) | 0];
        const p = new THREE.Vector3();
        bone.getWorldPosition(p);
        this._spawnSparks(p, 3);
      }
      v.malfWasActive = true;
    } else if (v.malfWasActive) {
      v.malfWasActive = false;
      for (const em of v.emissives) em.mat.emissiveIntensity = em.base;
    }
  }

  _spawnSparks(pos, n) {
    if (this._sparks.length > 40) return;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this._sparkGeo, new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 1,
      }));
      m.position.copy(pos);
      const a = Math.random() * Math.PI * 2;
      this._sparks.push({
        m,
        vx: Math.cos(a) * (1.5 + Math.random() * 2),
        vy: 1.5 + Math.random() * 2.5,
        life: 0.35,
      });
      this.scene3.add(m);
    }
  }

  _updateSparks(dt) {
    for (let i = this._sparks.length - 1; i >= 0; i--) {
      const s = this._sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene3.remove(s.m);
        s.m.material.dispose();
        this._sparks.splice(i, 1);
        continue;
      }
      s.m.position.x += s.vx * dt;
      s.m.position.y += s.vy * dt;
      s.vy -= 9 * dt;
      s.m.material.opacity = s.life / 0.35;
      s.m.rotation.x += 0.4; s.m.rotation.y += 0.3;
    }
  }

  /* ================= debug ================= */

  _updateDebug(dt) {
    if (!CONFIG.debug.showOverlay || !this.debugEl) return;
    this._fpsN++; this._fpsT += dt;
    if (this._fpsT > 0.5) {
      this._fps = Math.round(this._fpsN / this._fpsT);
      this._fpsN = 0; this._fpsT = 0;
    }
    const lines = [];
    if (CONFIG.debug.showFps) lines.push(`FPS ${this._fps}  x${this.speed}`);
    for (const u of this.battle.units) {
      lines.push(`${u.side === 'player' ? 'P' : 'E'} ${u.name} ${u.fighter.state}` +
        ` hp:${Math.round(u.fighter.hp)} g:${Math.round(u.gauge)}`);
    }
    this.debugEl.textContent = lines.join('\n');
  }

  /* ================= teardown ================= */

  teardown() {
    if (this.speedBtn && this._onSpeedClick) {
      this.speedBtn.removeEventListener('click', this._onSpeedClick);
    }
    for (const s of this._sparks) { this.scene3.remove(s.m); s.m.material.dispose(); }
    this._sparks.length = 0;
    this._sparkGeo.dispose();
    for (const u of this.battle.units) {
      const root = u.fighter.root;
      this.scene3.remove(root);
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) m.dispose();
      });
    }
    const cardsEl = this.consoleEl?.querySelector('#console-cards');
    if (cardsEl) cardsEl.innerHTML = '';
  }
}
