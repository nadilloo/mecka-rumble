/* ============================================================
 * HangarCatalog.js — the data layer behind the Mecka Hangar.
 *
 * There are no GLB part files.  MECKA armour is generated in code, so a
 * "part" is just the pair (setKey, slot) — the equip registry inside
 * MeckaKnightProcedural already knows how to show it.  This module turns
 * SET_CATALOG (32 sets) into 160 addressable parts with stats attached.
 *
 * Stats are DERIVED, not hand-authored:
 *     value = TIER_MAGNITUDE[tier] * SLOT_PROFILE[slot][stat] * (1 + tilt)
 *
 *   · TIER_MAGNITUDE is the progression ladder — rarer is strictly better.
 *   · SLOT_PROFILE is what a body part is *for* — legs carry speed, the
 *     torso carries armour, arms carry power.
 *   · ARCHETYPES is the per-set tilt — the trade-off that makes two sets of
 *     the same tier feel different.  BASTION is a wall; WRAITH is a rumour.
 *
 * Adding a 33rd set needs no work here: unknown keys fall back to a neutral
 * tilt, so the Hangar keeps working the moment it lands in SET_CATALOG.
 * ============================================================ */

/* ---- Slots (must match MeckaKnightProcedural's equip registry) ---- */
export const SLOTS = [
  { id: 'helmet', label: 'HEAD',  bone: 'mixamorigHead' },
  { id: 'torso',  label: 'TORSO', bone: 'mixamorigSpine' },
  { id: 'armR',   label: 'R ARM', bone: 'mixamorigRightArm' },
  { id: 'armL',   label: 'L ARM', bone: 'mixamorigLeftArm' },
  { id: 'legs',   label: 'LEGS',  bone: 'mixamorigLeftUpLeg' },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);

/* ---- Rarity ladder.  Gray → green → blue → purple, per the Hangar brief.
 *      Kept in sync with TIER_COLORS in MeckaKnightProcedural (single source
 *      of truth — the offline viewer reads the same four values). ---- */
export const RARITY = {
  common:   { label: 'COMMON',   color: '#9aa4b2', rank: 0 },
  uncommon: { label: 'UNCOMMON', color: '#3fbf5a', rank: 1 },
  rare:     { label: 'RARE',     color: '#3b82f6', rank: 2 },
  epic:     { label: 'EPIC',     color: '#a855f7', rank: 3 },
};

/* ---- What each body part contributes.  Weights, not values. ---- */
const SLOT_PROFILE = {
  helmet: { speed: 0.5, armor: 0.9, power: 0.6 },
  torso:  { speed: 0.3, armor: 1.4, power: 0.8 },
  armR:   { speed: 0.6, armor: 0.7, power: 1.2 },
  armL:   { speed: 0.6, armor: 0.7, power: 1.1 },
  legs:   { speed: 1.4, armor: 0.9, power: 0.5 },
};

/* ---- The progression ladder. ---- */
const TIER_MAGNITUDE = { common: 10, uncommon: 16, rare: 23, epic: 31 };

/* ---- Per-set tilt + flavour.  Keys are the LEGACY lowercase set keys:
 *      SENTINEL is `blue`, MAGMA is `red`.  Never rename these. ---- */
