/* ============================================================
   App.js — v2
   Changes:
   - Collision pass (_separateFighters) after fighter updates so
     they never cross through each other.
   - Hit pause: briefly freezes the world when a damaging hit
     lands, for impact feel.
   - Camera shake is triggered on damage.
   - Pause menu uses a real modal with difficulty selection.
   - End-of-fight modal with rematch button.
   - Difficulty starts at CONFIG.defaultDifficulty (medium).
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../utils/math.js';
import { Renderer } from './Renderer.js';
import { Loop } from './Loop.js';
import { InputManager } from '../input/InputManager.js';
import { BattleScene } from '../game/BattleScene.js';
import { FightCamera } from '../game/FightCamera.js';
import { Fighter } from '../game/Fighter.js';
import { FighterAI } from '../game/FighterAI.js';
import { ProjectileManager } from '../game/ProjectileManager.js';
import { UIManager } from '../ui/UIManager.js';

export class App {
  constructor(assets) {
    this._assets = assets;
    this.combatEl  = document.getElementById('combat');
    this.canvas    = document.getElementById('gl');
    this.panelEl   = document.getElementById('input-panel');
    this.trailEl   = document.getElementById('trail');
    this.gestureEl = document.getElementById('gesture-label');

    this.renderer  = new Renderer(this.canvas, this.combatEl);
    this.scene     = new BattleScene();
    this.fightCam  = new FightCamera(this.renderer.aspect);

    this.difficulty = CONFIG.defaultDifficulty;
    this.animSpeed  = CONFIG.defaultAnimSpeed;
    this.hitPauseTime = 0;
    this._ended = false;
    this._paused = false;

    /* ---- Damage callback: triggers hit pause + camera shake ---- */
    const onDamageDealt = (kind, amount /*, ownerIsPlayer */) => {
      const big = (kind === 'super');
      this.hitPauseTime = Math.max(
        this.hitPauseTime,
        big ? CONFIG.impact.hitPauseLarge : CONFIG.impact.hitPauseSmall
      );
      this.fightCam.shake(big ? CONFIG.impact.shakeLarge : CONFIG.impact.shakeSmall);
    };

    this.projectiles = new ProjectileManager(this.scene.scene, onDamageDealt);
    const handleShoot = (fighter, kind) => this.projectiles.spawn(fighter, kind);

    const F = CONFIG.fighter;
    this.player = new Fighter({
      isPlayer: true,
      side: -1,
      assets,
      startX: -F.startSeparation / 2,
      onShoot: handleShoot,
      onDamageDealt: onDamageDealt,
    });
    this.cpu = new Fighter({
      isPlayer: false,
      side: +1,
      assets,
      startX: +F.startSeparation / 2,
      onShoot: handleShoot,
      onDamageDealt: onDamageDealt,
    });
    this.scene.add(this.player.root);
    this.scene.add(this.cpu.root);

    this.ai = new FighterAI(
      this.cpu, this.player, this.projectiles,
      CONFIG.difficulties[this.difficulty]
    );

    this.ui = new UIManager();

    this.input = new InputManager(this.panelEl, this.trailEl, this.gestureEl);
    this._wireInput();
    this._wireUI();

    this.loop = new Loop(
      (dt) => this.update(dt),
      () => this.renderer.render(this.scene.scene, this.fightCam.camera)
    );

    // Aspect updates when renderer resizes.
    const origResize = this.renderer.resize.bind(this.renderer);
    this.renderer.resize = () => {
      origResize();
      this.fightCam.setAspect(this.renderer.aspect);
    };

    // Dev shortcuts.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if (e.key === 'r' || e.key === 'R') { this.reset(); this.resume(); }
    });

    this.ui.setAnnouncer('FIGHT!', 1200);
  }

  start() { this.loop.start(); }

  /* ---------- Input wiring ---------- */
  _wireInput() {
    this.input.on('TAP', () => { if (this._canAct()) this.player.shoot(); });
    this.input.on('HOLD', () => { if (this._canAct()) this.player.superShot(); });
    this.input.on('SWIPE_FORWARD', () => {
      if (!this._canAct()) return;
      const gap = Math.abs(this.cpu.root.position.x - this.player.root.position.x);
      if (gap <= CONFIG.fighter.punchRange) this.player.punch();
      else this.player.dashForward(this.cpu.root.position.x);
    });
    this.input.on('SWIPE_BACK', () => {
      if (this._canAct()) this.player.dodgeBack(this.cpu.root.position.x);
    });
    this.input.on('SHIELD_DOWN', () => { if (this._canAct()) this.player.setShielding(true); });
    this.input.on('SHIELD_UP',   () => this.player.setShielding(false));
  }

  _canAct() {
    return !this._paused && !this._ended;
  }

  /* ---------- UI / modal wiring ---------- */
  _wireUI() {
    this.ui.onPauseClick(() => {
      if (this._ended) return;
      this.togglePause();
    });
    this.ui.onPauseAction((action, payload) => {
      if (action === 'resume')   this.resume();
      else if (action === 'restart') { this.reset(); this.resume(); }
      else if (action === 'difficulty') this.setDifficulty(payload);
      else if (action === 'speed')      this.setAnimSpeed(payload);
    });
    this.ui.onEndAction((action) => {
      if (action === 'rematch') { this.reset(); this.resume(); }
      else if (action === 'end-restart') {
        // Reset + open pause menu so they can change difficulty.
        this.reset();
        this.ui.hideEndModal();
        this.togglePause();
      }
    });
  }

  togglePause() {
    if (this._ended) return;
    if (this._paused) this.resume();
    else this.pause();
  }
  pause() {
    this._paused = true;
    this.loop.setPaused(true);
    this.ui.showPauseModal(this.difficulty, this.animSpeed);
    // Release any held shield so the player isn't draining battery while paused.
    this.player.setShielding(false);
  }
  resume() {
    this._paused = false;
    this.loop.setPaused(false);
    this.ui.hidePauseModal();
  }

  setDifficulty(d) {
    if (!CONFIG.difficulties[d]) return;
    this.difficulty = d;
    this.ai.setDifficulty(CONFIG.difficulties[d]);
    this.ui.updateDifficultySelection(d);
  }

  setAnimSpeed(s) {
    this.animSpeed = s;
    this.player.anim.setSpeed(s);
    this.cpu.anim.setSpeed(s);
    this.ui.updateAnimSpeedSelection(s);
  }

  /* ---------- Frame update ---------- */
  update(dt) {
    // Hit pause: freeze the world for a few frames on impact.
    if (this.hitPauseTime > 0) {
      this.hitPauseTime -= dt;
      return;
    }

    // Tell input which horizontal direction is "forward" for the player.
    // (Since player is side-locked to the left, this is always true, but
    // keeping the call future-proofs the input layer.)
    this.input.setPlayerFacingRight(this.player.facing > 0);

    this.player.update(dt, this.cpu);
    this.cpu.update(dt, this.player);

    // Post-movement separation pass — guarantees they never overlap
    // even if simultaneous movement brought them too close.
    this._separateFighters();

    this.ai.update(dt);
    this.projectiles.update(dt, this.player, this.cpu);
    this.fightCam.update(dt, this.player, this.cpu);
    this.ui.update(dt, this.player, this.cpu);

    // Game-over detection → show end modal after a 3s pause so the
    // dying + celebration animations have time to play through.
    if (!this._ended) {
      if (this.player.isKO()) {
        this.cpu.celebrate();
        this.ui.setAnnouncer('K.O.', 2000);
        setTimeout(() => this.ui.showEndModal(false), 3000);
        this._ended = true;
      } else if (this.cpu.isKO()) {
        this.player.celebrate();
        this.ui.setAnnouncer('K.O.', 2000);
        setTimeout(() => this.ui.showEndModal(true), 3000);
        this._ended = true;
      }
    }
  }

  /** Enforce side-locked minimum gap between the two fighters. */
  _separateFighters() {
    const gap = CONFIG.fighter.minSeparation;
    const lhw = CONFIG.stage.laneHalfWidth;

    let pX = clamp(this.player.root.position.x, -lhw, lhw);
    let cX = clamp(this.cpu.root.position.x,    -lhw, lhw);

    // Player is the left side; CPU is the right side.  Push them apart
    // equally when they try to cross.
    if (pX > cX - gap) {
      const overlap = pX - (cX - gap);
      pX -= overlap * 0.5;
      cX += overlap * 0.5;
      // Re-clamp against arena walls in case a wall is now doing the
      // pushing — the wall wins, the opposite fighter keeps moving back.
      if (pX < -lhw) { cX += (-lhw - pX); pX = -lhw; }
      if (cX >  lhw) { pX -= (cX -  lhw); cX =  lhw; }
    }

    this.player.root.position.x = pX;
    this.cpu.root.position.x    = cX;
  }

  /** Reset HP/battery/state/position for a rematch. */
  reset() {
    const F = CONFIG.fighter;
    this.player.hp = F.healthMax; this.player.battery = F.batteryMax;
    this.cpu.hp = F.healthMax;    this.cpu.battery = F.batteryMax;
    this.player.state = 'idle';   this.cpu.state = 'idle';
    this.player.stateTime = 0;    this.cpu.stateTime = 0;
    this.player.invulnTime = 0;   this.cpu.invulnTime = 0;
    this.player.lockoutTime = 0;  this.cpu.lockoutTime = 0;
    this.player.recentDamageTime = 0; this.cpu.recentDamageTime = 0;
    this.player.anim.stop();      this.cpu.anim.stop();
    this.player.setShielding(false); this.cpu.setShielding(false);

    this.player.root.position.x = -F.startSeparation / 2;
    this.cpu.root.position.x    = +F.startSeparation / 2;
    // Player orthodox facing right, CPU southpaw facing left.
    this.player.root.rotation.set(0,  Math.PI / 2, 0);
    this.cpu.root.rotation.set(0,    -Math.PI / 2, 0);
    this.player._moveTarget = this.player.root.position.x;
    this.cpu._moveTarget    = this.cpu.root.position.x;

    // Clear projectiles.
    for (let i = this.projectiles.alive.length - 1; i >= 0; i--) {
      this.projectiles._kill(this.projectiles.alive[i]);
    }

    this._ended = false;
    this.hitPauseTime = 0;
    this.ui.hideEndModal();
    this.ui.setAnnouncer('ROUND START', 1100);
  }
}
