/* ============================================================
   math.js — Tiny math helpers used across the game.
   ============================================================ */

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent lerp ("damp").
 *  `rate` is roughly "how fast to approach, per second". */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

export const randRange = (a, b) => a + Math.random() * (b - a);

/** Ease-out cubic for snappy procedural animations. */
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Ease-in-out sine, used for idle breathing. */
export const easeInOut = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
