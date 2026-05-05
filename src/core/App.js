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
import { CharSelectPreview } from '../game/CharSelectPreview.js';
import { PlayroomManager } from '../network/PlayroomManager.js';

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
    this._isMultiplayer = false;   // true when in a Playroom match
    this._myFighter    = null;     // the fighter this client controls
    this._theirFighter = null;     // the fighter controlled by the opponent
    this._playroom     = null;     // PlayroomManager instance

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

    // ---- Character-select preview (also its own Three scene). ----
    const charSelectCanvas = document.getElementById('char-select-canvas');
    if (charSelectCanvas) {
      this.charSelectPreview = new CharSelectPreview(charSelectCanvas, assets);
      this.charSelectPreview.setCharacter(this.ui.getCharacterSelection());
    }

    // Default player character, restored from saved selection.
    this.playerCharacter = this.ui.getCharacterSelection();

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
    const cpuLoadout = { ...CONFIG.defaultLoadout };

    // Player picks their character at the character-select screen.
    // CPU is always Jammo for the prototype.
    const playerChar = this.playerCharacter || 'jammo';

    this.player = new Fighter({
      isPlayer: true, side: -1, assets: this._assets,
      character: playerChar,
      startX: -F.startSeparation / 2,
      onShoot: handleShoot, onDamageDealt: this._onDamageDealt,
      loadout: playerLoadout,
    });
    this.cpu = new Fighter({
      isPlayer: false, side: +1, assets: this._assets,
      character: 'jammo',
      startX: +F.startSeparation / 2,
      onShoot: handleShoot, onDamageDealt: this._onDamageDealt,
      loadout: cpuLoadout,
    });
    this.scene.add(this.player.root);
    this.scene.add(this.cpu.root);

    this.ai = new FighterAI(
      this.cpu, this.player, this.projectiles,
      CONFIG.difficulties[this.difficulty]
    );

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
      if (action === 'battle')        this._enterCharacterSelect();
      else if (action === 'multiplayer') this._enterMultiplayer().catch(e => {
        console.error('[MP] Unhandled error:', e);
        alert('Multiplayer error: ' + e.message);
      });
      else if (action === 'workshop') this._enterWorkshop();
    });
    this.ui.onWorkshopAction((action) => {
      if (action === 'save' || action === 'back') this._enterMenu();
    });
    // Character select: user picks Jammo or Knight, then launches battle.
    this.ui.onCharacterSelectAction((action, payload) => {
      if (action === 'pick') {
        this.ui.setCharacterSelection(payload);
        this.charSelectPreview?.setCharacter(payload);
      }
      else if (action === 'fight') {
        this.playerCharacter = this.ui.getCharacterSelection();
        this._enterBattle();
      } else if (action === 'back') {
        this._enterMenu();
      }
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
    this.charSelectPreview?.stop();
    this._isMultiplayer = false;
  }
  _enterWorkshop() {
    this.ui.showScreen('workshop');
    if (this.workshopPreview) {
      this.workshopPreview.setLoadout(this.ui.getLoadout());
      this.workshopPreview.start();
      requestAnimationFrame(() => this.workshopPreview.resize());
    }
  }

  /** Multiplayer flow:
   *  1. Show a "connecting..." message
   *  2. Call PlayroomManager.init() → Playroom's built-in lobby
   *     overlay appears (room code, join, player names, "Launch")
   *  3. Once the host taps Launch and both players are in,
   *     insertCoin resolves
   *  4. Determine host/joiner, assign fighters, start the fight */
  async _enterMultiplayer() {
    console.log('[MP] Starting multiplayer...');
    console.log('[MP] window.Playroom =', window.Playroom);

    if (!window.Playroom) {
      alert('Playroom SDK failed to load. Check your internet connection and refresh.');
      return;
    }

    try {
      console.log('[MP] Creating PlayroomManager...');
      this._playroom = new PlayroomManager();
      console.log('[MP] Calling init() (lobby will appear)...');
      await this._playroom.init();
      console.log('[MP] insertCoin resolved — both players are in!');
    } catch (err) {
      console.error('[MP] Playroom init failed:', err);
      alert('Multiplayer connection failed: ' + err.message);
      return;
    }

    this._isMultiplayer = true;

    // Force Jammo for both fighters in multiplayer.
    this.playerCharacter = 'jammo';

    // Build the 3D battle scene if it doesn't exist yet.
    this._ensureBattleBuilt();
    this._buildFighters();

    // Assign fighters based on host/joiner.
    // Host = red / left (this.player)
    // Joiner = blue / right (this.cpu)
    if (this._playroom.amIHost()) {
      this._myFighter    = this.player;
      this._theirFighter = this.cpu;
    } else {
      this._myFighter    = this.cpu;
      this._theirFighter = this.player;
    }

    // Wire opponent action reception.
    this._playroom.onOpponentAction((actionName) => {
      this._applyOpponentAction(actionName);
    });

    // Handle opponent disconnect.
    this._playroom.onOpponentLeave(() => {
      if (!this._ended) {
        this._theirFighter.hp = 0;
        this._theirFighter.state = 'ko';
        this._theirFighter.anim.play('ko');
        this.ui.setAnnouncer('OPPONENT DISCONNECTED', 2000);
        this._ended = true;
        setTimeout(() => {
          const iWon = this._myFighter === this.player;
          this.ui.showEndModal(iWon);
        }, 2500);
      }
    });

    // Enter the battle screen.
    this.ui.showScreen('battle');
    this.charSelectPreview?.stop();
    this.renderer.resize();
    this.fightCam.setAspect(this.renderer.aspect);
    this.reset();
    if (!this.loop.running) this.loop.start();
    this.resume();

    // Update HUD labels for multiplayer.
    const leftLabel  = document.getElementById('hud-name-left');
    const rightLabel = document.getElementById('hud-name-right');
    if (this._playroom.amIHost()) {
      if (leftLabel)  leftLabel.textContent = 'YOU';
      if (rightLabel) rightLabel.textContent = 'P2';
    } else {
      if (leftLabel)  leftLabel.textContent = 'P1';
      if (rightLabel) rightLabel.textContent = 'YOU';
    }

    // Show role banner so each player knows who they are.
    const role = this._playroom.amIHost() ? 'P1 — RED MECKA' : 'P2 — BLUE MECKA';
    this.ui.setAnnouncer(role, 2500);
  }

  /** Apply an action received from the network opponent to their
   *  local fighter.  This is the mirror of the local input wiring. */
  _applyOpponentAction(action) {
    const f = this._theirFighter;
    const myX = this._myFighter.root.position.x;
    if (!f || f.isKO()) return;
    switch (action) {
      case 'jab':        f.jab(); break;
      case 'cross':      f.cross(); break;
      case 'hook':       f.hook(); break;
      case 'uppercut':   f.uppercut(); break;
      case 'super':      f.superShot(); break;
      case 'dash':       f.dashForward(myX); break;
      case 'dodge':      f.dodgeBack(myX); break;
      case 'block_down': f.setBlocking(true); break;
      case 'block_up':   f.setBlocking(false); break;
      case 'crouch_down':f.setCrouching(true); break;
      case 'crouch_up':  f.setCrouching(false); break;
    }
  }
  _enterCharacterSelect() {
    this.ui.showScreen('character-select');
    if (this.charSelectPreview) {
      // Show the currently-selected character in the preview viewport.
      this.charSelectPreview.setCharacter(this.ui.getCharacterSelection());
      this.charSelectPreview.start();
      requestAnimationFrame(() => this.charSelectPreview.resize());
    }
  }
  _enterBattle() {
    this._isMultiplayer = false;     // single-player mode
    this._myFighter = null;
    this._theirFighter = null;
    const firstEntry = !this._battleReady;
    this._ensureBattleBuilt();
    this._buildFighters();
    this.ui.showScreen('battle');
    this.charSelectPreview?.stop();
    this.renderer.resize();
    this.fightCam.setAspect(this.renderer.aspect);
    this.reset();
    if (firstEntry) this.loop.start();
    this.resume();

    // Reset HUD labels to single-player.
    const leftLabel  = document.getElementById('hud-name-left');
    const rightLabel = document.getElementById('hud-name-right');
    if (leftLabel)  leftLabel.textContent = 'PLAYER';
    if (rightLabel) rightLabel.textContent = 'CPU';

    this.ui.setAnnouncer('FIGHT!', 1200);
  }
  _returnToMenu() {
    this._paused = true;
    this.loop.setPaused(true);
    this.ui.hidePauseModal();
    this.ui.hideEndModal();
    this.ui.hideCommandsModal();
    this._isMultiplayer = false;
    this._playroom = null;
    this._myFighter = null;
    this._theirFighter = null;
    this._enterMenu();
  }

  /* ---------- Input wiring ---------- */
  _wireInput() {
    // Helper: get the fighter this client controls.
    const me = () => this._isMultiplayer ? this._myFighter : this.player;
    // Helper: get the opponent fighter (for dash/dodge target position).
    const them = () => this._isMultiplayer ? this._theirFighter : this.cpu;
    // Helper: send an action name to the network (no-op in single player).
    const send = (name) => { if (this._isMultiplayer && this._playroom) this._playroom.sendAction(name); };

    this.input.on('TAP_CHAIN', ({ move }) => {
      if (!this._canAct()) return;
      const f = me();
      if (move === 'jab')   { if (f.jab())   send('jab'); }
      else if (move === 'cross') { if (f.cross()) send('cross'); }
    });

    this.input.on('SUPER', () => {
      if (!this._canAct()) return;
      if (me().superShot()) send('super');
    });

    this.input.on('DASH', () => {
      if (!this._canAct()) return;
      if (me().dashForward(them().root.position.x)) send('dash');
    });

    this.input.on('DODGE', () => {
      if (!this._canAct()) return;
      if (me().dodgeBack(them().root.position.x)) send('dodge');
    });

    this.input.on('BLOCK_DOWN', () => {
      if (this._paused || this._ended) return;
      me().setBlocking(true);
      send('block_down');
    });
    this.input.on('BLOCK_UP', () => {
      me()?.setBlocking(false);
      send('block_up');
    });

    this.input.on('CROUCH_DOWN', () => {
      if (this._paused || this._ended) return;
      me().setCrouching(true);
      send('crouch_down');
    });
    this.input.on('CROUCH_UP', () => {
      me()?.setCrouching(false);
      send('crouch_up');
    });

    this.input.on('UPPERCUT', () => {
      if (!this._canAct()) return;
      if (me().uppercut()) send('uppercut');
    });
    this.input.on('HOOK', () => {
      if (!this._canAct()) return;
      if (me().hook()) send('hook');
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

    // Set the correct facing direction for the input layer.
    // In single-player, the player always faces right (+1).
    // In multiplayer, the joiner faces left (-1).
    if (this._isMultiplayer) {
      this.input.setPlayerFacingRight(this._playroom.amIHost());
    } else {
      this.input.setPlayerFacingRight(this.player.facing > 0);
    }

    // Poll network for opponent actions (no-op if not multiplayer).
    if (this._isMultiplayer && this._playroom) {
      this._playroom.poll();
    }

    this.player.update(dt, this.cpu);
    this.cpu.update(dt, this.player);
    this._separateFighters();

    // AI only runs in single-player mode.
    if (!this._isMultiplayer) {
      this.ai.update(dt);
    }

    this.projectiles.update(dt, this.player, this.cpu);
    this.fightCam.update(dt, this.player, this.cpu);
    this.ui.update(dt, this.player, this.cpu);

    if (!this._ended) {
      if (this.player.isKO()) {
        this.cpu.celebrate();
        this.ui.setAnnouncer('K.O.', 2000);
        const iWon = this._isMultiplayer
          ? (this._myFighter !== this.player)   // my fighter survived
          : false;
        setTimeout(() => this.ui.showEndModal(iWon), 3000);
        this._ended = true;
      } else if (this.cpu.isKO()) {
        this.player.celebrate();
        this.ui.setAnnouncer('K.O.', 2000);
        const iWon = this._isMultiplayer
          ? (this._myFighter !== this.cpu)     // my fighter survived
          : true;
        setTimeout(() => this.ui.showEndModal(iWon), 3000);
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
      f.anim.stop();
      f.setShielding(false);
      f.setCrouching(false);
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
