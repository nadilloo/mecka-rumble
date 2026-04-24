/* ============================================================
   InputManager.js
   Listens to pointer events ONLY on the bottom input panel.
   Classifies each pointer stroke into one of these gestures:

      TAP               short press, little movement
      HOLD              long press, little movement  -> Super Shot
      SWIPE_FORWARD     big horizontal swipe toward opponent
      SWIPE_BACK        big horizontal swipe away from opponent
      DRAG_DOWN         downward drag / hold-down    -> Shield (held)

   Emits via event callbacks registered with on(name, fn).
   Also draws a small trail onto the trail canvas for feedback.
   ============================================================ */
import { CONFIG } from '../config.js';
import { logGesture } from '../utils/debug.js';

const IN = CONFIG.input;

export class InputManager {
  constructor(panelEl, trailCanvas, gestureLabelEl) {
    this.panelEl = panelEl;
    this.trailCanvas = trailCanvas;
    this.gestureLabelEl = gestureLabelEl;
    this.trailCtx = trailCanvas.getContext('2d');

    this.listeners = {};         // name -> [fns]
    this.active = null;          // active pointer stroke
    this._shieldHeld = false;    // we track drag-down as a held state

    /** If true the player has flipped to the right side of the stage.
     *  Forward/back direction inverts accordingly. */
    this.facingRight = true;

    // Resize the trail canvas to match CSS pixels.
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

  /** Called by the game each frame to tell input which side the player is on. */
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
    // Prevent context menu on long-press for iOS/Android.
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
    this.active = {
      id: e.pointerId,
      startX: p.x, startY: p.y,
      curX: p.x, curY: p.y,
      startT: performance.now(),
      points: [{ x: p.x, y: p.y, t: performance.now() }],
      holdFired: false,
      dragDownFired: false,
    };
    this._showLabel('…');
  }

  _onMove(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const p = this._localPos(e);
    this.active.curX = p.x; this.active.curY = p.y;
    this.active.points.push({ x: p.x, y: p.y, t: performance.now() });
    // Keep point list bounded.
    if (this.active.points.length > 60) this.active.points.shift();

    // Continuous gesture: drag-down triggers shield _while held_.
    const dx = p.x - this.active.startX;
    const dy = p.y - this.active.startY;
    if (!this.active.dragDownFired &&
        dy > IN.dragDownMinPx &&
        Math.abs(dy) > Math.abs(dx) * IN.verticalBias) {
      this.active.dragDownFired = true;
      this._shieldHeld = true;
      this._emit('SHIELD_DOWN', {});
      this._showLabel('SHIELD', true);
    }

    // Continuous gesture: long-hold fires SUPER once.
    if (!this.active.holdFired) {
      const age = performance.now() - this.active.startT;
      const moved = Math.hypot(dx, dy);
      if (age > CONFIG.input.holdMinMs && moved < IN.tapMaxMovePx) {
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

    // If we were shielding (drag-down), release it.
    if (this._shieldHeld) {
      this._shieldHeld = false;
      this._emit('SHIELD_UP', {});
    }

    // Already handled as HOLD mid-stroke: don't emit tap.
    if (!a.holdFired && !a.dragDownFired) {
      // --- Tap (short + minimal movement) ---
      if (dt <= IN.tapMaxMs && dist <= IN.tapMaxMovePx) {
        this._emit('TAP', {});
        this._showLabel('SHOOT', true);
      }
      // --- Swipe (long horizontal) ---
      else if (dist >= IN.swipeMinDistPx &&
               Math.abs(dx) > Math.abs(dy) * IN.horizontalBias) {
        // Forward = toward opponent. Player starts on the left facing right
        // so a rightward swipe is "forward". If player crosses sides, this flips.
        const swipedRight = dx > 0;
        const forward = this.facingRight ? swipedRight : !swipedRight;
        if (forward) { this._emit('SWIPE_FORWARD', {}); this._showLabel('FORWARD', true); }
        else         { this._emit('SWIPE_BACK', {});    this._showLabel('BACK', true); }
      } else {
        this._showLabel('—');
      }
    }

    this.active = null;
  }

  /* -------- Trail drawing -------- */
  _startTrailLoop() {
    const tick = () => {
      this._drawTrail();
      requestAnimationFrame(tick);
    };
    tick();
  }
  _drawTrail() {
    const ctx = this.trailCtx;
    const w = this.trailCanvas.clientWidth;
    const h = this.trailCanvas.clientHeight;
    // Fade previous frame.
    ctx.fillStyle = `rgba(7, 7, 17, ${IN.trailFade})`;
    ctx.fillRect(0, 0, w, h);
    if (!this.active || this.active.points.length < 2) return;

    const pts = this.active.points;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const age = (performance.now() - pts[i].t) / 400;
      const alpha = Math.max(0, 1 - age);
      ctx.strokeStyle = `rgba(160, 220, 255, ${alpha})`;
      ctx.lineWidth = 3 + 4 * alpha;
      ctx.beginPath();
      ctx.moveTo(pts[i-1].x, pts[i-1].y);
      ctx.lineTo(pts[i].x,   pts[i].y);
      ctx.stroke();
    }
    // Start point indicator.
    ctx.fillStyle = 'rgba(160, 220, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI*2);
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
