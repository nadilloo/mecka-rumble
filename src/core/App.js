/* ============================================================
   App.js
   Top-level app coordinator.

   Lifecycle:
     - On boot, UIManager renders the menu screen.
     - When the user clicks BATTLE, _enterBattle() spins up (or
       rebuilds) the 3D scene, fighters with the saved loadout,
       AI, and starts the loop.
     - When MAIN MENU is chosen from pause/end, the loop pauses
       and we go back to the menu screen.  The 3D scene is kept
       alive but not updated.
   ============================================================ */
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
import { WorkshopPreview } from '../game/WorkshopPreview.js';

export class App {
  constructor(assets) {
    this._assets = assets;

    // ---- DOM handles for battle screen ----
    this.combatEl  = document.getElementById('combat');
    this.canvas    = document.getElementById('gl');
    this.panelEl   = document.getElementById('input-panel');
    this.trailEl   = document.getElementById('trail');
    this.gestureEl = document.getElementById('gesture-label');

    // ---- App state ----
    this.difficulty   = CONFIG.defaultDifficulty;
    this.animSpeed    = CONFIG.defaultAnimSpeed;
    this.hitPauseTime = 0;
    this._ended       = false;
    this._paused      = false;
    this._battleReady = false;     // true once 3D scene is built

    // ---- UI first; the menu screen needs it before any 3D work ----
    this.ui = new UIManager();
    this._wireMenuAndPauseModals();

    // ---- Workshop preview (its own small Three scene). ----
    const previewCanvas = document.getElementById('workshop-canvas');
    if (previewCanvas) {
      this.workshopPreview = new WorkshopPreview(previewCanvas, assets);
      this.workshopPreview.setLoadout(this.ui.getLoadout());
      // Update preview live when loadout changes in the workshop.
      this.ui.onLoadoutChange((lo) => {
        this.workshopPreview.setLoadout(lo);
      });
    }

    // Show menu by default.
    this.ui.showScreen('menu');

    // Dev shortcuts.
    window.addEventListener('keydown', (e) => {
      if (!this._battleReady) return;
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if (e.key === 'r' || e.key === 'R') { this.reset(); this.resume(); }
    });
  }

  /* ---------- Boot the 3D scene the first time we enter battle ---------- */
  _ensureBattleBuilt() {
    if (this._battleReady) return;

    this.renderer = new Renderer(this.canvas, this.combatEl);
    this.scene    = new BattleScene();
    this.fightCam = new FightCamera(this.renderer.aspect);

    // Damage callback: hit pause + camera shake on every connecting hit.
    const onDamageDealt = (kind /*, amount, ownerIsPlayer */) => {
      const big = (kind === 'super' || kind === 'uppercut');
      this.hitPauseTime = Math.max(
        this.hitPauseTime,
        big ? CONFIG.impact.hitPauseLarge : CONFIG.impact.hitPauseSmall
      );
      this.fightCam.shake(big ? CONFIG.impact.shakeLarge : CONFIG.impact.shakeSmall);
    };
    this._onDamageDealt = onDamageDealt;

    this.projectiles = new ProjectileManager(this.scene.scene, onDamageDealt);

    this._buildFighters();

    // Input layer.
    this.input = new InputManager(this.panelEl, this.trailEl, this.gestureEl);
    this._wireInput();

    // Game loop.
    this.loop = new Loop(
      (dt) => this.update(dt),
      ()   => this.renderer.render(this.scene.scene, this.fightCam.camera)
    );

    // Hook resize → camera aspect.
    const origResize = this.renderer.resize.bind(this.renderer);
    this.renderer.resize = () => {
      origResize();
      this.fightCam.setAspect(this.renderer.aspect);
    };

    this._battleReady = true;
  }

  /** (Re)build both fighters with the current loadout from UIManager.
   *  Called on first entry and again every time the player saves a
   *  new loadout in the workshop. */
  _buildFighters() {
    // Tear down existing fighters if any.
    if (this.player) this.scene.scene.remove(this.player.root);
    if (this.cpu)    this.scene.scene.remove(this.cpu.root);

    const F = CONFIG.fighter;
    const handleShoot = (fighter, kind) =>
      this.projectiles.spawn(fighter, kind);
    const playerLoadout = this.ui.getLoadout();
    // CPU uses default loadout (could be randomized later).
    const cpuLoadout = { ...CONFIG.defaultLoadout };

    this.player = new Fighter({
      isPlayer: true, side: -1, assets: this._assets,
      startX: -F.startSeparation / 2,
      onShoot: handleShoot, onDamageDealt: this._onDamageDealt,
      loadout: playerLoadout,
    });
    this.cpu = new Fighter({
      isPlayer: false, side: +1, assets: this._assets,
      startX: +F.startSeparation / 2,
      onShoot: handleShoot, onDamageDealt: this._onDamageDealt,
      loadout: cpuLoadout,
    });
    this.scene.add(this.player.root);
    this.scene.add(this.cpu.root);

    // (Re)create AI.
    this.ai = new FighterAI(
      this.cpu, this.player, this.projectiles,
      CONFIG.difficulties[this.difficulty]
    );

    // Apply current anim-speed setting.
    this.player.anim.setSpeed(this.animSpeed);
    this.cpu.anim.setSpeed(this.animSpeed);
  }

