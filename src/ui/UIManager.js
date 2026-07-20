/* ============================================================
   UIManager.js — M1: screens, announcer, and the two modals.

   Slimmed with the pivot: HUD bars moved into the Console (owned by
   BattleScreen, which knows the units), the gesture command list and
   CPU-difficulty controls went with the fighting game.  What remains
   is chrome every screen shares — plus the build-version stamp,
   bottom-left, sourced from CONFIG.version and nowhere else.
   ============================================================ */
import { CONFIG } from '../config.js';

export class UIManager {
  constructor() {
    this.menuScreen = document.getElementById('menu-screen');
    this.announcer = document.getElementById('announcer');
    this.debug = document.getElementById('debug');
    this.pauseBtn = document.getElementById('pause-btn');
    this.pauseModal = document.getElementById('pause-modal');
    this.endModal = document.getElementById('end-modal');
    this.endTitle = document.getElementById('end-title');
    this.endSub = document.getElementById('end-sub');

    // The build version, bottom-left on every screen.  Single source of
    // truth is CONFIG.version; the shipped zip is named to match.
    const ver = document.getElementById('build-version');
    if (ver) ver.textContent = CONFIG.version;

    if (this.debug && !CONFIG.debug.showOverlay) this.debug.style.display = 'none';

    this._menuCb = () => {};
    this._pauseCb = () => {};
    this._endCb = () => {};

    this._setupOrientation();
    this._wireMenu();
    this._wireModalButtons();
  }

  /* ---------- screens ---------- */
  showScreen(name) {
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.toggle('show', el.id === `${name}-screen`);
    });
  }

  /* ---------- hooks ---------- */
  onMenuAction(fn) { this._menuCb = fn; }
  onPauseAction(fn) { this._pauseCb = fn; }
  onEndAction(fn) { this._endCb = fn; }
  onPauseClick(fn) { this.pauseBtn.addEventListener('click', fn); }

  /* ---------- modals ---------- */
  showPauseModal() { this.pauseModal.classList.add('show'); }
  hidePauseModal() { this.pauseModal.classList.remove('show'); }

  showEndModal(playerWon) {
    this.endTitle.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
    this.endSub.textContent = playerWon ? 'SALVAGE SECURED' : 'MECKA DOWN';
    this.endModal.classList.add('show');
  }
  hideEndModal() { this.endModal.classList.remove('show'); }

  /* ---------- announcer ---------- */
  setAnnouncer(text, ms = 1500) {
    if (!this.announcer) return;
    this.announcer.textContent = text;
    this.announcer.classList.add('show');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => this.announcer.classList.remove('show'), ms);
  }

  /* ---------- wiring ---------- */
  _wireMenu() {
    this.menuScreen.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-menu]');
      if (!btn) return;
      this._menuCb(btn.dataset.menu);
    });
  }

  _wireModalButtons() {
    this.pauseModal.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn?.dataset.action) this._pauseCb(btn.dataset.action);
    });
    this.endModal.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn?.dataset.action) this._endCb(btn.dataset.action);
    });
  }

  _setupOrientation() {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }
}
