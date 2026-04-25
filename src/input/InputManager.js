/* ============================================================
   InputManager.js — fighting-game style input
   Listens to pointer events ONLY on the bottom input panel.

   Outputs:
     TAP              short press, little movement   -> shoot
     HOLD             long press, little movement    -> super
     JAB              short forward swipe            -> light punch
     HOOK             long forward swipe             -> heavy punch
     DASH             very long forward swipe        -> dash forward
     DODGE            any backward swipe             -> dodge
     SHIELD_TOGGLE    quick down-tap (no drag)       -> toggle shield on/off
     UPPERCUT         quarter-circle forward (qcf)   -> ▼ ▶  (down then forward)
     SWEEP            ▶ then ▼ (forward then down)
     COUNTER          quarter-circle back (qcb)      -> ▼ ◀

   The motion buffer records cardinal-direction "ticks" as the
   pointer moves, so any qcf/qcb gesture works regardless of
   speed.  The classifier scans for ordered direction sequences.
   ============================================================ */
import { CONFIG } from '../config.js';
import { logGesture } from '../utils/debug.js';

const IN = CONFIG.input;

// Direction codes for the motion buffer.
const DIR = { N: 1, NE: 2, E: 3, SE: 4, S: 5, SW: 6, W: 7, NW: 8 };

export class InputManager {
  constructor(panelEl, trailCanvas, gestureLabelEl) {
    this.panelEl = panelEl;
    this.trailCanvas = trailCanvas;
    this.gestureLabelEl = gestureLabelEl;
    this.trailCtx = trailCanvas.getContext('2d');

    this.listeners = {};
    this.active = null;
    this._lastStrokePts = null;   // last completed stroke's points (drawn until next stroke starts)
    this._lastStrokeEndT = 0;

    this.facingRight = true;       // player is on the left, facing right

    this._resizeTrail();
    const ro = new ResizeObserver(() => this._resizeTrail());
    ro.observe(this.trailCanvas);

    this._bind();
    this._startTrailLoop();
  }

  on(name, fn) {
    (this.listeners[name] = this.listeners[name] || []).push(fn);
  }
  _emit(name, data) {
    logGesture(name, data);
    const arr = this.listeners[name]; if (!arr) return;
    for (const fn of arr) fn(data || {});
  }

  setPlayerFacingRight(v) { this.facingRight = v; }