  /* ---------- Public start (called by main.js after assets load) ---------- */
  start() {
    // We don't auto-start the loop — we only run it once we're in battle.
  }

  /* ---------- Menu / workshop / pause / end wiring ---------- */
  _wireMenuAndPauseModals() {
    this.ui.onMenuAction((action) => {
      if (action === 'battle')        this._enterBattle();
      else if (action === 'workshop') this._enterWorkshop();
    });
    this.ui.onWorkshopAction((action) => {
      if (action === 'save' || action === 'back') this._enterMenu();
    });
    this.ui.onPauseClick(() => {
      if (this._ended) return;
      this.togglePause();
    });
    this.ui.onPauseAction((action, payload) => {
      if (action === 'resume')         this.resume();
      else if (action === 'restart')   { this.reset(); this.resume(); }
      else if (action === 'commands')  this.ui.showCommandsModal();
      else if (action === 'menu')      this._returnToMenu();
      else if (action === 'difficulty')this.setDifficulty(payload);
      else if (action === 'speed')     this.setAnimSpeed(payload);
    });
    this.ui.onEndAction((action) => {
      if (action === 'rematch')       { this.reset(); this.resume(); }
      else if (action === 'end-menu') this._returnToMenu();
    });
  }

  _enterMenu() {
    this.ui.showScreen('menu');
    this.workshopPreview?.stop();
  }
  _enterWorkshop() {
    this.ui.showScreen('workshop');
    if (this.workshopPreview) {
      this.workshopPreview.setLoadout(this.ui.getLoadout());
      this.workshopPreview.start();
      // Wait one frame for the screen to be visible, then resize.
      requestAnimationFrame(() => this.workshopPreview.resize());
    }
  }
  _enterBattle() {
    const firstEntry = !this._battleReady;
    this._ensureBattleBuilt();
    // Rebuild fighters so a freshly-saved loadout takes effect.
    this._buildFighters();
    this.ui.showScreen('battle');
    // Force a renderer resize tick so the canvas matches the now-visible parent.
    this.renderer.resize();
    this.fightCam.setAspect(this.renderer.aspect);
    this.reset();
    if (firstEntry) this.loop.start();
    this.resume();
    this.ui.setAnnouncer('FIGHT!', 1200);
  }
  _returnToMenu() {
    this._paused = true;
    this.loop.setPaused(true);
    this.ui.hidePauseModal();
    this.ui.hideEndModal();
    this.ui.hideCommandsModal();
    this._enterMenu();
  }

  /* ---------- Input wiring ---------- */
  _wireInput() {
    this.input.on('TAP',  () => { if (this._canAct()) this.player.shoot(); });
    this.input.on('HOLD', () => { if (this._canAct()) this.player.superShot(); });

    // Forward swipes — single event with length classification.
    // Range gating: if the opponent is OUT of melee range, any forward
    // swipe (regardless of length) becomes a dash.  In melee range,
    // short = jab, long = hook, extra long = hook (dash distance is
    // pointless when already in range).
    // Forward swipes — single event with length classification.
    // Range gating: if the opponent is OUT of melee reach, ANY
    // forward swipe (regardless of length) becomes a dash.  In
    // melee range, short = jab, long = cross.
    this.input.on('SWIPE_FORWARD', ({ length }) => {
      if (!this._canAct()) return;
      const gap = Math.abs(this.cpu.root.position.x - this.player.root.position.x);
      const F = CONFIG.fighter;
      // Out of reach: always dash.  Skullgirls-style.
      if (gap > F.punchReach + 0.15) {
        this.player.dashForward(this.cpu.root.position.x);
      } else if (length === 'short') {
        this.player.jab();
      } else {
        this.player.cross();    // long (and dash-length) → cross when in range
      }
    });

    this.input.on('DODGE', () => {
      if (this._canAct()) this.player.dodgeBack(this.cpu.root.position.x);
    });

    // Forward-then-down → HOOK (replaces former SWEEP).
    this.input.on('HOOK_MOTION', () => {
      if (!this._canAct()) return;
      const gap = Math.abs(this.cpu.root.position.x - this.player.root.position.x);
      // Same gating as other melee.
      if (gap > CONFIG.fighter.punchReach + 0.15) return;
      this.player.hook();
    });

    // Quarter-circle forward → UPPERCUT.  Only fires in range.
    this.input.on('UPPERCUT', () => {
      if (!this._canAct()) return;
      const gap = Math.abs(this.cpu.root.position.x - this.player.root.position.x);
      if (gap > CONFIG.fighter.uppercutReach + 0.15) return;
      this.player.uppercut();
    });

    this.input.on('COUNTER',  () => { if (this._canAct()) this.player.counter(); });

    // Held shield: latched down on swipe-down, released on pointer up.
    this.input.on('SHIELD_DOWN', () => {
      if (this._paused || this._ended) return;
      this.player.setShielding(true);
    });
    this.input.on('SHIELD_UP', () => {
      this.player?.setShielding(false);
    });
  }
  _canAct() { return !this._paused && !this._ended; }

