/* ============================================================
   UIManager.js — v2
   HTML/CSS HUD + two modals:
     - Pause modal (resume, restart, difficulty selection)
     - End-of-fight modal (rematch, change difficulty)
   App wires actions via onPauseAction / onEndAction callbacks.
   ============================================================ */
import { CONFIG } from '../config.js';
import { formatNum } from '../utils/debug.js';

export class UIManager {
  constructor() {
    this.playerHp  = document.getElementById('player-hp');
    this.playerBat = document.getElementById('player-bat');
    this.cpuHp     = document.getElementById('cpu-hp');
    this.cpuBat    = document.getElementById('cpu-bat');
    this.announcer = document.getElementById('announcer');
    this.debug     = document.getElementById('debug');
    this.lockout   = document.getElementById('lockout-label');
    this.pauseBtn  = document.getElementById('pause-btn');

    this.pauseModal = document.getElementById('pause-modal');
    this.endModal   = document.getElementById('end-modal');
    this.endTitle   = document.getElementById('end-title');
    this.endSub     = document.getElementById('end-sub');

    if (!CONFIG.debug.showOverlay) this.debug.style.display = 'none';

    this._fps = 60; this._frames = 0; this._fpsT = 0;

    this._pauseCb = () => {};
    this._endCb   = () => {};

    this._setupOrientation();
    this._wireModalButtons();
  }

  onPauseClick(fn) { this.pauseBtn.addEventListener('click', fn); }

  /** App passes (action, payload).  Actions: 'resume' | 'restart' | 'difficulty' */
  onPauseAction(fn) { this._pauseCb = fn; }
  /** Actions from the end modal: 'rematch' | 'change-difficulty'. */
  onEndAction(fn)   { this._endCb = fn; }

  showPauseModal(currentDifficulty, currentAnimSpeed) {
    this.updateDifficultySelection(currentDifficulty);
    if (currentAnimSpeed !== undefined) this.updateAnimSpeedSelection(currentAnimSpeed);
    this.pauseModal.classList.add('show');
  }
  hidePauseModal() { this.pauseModal.classList.remove('show'); }

  showEndModal(playerWon) {
    this.endTitle.textContent = playerWon ? 'VICTORY' : 'K.O.';
    this.endSub.textContent   = playerWon ? 'YOU WIN' : 'YOU LOSE';
    this.endModal.classList.add('show');
  }
  hideEndModal() { this.endModal.classList.remove('show'); }

  updateDifficultySelection(d) {
    const btns = this.pauseModal.querySelectorAll('.diff-btn[data-diff]');
    btns.forEach(b => {
      if (b.dataset.diff === d) b.classList.add('selected');
      else b.classList.remove('selected');
    });
  }

  updateAnimSpeedSelection(s) {
    const btns = this.pauseModal.querySelectorAll('.diff-btn[data-speed]');
    btns.forEach(b => {
      if (parseFloat(b.dataset.speed) === s) b.classList.add('selected');
      else b.classList.remove('selected');
    });
  }

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
      this._frames++;
      this._fpsT += dt;
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

  _setupOrientation() {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }

  _wireModalButtons() {
    // Pause modal buttons.
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
    // End modal buttons.
    this.endModal.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action) this._endCb(action);
    });
  }
}
