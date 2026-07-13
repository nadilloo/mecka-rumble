/* ============================================================
   InputManager.js — fighting-game style input
   Listens to pointer events ONLY on the bottom input panel.

   Outputs:
     TAP_CHAIN        cycling tap chain (jab/cross/jab/cross/…) — payload.index
     SUPER            held still tap                    -> super shot
     DODGE            backward swipe, quick release     -> dodge
     BLOCK_DOWN       backward swipe, holding still     -> block on
     BLOCK_UP         pointerup while blocking          -> block off
     DASH             forward swipe (any length)        -> dash
     CROUCH_DOWN      down swipe, holding still         -> crouch on
     CROUCH_UP        pointerup while crouched          -> crouch off
     UPPERCUT         curved forward gesture ending UP  -> uppercut
     HOOK             curved forward gesture ending DOWN -> hook

   Conflict resolution:

   The same physical motion can mean two different things depending
   on whether the user releases quickly or holds.  Backward swipe is
   the canonical example:
     - quick release  → dodge
     - hold still     → block
   We solve this with a stationary timer.  After a directional swipe,
   if the pointer comes to rest within a small radius for HOLD_LATCH_MS,
   we latch the held variant.  Releasing before the timer expires fires
   the quick-release variant.

   The same pattern handles down-swipe (crouch on hold) versus the
   tail of an uppercut/hook gesture which ends moving (no hold).

   Curved-arc detection for uppercut/hook is intentionally lenient.
   We don't require a specific motion-buffer sequence — we just look
   at the START region (first ~30% of the stroke) and the END region
   (last ~30%) and ask:
     - did the stroke move overall toward the opponent? (forward bias)
     - did the END move upward (uppercut) or downward (hook)?
     - was there at least some vertical arc in the middle? (curved, not flat)
   Any motion satisfying those constraints qualifies.
   ============================================================ */
import { CONFIG } from '../config.js';
import { logGesture } from '../utils/debug.js';

const IN = CONFIG.input;

// Time window the pointer must rest stationary for held variants.
const HOLD_LATCH_MS = 140;
const HOLD_LATCH_RADIUS_PX = 12;

// Tap-chain cycling — sequence to play through.
// You can change this to ['jab', 'cross', 'hook'] later if desired.
const TAP_CHAIN = ['jab', 'cross'];
// How long a follow-up tap can arrive before the chain resets.
const TAP_CHAIN_WINDOW_MS = 500;