  /* ---------- Pause / difficulty / speed ---------- */
  togglePause() {
    if (this._ended) return;
    if (this._paused) this.resume();
    else this.pause();
  }
  pause() {
    this._paused = true;
    this.loop.setPaused(true);
    this.ui.showPauseModal(this.difficulty, this.animSpeed);
    this.player?.setShielding(false);
  }
  resume() {
    this._paused = false;
    this.loop.setPaused(false);
    this.ui.hidePauseModal();
  }
  setDifficulty(d) {
    if (!CONFIG.difficulties[d]) return;
    this.difficulty = d;
    this.ai?.setDifficulty(CONFIG.difficulties[d]);
    this.ui.updateDifficultySelection(d);
  }
  setAnimSpeed(s) {
    this.animSpeed = s;
    this.player?.anim.setSpeed(s);
    this.cpu?.anim.setSpeed(s);
    this.ui.updateAnimSpeedSelection(s);
  }

  /* ---------- Frame update ---------- */
  update(dt) {
    if (this.hitPauseTime > 0) {
      this.hitPauseTime -= dt;
      return;
    }

    this.input.setPlayerFacingRight(this.player.facing > 0);
    this.player.update(dt, this.cpu);
    this.cpu.update(dt, this.player);
    this._separateFighters();
    this.ai.update(dt);
    this.projectiles.update(dt, this.player, this.cpu);
    this.fightCam.update(dt, this.player, this.cpu);
    this.ui.update(dt, this.player, this.cpu);

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

  _separateFighters() {
    const gap = CONFIG.fighter.minSeparation;
    const lhw = CONFIG.stage.laneHalfWidth;

    let pX = clamp(this.player.root.position.x, -lhw, lhw);
    let cX = clamp(this.cpu.root.position.x,    -lhw, lhw);

    if (pX > cX - gap) {
      const overlap = pX - (cX - gap);
      pX -= overlap * 0.5;
      cX += overlap * 0.5;
      if (pX < -lhw) { cX += (-lhw - pX); pX = -lhw; }
      if (cX >  lhw) { pX -= (cX -  lhw); cX =  lhw; }
    }

    this.player.root.position.x = pX;
    this.cpu.root.position.x    = cX;
  }

  /** Reset HP/battery/state/position for a new fight. */
  reset() {
    const F = CONFIG.fighter;
    for (const f of [this.player, this.cpu]) {
      f.hp = F.healthMax;
      f.battery = F.batteryMax;
      f.state = 'idle';
      f.action = null;
      f.invulnTime = 0;
      f.lockoutTime = 0;
      f.recentDamageTime = 0;
      f.stunTime = 0;
      f.counterReady = false;
      f.anim.stop();
      f.setShielding(false);
    }
    this.player.root.position.x = -F.startSeparation / 2;
    this.cpu.root.position.x    = +F.startSeparation / 2;
    this.player.root.rotation.set(0,  Math.PI / 2, 0);
    this.cpu.root.rotation.set(0,    -Math.PI / 2, 0);
    this.player._moveTarget = this.player.root.position.x;
    this.cpu._moveTarget    = this.cpu.root.position.x;

    for (let i = this.projectiles.alive.length - 1; i >= 0; i--) {
      this.projectiles._kill(this.projectiles.alive[i]);
    }

    this._ended = false;
    this.hitPauseTime = 0;
    this.ui.hideEndModal();
    this.ui.hideCommandsModal();
    this.ui.setAnnouncer('ROUND START', 1100);
  }
}
