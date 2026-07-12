/* ============================================================
   UIManager.js
   Manages everything that lives outside the 3D scene:
     - Screen switching: menu → hangar → battle
     - HUD bars + announcer + debug overlay
     - Pause modal (with difficulty / anim speed / command list)
     - End-of-fight modal

   The Mecka Hangar owns its own DOM and events — see MeckaHangar.js.
   The old Workshop (parts buttons + stat bars) was removed 2026-07-12.
   ============================================================ */
import { CONFIG } from '../config.js';
import { formatNum } from '../utils/debug.js';

export class UIManager {
  constructor() {
    // ---- Screens ----
    this.menuScreen      = document.getElementById('menu-screen');
    this.battleScreen    = document.getElementById('battle-screen');

    // ---- HUD ----
    this.playerHp  = document.getElementById('player-hp');
    this.playerBat = document.getElementById('player-bat');
    this.cpuHp     = document.getElementById('cpu-hp');
    this.cpuBat    = document.getElementById('cpu-bat');
    this.announcer = document.getElementById('announcer');
    this.debug     = document.getElementById('debug');
    this.lockout   = document.getElementById('lockout-label');
    this.pauseBtn  = document.getElementById('pause-btn');

    // ---- Modals ----
    this.pauseModal    = document.getElementById('pause-modal');
    this.endModal      = document.getElementById('end-modal');
    this.commandsModal = document.getElementById('commands-modal');
    this.endTitle = document.getElementById('end-title');
    this.endSub   = document.getElementById('end-sub');

    if (!CONFIG.debug.showOverlay) this.debug.style.display = 'none';

    this._fps = 60; this._frames = 0; this._fpsT = 0;

    // External callbacks
    this._menuCb         = () => {};
    this._pauseCb        = () => {};
    this._endCb          = () => {};

    this._setupOrientation();
    this._wireMenu();
    // Hangar owns its own DOM + events (see MeckaHangar.js).
    this._wireModalButtons();
  }

  /* ---------- Screen control ---------- */
  showScreen(name) {
    // Query live rather than keep a hardcoded list: the old list silently
    // dropped any screen it didn't know about, so adding #hangar-screen to
    // the DOM wasn't enough to make it showable.
    document.querySelectorAll('.screen').forEach(el => {
      el.classList.toggle('show', el.id === `${name}-screen`);
    });
  }

  /* ---------- Callback hooks ---------- */
  onMenuAction(fn)            { this._menuCb = fn; }
  onPauseAction(fn)           { this._pauseCb = fn; }
  onEndAction(fn)             { this._endCb = fn; }
  onPauseClick(fn)            { this.pauseBtn.addEventListener('click', fn); }

  /* ---------- Pause / End modals ---------- */
  showPauseModal(currentDifficulty, currentAnimSpeed) {
    this.updateDifficultySelection(currentDifficulty);
    if (currentAnimSpeed !== undefined) this.updateAnimSpeedSelection(currentAnimSpeed);
    this.pauseModal.classList.add('show');
  }
  hidePauseModal() { this.pauseModal.classList.remove('show'); }

  showCommandsModal() { this.commandsModal.classList.add('show'); }
  hideCommandsModal() { this.commandsModal.classList.remove('show'); }

  showEndModal(playerWon) {
    this.endTitle.textContent = playerWon ? 'VICTORY' : 'K.O.';
    this.endSub.textContent   = playerWon ? 'YOU WIN' : 'YOU LOSE';
    this.endModal.classList.add('show');
  }
  hideEndModal() { this.endModal.classList.remove('show'); }

  updateDifficultySelection(d) {
    this.pauseModal.querySelectorAll('.diff-btn[data-diff]').forEach(b => {
      b.classList.toggle('selected', b.dataset.diff === d);
    });
  }
  updateAnimSpeedSelection(s) {
    this.pauseModal.querySelectorAll('.diff-btn[data-speed]').forEach(b => {
      b.classList.toggle('selected', parseFloat(b.dataset.speed) === s);
    });
  }

  /* ---------- Announcer / per-frame HUD ---------- */
  setAnnouncer(text, ms = 1500) {
    this.announcer.textContent = text;
    this.announcer.classList.add('show');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => this.announcer.classList.remove('show'), ms);
  }

  update(dt, player, cpu) {
    this.playerHp.style.width  = (player.hpFrac()  * 100) + '%';
    this.playerBat.style.width = (player.batFrac() * 100) + '%';
    this.cpuHp.style.width     = (cpu.hpFrac()     * 100) + '%';
    this.cpuBat.style.width    = (cpu.batFrac()    * 100) + '%';

    if (player.lockoutTime > 0) {
      this.lockout.textContent = `⚠ BATTERY EMPTY (${formatNum(player.lockoutTime)}s)`;
      this.lockout.classList.add('show');
    } else {
      this.lockout.classList.remove('show');
    }

    if (CONFIG.debug.showOverlay) {
      this._frames++; this._fpsT += dt;
      if (this._fpsT > 0.5) {
        this._fps = Math.round(this._frames / this._fpsT);
        this._frames = 0; this._fpsT = 0;
      }
      const lines = [];
      if (CONFIG.debug.showFps) lines.push(`FPS ${this._fps}`);
      lines.push(`P ${player.state}  hp:${formatNum(player.hp,0)} bat:${formatNum(player.battery,0)}`);
      lines.push(`C ${cpu.state}     hp:${formatNum(cpu.hp,0)} bat:${formatNum(cpu.battery,0)}`);
      this.debug.textContent = lines.join('\n');
    }
  }

  /* ---------- Wiring ---------- */
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
      if (!btn) return;
      const action = btn.dataset.action;
      const diff   = btn.dataset.diff;
      const speed  = btn.dataset.speed;
      if (action) this._pauseCb(action);
      else if (diff)  this._pauseCb('difficulty', diff);
      else if (speed) this._pauseCb('speed', parseFloat(speed));
    });
    this.endModal.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      this._endCb(btn.dataset.action);
    });
    this.commandsModal.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'commands-close') this.hideCommandsModal();
    });
  }

  _setupOrientation() {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }
}