const ARCHETYPES = {
  /* COMMON */
  scrap:     { speed: -0.10, armor:  0.06, power: -0.04, blurb: 'Salvage plate. Cheap, honest, ugly.' },
  cadet:     { speed:  0.00, armor:  0.00, power:  0.00, blurb: 'Academy issue. Nothing to hide behind.' },
  dune:      { speed:  0.18, armor: -0.12, power: -0.02, blurb: 'Desert-run frame. Light, dry, quick.' },
  moss:      { speed: -0.08, armor:  0.14, power: -0.04, blurb: 'Field plate, overgrown. Soaks hits.' },
  ash:       { speed: -0.02, armor: -0.10, power:  0.14, blurb: 'Burnt out. Still swings hard.' },
  slag:      { speed: -0.16, armor:  0.20, power: -0.02, blurb: 'Foundry runoff, poured thick.' },
  tide:      { speed:  0.16, armor:  0.02, power: -0.14, blurb: 'Coastal recon. Built to skim.' },
  brawler:   { speed: -0.06, armor: -0.06, power:  0.18, blurb: 'Pit rig. All knuckle, no manners.' },
  /* UNCOMMON */
  blue:      { speed: -0.04, armor:  0.12, power:  0.02, blurb: 'Standing guard. Standard issue blue.' },
  red:       { speed: -0.02, armor: -0.06, power:  0.16, blurb: 'Runs hot on purpose.' },
  glacier:   { speed: -0.14, armor:  0.20, power: -0.02, blurb: 'Cold plate. Nothing gets through.' },
  verdant:   { speed:  0.10, armor:  0.06, power: -0.10, blurb: 'Grown, not forged.' },
  copper:    { speed: -0.06, armor:  0.08, power:  0.06, blurb: 'Old money. Conducts everything.' },
  cobalt:    { speed:  0.06, armor:  0.06, power:  0.02, blurb: 'Hard alloy, even temper.' },
  umbra:     { speed:  0.16, armor: -0.08, power:  0.04, blurb: 'Reads as empty space.' },
  signal:    { speed:  0.12, armor: -0.10, power:  0.06, blurb: 'Broadcasts. Then hits.' },
  /* RARE */
  spartan:   { speed: -0.08, armor:  0.14, power:  0.10, blurb: 'Line-holder. Sealed and stubborn.' },
  hazard:    { speed:  0.04, armor: -0.08, power:  0.18, blurb: 'Marked for a reason.' },
  nighthawk: { speed:  0.20, armor: -0.10, power:  0.06, blurb: 'Comes in quiet. Leaves quicker.' },
  viper:     { speed:  0.18, armor: -0.12, power:  0.10, blurb: 'Two strikes. You only feel one.' },
  bastion:   { speed: -0.18, armor:  0.22, power:  0.02, blurb: 'A wall that walks.' },
  corsair:   { speed:  0.12, armor: -0.04, power:  0.08, blurb: 'Takes what it wants.' },
  tempest:   { speed:  0.14, armor: -0.06, power:  0.12, blurb: 'Weather, with intent.' },
  warden:    { speed: -0.10, armor:  0.18, power:  0.04, blurb: 'Keeps things in. And out.' },
  /* EPIC */
  shogun:    { speed: -0.10, armor:  0.16, power:  0.18, blurb: 'Full lamellar. Ceremonial. Lethal.' },
  void:      { speed:  0.12, armor:  0.06, power:  0.14, blurb: 'Sealed against everything.' },
  seraph:    { speed:  0.16, armor:  0.04, power:  0.12, blurb: 'Descends. Does not land.' },
  kraken:    { speed: -0.12, armor:  0.20, power:  0.14, blurb: 'Pressure-rated. Deep and patient.' },
  titan:     { speed: -0.20, armor:  0.26, power:  0.16, blurb: 'Built at the wrong scale.' },
  wraith:    { speed:  0.24, armor: -0.06, power:  0.10, blurb: "Half of it isn't there." },
  phoenix:   { speed:  0.06, armor:  0.02, power:  0.24, blurb: 'Burns down. Comes back up.' },
  monarch:   { speed: -0.02, armor:  0.14, power:  0.16, blurb: 'Rules by standing still.' },
};
const NEUTRAL = { speed: 0, armor: 0, power: 0, blurb: 'Field-tested. No further notes.' };

/* ---- Bar ceilings.  Sized to the theoretical best loadout per stat
 *      (all-WRAITH speed / all-TITAN armour / all-PHOENIX power) so a maxed
 *      Mecka fills the bar and nothing ever overflows it. ---- */
