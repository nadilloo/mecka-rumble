/* ============================================================
   App.js — M1: thin screen router for the RPG pivot.

   Three screens: MENU -> HANGAR (dress the MECKA) -> BATTLE (watch it
   fight).  The fighting-game input layer, FighterAI, projectiles, and
   the multiplayer entry point were retired with the pivot; the battle
   is a TeamBattle watched through BattleScreen.  PlayroomManager.js
   and InputManager.js stay in the tree unimported — netcode is paused,
   not deleted, and the gesture recognizer is earmarked for M2's QTEs.
   ============================================================ */
import { CONFIG } from '../config.js';
import { Renderer } from './Renderer.js';
import { Loop } from './Loop.js';
import { UIManager } from '../ui/UIManager.js';
import { BattleScreen } from '../game/BattleScreen.js';
import { MeckaHangar, readHangarState } from '../game/MeckaHangar.js';

export class App {
  constructor(assets) {
    this._assets = assets;

    this.combatEl = document.getElementById('combat');
    this.canvas = document.getElementById('gl');
    this.consoleEl = document.getElementById('console');

    this.ui = new UIManager();          // stamps CONFIG.version bottom-left

    // Hangar: built lazily on first visit (all 32 sets is not a cost a
    // straight-to-battle launch should pay).
    this.hangar = null;
    this._hangarEl = document.getElementById('hangar-screen');
    const saved = readHangarState();
    CONFIG.mecka.playerLoadout = saved.loadout;
    CONFIG.mecka.playerEye = saved.eye;

    this.screen = null;                 // active BattleScreen
    this._paused = false;
    this._rendererReady = false;

    this.ui.onMenuAction((action) => {
      if (action === 'battle') this._startBattle();
      else if (action === 'hangar') this._enterHangar();
    });
    this.ui.onPauseClick(() => this.togglePause());
    this.ui.onPauseAction((action) => {
      if (action === 'resume') this.resume();
      else if (action === 'restart') this._startBattle();
      else if (action === 'menu') this._returnToMenu();
    });
    this.ui.onEndAction((action) => {
      if (action === 'rematch') this._startBattle();
      else if (action === 'end-menu') this._returnToMenu();
    });

    this.ui.showScreen('menu');

    // Dev shortcuts — only while the battle screen is actually showing,
    // so 'p' on the menu can't float the pause modal over it.
    window.addEventListener('keydown', (e) => {
      if (!this.screen) return;
      if (!document.getElementById('battle-screen')?.classList.contains('show')) return;
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if (e.key === 'r' || e.key === 'R') this._startBattle();
    });
  }

  start() { /* loop starts on first battle entry */ }

  /* ---------- lazy renderer + loop ---------- */
  _ensureRenderer() {
    if (this._rendererReady) return;
    this.renderer = new Renderer(this.canvas, this.combatEl);
    this.loop = new Loop(
      (dt) => { if (this.screen) this.screen.update(dt); },
      () => {
        if (this.screen) {
          this.renderer.render(this.screen.scene3, this.screen.cam.camera);
        }
      });
    const origResize = this.renderer.resize.bind(this.renderer);
    this.renderer.resize = () => {
      origResize();
      this.screen?.cam.setAspect(this.renderer.aspect);
    };
    this._rendererReady = true;
  }

  /* ---------- battle ---------- */
  _startBattle() {
    this._ensureRenderer();
    this.ui.hidePauseModal();
    this.ui.hideEndModal();
    this.screen?.teardown();
    this.screen = new BattleScreen({
      assets: this._assets,
      renderer: this.renderer.three,
      aspect: this.renderer.aspect,
      consoleEl: this.consoleEl,
      announcer: (t, ms) => this.ui.setAnnouncer(t, ms),
      onEnd: (result) => this.ui.showEndModal(result.winner === 'player'),
      seed: Date.now() >>> 0,
    });
    this.ui.showScreen('battle');
    this.hangar?.stop();
    this.renderer.resize();
    this.screen.cam.setAspect(this.renderer.aspect);
    this._paused = false;
    this.loop.setPaused(false);
    if (!this.loop.running) this.loop.start();
  }

  /* ---------- hangar / menu ---------- */
  _enterHangar() {
    this.ui.showScreen('hangar');
    if (!this.hangar && this._hangarEl) {
      this.hangar = new MeckaHangar(this._hangarEl);
      this.hangar.onBack(() => this._returnToMenu());
      // Confirming a part writes straight through to the config the next
      // battle's player unit is built from.
      this.hangar.onChange((loadout, eye) => {
        CONFIG.mecka.playerLoadout = loadout;
        CONFIG.mecka.playerEye = eye;
      });
    }
    this.hangar?.start();
    requestAnimationFrame(() => this.hangar?.resize());
  }

  _returnToMenu() {
    this._paused = true;
    this.loop?.setPaused(true);
    this.ui.hidePauseModal();
    this.ui.hideEndModal();
    this.ui.showScreen('menu');
    this.hangar?.stop();
  }

  /* ---------- pause ---------- */
  togglePause() {
    if (!this.screen) return;
    if (this._paused) this.resume();
    else this.pause();
  }
  pause() {
    this._paused = true;
    this.loop.setPaused(true);
    this.ui.showPauseModal();
  }
  resume() {
    this._paused = false;
    this.loop.setPaused(false);
    this.ui.hidePauseModal();
  }
}