  _resizeTrail() {
    const c = this.trailCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    c.width = Math.floor(c.clientWidth * dpr);
    c.height = Math.floor(c.clientHeight * dpr);
    this.trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _bind() {
    const el = this.panelEl;
    el.addEventListener('pointerdown',   (e) => this._onDown(e), { passive: false });
    el.addEventListener('pointermove',   (e) => this._onMove(e), { passive: false });
    el.addEventListener('pointerup',     (e) => this._onUp(e),   { passive: false });
    el.addEventListener('pointercancel', (e) => this._onUp(e),   { passive: false });
    el.addEventListener('pointerleave',  (e) => this._onUp(e),   { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _localPos(e) {
    const r = this.panelEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onDown(e) {
    e.preventDefault();
    this.panelEl.setPointerCapture?.(e.pointerId);
    const p = this._localPos(e);
    // New stroke clears the previous trail immediately.
    this._lastStrokePts = null;
    this.active = {
      id: e.pointerId,
      startX: p.x, startY: p.y,
      curX: p.x, curY: p.y,
      startT: performance.now(),
      points: [{ x: p.x, y: p.y, t: performance.now() }],
      holdFired: false,
      // Motion buffer: array of { dir, t } direction ticks.
      motion: [],
      lastSampleX: p.x, lastSampleY: p.y,
    };
    this._showLabel('…');
  }

  _onMove(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const p = this._localPos(e);
    this.active.curX = p.x;
    this.active.curY = p.y;
    this.active.points.push({ x: p.x, y: p.y, t: performance.now() });
    if (this.active.points.length > 80) this.active.points.shift();

    // Sample direction whenever we've moved at least SAMPLE_PX from the
    // last sample point.  This builds the motion buffer used for qcf/qcb.
    const SAMPLE_PX = 22;
    const sx = p.x - this.active.lastSampleX;
    const sy = p.y - this.active.lastSampleY;
    if (Math.hypot(sx, sy) >= SAMPLE_PX) {
      const dir = this._classifyDir(sx, sy);
      const m = this.active.motion;
      // Don't record duplicates of the same direction in a row.
      if (!m.length || m[m.length - 1].dir !== dir) {
        m.push({ dir, t: performance.now() });
        if (m.length > 12) m.shift();
      }
      this.active.lastSampleX = p.x;
      this.active.lastSampleY = p.y;
    }

    // Long-hold = SUPER (fired once mid-stroke).
    if (!this.active.holdFired) {
      const age = performance.now() - this.active.startT;
      const moved = Math.hypot(p.x - this.active.startX, p.y - this.active.startY);
      if (age > IN.holdMinMs && moved < IN.tapMaxMovePx) {
        this.active.holdFired = true;
        this._emit('HOLD', {});
        this._showLabel('SUPER', true);
      }
    }
  }

  _onUp(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();

    const a = this.active;
    const dt = performance.now() - a.startT;
    const dx = a.curX - a.startX;
    const dy = a.curY - a.startY;
    const dist = Math.hypot(dx, dy);

    // Snapshot stroke so we can keep drawing it briefly after release.
    this._lastStrokePts = a.points.slice();
    this._lastStrokeEndT = performance.now();

    // If HOLD already fired, the stroke is consumed.
    if (a.holdFired) { this.active = null; return; }

    // ---- Special motions take priority over plain swipes ----
    const motion = a.motion.map(m => m.dir);
    const facing = this.facingRight ? 1 : -1;
    if (this._matchQCF(motion, facing)) {
      this._emit('UPPERCUT', {}); this._showLabel('UPPERCUT', true);
      this.active = null; return;
    }
    if (this._matchForwardDown(motion, facing)) {
      this._emit('SWEEP', {}); this._showLabel('SWEEP', true);
      this.active = null; return;
    }
    if (this._matchQCB(motion, facing)) {
      this._emit('COUNTER', {}); this._showLabel('COUNTER', true);
      this.active = null; return;
    }

    // ---- Tap on the bottom 40% area = shield toggle ----
    // We treat a brief, mostly-vertical-down tap or a stationary tap
    // in the lower half as SHIELD_TOGGLE.
    if (dt <= IN.tapMaxMs && dist <= IN.tapMaxMovePx) {
      const panelH = this.panelEl.clientHeight || 1;
      if (a.startY > panelH * 0.55) {
        this._emit('SHIELD_TOGGLE', {});
        this._showLabel('SHIELD', true);
      } else {
        this._emit('TAP', {});       // shoot
        this._showLabel('SHOOT', true);
      }
      this.active = null; return;
    }

    // ---- Down-drag = shield toggle ----
    if (dy > IN.dragDownMinPx && Math.abs(dy) > Math.abs(dx) * IN.verticalBias) {
      this._emit('SHIELD_TOGGLE', {});
      this._showLabel('SHIELD', true);
      this.active = null; return;
    }

    // ---- Horizontal swipe ----
    if (Math.abs(dx) >= IN.shortSwipeMinPx &&
        Math.abs(dx) > Math.abs(dy) * IN.horizontalBias) {
      const swipedForward = (this.facingRight ? dx > 0 : dx < 0);
      const len = Math.abs(dx);

      if (swipedForward) {
        // Three tiers based on swipe length.
        if (len >= IN.dashSwipeMinPx) {
          this._emit('DASH', {});  this._showLabel('DASH', true);
        } else if (len >= IN.longSwipeMinPx) {
          this._emit('HOOK', {});  this._showLabel('HOOK', true);
        } else {
          this._emit('JAB', {});   this._showLabel('JAB', true);
        }
      } else {
        // Backward swipe = dodge regardless of length.
        this._emit('DODGE', {}); this._showLabel('DODGE', true);
      }
      this.active = null; return;
    }

    this._showLabel('—');
    this.active = null;
  }

  /* ---------- Direction / motion classification ---------- */
  _classifyDir(dx, dy) {
    // Note Y is inverted on screen (down = +y), so we negate dy for the angle.
    const ang = Math.atan2(-dy, dx);             // 0 = right, π/2 = up
    const deg = (ang * 180 / Math.PI + 360) % 360;
    if (deg <  22.5 || deg >= 337.5) return DIR.E;
    if (deg <  67.5) return DIR.NE;
    if (deg < 112.5) return DIR.N;
    if (deg < 157.5) return DIR.NW;
    if (deg < 202.5) return DIR.W;
    if (deg < 247.5) return DIR.SW;
    if (deg < 292.5) return DIR.S;
    return DIR.SE;
  }

  /** Quarter-circle forward: down → down-forward → forward.
   *  Tolerant: any sequence containing S then SE/E (or SW then W
   *  if facing left) within the last 6 ticks. */
  _matchQCF(motion, facing) {
    const fwd = facing > 0 ? DIR.E : DIR.W;
    const fwdDown = facing > 0 ? DIR.SE : DIR.SW;
    return this._hasOrdered(motion, [DIR.S, fwd]) ||
           this._hasOrdered(motion, [DIR.S, fwdDown, fwd]);
  }
  /** Quarter-circle back: down → down-back → back. */
  _matchQCB(motion, facing) {
    const back = facing > 0 ? DIR.W : DIR.E;
    const backDown = facing > 0 ? DIR.SW : DIR.SE;
    return this._hasOrdered(motion, [DIR.S, back]) ||
           this._hasOrdered(motion, [DIR.S, backDown, back]);
  }
  /** Forward then down (sweep). */
  _matchForwardDown(motion, facing) {
    const fwd = facing > 0 ? DIR.E : DIR.W;
    return this._hasOrdered(motion, [fwd, DIR.S]);
  }

  /** Returns true if `seq` appears as a (non-contiguous) subsequence
   *  in the last <=8 entries of `motion`. */
  _hasOrdered(motion, seq) {
    const tail = motion.slice(-8);
    let idx = 0;
    for (const d of tail) {
      if (d === seq[idx]) idx++;
      if (idx === seq.length) return true;
    }
    return false;
  }

  /* ---------- Trail drawing ---------- */
  _startTrailLoop() {
    const tick = () => { this._drawTrail(); requestAnimationFrame(tick); };
    tick();
  }
  _drawTrail() {
    const ctx = this.trailCtx;
    const w = this.trailCanvas.clientWidth;
    const h = this.trailCanvas.clientHeight;
    // Hard clear: no accumulation. We redraw the current/last stroke from scratch.
    ctx.clearRect(0, 0, w, h);

    // Pick which stroke to draw: the active one if it exists, else the last one.
    let pts = null, fadeStart = 0;
    if (this.active && this.active.points.length >= 2) {
      pts = this.active.points;
    } else if (this._lastStrokePts && this._lastStrokePts.length >= 2) {
      // Fade the last stroke out within ~250ms after release.
      const age = performance.now() - this._lastStrokeEndT;
      if (age < 250) {
        pts = this._lastStrokePts;
        fadeStart = age;
      } else {
        this._lastStrokePts = null;
      }
    }
    if (!pts) return;

    const fade = 1 - fadeStart / 250;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const age = (performance.now() - pts[i].t) / 400;
      const alpha = Math.max(0, 1 - age) * fade;
      ctx.strokeStyle = `rgba(160, 220, 255, ${alpha})`;
      ctx.lineWidth = 3 + 4 * alpha;
      ctx.beginPath();
      ctx.moveTo(pts[i-1].x, pts[i-1].y);
      ctx.lineTo(pts[i].x,   pts[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(160, 220, 255, ${0.6 * fade})`;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  _showLabel(text, flash = false) {
    if (!this.gestureLabelEl) return;
    this.gestureLabelEl.textContent = text;
    if (flash) {
      this.gestureLabelEl.classList.add('flash');
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => {
        this.gestureLabelEl.classList.remove('flash');
      }, 180);
    }
  }
}
