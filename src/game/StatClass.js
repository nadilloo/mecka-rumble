/* ============================================================
 * StatClass.js — the D2 stat-triangle (LOCKED 2026-07-20).
 *
 * A unit's combat class is COMPUTED from its post-parts statline, never
 * authored: whichever stat carries >= `dominance` (default 40%) of the
 * total makes the class; no dominant stat = Adaptive.  Part mixing IS
 * the counter system — swapping legs literally moves a unit around the
 * triangle, and the Hangar's ghost preview will surface the flip live.
 *
 *   POWER breaks ARMOR  ·  ARMOR walls SPEED  ·  SPEED outruns POWER
 *   Breaker > Bulwark   ·  Bulwark > Striker  ·  Striker > Breaker
 *
 * Pure data functions only — no imports, no state — so the same module
 * serves the headless sim, the Hangar UI, and battle_check.  A future
 * core-reactor ELEMENT layer (D2 addendum) composes on top: it would be
 * a second multiplier alongside counterMultiplier, not a change here.
 * ============================================================ */

export const CLASSES = {
  breaker:  { label: 'BREAKER',  stat: 'power', glyph: '\u25B2' },  // ▲
  bulwark:  { label: 'BULWARK',  stat: 'armor', glyph: '\u25A0' },  // ■
  striker:  { label: 'STRIKER',  stat: 'speed', glyph: '\u25B6' },  // ▶
  adaptive: { label: 'ADAPTIVE', stat: null,    glyph: '\u25CF' },  // ●
};

/* Who counters whom.  attacker -> the class it has the edge AGAINST. */
const BEATS = { breaker: 'bulwark', bulwark: 'striker', striker: 'breaker' };

/** Classify a statline {speed, armor, power} -> class key.
 *  `dominance` is the share of the stat total a single stat must reach.
 *  If two stats both clear the bar (possible below 50%), the LARGER
 *  share wins; exact ties resolve power > armor > speed, documented so
 *  the Hangar preview and the sim can never disagree. */
export function classifyStats(stats, dominance = 0.40) {
  const total = (stats.speed || 0) + (stats.armor || 0) + (stats.power || 0);
  if (total <= 0) return 'adaptive';
  const shares = [
    ['breaker', (stats.power || 0) / total],
    ['bulwark', (stats.armor || 0) / total],
    ['striker', (stats.speed || 0) / total],
  ];
  // Stable: array order encodes the power > armor > speed tie precedence.
  let best = null;
  for (const [key, share] of shares) {
    if (share >= dominance && (!best || share > best[1])) best = [key, share];
  }
  return best ? best[0] : 'adaptive';
}

/** Damage multiplier for attackerClass hitting defenderClass.
 *  `edge` is the triangle strength (0.22 = +/-22%).  Adaptive gives and
 *  takes no edge — that IS its perk-neutral identity. */
export function counterMultiplier(attackerClass, defenderClass, edge = 0.22) {
  if (BEATS[attackerClass] === defenderClass) return 1 + edge;
  if (BEATS[defenderClass] === attackerClass) return 1 - edge;
  return 1;
}
