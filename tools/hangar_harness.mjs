import { buildMeckaKnightScene, SET_CATALOG, TIER_COLORS } from '../src/game/MeckaKnightProcedural.js';
import { buildCatalog, indexParts, totalStats, SLOTS, SLOT_IDS, STAT_MAX, RARITY } from '../src/game/HangarCatalog.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

// ---- 1. catalog integrity ----
const { parts, sets } = buildCatalog(SET_CATALOG);
ok(SET_CATALOG.length === 32, `SET_CATALOG has 32 sets (${SET_CATALOG.length})`);
ok(parts.length === 160, `catalog yields 160 parts (${parts.length})`);
const idx = indexParts(parts);

// Every set must have a hand-authored archetype — a silent NEUTRAL fallback
// would mean a set with no personality that I didn't notice.
const neutral = sets.filter(s => s.blurb === 'Field-tested. No further notes.');
ok(neutral.length === 0, `every set has an authored archetype (${neutral.map(s=>s.key).join(',') || 'all present'})`);

// ---- 2. stat ceilings + tier ladder ----
let over = [];
for (const st of ['speed','armor','power']) {
  for (const s of SET_CATALOG) {
    const lo = Object.fromEntries(SLOT_IDS.map(k => [k, s.key]));
    const t = totalStats(lo, idx);
    if (t[st] > STAT_MAX[st]) over.push(`${s.key}.${st}=${t[st]}>${STAT_MAX[st]}`);
  }
}
ok(over.length === 0, `no full set overflows its bar (${over.join(' ') || 'clear'})`);

const tierAvg = {};
for (const tier of ['common','uncommon','rare','epic']) {
  const ks = SET_CATALOG.filter(s => s.tier === tier);
  const tot = ks.reduce((a, s) => {
    const t = totalStats(Object.fromEntries(SLOT_IDS.map(k => [k, s.key])), idx);
    return a + t.speed + t.armor + t.power;
  }, 0) / ks.length;
  tierAvg[tier] = Math.round(tot);
}
ok(tierAvg.common < tierAvg.uncommon && tierAvg.uncommon < tierAvg.rare && tierAvg.rare < tierAvg.epic,
   `rarity ladder strictly increases: ${JSON.stringify(tierAvg)}`);

// ---- 3. the real risk: does the MODEL accept what the Hangar sends it? ----
const loadout = { helmet: 'shogun', torso: 'bastion', armR: 'wraith', armL: 'scrap', legs: 'titan' };
const root = buildMeckaKnightScene({ equip: loadout });     // no opts.sets -> all 32 built
const api = root.userData.mecka;
ok(!!api, 'buildMeckaKnightScene exposes userData.mecka');
// Compare per-key: the model's `equipped` literal declares armL before armR,
// so stringify order differs from ours even when every value matches.
const st = api.getState();
ok(SLOT_IDS.every(s => st[s] === loadout[s]) && Object.keys(st).length === SLOT_IDS.length,
   `object-form opts.equip applies a MIXED loadout: ${SLOT_IDS.map(s => s + '=' + st[s]).join(' ')}`);
ok(SLOT_IDS.every(s => api.slots.includes(s)),
   `HangarCatalog SLOT_IDS match the model's registry [${api.slots.join(',')}]`);

// Every slot x every set must equip without throwing — 160 swaps.
let swapErr = null;
try {
  for (const s of SET_CATALOG) for (const slot of SLOT_IDS) api.equip(slot, s.key);
} catch (e) { swapErr = e.message; }
ok(!swapErr, `all 160 (set x slot) swaps equip cleanly ${swapErr ? '-> ' + swapErr : ''}`);

// Bones the anchor nodes project from must exist.
const missing = SLOTS.filter(s => !root.getObjectByName(s.bone)).map(s => s.bone);
ok(missing.length === 0, `all 5 anchor bones resolve (${missing.join(',') || 'head/spine/arms/leg'})`);

// Eye system.
let eyeErr = null;
try { api.setEyeColor('#8ee9ff', 2); api.setEyeColor(null); api.setEyeColor('#ff3a30', 4); }
catch (e) { eyeErr = e.message; }
ok(!eyeErr, `setEyeColor(hex, level) + setEyeColor(null) ${eyeErr ? '-> ' + eyeErr : ''}`);

// TIER_COLORS must agree with HangarCatalog's RARITY (one source of truth).
const mismatch = Object.keys(RARITY).filter(t =>
  '#' + TIER_COLORS[t].toString(16).padStart(6, '0') !== RARITY[t].color);
ok(mismatch.length === 0, `TIER_COLORS == HangarCatalog RARITY (${mismatch.join(',') || 'in sync'})`);

// ---- 4. the battle path: only the named sets get built ----
const battle = buildMeckaKnightScene({ sets: [...new Set(Object.values(loadout))], equip: loadout });
let nAll = 0, nBattle = 0;
root.traverse(o => { if (o.isMesh) nAll++; });
battle.traverse(o => { if (o.isMesh) nBattle++; });
ok(nBattle < nAll / 3, `battle build is lean: ${nBattle} meshes vs hangar's ${nAll}`);

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS');
process.exit(fails ? 1 : 0);
