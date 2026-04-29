/* ============================================================
   UIManager.js
   Manages everything that lives outside the 3D scene:
     - Screen switching: menu → workshop → battle
     - HUD bars + announcer + debug overlay
     - Pause modal (with difficulty / anim speed / command list)
     - End-of-fight modal
     - Workshop screen (parts buttons + live stat bars)
   ============================================================ */
import { CONFIG } from '../config.js';
import { formatNum } from '../utils/debug.js';

const LS_KEY = 'mecka.loadout.v1';

export class UIManager {
  constructor() {
    // ---- Screens ----
    this.menuScreen      = document.getElementById('menu-screen');
    this.charSelectScreen = document.getElementById('character-select-screen');
    this.workshopScreen  = document.getElementById('workshop-screen');
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

    // ---- Workshop bits ----
    this.workshopCatsEl = document.getElementById('workshop-cats');
    this.statPower = document.getElementById('stat-power');
    this.statArmor = document.getElementById('stat-armor');
    this.statSpeed = document.getElementById('stat-speed');

    if (!CONFIG.debug.showOverlay) this.debug.style.display = 'none';

    this._fps = 60; this._frames = 0; this._fpsT = 0;

    // External callbacks
    this._menuCb         = () => {};
    this._workshopCb     = () => {};
    this._pauseCb        = () => {};
    this._endCb          = () => {};
    this._loadoutChangeCb = () => {};
    this._charSelectCb   = () => {};

    // Workshop state
    this.loadout = this._loadLoadoutFromStorage();
    this._renderWorkshop();
    this._updateStatBars();

    // Character-select state — persisted across sessions.
    this._charSelection = this._loadCharSelectionFromStorage();
    this._renderCharSelection();

    this._setupOrientation();
    this._wireMenu();
    this._wireCharacterSelect();
    this._wireWorkshop();
    this._wireModalButtons();
  }

  /* ---------- Screen control ---------- */
  showScreen(name) {
    [this.menuScreen, this.charSelectScreen, this.workshopScreen, this.battleScreen].forEach(el => {
      if (!el) return;
      el.classList.toggle('show', el.id === `${name}-screen`);
    });
  }

  /* ---------- Callback hooks ---------- */
  onMenuAction(fn)            { this._menuCb = fn; }
  onWorkshopAction(fn)        { this._workshopCb = fn; }
  onCharacterSelectAction(fn) { this._charSelectCb = fn; }
  onPauseAction(fn)           { this._pauseCb = fn; }
  onEndAction(fn)             { this._endCb = fn; }
  onPauseClick(fn)            { this.pauseBtn.addEventListener('click', fn); }
  onLoadoutChange(fn)  { this._loadoutChangeCb = fn; }

  /* ---------- Loadout (saved to localStorage) ---------- */
  getLoadout() { return { ...this.loadout }; }

  setLoadout(lo) {
    this.loadout = { ...lo };
    this._saveLoadoutToStorage();
    this._renderWorkshop();
    this._updateStatBars();
  }