export class InputManager {
  constructor(panelEl, trailCanvas, gestureLabelEl) {
    this.panelEl = panelEl;
    this.trailCanvas = trailCanvas;
    this.gestureLabelEl = gestureLabelEl;
    this.trailCtx = trailCanvas.getContext('2d');

    this.listeners = {};
    this.active = null;
    this._lastStrokePts = null;

    // The fighter's current facing direction.  +1 = facing right.
    // Used to interpret "forward"/"back" in screen-space terms.
    this.facingRight = true;

    // Held-action latches.  Set on *_DOWN, cleared on *_UP.
    this._blockHeld = false;
    this._crouchHeld = false;

    // Tap chain state.
    this._tapChainIndex = 0;        // next index in TAP_CHAIN to fire
    this._tapChainExpiresAt = 0;    // performance.now() deadline

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

  /* ---------- Pointer lifecycle ---------- */

  _onDown(e) {
    e.preventDefault();
    this.panelEl.setPointerCapture?.(e.pointerId);
    const p = this._localPos(e);
    this._lastStrokePts = null;     // new stroke clears the persisted trail

    this.active = {
      id: e.pointerId,
      startX: p.x, startY: p.y,
      curX: p.x, curY: p.y,
      startT: performance.now(),
      points: [{ x: p.x, y: p.y, t: performance.now() }],

      // One-shot latches set during this stroke (so we never fire twice):
      superFired: false,
      blockFired: false,
      crouchFired: false,

      // Anchor used by the held-still detector — set when the pointer
      // settles down, cleared whenever it moves > radius.
      stillAnchor: null,
    };

    this._showLabel('…');
  }

  _onMove(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    const p = this._localPos(e);
    const a = this.active;

    a.curX = p.x; a.curY = p.y;
    a.points.push({ x: p.x, y: p.y, t: performance.now() });
    if (a.points.length > 80) a.points.shift();

    const now = performance.now();
    const dx = p.x - a.startX;
    const dy = p.y - a.startY;
    const dist = Math.hypot(dx, dy);

    // ---- SUPER: tap held still in place (no significant displacement).
    // Only fires if NO directional intent was ever shown.
    if (!a.superFired && !a.blockFired && !a.crouchFired) {
      const age = now - a.startT;
      if (age > IN.holdMinMs && dist < IN.tapMaxMovePx) {
        a.superFired = true;
        this._emit('SUPER', {});
        this._showLabel('SUPER', true);
        return;
      }
    }

    // ---- GUARD (block) fires IMMEDIATELY on any backward pull.
    // It used to wait HOLD_LATCH_MS for the pointer to come to rest, so it
    // could tell "block" from "dodge" before committing.  That wait is exactly
    // what made shielding feel sluggish.  We now raise the guard the moment you
    // pull back and defer only the MOVEMENT decision to release:
    //     released while still moving (a swipe) -> dodge backstep
    //     released after settling   (a hold)    -> shield in place
    // Both wear the same shield animation, so there is nothing to disambiguate
    // visually and nothing to wait for.
    //
    // CROUCH keeps its stationary latch: a down-drag has to be told apart from
    // the tail of a hook/uppercut arc, and there is no shared pose to fall back on.
    if (!a.blockFired && !a.crouchFired && !a.superFired) {
      const fwdSign = this.facingRight ? 1 : -1;
      const movingBack = dx * fwdSign < -IN.shortSwipeMinPx
                       && Math.abs(dx) > Math.abs(dy) * IN.horizontalBias;
      const movingDown = dy > IN.shortSwipeMinPx
                       && Math.abs(dy) > Math.abs(dx) * IN.verticalBias;

      if (movingBack) {
        a.blockFired = true;
        this._blockHeld = true;
        a.guardFromBack = true;          // remembered so release can decide
        this._emit('BLOCK_DOWN', {});
        this._showLabel('GUARD', true);
      } else if (movingDown) {
        // Maintain a stillAnchor at the latest pointer position.
        // If the pointer has been within HOLD_LATCH_RADIUS_PX of the
        // anchor for HOLD_LATCH_MS, we latch the appropriate held event.
        if (!a.stillAnchor) {
          a.stillAnchor = { x: p.x, y: p.y, t: now };
        } else {
          const ax = a.stillAnchor.x, ay = a.stillAnchor.y;
          if (Math.hypot(p.x - ax, p.y - ay) > HOLD_LATCH_RADIUS_PX) {
            a.stillAnchor = { x: p.x, y: p.y, t: now };
          } else if (now - a.stillAnchor.t >= HOLD_LATCH_MS) {
            a.crouchFired = true;
            this._crouchHeld = true;
            this._emit('CROUCH_DOWN', {});
            this._showLabel('CROUCH', true);
          }
        }
      } else {
        // No longer moving back or down — clear any pending anchor.
        a.stillAnchor = null;
      }
    }
  }

  /* Was the pointer still travelling when it lifted?
   * Points are only appended on move, so a settled finger stops producing
   * them — which is why we measure staleness against `now`, not the last
   * sample's timestamp.  Miss that and a long hold reads as a fast swipe. */
  _wasSwipe(a, now) {
    const pts = a.points;
    if (pts.length < 2) return false;
    const last = pts[pts.length - 1];
    if (now - last.t > IN.swipeRestMs) return false;      // finger had settled
    let i = pts.length - 1;
    while (i > 0 && last.t - pts[i].t < IN.swipeWindowMs) i--;
    const p0 = pts[i];
    return Math.hypot(last.x - p0.x, last.y - p0.y) >= IN.swipeReleaseMinPx;
  }

  _onUp(e) {
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();

    const a = this.active;
    const now = performance.now();
    const dt = now - a.startT;
    const dx = a.curX - a.startX;
    const dy = a.curY - a.startY;
    const dist = Math.hypot(dx, dy);

    // Snapshot the stroke so we can keep drawing it after release.
    this._lastStrokePts = a.points.slice();

    // ---- Guard release: swipe -> dodge backstep, hold -> just drop the guard.
    // We do NOT emit BLOCK_UP before DODGE: the Fighter drops the guard as part
    // of starting the dodge, and emitting both would crossfade to idle and back
    // inside a single frame for no reason.
    if (this._blockHeld) {
      this._blockHeld = false;
      if (a.guardFromBack && this._wasSwipe(a, now)) {
        this._emit('DODGE', {});
        this._showLabel('DODGE', true);
      } else {
        this._emit('BLOCK_UP', {});
        this._showLabel('—');
      }
      this.active = null;
      return;
    }
    if (this._crouchHeld) {
      this._crouchHeld = false;
      this._emit('CROUCH_UP', {});
      this._showLabel('—');
      this.active = null;
      return;
    }

    // If SUPER already fired during the stroke, the gesture is consumed.
    if (a.superFired) { this.active = null; return; }

    // ---- TAP: fires the next move in the cycling tap chain ----
    if (dt <= IN.tapMaxMs && dist <= IN.tapMaxMovePx) {
      const move = this._advanceTapChain();
      this._emit('TAP_CHAIN', { move });
      this._showLabel(move.toUpperCase(), true);
      this.active = null;
      return;
    }

    // ---- Curved arcs: uppercut / hook ----
    // Lenient classification: forward overall + ends going up (uppercut)
    // or down (hook), with at least some vertical arc in the middle.
    const arc = this._classifyCurvedArc(a.points);
    if (arc) {
      if (arc === 'uppercut') {
        this._emit('UPPERCUT', {});
        this._showLabel('UPPERCUT', true);
      } else {
        this._emit('HOOK', {});
        this._showLabel('HOOK', true);
      }
      // Heavy enders break the tap chain — next tap starts fresh.
      this._tapChainIndex = 0;
      this._tapChainExpiresAt = 0;
      this.active = null;
      return;
    }

    // ---- DODGE: quick backward swipe (released before HOLD_LATCH_MS) ----
    const fwdSign = this.facingRight ? 1 : -1;
    const horizontalish = Math.abs(dx) > Math.abs(dy) * IN.horizontalBias;
    if (horizontalish && Math.abs(dx) >= IN.shortSwipeMinPx) {
      if (dx * fwdSign < 0) {
        // Backward swipe, released before block could latch.
        this._emit('DODGE', {});
        this._showLabel('DODGE', true);
      } else {
        // ---- DASH: any forward swipe ----
        this._emit('DASH', {});
        this._showLabel('DASH', true);
      }
      this.active = null;
      return;
    }

    this._showLabel('—');
    this.active = null;
  }

  /* ---------- Tap-chain helper ---------- */

  _advanceTapChain() {
    const now = performance.now();
    if (now > this._tapChainExpiresAt) {
      this._tapChainIndex = 0;       // chain timed out — restart at jab
    }
    const move = TAP_CHAIN[this._tapChainIndex % TAP_CHAIN.length];
    this._tapChainIndex++;
    this._tapChainExpiresAt = now + TAP_CHAIN_WINDOW_MS;
    return move;
  }

  /* ---------- Curved-arc classification (HOOK / UPPERCUT) ----------
     Returns 'uppercut' | 'hook' | null.

     We sample the start third and end third of the stroke and
     compare their average motion vectors to figure out:
        does the gesture move forward overall?
        does it END going up or down?
        was there a vertical arc in the middle (so it's not a flat swipe)?
  */
  _classifyCurvedArc(points) {
    if (!points || points.length < 5) return null;
    const fwdSign = this.facingRight ? 1 : -1;

    // Total displacement.
    const total = {
      x: points[points.length - 1].x - points[0].x,
      y: points[points.length - 1].y - points[0].y,
    };
    const totalDist = Math.hypot(total.x, total.y);
    if (totalDist < IN.shortSwipeMinPx) return null;

    // Need clear forward bias overall — eliminates pure backward
    // gestures (which become block/dodge) and pure down gestures.
    if (total.x * fwdSign < IN.shortSwipeMinPx) return null;

    // Sample the END region: average direction of the last ~30% of points.
    const endStart = Math.floor(points.length * 0.7);
    let endDx = 0, endDy = 0;
    for (let i = endStart + 1; i < points.length; i++) {
      endDx += points[i].x - points[i - 1].x;
      endDy += points[i].y - points[i - 1].y;
    }
    const endMag = Math.hypot(endDx, endDy);
    if (endMag < 4) return null;        // not enough motion at the end
    // Normalize.
    const ex = endDx / endMag, ey = endDy / endMag;

    // Need a meaningful vertical component at the end.  Allow
    // anything from "purely up" (ey < -0.3) to "up and forward"
    // (ey < -0.15).  Same for downward.
    // Negative y on screen = up (because pointer Y grows downward).
    const ENDS_UP   = ey < -0.20;
    const ENDS_DOWN = ey >  0.20;
    if (!ENDS_UP && !ENDS_DOWN) return null;

    // Sanity: did the gesture have a vertical arc in the middle?
    // We measure max vertical excursion from the start point.
    let maxYDelta = 0;
    for (const pt of points) {
      const d = Math.abs(pt.y - points[0].y);
      if (d > maxYDelta) maxYDelta = d;
    }
    // Generous floor — even a small bump qualifies, so a near-flat
    // forward swipe with a slight up-tick at the end is still a
    // hook/uppercut rather than a dash.  (Pure-flat dashes have
    // maxYDelta near 0.)
    if (maxYDelta < 18) return null;

    return ENDS_UP ? 'uppercut' : 'hook';
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
    ctx.clearRect(0, 0, w, h);

    let pts = null;
    let alphaMul = 1.0;
    if (this.active && this.active.points.length >= 2) {
      pts = this.active.points;
    } else if (this._lastStrokePts && this._lastStrokePts.length >= 2) {
      pts = this._lastStrokePts;
      alphaMul = 0.45;
    }
    if (!pts) return;

    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const alpha = (this.active === null)
        ? alphaMul
        : Math.max(0, 1 - (performance.now() - pts[i].t) / 400);
      ctx.strokeStyle = `rgba(160, 220, 255, ${alpha})`;
      ctx.lineWidth = 3 + 4 * alpha;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(160, 220, 255, ${0.6 * alphaMul})`;
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