export const STAT_MAX = { speed: 140, armor: 180, power: 170 };
export const STATS = [
  { id: 'speed', label: 'SPEED', color: '#4ade5f' },
  { id: 'armor', label: 'ARMOR', color: '#3f8fff' },
  { id: 'power', label: 'POWER', color: '#ff8a1f' },
];

/* ---- Build the part list from the model's own SET_CATALOG. ---- */
export function buildCatalog(setCatalog) {
  const parts = [];
  const sets = [];
  for (const set of setCatalog) {
    const arch = ARCHETYPES[set.key] || NEUTRAL;
    const mag = TIER_MAGNITUDE[set.tier] ?? 10;
    const setStats = { speed: 0, armor: 0, power: 0 };

    for (const slot of SLOTS) {
      const stats = {};
      for (const s of ['speed', 'armor', 'power']) {
        stats[s] = Math.round(mag * SLOT_PROFILE[slot.id][s] * (1 + arch[s]));
        setStats[s] += stats[s];
      }
      parts.push({
        id: `${set.key}:${slot.id}`,
        setKey: set.key,
        setLabel: set.label,
        slot: slot.id,
        slotLabel: slot.label,
        tier: set.tier,
        name: `${set.label} ${slot.label}`,
        stats,
      });
    }
    sets.push({ ...set, blurb: arch.blurb, stats: setStats });
  }
  // Rarest first, then alphabetical — the good stuff shouldn't need scrolling to.
  // Parts and sets need SEPARATE comparators: a part carries `setLabel` and a
  // set carries `label`, and the five parts of one set tie on every field
  // above slot, so a shared comparator falls through to a key that isn't there.
  const rank = (a, b) => RARITY[b.tier].rank - RARITY[a.tier].rank;
  parts.sort((a, b) =>
    rank(a, b) ||
    a.setLabel.localeCompare(b.setLabel) ||
    SLOT_IDS.indexOf(a.slot) - SLOT_IDS.indexOf(b.slot));
  sets.sort((a, b) => rank(a, b) || a.label.localeCompare(b.label));
  return { parts, sets };
}

/* ---- Sum a loadout {slot: setKey} into {speed, armor, power}. ---- */
export function totalStats(loadout, partIndex) {
  const out = { speed: 0, armor: 0, power: 0 };
  for (const slot of SLOT_IDS) {
    const part = partIndex.get(`${loadout[slot]}:${slot}`);
    if (!part) continue;
    out.speed += part.stats.speed;
    out.armor += part.stats.armor;
    out.power += part.stats.power;
  }
  return out;
}

/* ---- Index parts by id for O(1) lookup. ---- */
export function indexParts(parts) {
  const m = new Map();
  for (const p of parts) m.set(p.id, p);
  return m;
}

/* ---- Eye colours.  The model ships 16 × 5 brightness levels; the brief asks
 *      for a 2×4 grid, so we surface eight and let the rest expand in. ---- */
export const EYE_PRIMARY = [
  ['WHITE', '#c9d2dd'], ['CYAN', '#8ee9ff'], ['BLUE', '#4d8aff'], ['VIOLET', '#a06bff'],
  ['GREEN', '#58e06a'], ['LIME', '#b8f03a'], ['GOLD', '#ffd34d'], ['ORANGE', '#ff8a2e'],
];
export const EYE_EXTRA = [
  ['ICE', '#8fdcff'], ['TEAL', '#4dd8c0'], ['AMBER', '#ffbf2e'], ['EMBER', '#ff5a1f'],
  ['RED', '#ff3a30'], ['CRIMSON', '#e0364e'], ['PINK', '#ff7ab8'], ['MAGENTA', '#e870ff'],
];

export const DEFAULT_LOADOUT = {
  helmet: 'blue', torso: 'blue', armR: 'blue', armL: 'blue', legs: 'blue',
};
