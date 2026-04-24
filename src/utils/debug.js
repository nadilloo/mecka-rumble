/* ============================================================
   debug.js — Minimal debug helpers gated by CONFIG.debug flags.
   ============================================================ */
import { CONFIG } from '../config.js';

export function logGesture(name, data) {
  if (CONFIG.debug.logGestures) {
    // eslint-disable-next-line no-console
    console.log('[gesture]', name, data || '');
  }
}

export function formatNum(n, decimals = 1) {
  return Number(n).toFixed(decimals);
}