  _loadLoadoutFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Validate against catalog.
        const out = { ...CONFIG.defaultLoadout };
        for (const cat of Object.keys(out)) {
          if (parsed[cat] && (CONFIG.parts[cat] || []).some(p => p.id === parsed[cat])) {
            out[cat] = parsed[cat];
          }
        }
        return out;
      }
    } catch (e) {
      console.warn('Could not read loadout from storage:', e);
    }
    return { ...CONFIG.defaultLoadout };
  }

  _saveLoadoutToStorage() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.loadout));
    } catch (e) {
      console.warn('Could not write loadout:', e);
    }
  }

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

  /* ---------- Workshop rendering ---------- */
  _renderWorkshop() {
    if (!this.workshopCatsEl) return;
    const labels = {
      head: 'HEAD',
      leftArm: 'LEFT ARM',
      rightArm: 'RIGHT ARM',
      torso: 'TORSO',
      legs: 'LEGS',
    };
    let html = '';
    for (const cat of Object.keys(labels)) {
      const variants = CONFIG.parts[cat] || [];
      const selected = this.loadout[cat];
      html += `<div class="cat">
        <div class="cat-title">${labels[cat]}</div>
        <div class="cat-row">${variants.map(v =>
          `<button class="part-btn ${v.id === selected ? 'selected' : ''}"
                   data-cat="${cat}" data-id="${v.id}">${v.name}</button>`
        ).join('')}</div>
      </div>`;
    }
    this.workshopCatsEl.innerHTML = html;
  }

  _updateStatBars() {
    let p = 1, a = 1, s = 1;
    for (const [cat, id] of Object.entries(this.loadout)) {
      const v = (CONFIG.parts[cat] || []).find(x => x.id === id);
      if (!v) continue;
      p *= v.stats.power;
      a *= v.stats.armor;
      s *= v.stats.speed;
    }
    // Map stat (range ~0.5 to ~1.5) to 0-100% bar position.  1.0 = 50%.
    const pct = (val, lowerIsBetter = false) => {
      // For armor, lower = better, so flip.
      const v = lowerIsBetter ? (2 - val) : val;
      return clamp((v - 0.5) / 1.0, 0, 1) * 100;
    };
    const setBar = (el, percent) => {
      el.style.left = '0%';
      el.style.width = percent + '%';
    };
    setBar(this.statPower, pct(p));
    setBar(this.statArmor, pct(a, true));   // armor is 0.7 = good, so flip
    setBar(this.statSpeed, pct(s));
  }

  /* ---------- Wiring ---------- */
  _wireMenu() {
    this.menuScreen.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-menu]');
      if (!btn) return;
      this._menuCb(btn.dataset.menu);
    });
  }

  _wireWorkshop() {
    this.workshopScreen.addEventListener('click', (e) => {
      const partBtn = e.target.closest('.part-btn');
      if (partBtn) {
        const cat = partBtn.dataset.cat;
        const id  = partBtn.dataset.id;
        this.loadout[cat] = id;
        this._renderWorkshop();
        this._updateStatBars();
        this._loadoutChangeCb({ ...this.loadout });
        return;
      }
      const ctlBtn = e.target.closest('button[data-workshop]');
      if (ctlBtn) {
        const action = ctlBtn.dataset.workshop;
        if (action === 'reset') {
          this.loadout = { ...CONFIG.defaultLoadout };
          this._renderWorkshop();
          this._updateStatBars();
          this._loadoutChangeCb({ ...this.loadout });
        } else if (action === 'save') {
          this._saveLoadoutToStorage();
          this._workshopCb('save');
        } else if (action === 'back') {
          this._workshopCb('back');
        }
      }
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

  /* ---------- Character select ---------- */
  getCharacterSelection() { return this._charSelection; }

  setCharacterSelection(charId) {
    if (charId !== 'jammo' && charId !== 'knight') return;
    this._charSelection = charId;
    this._renderCharSelection();
    this._saveCharSelectionToStorage();
  }

  _renderCharSelection() {
    if (!this.charSelectScreen) return;
    this.charSelectScreen.querySelectorAll('.char-pick').forEach(b => {
      b.classList.toggle('selected', b.dataset.char === this._charSelection);
    });
  }

  _loadCharSelectionFromStorage() {
    try {
      const raw = localStorage.getItem('mecka.character.v1');
      if (raw === 'jammo' || raw === 'knight') return raw;
    } catch (e) { /* ignore */ }
    return 'jammo';
  }

  _saveCharSelectionToStorage() {
    try { localStorage.setItem('mecka.character.v1', this._charSelection); }
    catch (e) { /* ignore */ }
  }

  _wireCharacterSelect() {
    if (!this.charSelectScreen) return;
    this.charSelectScreen.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-charselect]');
      if (!btn) return;
      const action = btn.dataset.charselect;
      if (action === 'pick') {
        const char = btn.dataset.char;
        this._charSelectCb('pick', char);
      } else if (action === 'fight') {
        this._charSelectCb('fight');
      } else if (action === 'back') {
        this._charSelectCb('back');
      }
    });
  }

  _setupOrientation() {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('portrait').catch(() => {});
    }
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
