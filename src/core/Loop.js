/* ============================================================
   Loop.js
   Simple requestAnimationFrame loop.
   Calls update(dt) then render() each frame.
   Clamps dt so big tab-switch gaps don't explode physics.
   ============================================================ */

export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.paused = false;
    this.lastMs = 0;
    this._onFrame = this._onFrame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    requestAnimationFrame(this._onFrame);
  }

  stop() { this.running = false; }

  setPaused(p) { this.paused = p; if (!p) this.lastMs = performance.now(); }

  _onFrame(now) {
    if (!this.running) return;
    const dtMs = Math.min(64, now - this.lastMs);  // clamp big stalls
    this.lastMs = now;
    const dt = dtMs / 1000;

    if (!this.paused) this.update(dt);
    this.render();

    requestAnimationFrame(this._onFrame);
  }
}
