/* ============================================================
   MeckaKnightProcedural.js  —  "MECKA" character  (v8)
   ============================================================
   Two-layer system built 100% from Three.js primitives on
   Jammo's EXACT skeleton (meckaSkeletonData.js):

     1. ENDOSKELETON (always visible): gunmetal robot frame —
        faceted visor head, exposed ball joints, vertebra discs,
        articulated fingers on the REAL finger bones.
     2. ARMOR (equippable): 5 slots × 2 variants that sit OVER
        the skeleton.  slots: helmet|torso|armL|armR|legs.
        variants: blue(SENTINEL) | red(MAGMA) | spartan | shogun |
                  glacier | hazard | nighthawk | void  (or null = bare).  Mix & match.

   REFERENCE AUTHORITY — generation 5 (CURRENT), two units:
     A) warm ORGANIC-faceted unit (terracotta, dark mohawk crest,
        hex chest gem, round pauldrons)  -> variant 'red'
     B) cool HARD-SURFACE mecha "UNIT 07" (slate navy, beveled
        boxes, segmented cyan visor bar, antenna fin, ribbed
        piston actuators + brass bushings, orange chevrons,
        blocky grey sabatons)            -> variant 'blue'
   The two share almost no geometry — each variant is its own
   sculpt per slot, NOT one shape recolored.

   BUILD STATUS (this pass): the BLUE (UNIT-07) set is rebuilt to
   ref B.  The RED set is the previous placeholder sculpt and is
   scheduled for its own rebuild to ref A next.  Text decals and
   engraved panel lines are intentionally OMITTED (kept simple).

   HAND RULE: armored arms wear a boxing-glove hand cover on the
   hand bone; the skeleton gripper for that hand hides beneath it.
   A bare arm shows the skeleton gripper.  (A variant only hides
   the gripper if it actually provides a glove — tracked per
   slot/variant so the placeholder red arm still shows a hand.)

   Skeleton scaffold unchanged from v1–v7: bones rebuilt verbatim
   from data (clips bind by name), armature carries the GLB's
   90°-X rotation + 0.28 scale, parts are rigid meshes on bones,
   canonical authoring via orientedGroup() (+Z fwd, +Y up), limb
   pieces sized from real bone offsets.  meshScale 2.0 /
   groundLift 0.85, same as Jammo.

   EQUIP API (viewer + game):
     const root = buildMeckaKnightScene({ equip: null });   // bare
     root.userData.mecka.equip('torso', 'blue');
     root.userData.mecka.equipAll('red');
     root.userData.mecka.getEquipped('legs');   // 'blue'|'red'|null
   ============================================================ */
import * as THREE from 'three';
import { JAMMO_SKELETON, ARMATURE } from './meckaSkeletonData.js';

/* ---------- Palette (gen-5 reference set) */
const P = {
  // endoskeleton
  steel:    0x4d5461, steelHi: 0x6e7787, steelLo: 0x30353f,
  visor:    0x8ee9ff,                       // cyan emissive
  faceDark: 0x14171f,                        // face windows / bezels / vents
  // shared mechanical accents (UNIT-07)
  gun:      0x282c34,                        // dark ribbed actuators
  brass:    0xa8863f,                        // bushings / pivots
  accent:   0xd06a2c,                        // orange chevrons/decal blocks
  // BLUE = slate-navy mecha (ref B)
  blue:     0x45526f, blueHi: 0x5c6d8f, blueLo: 0x2d3548,
  // RED = MAGMA basalt-brick family + ember glow
  red:      0x7e2a1f, redHi: 0x9a3c2c, redLo: 0x571a12,
  ember:    0xff5a1f, eyeOrange: 0xff7038,
  // SPARTAN = Master Chief green (plates) + green boots + gold visor
  green:    0x4d5a33, greenHi: 0x66744a, greenLo: 0x333d20, greenDk: 0x232a15,
  visorGold: 0xffb84d,
  // SHOGUN = vermillion lacquer + gold
  shogun: 0xa63428, shogunHi: 0xc2483a, shogunLo: 0x781f16,
  gold: 0xd1a637, amber: 0xffbf2e,
  // GLACIER = arctic white + ice blue
  glacier: 0xdde4ea, glacierHi: 0xf1f5f8, glacierLo: 0xa9b4bf, glacierDk: 0x7e8a96,
  iceVisor: 0x8fdcff,
  // HAZARD = safety yellow + ink charcoal
  hazard: 0xe3a91c, hazardHi: 0xf3c246, hazardLo: 0xb07f10, ink: 0x16181d,
  // NIGHTHAWK = graphite stealth + crimson sensor
  night: 0x262a32, nightHi: 0x3d434f, nightLo: 0x14171c, eyeRed: 0xff3a30,
  // VOID = royal violet + magenta lens
  voidP: 0x46286f, voidHi: 0x5c3a8e, voidLo: 0x2f1a4b, voidDk: 0x241239,
  visorMagenta: 0xe870ff,
};

function buildMaterials() {
  const mk = (color, metalness, roughness, extra = {}) =>
    new THREE.MeshStandardMaterial({
      color, metalness, roughness, flatShading: true, ...extra });
  const mats = {
    steel:    mk(P.steel,    0.75, 0.42),
    steelHi:  mk(P.steelHi,  0.80, 0.34),
    steelLo:  mk(P.steelLo,  0.70, 0.52),
    visor:    mk(0x0a2a33, 0.0, 0.4, { emissive: P.visor, emissiveIntensity: 2.6 }),
    faceDark: mk(P.faceDark, 0.50, 0.60),
    gun:      mk(P.gun,      0.72, 0.48),
    brass:    mk(P.brass,    0.88, 0.36),
    accent:   mk(P.accent,   0.45, 0.50),
    blue:     mk(P.blue,     0.42, 0.50),
    blueHi:   mk(P.blueHi,   0.40, 0.44),
    blueLo:   mk(P.blueLo,   0.46, 0.56),
    red:      mk(P.red,      0.30, 0.55),
    redHi:    mk(P.redHi,    0.28, 0.48),
    redLo:    mk(P.redLo,    0.34, 0.58),
    green:    mk(P.green,    0.40, 0.50),
    greenHi:  mk(P.greenHi,  0.38, 0.44),
    greenLo:  mk(P.greenLo,  0.44, 0.56),
    greenDk:  mk(P.greenDk,  0.48, 0.58),
    visorGold: mk(0x2a1c04, 0.0, 0.4, { emissive: P.visorGold, emissiveIntensity: 1.7 }),
    eyeOrange: mk(0x2a0d04, 0.0, 0.4, { emissive: P.eyeOrange, emissiveIntensity: 2.6 }),
    ember:    mk(0x2a0c04, 0.0, 0.4, { emissive: P.ember, emissiveIntensity: 2.6 }),
    shogun:   mk(P.shogun,   0.35, 0.42), shogunHi: mk(P.shogunHi, 0.33, 0.36),
    shogunLo: mk(P.shogunLo, 0.38, 0.50), gold:     mk(P.gold,     0.90, 0.32),
    amber:    mk(0x2a1c04, 0.0, 0.4, { emissive: P.amber, emissiveIntensity: 2.6 }),
    glacier:  mk(P.glacier,  0.35, 0.38), glacierHi: mk(P.glacierHi, 0.30, 0.30),
    glacierLo: mk(P.glacierLo, 0.40, 0.46), glacierDk: mk(P.glacierDk, 0.45, 0.52),
    iceVisor: mk(0x0a222e, 0.0, 0.4, { emissive: P.iceVisor, emissiveIntensity: 2.6 }),
    hazard:   mk(P.hazard,   0.35, 0.48), hazardHi: mk(P.hazardHi, 0.32, 0.42),
    hazardLo: mk(P.hazardLo, 0.40, 0.54), ink:      mk(P.ink,      0.55, 0.55),
    night:    mk(P.night,    0.60, 0.40), nightHi:  mk(P.nightHi,  0.62, 0.34),
    nightLo:  mk(P.nightLo,  0.55, 0.50),
    eyeRed:   mk(0x2a0806, 0.0, 0.4, { emissive: P.eyeRed, emissiveIntensity: 2.6 }),
    voidP:    mk(P.voidP,    0.45, 0.44), voidHi:   mk(P.voidHi,   0.42, 0.38),
    voidLo:   mk(P.voidLo,   0.48, 0.52), voidDk:   mk(P.voidDk,   0.50, 0.56),
    visorMagenta: mk(0x220a2a, 0.0, 0.4, { emissive: P.visorMagenta, emissiveIntensity: 1.7 }),
    visorDim: mk(0x1a2126, 0.0, 0.5, { emissive: 0x9fb8c8, emissiveIntensity: 1.1 }),
    skSteel: mk(0x5a6270, 0.85, 0.45), skSteelHi: mk(0x7d8698, 0.80, 0.38),
    skSteelLo: mk(0x3b414d, 0.85, 0.55),
    eyeWhite: mk(0x1a1e26, 0.0, 0.4, { emissive: 0xc9d2dd, emissiveIntensity: 0.9 }),
    seraph: mk(0xdfe3ea, 0.5, 0.40), seraphHi: mk(0xf3f6fa, 0.45, 0.35), seraphLo: mk(0xb3bac6, 0.55, 0.48),
    kraken: mk(0x1d4a52, 0.5, 0.40), krakenHi: mk(0x2a6b74, 0.45, 0.35), krakenLo: mk(0x123037, 0.55, 0.48),
    titan: mk(0x7a7f88, 0.5, 0.40), titanHi: mk(0x969ba6, 0.45, 0.35), titanLo: mk(0x555a63, 0.55, 0.48),
    wraith: mk(0x1b1d24, 0.5, 0.40), wraithHi: mk(0x2c3039, 0.45, 0.35), wraithLo: mk(0x101216, 0.55, 0.48),
    phoenix: mk(0xb8371f, 0.5, 0.40), phoenixHi: mk(0xd8542f, 0.45, 0.35), phoenixLo: mk(0x861f10, 0.55, 0.48),
    monarch: mk(0x2a2f6b, 0.5, 0.40), monarchHi: mk(0x3d4590, 0.45, 0.35), monarchLo: mk(0x1a1d47, 0.55, 0.48),
    visorAqua: mk(0x062a2e, 0.0, 0.4, { emissive: 0x36e0d0, emissiveIntensity: 1.7 }),
    visorViolet: mk(0x18092e, 0.0, 0.4, { emissive: 0xa06bff, emissiveIntensity: 1.7 }),
    silverTrim: mk(0xc9cfd8, 0.9, 0.28), pearl: mk(0xf0f3f7, 0.6, 0.3),
    visorGreen: mk(0x0a2410, 0.0, 0.4, { emissive: 0x58e06a, emissiveIntensity: 1.7 }),
    visorRoyal: mk(0x0a1430, 0.0, 0.4, { emissive: 0x4d8aff, emissiveIntensity: 1.7 }),
    patina: mk(0x3f7d6d, 0.5, 0.5), bastBlue: mk(0x33549c, 0.4, 0.45), violetTrim: mk(0x6f56a8, 0.4, 0.45),
    verdant: mk(0x4c6b3a, 0.4, 0.45), verdantHi: mk(0x5f8149, 0.36, 0.40), verdantLo: mk(0x37502a, 0.44, 0.52),
    copper: mk(0x8a5a2e, 0.4, 0.45), copperHi: mk(0xa06f3c, 0.36, 0.40), copperLo: mk(0x6b4522, 0.44, 0.52),
    cobalt: mk(0x2450b8, 0.4, 0.45), cobaltHi: mk(0x3868d6, 0.36, 0.40), cobaltLo: mk(0x173a8a, 0.44, 0.52),
    umbra: mk(0x453a52, 0.4, 0.45), umbraHi: mk(0x584a68, 0.36, 0.40), umbraLo: mk(0x312a3c, 0.44, 0.52),
    signal: mk(0xc9662a, 0.4, 0.45), signalHi: mk(0xdd7f42, 0.36, 0.40), signalLo: mk(0x9c4c1e, 0.44, 0.52),
    viper: mk(0x2f5236, 0.4, 0.45), viperHi: mk(0x3f6a47, 0.36, 0.40), viperLo: mk(0x203a26, 0.44, 0.52),
    bastion: mk(0x5d6068, 0.4, 0.45), bastionHi: mk(0x73767f, 0.36, 0.40), bastionLo: mk(0x45484f, 0.44, 0.52),
    corsair: mk(0x1f5d63, 0.4, 0.45), corsairHi: mk(0x2c7a80, 0.36, 0.40), corsairLo: mk(0x14424a, 0.44, 0.52),
    tempest: mk(0x3e4a5e, 0.4, 0.45), tempestHi: mk(0x51607a, 0.36, 0.40), tempestLo: mk(0x2c3545, 0.44, 0.52),
    warden: mk(0x6e5638, 0.4, 0.45), wardenHi: mk(0x84693f, 0.36, 0.40), wardenLo: mk(0x523f28, 0.44, 0.52),
    scrap: mk(0x6f4a2e, 0.25, 0.60), scrapHi: mk(0x855c3a, 0.22, 0.55), scrapLo: mk(0x523522, 0.30, 0.65),
    cadet: mk(0x5a6678, 0.25, 0.60), cadetHi: mk(0x6f7c90, 0.22, 0.55), cadetLo: mk(0x434d5c, 0.30, 0.65),
    dune: mk(0x8a7a58, 0.25, 0.60), duneHi: mk(0xa08f6a, 0.22, 0.55), duneLo: mk(0x6b5e42, 0.30, 0.65),
    moss: mk(0x5c6247, 0.25, 0.60), mossHi: mk(0x707758, 0.22, 0.55), mossLo: mk(0x454a34, 0.30, 0.65),
    ash: mk(0x8d9299, 0.25, 0.60), ashHi: mk(0xa3a8af, 0.22, 0.55), ashLo: mk(0x6f747b, 0.30, 0.65),
    slag: mk(0x4a423c, 0.25, 0.60), slagHi: mk(0x5c534b, 0.22, 0.55), slagLo: mk(0x342e2a, 0.30, 0.65),
    tide: mk(0x4e6b6b, 0.25, 0.60), tideHi: mk(0x618080, 0.22, 0.55), tideLo: mk(0x3a5252, 0.30, 0.65),
    brawler: mk(0x6b4048, 0.25, 0.60), brawlerHi: mk(0x815058, 0.22, 0.55), brawlerLo: mk(0x4f2e35, 0.30, 0.65),
  };
  mats.blue.userData.tintRole   = 'primary';
  mats.blueHi.userData.tintRole = 'primaryHi';
  mats.blueLo.userData.tintRole = 'primaryLo';
  return mats;
}

/* ---------- Mesh helpers (sizes in armature units; ×0.56 ≈ world) */
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const box = (w, h, d, mat) =>
  shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
const cyl = (rTop, rBot, h, seg, mat) =>
  shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat));
function hex(rTop, rBot, h, mat) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 6);
  g.rotateY(Math.PI / 6);
  return shadowed(new THREE.Mesh(g, mat));
}
const hexPlate = (r, h, mat) =>
  shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), mat));
function fbox(wTop, wBot, h, dRatio, mat) {
  const g = new THREE.CylinderGeometry(wTop * Math.SQRT1_2, wBot * Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, dRatio);
  return shadowed(new THREE.Mesh(g, mat));
}
const ico = (r, det, mat) =>
  shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(r, det), mat));

/* Prism from bone origin to `vec` (bone-local); rFar at the child joint. */
function limbAlong(vec, rFar, rNear, mat, seg = 6) {
  const len = vec.length();
  const g = new THREE.CylinderGeometry(rFar, rNear, len, seg);
  if (seg === 6) g.rotateY(Math.PI / 6);
  if (seg === 4) g.rotateY(Math.PI / 4);
  g.translate(0, len / 2, 0);
  const m = shadowed(new THREE.Mesh(g, mat));
  m.quaternion.setFromUnitVectors(Y_AXIS, vec.clone().normalize());
  return m;
}
/* Shell covering only [f0..f1] of `vec` (armor over a limb). */
function shellAlong(vec, f0, f1, rNear, rFar, mat, seg = 8) {
  const full = vec.length();
  const len = full * (f1 - f0);
  const g = new THREE.CylinderGeometry(rFar, rNear, len, seg);
  g.translate(0, full * f0 + len / 2, 0);
  const m = shadowed(new THREE.Mesh(g, mat));
  m.quaternion.setFromUnitVectors(Y_AXIS, vec.clone().normalize());
  return m;
}
/* Hex sleeve perpendicular to `vec`, at fraction f. */
function sleeveAlong(vec, f, radius, h, mat) {
  const m = hex(radius, radius, h, mat);
  m.quaternion.setFromUnitVectors(Y_AXIS, vec.clone().normalize());
  m.position.copy(vec).multiplyScalar(f);
  return m;
}
/* Round ring (12-seg) perpendicular to `vec`, at fraction f. */
function ringAlong(vec, f, r, h, mat) {
  const m = cyl(r, r, h, 12, mat);
  m.quaternion.setFromUnitVectors(Y_AXIS, vec.clone().normalize());
  m.position.copy(vec).multiplyScalar(f);
  return m;
}
/* Ribbed piston actuator: stacked alternating-radius discs along
   [f0..f1] of `vec` — the bellows/screw look of UNIT-07 joints. */
function ribbedAlong(vec, f0, f1, rOut, rIn, nRibs, mat) {
  const g = new THREE.Group();
  const full = vec.length();
  const span = full * (f1 - f0);
  const step = span / nRibs;
  for (let i = 0; i < nRibs; i++) {
    const r = (i % 2 === 0) ? rOut : rIn;
    const disc = cyl(r, r, step * 0.96, 12, mat);
    disc.position.y = full * f0 + step * (i + 0.5);
    g.add(disc);
  }
  g.quaternion.setFromUnitVectors(Y_AXIS, vec.clone().normalize());
  return g;
}

/* ============================================================ */
/* Rarity ladder — gray → green → blue → purple (Hangar brief, 2026-07-12).
   Was green/blue/yellow/purple; changed so COMMON reads as drab and GREEN
   means uncommon, per the near-universal convention players already know.
   Single source of truth: the offline viewer and HangarCatalog both read this. */
export const TIER_COLORS = { common: 0x9aa4b2, uncommon: 0x3fbf5a, rare: 0x3b82f6, epic: 0xa855f7 };
export const SET_CATALOG = [
  { key: 'scrap', label: 'SCRAP', tier: 'common' },
  { key: 'cadet', label: 'CADET', tier: 'common' },
  { key: 'dune', label: 'DUNE', tier: 'common' },
  { key: 'moss', label: 'MOSS', tier: 'common' },
  { key: 'ash', label: 'ASH', tier: 'common' },
  { key: 'slag', label: 'SLAG', tier: 'common' },
  { key: 'tide', label: 'TIDE', tier: 'common' },
  { key: 'brawler', label: 'BRAWLER', tier: 'common' },
  { key: 'blue',      label: 'SENTINEL',  tier: 'uncommon' },
  { key: 'red',       label: 'MAGMA',     tier: 'uncommon' },
  { key: 'glacier',   label: 'GLACIER',   tier: 'uncommon' },
  { key: 'spartan',   label: 'SPARTAN',   tier: 'rare' },
  { key: 'hazard',    label: 'HAZARD',    tier: 'rare' },
  { key: 'nighthawk', label: 'NIGHTHAWK', tier: 'rare' },
  { key: 'shogun',    label: 'SHOGUN',    tier: 'epic' },
  { key: 'void',      label: 'VOID',      tier: 'epic' },
  { key: 'verdant', label: 'VERDANT', tier: 'uncommon' },
  { key: 'copper', label: 'COPPER', tier: 'uncommon' },
  { key: 'cobalt', label: 'COBALT', tier: 'uncommon' },
  { key: 'umbra', label: 'UMBRA', tier: 'uncommon' },
  { key: 'signal', label: 'SIGNAL', tier: 'uncommon' },
  { key: 'viper', label: 'VIPER', tier: 'rare' },
  { key: 'bastion', label: 'BASTION', tier: 'rare' },
  { key: 'corsair', label: 'CORSAIR', tier: 'rare' },
  { key: 'tempest', label: 'TEMPEST', tier: 'rare' },
  { key: 'warden', label: 'WARDEN', tier: 'rare' },
  { key: 'seraph', label: 'SERAPH', tier: 'epic' },
  { key: 'kraken', label: 'KRAKEN', tier: 'epic' },
  { key: 'titan', label: 'TITAN', tier: 'epic' },
  { key: 'wraith', label: 'WRAITH', tier: 'epic' },
  { key: 'phoenix', label: 'PHOENIX', tier: 'epic' },
  { key: 'monarch', label: 'MONARCH', tier: 'epic' },
];

export function buildMeckaKnightScene(opts = {}) {
  const m = buildMaterials();

  // ---- 1. Rebuild Jammo's skeleton exactly ----
  const bones = {};
  for (const b of JAMMO_SKELETON) {
    const bone = new THREE.Bone();
    bone.name = b.n;
    bone.position.fromArray(b.t);
    bone.quaternion.fromArray(b.r);
    bones[b.n] = bone;
    if (b.p) bones[b.p].add(bone);
  }
  const armature = new THREE.Group();
  armature.name = 'Armature';
  armature.quaternion.fromArray(ARMATURE.r);
  armature.scale.setScalar(ARMATURE.s);
  armature.add(bones['mixamorigHips']);

  const sceneRoot = new THREE.Group();
  sceneRoot.name = 'MeckaScene';
  sceneRoot.add(armature);
  sceneRoot.userData.procedural = true;

  // ---- 2. Per-bone helpers ----
  sceneRoot.updateMatrixWorld(true);
  const childOff = (parent, child) => bones[child].position.clone();
  const _q = new THREE.Quaternion();
  const localDir = (boneName, worldVec) => {
    bones[boneName].getWorldQuaternion(_q).invert();
    return worldVec.clone().applyQuaternion(_q).normalize();
  };
  const WORLD_FWD = new THREE.Vector3(0, 0, 1);
  const WORLD_UP  = new THREE.Vector3(0, 1, 0);
  function orientedGroup(boneName) {
    const fwd = localDir(boneName, WORLD_FWD);
    const up  = localDir(boneName, WORLD_UP);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const upOrtho = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, upOrtho, fwd));
    bones[boneName].add(g);
    return g;
  }
  const ogCache = {};
  const og = (b) => ogCache[b] || (ogCache[b] = orientedGroup(b));

  function footGroup(sFoot, sToe) {
    const v = childOff(sFoot, sToe);
    const dir = v.clone().normalize();
    const up = localDir(sFoot, WORLD_UP);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const upO = new THREE.Vector3().crossVectors(dir, right).normalize();
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upO, dir));
    bones[sFoot].add(g);
    return { g, len: v.length() };
  }
  /* Basis on the hand: +Y = fingers, +Z = palm-normal (back of hand). */
  function handBasisGroup(side) {
    const idx = bones[`mixamorig${side}HandIndex1`];
    const pky = bones[`mixamorig${side}HandPinky1`];
    const mid = bones[`mixamorig${side}HandMiddle1`];
    const fingersDir = (mid ? mid.position.clone() : new THREE.Vector3(0, 1, 0)).normalize();
    let width2, normal;
    if (idx && pky) {
      const widthDir = idx.position.clone().sub(pky.position).normalize();
      normal = new THREE.Vector3().crossVectors(widthDir, fingersDir).normalize();
      width2 = new THREE.Vector3().crossVectors(fingersDir, normal).normalize();
    } else {
      normal = new THREE.Vector3(0, 0, 1); width2 = new THREE.Vector3(1, 0, 0);
    }
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(width2, fingersDir, normal));
    bones[`mixamorig${side}Hand`].add(g);
    return g;
  }

  // ---- 3. Equip registry ----
  // opts.sets = array of set keys to actually construct (default: all 32).
  // The game passes ONE set per fighter: building all 32 makes ~3,150 meshes
  // of which only ~170 are visible, and Three.js still walks every node in
  // updateMatrixWorld every frame.  The viewer builds all (it swaps live).
  const want = (k) => !opts.sets || opts.sets.includes(k);
  const builtSets = new Set();

  const VKEYS = ['blue', 'red', 'spartan', 'shogun', 'glacier', 'hazard', 'nighthawk', 'void',
                 'scrap', 'cadet', 'dune', 'moss', 'ash', 'slag', 'tide', 'brawler',
                 'verdant', 'copper', 'cobalt', 'umbra', 'signal',
                 'viper', 'bastion', 'corsair', 'tempest', 'warden',
                 'seraph', 'kraken', 'titan', 'wraith', 'phoenix', 'monarch'];
  const registry = { helmet: {}, torso: {}, armL: {}, armR: {}, legs: {} };
  for (const sl in registry) for (const vk of VKEYS) registry[sl][vk] = [];
  const equipped = { helmet: null, torso: null, armL: null, armR: null, legs: null };
  // Skeleton parts that hide when a slot wears a hand cover:
  const slotBase = { armL: [], armR: [] };
  const coversHand = { armL: {}, armR: {} };   // {variant: true} when a glove exists

  function reg(slot, variant, obj) { obj.visible = false; registry[slot][variant].push(obj); return obj; }
  function canonContainer(slot, variant, boneName) {
    const c = new THREE.Group(); og(boneName).add(c); return reg(slot, variant, c);
  }
  function boneContainer(slot, variant, boneName) {
    const c = new THREE.Group(); bones[boneName].add(c); return reg(slot, variant, c);
  }
  function equip(slot, variant) {
    if (!(slot in registry)) throw new Error('unknown slot: ' + slot);
    if (variant !== null && !registry[slot][variant]) throw new Error('unknown variant: ' + variant);
    if (variant !== null && !builtSets.has(variant))
      throw new Error(`set "${variant}" not built — include it in opts.sets`);
    equipped[slot] = variant;
    for (const v of Object.keys(registry[slot]))
      for (const o of registry[slot][v]) o.visible = (v === variant);
    if (slotBase[slot]) {
      const hide = !!(variant && coversHand[slot][variant]);
      for (const o of slotBase[slot]) o.visible = !hide;
    }
  }
  const equipAll = (variant) => { for (const s in registry) equip(s, variant); };

  /* ============================================================
     ENDOSKELETON (always visible; hands may hide under a glove)
     ============================================================ */
  // 25 skeleton styles: [head, eye, eyeColor, torso, spine, pelvis, joint, rod, hand, foot, tone]
  const SKEL_STYLES = [
    ['boxy2','dots','white','cage','nuts','wedge','octo','cyl','rod6','wedgef','std'],  // COMPOSITE default (user pick)
    ['boxy','dots','cyan','frame','discs','wedge','ball','hex','rod4','flat','std'],
    ['wedge','mono','amber','core','discs','boxp','puck','cyl','rod4','wedgef','std'],
    ['drum','band','cyan','ribs','nuts','wedge','octo','hex','rod6','flat','std'],
    ['octo','vslit','red','xbrace','discs','tri','ball','quad','slim','wedgef','std'],
    ['monitor','band','dim','plate','boxes','boxp','cube','cyl','chunk','flat','std'],
    ['tri','tri','cyan','frame','coil','wedge','octo','quad','rod4','split','std'],
    ['capsule','mono','ice','core','discs','wedge','ball','cyl','slim','pad','std'],
    ['dome','dots','amber','ribs','nuts','boxp','puck','hex','rod4','flat','std'],
    ['boxy','cross','red','plate','boxes','wedge','cube','quad','chunk','wedgef','std'],
    ['wedge','strip','ice','twinT','discs','tri','ball','twin','rod4','flat','std'],
    ['drum','mono','magenta','frame','coil','wedge','octo','cyl','rod6','split','std'],
    ['octo','band','cyan','core','nuts','boxp','puck','hex','slim','pad','std'],
    ['monitor','tri','amber','xbrace','discs','wedge','ball','twin','rod4','wedgef','std'],
    ['tri','vslit','cyan','ribs','boxes','tri','cube','quad','chunk','flat','dark'],
    ['capsule','dots','ice','plate','coil','wedge','octo','cyl','rod4','split','std'],
    ['dome','cross','gold','twinT','discs','boxp','puck','hex','rod6','flat','std'],
    ['boxy','band','red','core','nuts','wedge','ball','twin','slim','pad','dark'],
    ['wedge','dots','magenta','frame','boxes','tri','cube','cyl','chunk','wedgef','std'],
    ['drum','strip','gold','xbrace','discs','wedge','octo','quad','rod4','flat','std'],
    ['octo','mono','cyan','plate','coil','boxp','ball','hex','slim','split','dark'],
    ['monitor','vslit','ice','twinT','nuts','wedge','puck','twin','rod6','flat','std'],
    ['tri','cross','amber','core','discs','tri','cube','cyl','rod4','pad','std'],
    ['capsule','band','red','ribs','boxes','wedge','octo','hex','chunk','wedgef','dark'],
    ['dome','bighex','ember','frame','discs','wedge','ball','cyl','rod4','flat','std'],
  ];
  let skelGroups = [], skelIndex = 0;
  function skG(parent) { const g = new THREE.Group(); parent.add(g); skelGroups.push(g); return g; }
  function clearSkeleton() {
    for (const g of skelGroups) if (g.parent) g.parent.remove(g);
    skelGroups = []; slotBase.armL = []; slotBase.armR = [];
  }
  function buildSkeletonMeshes(idx) {
    skelIndex = idx;
    const [HD, EY, EC, TO, SP, PV, JT, RD, HN, FT, TN] = SKEL_STYLES[idx];
    const skelEyeMats = { cyan: m.visor, amber: m.amber, red: m.eyeRed, magenta: m.visorMagenta,
                          ice: m.iceVisor, gold: m.visorGold, ember: m.ember, dim: m.visorDim,
                          white: m.eyeWhite };
    const S = TN === 'dark' ? m.night : m.skSteel;
    const SH = TN === 'dark' ? m.nightHi : m.skSteelHi;
    const SL = TN === 'dark' ? m.nightLo : m.skSteelLo;
    const EM = skelEyeMats[EC];
    const joint = (r) => JT === 'octo' ? ico(r, 0, SH)
      : JT === 'puck' ? (() => { const p = cyl(r, r, r * 0.9, 8, SH); p.rotation.z = Math.PI / 2; return p; })()
      : JT === 'cube' ? box(r * 1.5, r * 1.5, r * 1.5, SH)
      : ico(r, 1, SH);
    const rod = (v, r0, r1, mat) =>
      RD === 'hex' ? limbAlong(v, r0, r1, mat, 6)
      : RD === 'quad' ? limbAlong(v, r0, r1, mat, 4)
      : RD === 'twin' ? (() => { const g = new THREE.Group();
          const a = limbAlong(v, r0 * 0.62, r1 * 0.62, mat, 6); a.position.x = 0.07;
          const b = limbAlong(v, r0 * 0.62, r1 * 0.62, mat, 6); b.position.x = -0.07;
          g.add(a); g.add(b); return g; })()
      : limbAlong(v, r0, r1, mat, 8);

    const hg = skG(og('mixamorigHead'));
    let eyeY = 0.86, eyeZ = 0.48;
    if (HD === 'dome') {
      const housing = box(1.34, 0.32, 1.02, SL); housing.position.y = 0.86; hg.add(housing);
      const dome = ico(0.70, 0, S); dome.scale.set(0.95, 0.80, 0.95); dome.position.y = 1.26; hg.add(dome);
      const chin = fbox(1.26, 0.86, 0.50, 0.80, S); chin.position.y = 0.58; hg.add(chin);
    } else if (HD === 'boxy2') {   // composite: boxy -10%, eyes recessed into sockets
      const h = box(1.17, 1.06, 0.95, S); h.position.y = 0.85; hg.add(h);
      const brow = box(1.21, 0.13, 0.18, SL); brow.position.set(0, 1.10, 0.44); hg.add(brow);
      eyeZ = 0.45; eyeY = 0.83;   // eye front clearly proud of the face (z-fight fix)
      for (const sd of [1, -1]) {   // dark socket rims sit flush, framing the eyes
        const sock = box(0.26, 0.24, 0.08, m.faceDark); sock.position.set(sd * 0.28, 0.83, 0.435); hg.add(sock);
      }
    } else if (HD === 'boxy') {
      const h = box(1.30, 1.18, 1.06, S); h.position.y = 0.94; hg.add(h);
      const brow = box(1.34, 0.14, 0.20, SL); brow.position.set(0, 1.22, 0.50); hg.add(brow); eyeZ = 0.56; eyeY = 0.92;
    } else if (HD === 'wedge') {
      const h = box(1.28, 1.06, 1.04, S); h.position.y = 0.90; hg.add(h);
      const sl = box(1.22, 0.46, 0.16, SH); sl.rotation.x = 0.55; sl.position.set(0, 1.30, 0.48); hg.add(sl); eyeZ = 0.55;
    } else if (HD === 'drum') {
      const h = cyl(0.66, 0.70, 1.10, 8, S); h.position.y = 0.92; hg.add(h);
      const cap = cyl(0.55, 0.62, 0.18, 8, SH); cap.position.y = 1.54; hg.add(cap); eyeZ = 0.60;
    } else if (HD === 'octo') {
      const h = ico(0.82, 0, S); h.scale.set(0.95, 1.0, 0.9); h.position.y = 1.00; hg.add(h);
      const jaw = fbox(1.00, 0.70, 0.36, 0.80, S); jaw.position.y = 0.42; hg.add(jaw); eyeZ = 0.55; eyeY = 0.95;
    } else if (HD === 'monitor') {
      const h = box(1.52, 0.98, 0.92, S); h.position.y = 0.92; hg.add(h);
      const stand = cyl(0.16, 0.20, 0.30, 6, SL); stand.position.y = 0.40; hg.add(stand); eyeZ = 0.49; eyeY = 0.92;
    } else if (HD === 'tri') {
      const h = fbox(0.78, 1.42, 1.10, 0.85, S); h.position.y = 0.94; hg.add(h);
      const chin = box(0.90, 0.20, 0.60, SL); chin.position.y = 0.34; hg.add(chin); eyeZ = 0.50;
    } else {
      const h = ico(0.62, 1, S); h.scale.set(1.0, 1.35, 0.95); h.position.y = 0.98; hg.add(h);
      const band = cyl(0.60, 0.63, 0.12, 8, SL); band.position.y = 0.70; hg.add(band); eyeZ = 0.55; eyeY = 0.98;
    }
    if (EY === 'strip') { const e = box(1.10, 0.16, 0.14, EM); e.position.set(0, eyeY, eyeZ); hg.add(e); }
    else if (EY === 'dots') { for (const sd of [1, -1]) {
      const e = box(0.18, 0.16, 0.10, EM); e.position.set(sd * 0.28, eyeY, eyeZ); hg.add(e); } }
    else if (EY === 'mono') { const e = hexPlate(0.15, 0.12, EM); e.rotation.x = Math.PI / 2; e.position.set(0, eyeY, eyeZ); hg.add(e); }
    else if (EY === 'vslit') { const e = box(0.16, 0.56, 0.12, EM); e.position.set(0, eyeY, eyeZ); hg.add(e); }
    else if (EY === 'tri') { for (const gx of [-0.30, 0, 0.30]) {
      const e = box(0.12, 0.34, 0.12, EM); e.position.set(gx, eyeY, eyeZ); hg.add(e); } }
    else if (EY === 'band') { const e = box(1.34, 0.12, 0.12, EM); e.position.set(0, eyeY, eyeZ); hg.add(e); }
    else if (EY === 'cross') {
      const ev = box(0.14, 0.52, 0.12, EM); ev.position.set(0, eyeY - 0.04, eyeZ); hg.add(ev);
      const eh = box(0.50, 0.13, 0.12, EM); eh.position.set(0, eyeY + 0.06, eyeZ); hg.add(eh);
    } else { const e = hexPlate(0.24, 0.10, EM); e.rotation.x = Math.PI / 2; e.position.set(0, eyeY, eyeZ); hg.add(e); }

    {   // neck: a smaller version of the spine — thin core + stacked nuts
      const ng = skG(bones['mixamorigNeck']);
      const vN = childOff('mixamorigNeck', 'mixamorigHead');
      ng.add(limbAlong(vN, 0.07, 0.08, SL, 6));
      const nL = vN.length();
      for (const t2 of [0.25, 0.55, 0.85]) {
        const nut = cyl(0.13, 0.13, 0.06, 6, S);
        nut.position.copy(vN.clone().multiplyScalar(t2));
        nut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vN.clone().normalize());
        ng.add(nut);
      }
    }

    const tg = skG(og('mixamorigSpine1'));
    if (TO === 'frame') {
      const chest = fbox(1.44, 0.92, 1.02, 0.60, S); chest.position.y = 0.54; tg.add(chest);
      const panel = fbox(0.95, 0.60, 0.85, 0.18, SH); panel.position.set(0, 0.56, 0.30); tg.add(panel);
    } else if (TO === 'core') {
      const c2 = cyl(0.55, 0.62, 1.00, 8, S); c2.position.y = 0.55; tg.add(c2);
      const ring = cyl(0.60, 0.60, 0.10, 8, SH); ring.position.y = 0.78; tg.add(ring);
    } else if (TO === 'cage') {    // composite: rib cage funneling down, -10% overall
      const rw = [1.17, 1.05, 0.95];   // 3 ribs, each 10% narrower than the one above
      const ry = [0.82, 0.56, 0.30];
      for (let k2 = 0; k2 < 3; k2++) {
        const r2 = box(rw[k2], 0.13, 0.83 - k2 * 0.05, S); r2.position.y = ry[k2]; tg.add(r2);
      }
      const sp2 = box(0.16, 0.85, 0.18, SL); sp2.position.set(0, 0.53, -0.38); tg.add(sp2);
      const st3 = box(0.14, 0.85, 0.16, SL); st3.position.set(0, 0.53, 0.30); tg.add(st3);
    } else if (TO === 'ribs') {
      for (const ry of [0.30, 0.55, 0.80]) { const r2 = box(1.30, 0.16, 0.92, S); r2.position.y = ry; tg.add(r2); }
      const sp2 = box(0.18, 0.90, 0.20, SL); sp2.position.set(0, 0.55, -0.42); tg.add(sp2);
    } else if (TO === 'xbrace') {
      for (const sd of [1, -1]) { const b2 = box(0.20, 1.15, 0.20, S); b2.rotation.z = sd * 0.55; b2.position.set(0, 0.55, 0.30); tg.add(b2); }
      const back2 = box(1.20, 0.90, 0.16, SL); back2.position.set(0, 0.55, -0.35); tg.add(back2);
    } else if (TO === 'plate') {
      const p2 = fbox(1.40, 1.00, 1.00, 0.50, S); p2.position.y = 0.54; tg.add(p2);
      const inset = box(0.70, 0.60, 0.10, SL); inset.position.set(0, 0.56, 0.30); tg.add(inset);
    } else {
      for (const sd of [1, -1]) { const p3 = box(0.56, 1.00, 0.90, S); p3.position.set(sd * 0.36, 0.54, 0); tg.add(p3); }
    }
    const cw = TO === 'cage' ? 0.9 : 1.0;   // composite torso runs 10% smaller
    const collar = box(1.02 * cw, 0.12, 0.62 * cw, SH); collar.position.y = 1.02 + 0.04 * cw; tg.add(collar);
    const socket = cyl(0.20 * cw, 0.22 * cw, 0.16, 8, SL); socket.position.y = 1.08 + 0.04 * cw; tg.add(socket);

    const sg = skG(og('mixamorigSpine'));
    const core = cyl(0.11, 0.11, 0.45, 8, SL); core.position.y = 0.05; sg.add(core);
    if (SP === 'discs') { for (const y of [-0.06, 0.05, 0.16]) { const d = cyl(0.26, 0.26, 0.09, 8, S); d.position.y = y; sg.add(d); } }
    else if (SP === 'boxes') { for (const y of [-0.06, 0.05, 0.16]) { const d = box(0.42, 0.10, 0.42, S); d.position.y = y; sg.add(d); } }
    else if (SP === 'nuts') { for (const y of [-0.06, 0.05, 0.16]) { const d = cyl(0.26, 0.26, 0.10, 6, S); d.position.y = y; sg.add(d); } }
    else { for (const y of [-0.08, -0.01, 0.06, 0.13, 0.20]) { const d = cyl(0.24, 0.24, 0.05, 8, S); d.position.y = y; sg.add(d); } }

    const pg2 = skG(og('mixamorigHips'));
    if (PV === 'wedge') {
      const pelvis = fbox(1.02, 0.66, 0.42, 0.72, S); pelvis.position.y = 0.13; pg2.add(pelvis);
      const crotch = box(0.30, 0.24, 0.32, SL); crotch.position.y = -0.10; pg2.add(crotch);
    } else if (PV === 'boxp') {
      const pelvis = box(0.92, 0.46, 0.72, S); pelvis.position.y = 0.10; pg2.add(pelvis);
    } else {
      const pelvis = fbox(0.60, 1.04, 0.44, 0.70, S); pelvis.rotation.z = Math.PI; pelvis.position.y = 0.10; pg2.add(pelvis);
    }
    for (const side of ['Left', 'Right']) {
      const j2 = joint(0.21); j2.position.copy(childOff('mixamorigHips', `mixamorig${side}UpLeg`));
      skG(bones['mixamorigHips']).add(j2);
    }

    for (const side of ['Left', 'Right']) {
      const sSh = `mixamorig${side}Shoulder`, sArm = `mixamorig${side}Arm`,
            sFore = `mixamorig${side}ForeArm`, sHand = `mixamorig${side}Hand`;
      const shg = skG(bones[sSh]);
      const v0 = childOff(sSh, sArm);
      shg.add(rod(v0, 0.10, 0.10, SL));
      const jb = joint(0.23); jb.position.copy(v0); shg.add(jb);
      skG(bones[sArm]).add(rod(childOff(sArm, sFore), 0.105, 0.115, S));
      const fg2 = skG(bones[sFore]);
      fg2.add(joint(0.15));
      const vFA = childOff(sFore, sHand);
      fg2.add(rod(vFA, 0.10, 0.12, S));
      fg2.add(sleeveAlong(vFA, 0.93, 0.135, 0.09, SL));
      const hgg = skG(handBasisGroup(side));
      const handList = [hgg];
      const palm = HN === 'round'
        ? (() => { const p2 = ico(0.20, 1, S); p2.scale.set(0.9, 1.1, 0.5); return p2; })()
        : box(0.34, 0.42, 0.14, S);
      palm.position.y = 0.24; hgg.add(palm);
      const fr = HN === 'chunk' ? 1.35 : HN === 'slim' ? 0.70 : 1.0;
      const seg = HN === 'rod6' ? 6 : 4;
      for (const finger of ['Thumb', 'Index', 'Middle', 'Pinky']) {
        const r = (finger === 'Thumb' ? 0.055 : 0.045) * fr;
        for (let i2 = 1; i2 <= 3; i2++) {
          const a2 = `mixamorig${side}Hand${finger}${i2}`, b2 = `mixamorig${side}Hand${finger}${i2 + 1}`;
          if (!bones[a2] || !bones[b2]) continue;
          const fgrp = skG(bones[a2]);
          fgrp.add(limbAlong(childOff(a2, b2), r * 0.85, r, SL, seg));
          handList.push(fgrp);
        }
      }
      if (side === 'Left') slotBase.armL = handList; else slotBase.armR = handList;
    }

    for (const side of ['Left', 'Right']) {
      const sUp = `mixamorig${side}UpLeg`, sLeg = `mixamorig${side}Leg`,
            sFoot = `mixamorig${side}Foot`, sToe = `mixamorig${side}ToeBase`;
      skG(bones[sUp]).add(rod(childOff(sUp, sLeg), 0.125, 0.14, S));
      const kg = skG(bones[sLeg]);
      kg.add(joint(0.16));
      kg.add(rod(childOff(sLeg, sFoot), 0.10, 0.13, S));
      skG(bones[sFoot]).add(joint(0.135));
      const { g: fgg, len } = footGroup(sFoot, sToe);
      skelGroups.push(fgg);
      if (FT === 'flat') {
        const slab = box(0.34, 0.15, len * 0.95, S); slab.position.set(0, -0.02, len * 0.40); fgg.add(slab);
        const toe = box(0.30, 0.12, 0.26, SL); toe.position.set(0, -0.05, len * 0.95); fgg.add(toe);
        const heel = box(0.28, 0.12, 0.14, SL); heel.position.set(0, -0.04, -0.08); fgg.add(heel);
      } else if (FT === 'wedgef') {
        const slab = fbox(0.20, 0.40, len * 1.15, 0.50, S);
        slab.rotation.x = Math.PI / 2; slab.position.set(0, -0.02, len * 0.45); fgg.add(slab);
        const heel = box(0.28, 0.14, 0.14, SL); heel.position.set(0, -0.02, -0.08); fgg.add(heel);
      } else if (FT === 'split') {
        for (const sd of [1, -1]) { const t2 = box(0.14, 0.13, len * 1.00, S); t2.position.set(sd * 0.10, -0.03, len * 0.45); fgg.add(t2); }
        const heel = box(0.30, 0.13, 0.16, SL); heel.position.set(0, -0.03, -0.06); fgg.add(heel);
      } else {
        const slab = box(0.32, 0.13, len * 0.80, S); slab.position.set(0, -0.02, len * 0.35); fgg.add(slab);
        const toe = ico(0.16, 1, SL); toe.scale.set(1.0, 0.6, 1.2); toe.position.set(0, -0.04, len * 0.95); fgg.add(toe);
      }
    }
    sceneRoot.updateMatrixWorld(true);
  }
  buildSkeletonMeshes(0);

  /* ============================================================
     MECHA ARMOR — one UNIT-07 sculpt, colored per variant:
       'blue'    = slate-navy plates, grey boots, cyan visor
       'spartan' = Master Chief green plates, green boots, gold visor
     (geometry identical; only the palette differs)
     ============================================================ */
  /* ============================================================
     MECHA ARMOR — shared ribbed-piston limbs (buildMechaArms/Legs)
     + per-variant head & chest:
       blue    = boxy UNIT-07 helmet + antenna, angular chest
       spartan = Mjolnir dome + mandibles + gold visor, chevron chest
     ============================================================ */
  /* Shared limb core (ribbed pistons + brass + shells) with per-variant
     STYLE options so silhouettes differ, not just colors:
       st.pauldron: 'stack'|'sode'|'dome'|'domeTrim'|'box'|'blade'|'point'|'slab'
       st.fist:     'mitt'|'block'|'sharp'      st.fistBand: material|null
       st.knuckleMat: material override          st.armSeam: emissive mat|null
       st.boot:     'block'|'steel'|'sleek'|'clean'|'trim'|'lacquer'|'ember'
       st.knee:     {type:'ring'|'gem', mat}     st.shinGuard: bool
       st.hipSkirt: bool (hanging haidate side plates)                     */
  function buildMechaArms(vk, pal, st = {}) {
    if (!want(vk)) return;
    builtSets.add(vk);
  const pd = st.pauldron || 'stack', fist = st.fist || 'mitt';
  for (const side of ['Left', 'Right']) {
    const s = side === 'Left' ? 1 : -1;
    const slot = side === 'Left' ? 'armL' : 'armR';
    const sSh = `mixamorig${side}Shoulder`, sArm = `mixamorig${side}Arm`,
          sFore = `mixamorig${side}ForeArm`;

    // ---- Pauldron (style-switched) ----
    const pc = canonContainer(slot, vk, sSh);
    if (pd === 'none') {
      // bare shoulder — skeleton joint fully visible
    } else if (pd === 'cap') {           // small half-dome cap
      const cap = ico(0.26, 1, pal.main); cap.scale.set(1.1, 0.7, 1.0); cap.position.set(s * 0.30, 0.30, 0); pc.add(cap);
    } else if (pd === 'flatp') {         // single flat plate + edge
      const fp = box(0.54, 0.10, 0.64, pal.main); fp.rotation.z = -s * 0.24; fp.position.set(s * 0.30, 0.30, 0); pc.add(fp);
      const fe = box(0.54, 0.06, 0.10, pal.lo); fe.rotation.z = -s * 0.24; fe.position.set(s * 0.30, 0.28, 0.30); pc.add(fe);
    } else if (pd === 'stack') {
      const p1 = box(0.64, 0.30, 0.80, pal.main); p1.rotation.z = -s * 0.30; p1.position.set(s * 0.30, 0.24, 0); pc.add(p1);
      const p2 = box(0.54, 0.24, 0.68, pal.hi); p2.rotation.z = -s * 0.34; p2.position.set(s * 0.42, 0.04, 0); pc.add(p2);
      const p3 = box(0.44, 0.20, 0.56, pal.lo); p3.rotation.z = -s * 0.38; p3.position.set(s * 0.52, -0.16, 0); pc.add(p3);
      const pTop = box(0.48, 0.14, 0.62, pal.hi); pTop.rotation.z = -s * 0.26; pTop.position.set(s * 0.20, 0.42, 0); pc.add(pTop);
    } else if (pd === 'sode') {           // shogun: flat hanging square plates
      const mats = [pal.main, pal.hi, pal.lo];
      for (let k = 0; k < 3; k++) {
        const pl = box(0.60, 0.10, 0.72, mats[k]);
        pl.rotation.z = -s * 0.22; pl.position.set(s * (0.26 + 0.10 * k), 0.30 - 0.20 * k, 0); pc.add(pl);
      }
      const rail = box(0.50, 0.10, 0.60, pal.accent);
      rail.rotation.z = -s * 0.18; rail.position.set(s * 0.16, 0.46, 0); pc.add(rail);
    } else if (pd === 'dome' || pd === 'domeTrim') {   // glacier / spartan
      const dome = ico(0.42, 1, pd === 'dome' ? pal.hi : pal.main);
      dome.scale.set(1.15, 0.75, 1.0); dome.position.set(s * 0.30, 0.26, 0); pc.add(dome);
      const rim = box(0.62, 0.10, 0.70, pal.lo); rim.rotation.z = -s * 0.28; rim.position.set(s * 0.34, 0.02, 0); pc.add(rim);
      if (pd === 'dome') for (const vy of [0.36, 0.26]) {
        const slat = box(0.30, 0.05, 0.08, pal.lo); slat.position.set(s * 0.30, vy, 0.30); pc.add(slat);
      }
      else { const trim = box(0.10, 0.26, 0.66, pal.hi); trim.position.set(s * 0.56, 0.12, 0); pc.add(trim); }
    } else if (pd === 'box') {            // hazard: riveted crate + marker lamp
      const bx = box(0.66, 0.42, 0.78, pal.main); bx.rotation.z = -s * 0.22; bx.position.set(s * 0.32, 0.18, 0); pc.add(bx);
      const stripe = box(0.68, 0.10, 0.16, pal.accent); stripe.rotation.z = -s * 0.22; stripe.position.set(s * 0.32, 0.18, 0.34); pc.add(stripe);
      const riv = cyl(0.05, 0.05, 0.08, 8, pal.hi); riv.rotation.x = Math.PI / 2; riv.position.set(s * 0.48, 0.34, 0.34); pc.add(riv);
      const lamp = box(0.10, 0.08, 0.06, pal.visor); lamp.position.set(s * 0.14, 0.40, 0.38); pc.add(lamp);
    } else if (pd === 'blade') {          // nighthawk: knife-edge chines
      const b1 = box(0.10, 0.56, 0.84, pal.hi); b1.rotation.z = -s * 0.42; b1.position.set(s * 0.38, 0.14, 0); pc.add(b1);
      const b2 = box(0.08, 0.44, 0.68, pal.main); b2.rotation.z = -s * 0.50; b2.position.set(s * 0.52, -0.02, 0); pc.add(b2);
      const bTop = box(0.34, 0.08, 0.70, pal.lo); bTop.rotation.z = -s * 0.20; bTop.position.set(s * 0.18, 0.36, 0); pc.add(bTop);
    } else if (pd === 'point') {          // void: downward-pointed spaulder + gold
      const pt = fbox(0.20, 0.66, 0.50, 0.85, pal.main);
      pt.rotation.z = Math.PI - s * 0.25; pt.position.set(s * 0.34, 0.10, 0); pc.add(pt);
      const trim = box(0.56, 0.08, 0.60, pal.accent); trim.rotation.z = -s * 0.25; trim.position.set(s * 0.28, 0.36, 0); pc.add(trim);
      const stud = ico(0.08, 0, pal.visor); stud.position.set(s * 0.30, 0.22, 0.30); pc.add(stud);
    } else if (pd === 'strap') {          // common: one thin bolted strap plate
      const sp = box(0.52, 0.16, 0.62, pal.main); sp.rotation.z = -s * 0.26; sp.position.set(s * 0.30, 0.28, 0); pc.add(sp);
      const bolt = cyl(0.05, 0.05, 0.07, 6, pal.lo); bolt.rotation.x = Math.PI / 2; bolt.position.set(s * 0.30, 0.30, 0.30); pc.add(bolt);
    } else if (pd === 'slab') {           // magma: cracked slabs + ember seam
      const sl1 = box(0.64, 0.36, 0.78, pal.main); sl1.rotation.z = -s * 0.26; sl1.position.set(s * 0.30, 0.18, 0); pc.add(sl1);
      const sl2 = box(0.50, 0.22, 0.62, pal.lo); sl2.rotation.z = -s * 0.34; sl2.position.set(s * 0.46, -0.06, 0); pc.add(sl2);
      if (st.armSeam) {
        const seam = box(0.05, 0.30, 0.66, st.armSeam);
        seam.rotation.z = -s * 0.26; seam.position.set(s * 0.42, 0.16, 0); pc.add(seam);
      }
    }

    // ---- Upper arm core: SKIPPED when st.upperArm === false (uncommon tier
    //      signal — the skeleton upper arm stays exposed) ----
    if (st.upperArm !== false) {
      const uc = boneContainer(slot, vk, sArm);
      const vArm = childOff(sArm, sFore);
      uc.add(ribbedAlong(vArm, 0.02, 0.30, 0.155, 0.115, 5, pal.gun));
      uc.add(ringAlong(vArm, 0.03, 0.175, 0.05, pal.brass));
      uc.add(ringAlong(vArm, 0.30, 0.165, 0.05, pal.brass));
      uc.add(shellAlong(vArm, 0.34, 0.92, 0.15, 0.16, pal.main, 8));
    }

    if (st.forearm !== false) {
      const fc = boneContainer(slot, vk, sFore);
      const vFA = childOff(sFore, `mixamorig${side}Hand`);
      fc.add(ribbedAlong(vFA, 0.00, 0.22, 0.17, 0.13, 4, pal.gun));
      fc.add(ringAlong(vFA, 0.22, 0.185, 0.05, pal.brass));
      fc.add(shellAlong(vFA, 0.24, 0.80, 0.175, 0.20, pal.main, 8));
      fc.add(ribbedAlong(vFA, 0.80, 0.98, 0.20, 0.16, 3, pal.gun));
    }

    // ---- Fist (style-switched); hides the skeleton gripper beneath ----
    const hg = handBasisGroup(side);
    const gc = new THREE.Group(); hg.add(gc); reg(slot, vk, gc);
    const knu = st.knuckleMat || pal.hi;
    if (fist === 'mitt') {
      const mitt = ico(0.29, 1, pal.main); mitt.scale.set(1.08, 1.16, 0.98); mitt.position.y = 0.26; gc.add(mitt);
      const knuck = box(0.44, 0.16, 0.30, knu); knuck.position.set(0, 0.38, 0.06); gc.add(knuck);
      const thumb = ico(0.13, 1, pal.main); thumb.scale.set(1.0, 1.2, 1.0);
      thumb.position.set(s * 0.20, 0.20, 0.10); gc.add(thumb);
      const cuff = cyl(0.20, 0.22, 0.14, 10, pal.lo); cuff.position.y = 0.02; gc.add(cuff);
    } else if (fist === 'block') {        // squared power-fist
      const body = box(0.50, 0.44, 0.44, pal.main); body.position.y = 0.24; gc.add(body);
      const knuck = box(0.52, 0.16, 0.18, knu); knuck.position.set(0, 0.40, 0.14); gc.add(knuck);
      const thumb = box(0.16, 0.20, 0.18, pal.main); thumb.position.set(s * 0.26, 0.16, 0.10); gc.add(thumb);
      const cuff = box(0.44, 0.14, 0.40, pal.lo); cuff.position.y = 0.02; gc.add(cuff);
    } else if (fist === 'sharp') {        // faceted stealth mitt + knuckle blade
      const mitt = ico(0.29, 1, pal.main); mitt.scale.set(1.02, 1.14, 0.94); mitt.position.y = 0.26; gc.add(mitt);
      const bladeK = box(0.46, 0.10, 0.10, knu); bladeK.position.set(0, 0.42, 0.12); gc.add(bladeK);
      const chine = box(0.08, 0.26, 0.30, pal.lo); chine.rotation.z = -s * 0.30; chine.position.set(s * 0.30, 0.26, 0.02); gc.add(chine);
      const cuff = cyl(0.20, 0.22, 0.14, 10, pal.lo); cuff.position.y = 0.02; gc.add(cuff);
    }
    if (st.fistBand) {
      const band = cyl(0.205, 0.215, 0.08, 10, st.fistBand); band.position.y = 0.11; gc.add(band);
    }
    gc.scale.multiplyScalar(1.2);   // punching power: every glove +20%
    coversHand[slot][vk] = true;
  }
  }

  function buildMechaLegs(vk, pal, st = {}) {
    if (!want(vk)) return;
    builtSets.add(vk);
  const bt = st.boot || 'block';
  {
    const c = canonContainer('legs', vk, 'mixamorigHips');
    const guard = fbox(1.12, 0.86, 0.46, 0.78, pal.main); guard.position.y = 0.15; c.add(guard);
    const belt = box(1.16, 0.14, 0.92, pal.lo); belt.position.y = 0.36; c.add(belt);
    const cod = fbox(0.40, 0.20, 0.34, 0.55, pal.hi); cod.position.set(0, -0.10, 0.32); c.add(cod);
    for (const s of [1, -1]) {
      const hipPlate = box(0.16, 0.56, 0.58, pal.main); hipPlate.rotation.z = -s * 0.12;
      hipPlate.position.set(s * 0.60, 0.00, 0); c.add(hipPlate);
      if (st.hipSkirt) {                 // shogun haidate hanging side plates
        const skirt = box(0.12, 0.44, 0.50, pal.gun); skirt.position.set(s * 0.72, -0.24, 0.06); c.add(skirt);
        const edge = box(0.12, 0.08, 0.52, pal.accent); edge.position.set(s * 0.72, -0.48, 0.06); c.add(edge);
      }
    }
  }
  for (const side of ['Left', 'Right']) {
    const sUp = `mixamorig${side}UpLeg`, sLeg = `mixamorig${side}Leg`,
          sFoot = `mixamorig${side}Foot`, sToe = `mixamorig${side}ToeBase`;

    if (st.thigh !== false) {
      const tc = boneContainer('legs', vk, sUp);
      const vTh = childOff(sUp, sLeg);
      tc.add(shellAlong(vTh, 0.04, 0.80, 0.205, 0.185, pal.main, 8));
      tc.add(ribbedAlong(vTh, 0.80, 0.99, 0.185, 0.145, 3, pal.gun));
    }

    const lc = boneContainer('legs', vk, sLeg);
    const vSh = childOff(sLeg, sFoot);
    lc.add(ribbedAlong(vSh, 0.00, 0.20, 0.185, 0.14, 4, pal.gun));
    lc.add(ringAlong(vSh, 0.20, 0.19, 0.05, pal.brass));
    lc.add(shellAlong(vSh, 0.22, 0.86, 0.18, 0.15, pal.main, 8));
    lc.add(ribbedAlong(vSh, 0.86, 0.99, 0.16, 0.13, 3, pal.gun));
    if (st.knee) {                        // per-variant knee treatment
      if (st.knee.type === 'ring') lc.add(ringAlong(vSh, 0.02, 0.205, 0.09, st.knee.mat));
      else if (st.knee.type === 'gem') {
        const gem = ico(0.11, 0, st.knee.mat);
        gem.position.copy(vSh.clone().multiplyScalar(0.05)); lc.add(gem);
      }
    }
    if (st.shinGuard) lc.add(shellAlong(vSh, 0.34, 0.62, 0.195, 0.19, pal.hi, 4));

    // ---- Sabaton (style-switched) ----
    const bc = boneContainer('legs', vk, sFoot); bc.userData.isBootHost = true;
    const v = childOff(sFoot, sToe);
    const len = v.length();
    const dir = v.clone().normalize();
    const up = localDir(sFoot, WORLD_UP);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const upO = new THREE.Vector3().crossVectors(dir, right).normalize();
    const fg = new THREE.Group();
    fg.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upO, dir));
    bc.add(fg);
    if (bt === 'wrap') {               // stacked cloth-like bands
      for (const k2 of [0, 1, 2]) {
        const band = box(0.46 - k2 * 0.02, 0.14, len * (1.05 - k2 * 0.10), pal.boot);
        band.position.set(0, 0.20 - k2 * 0.13, len * 0.38); fg.add(band);
      }
      const sole = box(0.48, 0.08, len * 1.22, pal.bootLo); sole.position.set(0, -0.15, len * 0.40); fg.add(sole);
      const toe = box(0.34, 0.16, 0.22, pal.bootLo); toe.position.set(0, -0.04, len * 0.98); fg.add(toe);
    } else if (bt === 'slab') {          // one heavy block
      const body = box(0.50, 0.44, len * 1.05, pal.boot); body.position.set(0, 0.10, len * 0.40); fg.add(body);
      const sole = box(0.54, 0.10, len * 1.30, pal.bootLo); sole.position.set(0, -0.16, len * 0.42); fg.add(sole);
    } else if (bt === 'basic') {                 // common: bare-bones body + sole
      const body = box(0.44, 0.30, len * 0.95, pal.boot); body.position.set(0, 0.05, len * 0.38); fg.add(body);
      const toe = box(0.36, 0.20, 0.26, pal.boot); toe.position.set(0, -0.02, len * 0.94); fg.add(toe);
      const sole = box(0.46, 0.08, len * 1.24, pal.bootLo); sole.position.set(0, -0.15, len * 0.40); fg.add(sole);
      const cuff = box(0.38, 0.18, 0.38, pal.lo); cuff.position.set(0, 0.26, 0.02); fg.add(cuff);
    } else if (bt === 'sleek') {                 // nighthawk: slim pointed boots
      const body = box(0.46, 0.28, len * 1.00, pal.boot); body.position.set(0, 0.04, len * 0.40); fg.add(body);
      const toe = box(0.38, 0.18, 0.34, pal.boot); toe.position.set(0, -0.02, len * 1.00); fg.add(toe);
      const tip = box(0.26, 0.10, 0.20, pal.bootLo); tip.position.set(0, -0.07, len * 1.28); fg.add(tip);
      const heelB = box(0.10, 0.26, 0.14, pal.bootLo); heelB.position.set(0, 0.10, -0.16); fg.add(heelB);
      const cuff = box(0.36, 0.20, 0.38, pal.main); cuff.position.set(0, 0.28, 0.02); fg.add(cuff);
      const sole = box(0.48, 0.07, len * 1.30, pal.bootLo); sole.position.set(0, -0.14, len * 0.44); fg.add(sole);
    } else if (bt === 'clean') {          // glacier: rounded toe + heel fin + vents
      const body = box(0.46, 0.32, len * 0.98, pal.boot); body.position.set(0, 0.06, len * 0.38); fg.add(body);
      const toe = ico(0.20, 1, pal.boot); toe.scale.set(1.1, 0.7, 1.25); toe.position.set(0, -0.02, len * 1.02); fg.add(toe);
      const fin = box(0.08, 0.30, 0.16, pal.bootLo); fin.position.set(0, 0.14, -0.18); fg.add(fin);
      const cuff = box(0.40, 0.22, 0.42, pal.main); cuff.position.set(0, 0.30, 0.02); fg.add(cuff);
      for (const vy of [0.34, 0.26]) { const slat = box(0.30, 0.04, 0.06, pal.bootLo); slat.position.set(0, vy, 0.26); fg.add(slat); }
      const sole = box(0.48, 0.09, len * 1.32, pal.bootLo); sole.position.set(0, -0.16, len * 0.40); fg.add(sole);
    } else {                              // block family (+ steel/trim/lacquer/ember extras)
      const body = box(0.48, 0.34, len * 1.02, pal.boot); body.position.set(0, 0.06, len * 0.40); fg.add(body);
      const toe = box(0.44, 0.26, 0.30, pal.boot); toe.position.set(0, 0.00, len * 0.92); fg.add(toe);
      const toeCap = box(0.38, 0.16, 0.22, pal.bootHi); toeCap.position.set(0, -0.06, len * 1.22); fg.add(toeCap);
      const heel = box(0.42, 0.30, 0.18, pal.boot); heel.position.set(0, 0.06, -0.12); fg.add(heel);
      const cuff = box(0.40, 0.22, 0.42, pal.main); cuff.position.set(0, 0.30, 0.02); fg.add(cuff);
      const sole = box(0.50, 0.09, len * 1.36, pal.bootLo); sole.position.set(0, -0.16, len * 0.42); fg.add(sole);
      if (bt === 'steel') {               // hazard: armored toe + caution stripe
        const cap2 = box(0.44, 0.22, 0.26, pal.bootHi); cap2.position.set(0, 0.04, len * 1.14); fg.add(cap2);
        const stripe = box(0.50, 0.09, 0.12, pal.accent); stripe.position.set(0, 0.13, len * 0.68); fg.add(stripe);
      } else if (bt === 'trim') {         // void: gold band + gold toe edge
        const band = box(0.52, 0.08, 0.46, pal.accent); band.position.set(0, 0.17, len * 0.40); fg.add(band);
        const tEdge = box(0.40, 0.07, 0.10, pal.accent); tEdge.position.set(0, 0.02, len * 1.30); fg.add(tEdge);
      } else if (bt === 'lacquer') {      // shogun: gold cuff band
        const band = box(0.44, 0.10, 0.46, pal.accent); band.position.set(0, 0.24, 0.02); fg.add(band);
      } else if (bt === 'ember' && st.seamMat) {   // magma: glowing sole seam + toe strip
        const seam = box(0.52, 0.05, len * 1.30, st.seamMat); seam.position.set(0, -0.105, len * 0.42); fg.add(seam);
        const tStrip = box(0.34, 0.05, 0.06, st.seamMat); tStrip.position.set(0, -0.06, len * 1.34); fg.add(tStrip);
      }
    }
  }
  }

  function buildBlueHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
  // ---- Blue HELMET: beveled box that ENCLOSES the skeleton head,
  //      segmented cyan visor bar, tall antenna fin (asymmetric)
  {
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    // Enclosing shell: main box + beveled tapered crown + jaw wedge.
    const main = box(1.56, 1.30, 1.30, pal.main); main.position.set(0, 0.94, 0.00); c.add(main);
    const crown = fbox(0.86, 1.46, 0.74, 0.82, pal.hi); crown.position.set(0, 1.62, -0.02); c.add(crown);
    const jaw = fbox(1.30, 0.98, 0.44, 0.86, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
    // Face features, proud of the front face (front is local z ≈ 0.65):
    const brow = box(1.30, 0.22, 0.18, pal.lo); brow.position.set(0, 1.16, 0.70); c.add(brow);
    const bezel = box(1.16, 0.34, 0.18, pal.faceDark); bezel.position.set(0, 0.82, 0.70); c.add(bezel);
    const heights = [0.10, 0.18, 0.12, 0.20, 0.12, 0.18, 0.10];
    for (let i = 0; i < heights.length; i++) {
      const seg = box(0.10, heights[i], 0.07, pal.visor);
      seg.position.set(-0.42 + i * 0.14, 0.82, 0.80); c.add(seg);
    }
    for (const s of [1, -1]) {
      const notch = box(0.12, 0.30, 0.16, pal.lo); notch.position.set(s * 0.62, 0.82, 0.72); c.add(notch);
    }
    // SENTINEL: symmetric twin sensor studs (antenna fin removed by request)
    for (const sd of [1, -1]) {
      const stud = box(0.16, 0.38, 0.28, pal.hi);
      stud.rotation.z = -sd * 0.30; stud.position.set(sd * 0.66, 1.60, -0.02); c.add(stud);
      const tip = box(0.08, 0.14, 0.30, pal.accent);
      tip.rotation.z = -sd * 0.30; tip.position.set(sd * 0.72, 1.76, -0.02); c.add(tip);
    }
  }

  }

  function buildBlueTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
  // ---- Blue TORSO: angular breastplate, raised sternum, orange chevrons
  {
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.62, 1.18, 1.06, 0.70, pal.main); breast.position.y = 0.55; c.add(breast);
    const upper = box(1.34, 0.30, 0.98, pal.hi); upper.position.set(0, 1.00, 0.02); c.add(upper);
    const sternum = box(0.60, 0.72, 0.20, pal.hi); sternum.position.set(0, 0.62, 0.46); c.add(sternum);
    const sternumEdge = box(0.70, 0.14, 0.22, pal.lo); sternumEdge.position.set(0, 0.28, 0.46); c.add(sternumEdge);
    for (const s of [1, -1]) {
      const pec = box(0.42, 0.50, 0.10, pal.lo);
      pec.rotation.y = -s * 0.16; pec.position.set(s * 0.44, 0.66, 0.44); c.add(pec);
      // orange chevron accent, lower corner
      const chevA = box(0.24, 0.07, 0.08, pal.accent);
      chevA.rotation.z = s * 0.7; chevA.position.set(s * 0.44, 0.20, 0.46); c.add(chevA);
      const chevB = box(0.24, 0.07, 0.08, pal.accent);
      chevB.rotation.z = -s * 0.7; chevB.position.set(s * 0.52, 0.20, 0.46); c.add(chevB);
    }
    const collar = box(1.10, 0.16, 0.70, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.30, 1.02, 0.24, pal.main); back.position.set(0, 0.58, -0.46); c.add(back);
    const backRidge = box(0.30, 0.90, 0.14, pal.hi); backRidge.position.set(0, 0.58, -0.58); c.add(backRidge);
  }

  }

  function buildSpartanHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Beveled faceted combat helmet (hard-surface, large flat panels),
    // SYMMETRIC (no antenna). Single SOLID GOLD visor lens in a dark recess.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    // Enclosing beveled shell: main box + tapered crown ridge + jaw wedge
    const main = box(1.62, 1.30, 1.32, pal.main); main.position.set(0, 0.94, 0.00); c.add(main);
    const crown = fbox(0.84, 1.44, 0.78, 0.84, pal.hi); crown.position.set(0, 1.54, -0.02); c.add(crown);
    // Top chamfers: round the boxy crown into a faceted dome (soft edges, big panels)
    const chamF = fbox(1.40, 0.80, 0.34, 0.9, pal.main); chamF.rotation.x = 0.62; chamF.position.set(0, 1.42, 0.42); c.add(chamF);
    const chamB = fbox(1.40, 0.80, 0.34, 0.9, pal.main); chamB.rotation.x = -0.62; chamB.position.set(0, 1.42, -0.48); c.add(chamB);
    const jaw = fbox(1.26, 0.96, 0.46, 0.86, pal.main); jaw.position.set(0, 0.30, 0.08); c.add(jaw);
    // Brow ridge above the visor
    const brow = box(1.26, 0.22, 0.20, pal.hi); brow.position.set(0, 1.16, 0.68); c.add(brow);
    // Halo-style trapezoid visor: wider at the top, seated in a trapezoid recess
    const recess = fbox(1.30, 0.98, 0.48, 0.20, pal.faceDark); recess.position.set(0, 0.82, 0.62); c.add(recess);
    const visor = fbox(1.16, 0.84, 0.38, 0.16, pal.visor); visor.position.set(0, 0.82, 0.70); c.add(visor);
    // Angular cheek guards flanking the visor, jutting forward
    for (const s of [1, -1]) {
      const cheek = fbox(0.40, 0.30, 0.78, 0.72, pal.main);
      cheek.rotation.set(0.10, -s * 0.26, s * 0.05); cheek.position.set(s * 0.66, 0.74, 0.42); c.add(cheek);
      const cheekEdge = box(0.10, 0.64, 0.20, pal.hi);
      cheekEdge.rotation.set(0.10, -s * 0.26, 0); cheekEdge.position.set(s * 0.74, 0.78, 0.52); c.add(cheekEdge);
      const bolt = cyl(0.07, 0.07, 0.10, 8, pal.hi);
      bolt.rotation.z = Math.PI / 2; bolt.position.set(s * 0.52, 1.04, 0.72); c.add(bolt);
    }
  }

  function buildSpartanTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Compact breastplate + raised sternum + central inverted-V ab-chevron.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.28, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const sternum = box(0.24, 0.60, 0.20, pal.hi); sternum.position.set(0, 0.74, 0.46); c.add(sternum);
    // Central inverted-V ab-chevron (point down): dark seam + two angled plates + apex
    const seam = box(0.62, 0.44, 0.14, pal.faceDark); seam.position.set(0, 0.30, 0.44); c.add(seam);
    for (const s of [1, -1]) {
      const armp = box(0.52, 0.16, 0.18, pal.hi);
      armp.rotation.z = s * 0.62; armp.position.set(s * 0.19, 0.35, 0.50); c.add(armp);
    }
    const apex = box(0.18, 0.18, 0.18, pal.hi); apex.rotation.z = Math.PI / 4; apex.position.set(0, 0.17, 0.50); c.add(apex);
    for (const s of [1, -1]) {
      const notch = box(0.16, 0.22, 0.12, pal.faceDark); notch.position.set(s * 0.56, 0.26, 0.44); c.add(notch);
    }
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const backRidge = box(0.28, 0.88, 0.14, pal.hi); backRidge.position.set(0, 0.58, -0.57); c.add(backRidge);
  }


  /* ============================================================
     FIVE VARIANT LINE-UP — dedicated helmets & torsos,
     shared ribbed arms/legs via buildMechaArms/Legs.
     All symmetric, same enclosure rules as blue/spartan.
     ============================================================ */

  function buildShogunHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Sengoku kabuto: gold crescent maedate, flared shikoro neck plates,
    // amber eye slit, dark menpo jaw with gold grille.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.54, 1.26, 1.28, pal.main); main.position.set(0, 0.94, 0.00); c.add(main);
    const crown = fbox(0.90, 1.44, 0.72, 0.86, pal.hi); crown.position.set(0, 1.54, -0.02); c.add(crown);
    const browband = box(1.34, 0.16, 0.20, pal.accent); browband.position.set(0, 1.16, 0.66); c.add(browband);
    const bezel = box(1.12, 0.34, 0.20, pal.faceDark); bezel.position.set(0, 0.88, 0.66); c.add(bezel);
    for (const sd of [1, -1]) {   // twin slanted oni-glare eyes (outer edge raised)
      const eye = box(0.34, 0.10, 0.07, pal.visor);
      eye.rotation.z = sd * 0.30; eye.position.set(sd * 0.27, 0.88, 0.78); c.add(eye);
    }
    const jaw = fbox(1.28, 0.94, 0.46, 0.84, pal.gun); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
    for (const gx of [-0.22, 0, 0.22]) {
      const bar = box(0.07, 0.26, 0.06, pal.accent); bar.position.set(gx, 0.36, 0.70); c.add(bar);
    }
    // shikoro: three flared stacked neck plates (sides + back)
    const sk1 = box(1.72, 0.13, 1.02, pal.gun); sk1.position.set(0, 0.40, -0.30); c.add(sk1);
    const sk2 = box(1.86, 0.13, 1.06, pal.gun); sk2.position.set(0, 0.26, -0.32); c.add(sk2);
    const sk3 = box(2.00, 0.13, 1.10, pal.gun); sk3.position.set(0, 0.12, -0.34); c.add(sk3);
    // maedate: gold crescent (two flared blades from a disc mount)
    const disc = cyl(0.11, 0.11, 0.06, 12, pal.accent);
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 1.42, 0.68); c.add(disc);
    for (const sd of [1, -1]) {
      const blade = box(0.10, 0.85, 0.05, pal.accent);
      blade.rotation.z = sd * 0.52; blade.position.set(sd * 0.24, 1.82, 0.58); c.add(blade);
    }
  }

  function buildShogunTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Layered lacquer do bands + gold sun disc.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const disc = cyl(0.17, 0.17, 0.08, 12, pal.accent);
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 0.80, 0.55); c.add(disc);
    // lamellar band strips (front-mounted, flaring wider downward)
    const b1 = box(1.24, 0.15, 0.14, pal.gun); b1.position.set(0, 0.44, 0.48); c.add(b1);
    const b2 = box(1.34, 0.15, 0.14, pal.lo);  b2.position.set(0, 0.28, 0.50); c.add(b2);
    const b3 = box(1.44, 0.15, 0.14, pal.gun); b3.position.set(0, 0.12, 0.52); c.add(b3);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const ctrim = box(1.10, 0.06, 0.70, pal.accent); ctrim.position.y = 1.24; c.add(ctrim);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const bridge = box(0.28, 0.88, 0.14, pal.hi); bridge.position.set(0, 0.58, -0.57); c.add(bridge);
    // EPIC closure: lamellar abdomen wrap (ringed, no exposed spine) + nodowa gorget
    const ab0 = cyl(0.53, 0.57, 0.16, 8, pal.main); ab0.position.set(0, 0.06, 0.02); c.add(ab0);
    const ab1 = cyl(0.56, 0.60, 0.16, 8, pal.gun);  ab1.position.set(0, -0.08, 0.02); c.add(ab1);
    const ab2 = cyl(0.60, 0.64, 0.16, 8, pal.main); ab2.position.set(0, -0.24, 0.02); c.add(ab2);
    const ab3 = cyl(0.64, 0.68, 0.16, 8, pal.gun);  ab3.position.set(0, -0.40, 0.02); c.add(ab3);
    const abT = cyl(0.575, 0.575, 0.05, 8, pal.accent); abT.position.set(0, -0.16, 0.02); c.add(abT);
    const gor1 = cyl(0.34, 0.40, 0.16, 8, pal.lo);   gor1.position.set(0, 1.32, 0.02); c.add(gor1);
    const gor2 = cyl(0.30, 0.35, 0.14, 8, pal.main); gor2.position.set(0, 1.46, 0.02); c.add(gor2);
  }

  function buildGlacierHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Polar recon: chisel-nosed shell, low flat crown, ice slit visor, side intakes.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.50, 1.22, 1.26, pal.main); main.position.set(0, 0.92, 0.00); c.add(main);
    const crown = box(1.24, 0.26, 1.00, pal.hi); crown.position.set(0, 1.78, -0.04); c.add(crown);
    const trim = box(1.34, 0.10, 1.08, pal.lo); trim.position.set(0, 1.58, -0.04); c.add(trim);
    const wedge = box(1.40, 0.52, 0.20, pal.main); wedge.rotation.x = 0.55; wedge.position.set(0, 1.32, 0.52); c.add(wedge);
    const bezel = box(1.40, 0.36, 0.20, pal.faceDark); bezel.position.set(0, 0.90, 0.66); c.add(bezel);
    const slit = box(1.24, 0.15, 0.07, pal.visor); slit.position.set(0, 0.90, 0.78); c.add(slit);
    for (const sd of [1, -1]) {   // goggle band wraps onto the sides
      const wrapD = box(0.20, 0.32, 0.26, pal.faceDark);
      wrapD.rotation.y = -sd * 0.62; wrapD.position.set(sd * 0.72, 0.90, 0.48); c.add(wrapD);
      const wrapS = box(0.20, 0.13, 0.08, pal.visor);
      wrapS.rotation.y = -sd * 0.62; wrapS.position.set(sd * 0.76, 0.90, 0.55); c.add(wrapS);
    }
    for (const sd of [1, -1]) {
      const v1 = box(0.10, 0.08, 0.42, pal.lo); v1.position.set(sd * 0.79, 1.04, 0.02); c.add(v1);
      const v2 = box(0.10, 0.08, 0.42, pal.lo); v2.position.set(sd * 0.79, 0.90, 0.02); c.add(v2);
      const cheek = box(0.16, 0.34, 0.18, pal.hi); cheek.position.set(sd * 0.58, 0.88, 0.62); c.add(cheek);
    }
    const chin = fbox(1.22, 0.92, 0.44, 0.84, pal.main); chin.position.set(0, 0.30, 0.06); c.add(chin);
  }

  function buildGlacierTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Clean white breastplate + glowing cryo-core.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const bez = box(0.34, 0.62, 0.16, pal.faceDark); bez.position.set(0, 0.64, 0.50); c.add(bez);
    const core = box(0.16, 0.46, 0.07, pal.visor); core.position.set(0, 0.64, 0.58); c.add(core);
    for (const sd of [1, -1]) {
      const sideP = box(0.30, 0.52, 0.22, pal.lo);
      sideP.rotation.z = sd * 0.18; sideP.position.set(sd * 0.60, 0.36, 0.36); c.add(sideP);
    }
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.hi); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildHazardHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Industrial exo-loader: hard-hat brim, live beacon, amber slit, riveted.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.52, 1.20, 1.26, pal.main); main.position.set(0, 0.92, 0.00); c.add(main);
    const crown = fbox(1.00, 1.40, 0.62, 0.88, pal.hi); crown.position.set(0, 1.58, -0.02); c.add(crown);
    const brim = box(1.78, 0.10, 0.60, pal.hi); brim.position.set(0, 1.24, 0.42); c.add(brim);
    const brimEdge = box(1.78, 0.06, 0.10, pal.lo); brimEdge.position.set(0, 1.21, 0.70); c.add(brimEdge);
    const bBase = box(0.30, 0.10, 0.30, pal.gun); bBase.position.set(0, 1.94, -0.02); c.add(bBase);
    const beacon = box(0.20, 0.16, 0.20, pal.visor); beacon.position.set(0, 2.06, -0.02); c.add(beacon);
    for (const sd of [1, -1]) {   // twin square headlamps in dark housings
      const housing = box(0.36, 0.32, 0.20, pal.faceDark); housing.position.set(sd * 0.30, 0.88, 0.66); c.add(housing);
      const lamp = box(0.22, 0.20, 0.07, pal.visor); lamp.position.set(sd * 0.30, 0.88, 0.78); c.add(lamp);
    }
    for (const sd of [1, -1]) {
      for (const ry of [1.10, 0.56]) {
        const riv = cyl(0.05, 0.05, 0.08, 8, pal.hi);
        riv.rotation.x = Math.PI / 2; riv.position.set(sd * 0.60, ry, 0.66); c.add(riv);
      }
    }
    const jaw = fbox(1.24, 0.92, 0.44, 0.84, pal.lo); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }

  function buildHazardTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Caution chevrons + corner rivets + tow block.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const band = box(1.36, 0.30, 0.10, pal.faceDark); band.position.set(0, 0.52, 0.50); c.add(band);
    for (const gx of [-0.51, -0.17, 0.17, 0.51]) {
      const stripe = box(0.14, 0.34, 0.12, pal.hi);
      stripe.rotation.z = 0.65; stripe.position.set(gx, 0.52, 0.54); c.add(stripe);
    }
    for (const sd of [1, -1]) {
      for (const ry of [1.00, 0.20]) {
        const riv = cyl(0.05, 0.05, 0.08, 8, pal.hi);
        riv.rotation.x = Math.PI / 2; riv.position.set(sd * 0.62, ry, 0.52); c.add(riv);
      }
    }
    const tow = box(0.30, 0.16, 0.14, pal.gun); tow.position.set(0, 0.16, 0.48); c.add(tow);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.faceDark); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildNighthawkHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Stealth-jet: knife-edge chines, sloped forehead, thin crimson sensor bar.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.48, 1.20, 1.26, pal.main); main.position.set(0, 0.92, 0.00); c.add(main);
    const crown = fbox(0.70, 1.30, 0.72, 0.80, pal.hi); crown.position.set(0, 1.56, -0.02); c.add(crown);
    const slope = box(1.30, 0.50, 0.18, pal.main); slope.rotation.x = 0.60; slope.position.set(0, 1.30, 0.50); c.add(slope);
    for (const sd of [1, -1]) {
      const chine = box(0.16, 0.96, 1.20, pal.hi);
      chine.rotation.z = sd * 0.18; chine.position.set(sd * 0.74, 1.00, -0.02); c.add(chine);
    }
    const housing = hexPlate(0.20, 0.12, pal.faceDark);
    housing.rotation.x = Math.PI / 2; housing.position.set(0, 0.92, 0.66); c.add(housing);
    const aperture = hexPlate(0.12, 0.07, pal.visor);   // single camera mono-eye
    aperture.rotation.x = Math.PI / 2; aperture.position.set(0, 0.92, 0.74); c.add(aperture);
    const chin = fbox(1.10, 0.60, 0.44, 0.70, pal.main); chin.position.set(0, 0.28, 0.06); c.add(chin);
    const blade = box(0.10, 0.30, 0.24, pal.lo); blade.position.set(0, 0.20, 0.52); c.add(blade);
  }

  function buildNighthawkTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Chined stealth fuselage, recessed dark core, mirrored status dots.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    const ridge = box(0.16, 0.90, 0.18, pal.hi); ridge.position.set(0, 0.60, 0.50); c.add(ridge);
    for (const sd of [1, -1]) {
      const panel = box(0.60, 0.80, 0.16, pal.hi);
      panel.rotation.y = -sd * 0.35; panel.position.set(sd * 0.42, 0.62, 0.38); c.add(panel);
      const dot = box(0.06, 0.06, 0.05, pal.visor); dot.position.set(sd * 0.30, 0.94, 0.52); c.add(dot);
    }
    const coreBz = hexPlate(0.18, 0.08, pal.faceDark);
    coreBz.rotation.x = Math.PI / 2; coreBz.position.set(0, 0.40, 0.52); c.add(coreBz);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.lo); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildVoidHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Cosmic paladin: centered fore-aft crest ridge, gold arch, magenta lens.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.52, 1.26, 1.28, pal.main); main.position.set(0, 0.94, 0.00); c.add(main);
    const crown = fbox(0.86, 1.44, 0.70, 0.84, pal.hi); crown.position.set(0, 1.52, -0.02); c.add(crown);
    const riser = box(0.24, 0.28, 1.16, pal.lo); riser.position.set(0, 1.78, -0.02); c.add(riser);
    const crest = box(0.16, 0.30, 1.10, pal.accent); crest.position.set(0, 2.02, -0.02); c.add(crest);
    for (const sd of [1, -1]) {
      const col = box(0.12, 0.62, 0.16, pal.accent); col.position.set(sd * 0.52, 0.86, 0.70); c.add(col);
    }
    const lintel = box(1.16, 0.12, 0.16, pal.accent); lintel.position.set(0, 1.20, 0.70); c.add(lintel);
    const bezel = box(0.76, 0.82, 0.18, pal.faceDark); bezel.position.set(0, 0.84, 0.66); c.add(bezel);
    // crusader cross-slit: vertical + horizontal bars, great-helm style
    const crossV = box(0.16, 0.68, 0.07, pal.visor); crossV.position.set(0, 0.82, 0.74); c.add(crossV);
    const crossH = box(0.58, 0.14, 0.07, pal.visor); crossH.position.set(0, 0.92, 0.74); c.add(crossH);
    const chin = fbox(1.22, 0.92, 0.44, 0.84, pal.main); chin.position.set(0, 0.30, 0.06); c.add(chin);
    const chinTrim = box(0.50, 0.10, 0.14, pal.accent); chinTrim.position.set(0, 0.44, 0.60); c.add(chinTrim);
  }

  function buildVoidTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Violet plates, rising gold V filigree, magenta gem, gold collar.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    for (const sd of [1, -1]) {
      const vArm2 = box(0.55, 0.14, 0.16, pal.accent);
      vArm2.rotation.z = -sd * 0.55; vArm2.position.set(sd * 0.21, 0.52, 0.50); c.add(vArm2);
    }
    const gem = ico(0.13, 0, pal.visor); gem.scale.set(1.0, 1.35, 0.8); gem.position.set(0, 0.76, 0.53); c.add(gem);
    // EPIC closure: gold-banded girdle sealing the abdomen + collar gorget
    const gird = cyl(0.58, 0.66, 0.34, 8, pal.main); gird.position.set(0, -0.22, 0.02); c.add(gird);
    const gird0 = cyl(0.54, 0.58, 0.18, 8, pal.main); gird0.position.set(0, 0.03, 0.02); c.add(gird0);
    const gb1 = cyl(0.60, 0.60, 0.08, 8, pal.accent); gb1.position.set(0, -0.06, 0.02); c.add(gb1);
    const gb2 = cyl(0.665, 0.665, 0.08, 8, pal.accent); gb2.position.set(0, -0.38, 0.02); c.add(gb2);
    const gor = cyl(0.33, 0.38, 0.18, 8, pal.lo);  gor.position.set(0, 1.34, 0.02); c.add(gor);
    const gorT = cyl(0.30, 0.32, 0.10, 8, pal.accent); gorT.position.set(0, 1.47, 0.02); c.add(gorT);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const ctrim = box(1.10, 0.06, 0.70, pal.accent); ctrim.position.y = 1.24; c.add(ctrim);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.accent); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildMagmaHelmet(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Basalt foundry unit: heavy brow, furnace-grate eyes, ember crack seams.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.68, 1.26, 1.32, pal.main); main.position.set(0, 0.94, 0.00); c.add(main);
    const crown = fbox(0.92, 1.42, 0.70, 0.85, pal.hi); crown.position.set(0, 1.52, -0.02); c.add(crown);
    const brow = box(1.46, 0.26, 0.26, pal.lo); brow.position.set(0, 1.14, 0.60); c.add(brow);
    const recess = box(1.18, 0.44, 0.20, pal.faceDark); recess.position.set(0, 0.86, 0.66); c.add(recess);
    for (const gx of [-0.39, -0.13, 0.13, 0.39]) {   // furnace grate
      const slot = box(0.11, 0.30, 0.07, pal.visor); slot.position.set(gx, 0.86, 0.78); c.add(slot);
    }
    const jaw = fbox(1.26, 0.94, 0.46, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
    const chinVent = box(0.40, 0.12, 0.10, pal.faceDark); chinVent.position.set(0, 0.34, 0.62); c.add(chinVent);
    for (const sd of [1, -1]) {   // glowing crack seams on the crown corners
      const seam = box(0.05, 0.55, 0.06, pal.visor);
      seam.rotation.z = sd * 0.35; seam.position.set(sd * 0.60, 1.28, 0.42); c.add(seam);
    }
    const back = box(1.30, 1.00, 0.26, pal.lo); back.position.set(0, 0.90, -0.56); c.add(back);
  }

  function buildMagmaTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // Brick breastplate, ember furnace core, crack-V seams, charcoal vents.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const coreBz = hexPlate(0.20, 0.10, pal.faceDark);
    coreBz.rotation.x = Math.PI / 2; coreBz.position.set(0, 0.66, 0.50); c.add(coreBz);
    const core = hexPlate(0.13, 0.07, pal.visor);
    core.rotation.x = Math.PI / 2; core.position.set(0, 0.66, 0.56); c.add(core);
    for (const sd of [1, -1]) {
      const crack = box(0.05, 0.44, 0.06, pal.visor);
      crack.rotation.z = -sd * 0.50; crack.position.set(sd * 0.22, 0.36, 0.52); c.add(crack);
      const vent = box(0.30, 0.08, 0.10, pal.gun); vent.position.set(sd * 0.42, 0.94, 0.50); c.add(vent);
    }
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.lo); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildCommonHelmet(vk, pal, o = {}) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // COMMON: OPEN half-helm frame — crown cap + cheek plates + brow/chin bars.
    // The face stays open so the skeleton head and its cyan visor show through.
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    if (o.cap === 'drum') {
      const cap = cyl(0.84, 0.88, 0.50, 8, pal.main); cap.position.set(0, 1.64, -0.02); c.add(cap);
    } else {
      const cap = box(1.58, 0.46, 1.34, pal.main); cap.position.set(0, 1.66, -0.02); c.add(cap);
      if (o.cap === 'ridge') { const rg = box(0.30, 0.26, 1.18, pal.hi); rg.position.set(0, 1.98, -0.02); c.add(rg); }
      if (o.cap === 'wedge') { const wd = box(1.48, 0.42, 0.16, pal.main); wd.rotation.x = 0.52; wd.position.set(0, 1.44, 0.58); c.add(wd); }
    }
    for (const sd of [1, -1]) {
      const cheek = box(0.16, 0.88, 1.16, pal.main); cheek.position.set(sd * 0.74, 0.84, -0.04); c.add(cheek);
      if (o.bolts) { const bo = cyl(0.05, 0.05, 0.07, 6, pal.lo); bo.rotation.z = Math.PI / 2; bo.position.set(sd * 0.83, 1.10, 0.30); c.add(bo); }
    }
    const backB = box(1.52, 0.72, 0.16, pal.lo); backB.position.set(0, 0.90, -0.62); c.add(backB);
    const brow = box(1.54, 0.16, 0.20, pal.lo); brow.position.set(0, 1.24, 0.60); c.add(brow);
    const chin = box(1.34, 0.14, 0.16, pal.lo); chin.position.set(0, 0.16, 0.52); c.add(chin);
    if (o.slit) {   // closed-face variant of the frame: plate + dim training slit
      const face = box(1.42, 0.92, 0.16, pal.main); face.position.set(0, 0.76, 0.58); c.add(face);
      const slit = box(1.00, 0.12, 0.06, m.visorDim); slit.position.set(0, 0.88, 0.70); c.add(slit);
    }
  }

  function buildCommonTorso(vk, pal, o = {}) {
    if (!want(vk)) return;
    builtSets.add(vk);
    // COMMON: thin front-only protection, style-switched. NO back plate ever.
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const ch = o.chest || 'plate';
    if (ch === 'plate') {
      const plate = box(1.46, 1.02, 0.20, pal.main); plate.position.set(0, 0.60, 0.40); c.add(plate);
      const upper = box(1.20, 0.20, 0.18, pal.hi); upper.position.set(0, 1.04, 0.42); c.add(upper);
    } else if (ch === 'trap') {          // tapered trapezoid bib
      const plate = fbox(1.54, 1.08, 1.04, 0.16, pal.main); plate.position.set(0, 0.58, 0.40); c.add(plate);
      const upper = box(1.06, 0.16, 0.16, pal.hi); upper.position.set(0, 1.08, 0.44); c.add(upper);
    } else if (ch === 'twin') {          // two plates, skeleton shows down the middle
      for (const sd of [1, -1]) {
        const pl = box(0.58, 1.02, 0.20, pal.main); pl.position.set(sd * 0.38, 0.60, 0.40); c.add(pl);
      }
      const bar = box(1.30, 0.16, 0.16, pal.lo); bar.position.set(0, 1.08, 0.42); c.add(bar);
    } else {                             // vee: two angled plates meeting low
      for (const sd of [1, -1]) {
        const pl = box(0.80, 1.00, 0.20, pal.main);
        pl.rotation.z = -sd * 0.14; pl.position.set(sd * 0.34, 0.58, 0.40); c.add(pl);
      }
    }
    for (const sd of [1, -1]) {
      const strap = box(0.16, 0.12, 0.86, pal.lo); strap.position.set(sd * 0.42, 1.16, 0.02); c.add(strap);
    }
    const belt = box(1.24, 0.14, 0.18, pal.lo); belt.position.set(0, 0.10, 0.42); c.add(belt);
    if (o.deco === 'stripe') { const st2 = box(0.20, 0.86, 0.06, pal.lo); st2.position.set(0, 0.58, 0.51); c.add(st2); }
    if (o.deco === 'bolts') for (const sd of [1, -1]) {
      const bo = cyl(0.05, 0.05, 0.07, 6, pal.hi); bo.rotation.x = Math.PI / 2; bo.position.set(sd * 0.58, 1.00, 0.51); c.add(bo);
    }
    if (o.deco === 'patch') { const pt = box(0.40, 0.34, 0.06, pal.hi); pt.rotation.z = 0.2; pt.position.set(0.30, 0.42, 0.51); c.add(pt); }
  }


  /* ============================================================
     BATCH 2 — five UNCOMMON + five RARE sets (parts-library reuse:
     drum & tapered helms; variety-first bodies).
     ============================================================ */
  function buildVerdantHelmet(vk, pal) {   // uncommon: forest drum + band eye
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const drum = cyl(0.90, 0.94, 1.22, 8, pal.main); drum.scale.z = 0.82; drum.position.set(0, 0.98, 0); c.add(drum);
    const cap = cyl(0.64, 0.74, 0.22, 8, pal.hi); cap.scale.z = 0.80; cap.position.set(0, 1.66, 0); c.add(cap);
    const bezel = box(1.22, 0.30, 0.18, pal.faceDark); bezel.position.set(0, 0.90, 0.60); c.add(bezel);
    const band = box(1.06, 0.14, 0.07, pal.visor); band.position.set(0, 0.90, 0.70); c.add(band);
    for (const sd of [1, -1]) for (const vy of [1.08, 0.96]) {
      const vent = box(0.10, 0.07, 0.34, pal.lo); vent.position.set(sd * 0.72, vy, 0.02); c.add(vent);
    }
    const chin = box(1.16, 0.22, 0.32, pal.lo); chin.position.set(0, 0.40, 0.42); c.add(chin);
  }
  function buildVerdantTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.26, 0.24, 0.92, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    for (const sd of [1, -1]) { const slat = box(0.12, 0.52, 0.14, pal.lo); slat.position.set(sd * 0.52, 0.56, 0.46); c.add(slat); }
    const collar = box(1.04, 0.16, 0.64, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.24, 0.98, 0.22, pal.main); back.position.set(0, 0.58, -0.44); c.add(back);
    const spine = box(0.26, 0.86, 0.12, pal.lo); spine.position.set(0, 0.58, -0.55); c.add(spine);
  }

  function buildCopperHelmet(vk, pal) {   // uncommon: bronze wedge + amber dots
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.68, 1.26, 1.32, pal.main); main.position.set(0, 0.92, 0); c.add(main);
    const slope = box(1.56, 0.50, 0.18, pal.hi); slope.rotation.x = 0.55; slope.position.set(0, 1.32, 0.50); c.add(slope);
    const crown = box(1.30, 0.24, 1.06, pal.hi); crown.position.set(0, 1.62, -0.02); c.add(crown);
    for (const sd of [1, -1]) {
      const bez = box(0.34, 0.30, 0.18, pal.faceDark); bez.position.set(sd * 0.30, 0.88, 0.62); c.add(bez);
      const dot = box(0.20, 0.18, 0.07, pal.visor); dot.position.set(sd * 0.30, 0.88, 0.72); c.add(dot);
      const riv = cyl(0.05, 0.05, 0.08, 8, pal.hi); riv.rotation.x = Math.PI / 2; riv.position.set(sd * 0.58, 1.12, 0.62); c.add(riv);
    }
    const stripe = box(1.30, 0.10, 0.16, pal.accent); stripe.position.set(0, 1.14, 0.60); c.add(stripe);
    const jaw = fbox(1.24, 0.92, 0.44, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildCopperTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    const band = box(1.34, 0.14, 0.16, pal.accent); band.position.set(0, 0.78, 0.46); c.add(band);
    for (const sd of [1, -1]) { const riv = cyl(0.05, 0.05, 0.08, 8, pal.hi); riv.rotation.x = Math.PI / 2; riv.position.set(sd * 0.56, 0.98, 0.48); c.add(riv); }
    const collar = box(1.04, 0.16, 0.64, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.24, 0.98, 0.22, pal.main); back.position.set(0, 0.58, -0.44); c.add(back);
    const spine = box(0.26, 0.86, 0.12, pal.hi); spine.position.set(0, 0.58, -0.55); c.add(spine);
  }

  function buildCobaltHelmet(vk, pal) {   // uncommon: vivid boxy + ice band + white chevron
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.62, 1.26, 1.32, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = fbox(0.96, 1.50, 0.66, 0.86, pal.hi); crown.position.set(0, 1.56, -0.02); c.add(crown);
    const bezel = box(1.32, 0.32, 0.18, pal.faceDark); bezel.position.set(0, 0.90, 0.62); c.add(bezel);
    const band = box(1.12, 0.14, 0.07, pal.visor); band.position.set(0, 0.90, 0.72); c.add(band);
    for (const sd of [1, -1]) {
      const ch = box(0.42, 0.12, 0.10, pal.accent); ch.rotation.z = -sd * 0.50; ch.position.set(sd * 0.17, 1.24, 0.60); c.add(ch);
    }
    const jaw = fbox(1.24, 0.92, 0.44, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildCobaltTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    for (const sd of [1, -1]) {
      const ch = box(0.50, 0.13, 0.12, pal.accent); ch.rotation.z = -sd * 0.55; ch.position.set(sd * 0.19, 0.62, 0.48); c.add(ch);
    }
    const upper = box(1.26, 0.24, 0.92, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const collar = box(1.04, 0.16, 0.64, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.24, 0.98, 0.22, pal.main); back.position.set(0, 0.58, -0.44); c.add(back);
    const spine = box(0.26, 0.86, 0.12, pal.lo); spine.position.set(0, 0.58, -0.55); c.add(spine);
  }

  function buildUmbraHelmet(vk, pal) {   // uncommon: tapered tri helm + dim slit
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = fbox(1.34, 1.60, 1.30, 1.08, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = box(1.20, 0.20, 1.00, pal.hi); crown.position.set(0, 1.62, -0.02); c.add(crown);
    const bezel = box(1.10, 0.30, 0.18, pal.faceDark); bezel.position.set(0, 0.88, 0.54); c.add(bezel);
    const slit = box(0.94, 0.12, 0.07, pal.visor); slit.position.set(0, 0.88, 0.64); c.add(slit);
    const band = box(1.16, 0.10, 0.14, pal.accent); band.position.set(0, 1.14, 0.48); c.add(band);
    const jaw = box(1.10, 0.30, 0.36, pal.lo); jaw.position.set(0, 0.28, 0.30); c.add(jaw);
  }
  function buildUmbraTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    const waist = box(1.32, 0.14, 0.98, pal.accent); waist.position.set(0, 0.14, 0.02); c.add(waist);
    const upper = box(1.26, 0.24, 0.92, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const collar = box(1.04, 0.16, 0.64, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.24, 0.98, 0.22, pal.main); back.position.set(0, 0.58, -0.44); c.add(back);
    const spine = box(0.26, 0.86, 0.12, pal.accent); spine.position.set(0, 0.58, -0.55); c.add(spine);
  }

  function buildSignalHelmet(vk, pal) {   // uncommon: orange + white center stripe + dim dots
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.68, 1.26, 1.32, pal.main); main.position.set(0, 0.92, 0); c.add(main);
    const crown = box(1.48, 0.26, 1.14, pal.hi); crown.position.set(0, 1.60, -0.02); c.add(crown);
    const stripe = box(0.26, 1.20, 0.10, pal.accent); stripe.position.set(0, 0.92, 0.64); c.add(stripe);
    for (const sd of [1, -1]) {
      const bez = box(0.32, 0.28, 0.16, pal.faceDark); bez.position.set(sd * 0.36, 0.90, 0.62); c.add(bez);
      const dot = box(0.18, 0.16, 0.07, pal.visor); dot.position.set(sd * 0.36, 0.90, 0.71); c.add(dot);
    }
    const jaw = fbox(1.24, 0.92, 0.44, 0.84, pal.lo); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildSignalTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    const stripe = box(0.28, 1.00, 0.10, pal.accent); stripe.position.set(0, 0.58, 0.50); c.add(stripe);
    const upper = box(1.26, 0.24, 0.92, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const collar = box(1.04, 0.16, 0.64, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.24, 0.98, 0.22, pal.main); back.position.set(0, 0.58, -0.44); c.add(back);
    const spine = box(0.26, 0.86, 0.12, pal.accent); spine.position.set(0, 0.58, -0.55); c.add(spine);
  }

  function buildViperHelmet(vk, pal) {   // rare: cobra hood + twin fang slits
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.48, 1.22, 1.26, pal.main); main.position.set(0, 0.92, 0); c.add(main);
    const crown = fbox(0.86, 1.40, 0.62, 0.84, pal.hi); crown.position.set(0, 1.54, -0.02); c.add(crown);
    for (const sd of [1, -1]) {   // flared hood plates sweeping out and back
      const hood = box(0.16, 0.98, 0.90, pal.hi);
      hood.rotation.set(0, sd * 0.25, -sd * 0.35); hood.position.set(sd * 0.92, 1.18, -0.10); c.add(hood);
    }
    const bezel = box(0.96, 0.46, 0.18, pal.faceDark); bezel.position.set(0, 0.88, 0.62); c.add(bezel);
    for (const sd of [1, -1]) {
      const fang = box(0.13, 0.36, 0.07, pal.visor); fang.position.set(sd * 0.22, 0.88, 0.72); c.add(fang);
      const tooth = box(0.08, 0.14, 0.10, pal.lo); tooth.position.set(sd * 0.30, 0.52, 0.70); c.add(tooth);
    }
    const jaw = fbox(1.22, 0.90, 0.44, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildViperTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    for (let k2 = 0; k2 < 3; k2++) {   // scale bands stepping down the chest
      const band = box(1.20 - k2 * 0.14, 0.13, 0.14, pal.hi); band.position.set(0, 0.78 - k2 * 0.24, 0.48); c.add(band);
    }
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.hi); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildBastionHelmet(vk, pal) {   // rare: crenellated fortress crown
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.54, 1.24, 1.28, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = box(1.44, 0.22, 1.12, pal.hi); crown.position.set(0, 1.58, -0.02); c.add(crown);
    for (const gx of [-0.50, 0, 0.50]) {   // merlons
      const mer = box(0.30, 0.28, 1.04, pal.main); mer.position.set(gx, 1.82, -0.02); c.add(mer);
    }
    const bezel = box(1.06, 0.50, 0.18, pal.faceDark); bezel.position.set(0, 0.88, 0.62); c.add(bezel);
    for (const sd of [1, -1]) {
      const slit = box(0.14, 0.40, 0.07, pal.visor); slit.position.set(sd * 0.26, 0.88, 0.72); c.add(slit);
    }
    const band = box(1.40, 0.12, 0.16, pal.accent); band.position.set(0, 1.20, 0.60); c.add(band);
    const jaw = fbox(1.26, 0.94, 0.46, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildBastionTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const tower = box(0.70, 0.86, 0.16, pal.hi); tower.position.set(0, 0.60, 0.48); c.add(tower);
    for (const gx of [-0.22, 0, 0.22]) { const mer = box(0.14, 0.12, 0.16, pal.hi); mer.position.set(gx, 1.08, 0.48); c.add(mer); }
    const band = box(1.34, 0.12, 0.16, pal.accent); band.position.set(0, 0.20, 0.48); c.add(band);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.lo); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildCorsairHelmet(vk, pal) {   // rare: naval brim + gold porthole mono-eye
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.50, 1.22, 1.26, pal.main); main.position.set(0, 0.92, 0); c.add(main);
    const crown = fbox(0.94, 1.42, 0.60, 0.85, pal.hi); crown.position.set(0, 1.54, -0.02); c.add(crown);
    const brim = box(1.66, 0.10, 0.52, pal.hi); brim.rotation.x = 0.12; brim.position.set(0, 1.26, 0.46); c.add(brim);
    const bEdge = box(1.66, 0.06, 0.10, pal.accent); bEdge.position.set(0, 1.22, 0.70); c.add(bEdge);
    const ring = cyl(0.30, 0.30, 0.10, 8, pal.accent); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.88, 0.62); c.add(ring);
    const lens = hexPlate(0.19, 0.08, pal.visor); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.88, 0.70); c.add(lens);
    const strap = box(0.90, 0.08, 0.12, pal.accent); strap.position.set(0, 0.34, 0.56); c.add(strap);
    const jaw = fbox(1.24, 0.92, 0.44, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildCorsairTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    for (const sd of [1, -1]) for (const by of [0.86, 0.62, 0.38]) {
      const btn = cyl(0.05, 0.05, 0.08, 8, pal.accent); btn.rotation.x = Math.PI / 2; btn.position.set(sd * 0.24, by, 0.50); c.add(btn);
    }
    const belt = box(1.30, 0.12, 0.16, pal.accent); belt.position.set(0, 0.14, 0.48); c.add(belt);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const ctrim = box(1.10, 0.06, 0.70, pal.accent); ctrim.position.y = 1.24; c.add(ctrim);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.hi); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildTempestHelmet(vk, pal) {   // rare: swept storm fin + split visor
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.50, 1.22, 1.26, pal.main); main.position.set(0, 0.92, 0); c.add(main);
    const crown = fbox(0.88, 1.42, 0.62, 0.85, pal.hi); crown.position.set(0, 1.54, -0.02); c.add(crown);
    const fin = box(0.14, 0.52, 1.00, pal.hi); fin.rotation.x = -0.35; fin.position.set(0, 1.84, -0.20); c.add(fin);
    const finEdge = box(0.08, 0.52, 0.14, pal.accent); finEdge.rotation.x = -0.35; finEdge.position.set(0, 1.84, 0.30); c.add(finEdge);
    const bezel = box(1.34, 0.34, 0.18, pal.faceDark); bezel.position.set(0, 0.90, 0.62); c.add(bezel);
    for (const sd of [1, -1]) {
      const half = box(0.52, 0.15, 0.07, pal.visor); half.position.set(sd * 0.31, 0.90, 0.72); c.add(half);
    }
    const jaw = fbox(1.24, 0.92, 0.44, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildTempestTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const b1 = box(0.34, 0.13, 0.10, pal.visor); b1.rotation.z = -0.6; b1.position.set(-0.12, 0.84, 0.50); c.add(b1);
    const b2 = box(0.34, 0.13, 0.10, pal.visor); b2.rotation.z = 0.6; b2.position.set(0.06, 0.62, 0.50); c.add(b2);
    const b3 = box(0.34, 0.13, 0.10, pal.visor); b3.rotation.z = -0.6; b3.position.set(-0.12, 0.40, 0.50); c.add(b3);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.hi); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function buildWardenHelmet(vk, pal) {   // rare: barred jailer visor (glow behind bars)
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.52, 1.24, 1.28, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = box(1.36, 0.26, 1.10, pal.hi); crown.position.set(0, 1.60, -0.02); c.add(crown);
    const brow = box(1.38, 0.22, 0.24, pal.lo); brow.position.set(0, 1.20, 0.58); c.add(brow);
    const recess = box(1.20, 0.44, 0.20, pal.faceDark); recess.position.set(0, 0.86, 0.60); c.add(recess);
    const glow = box(1.02, 0.30, 0.06, pal.visor); glow.position.set(0, 0.86, 0.68); c.add(glow);
    for (const gx of [-0.39, -0.13, 0.13, 0.39]) {
      const bar = box(0.09, 0.50, 0.10, pal.lo); bar.position.set(gx, 0.86, 0.74); c.add(bar);
    }
    const jaw = fbox(1.26, 0.94, 0.46, 0.84, pal.lo); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildWardenTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const core = box(0.60, 0.60, 0.14, pal.faceDark); core.position.set(0, 0.62, 0.48); c.add(core);
    const cGlow = box(0.46, 0.44, 0.05, pal.visor); cGlow.position.set(0, 0.62, 0.545); c.add(cGlow);
    for (const gx of [-0.16, 0, 0.16]) { const bar = box(0.07, 0.56, 0.08, pal.lo); bar.position.set(gx, 0.62, 0.58); c.add(bar); }
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.lo); spine.position.set(0, 0.58, -0.57); c.add(spine);
  }

  function epicClosure(c, pal) {
    // EPIC tier contract: seal the abdomen ring + add a neck gorget.
    const ab0 = cyl(0.53, 0.57, 0.16, 8, pal.main); ab0.position.set(0, 0.06, 0.02); c.add(ab0);
    const ab1 = cyl(0.56, 0.60, 0.16, 8, pal.gun);  ab1.position.set(0, -0.08, 0.02); c.add(ab1);
    const ab2 = cyl(0.60, 0.64, 0.16, 8, pal.main); ab2.position.set(0, -0.24, 0.02); c.add(ab2);
    const ab3 = cyl(0.64, 0.68, 0.16, 8, pal.gun);  ab3.position.set(0, -0.40, 0.02); c.add(ab3);
    const abT = cyl(0.575, 0.575, 0.05, 8, pal.accent); abT.position.set(0, -0.16, 0.02); c.add(abT);
    const gor1 = cyl(0.34, 0.40, 0.16, 8, pal.lo);   gor1.position.set(0, 1.32, 0.02); c.add(gor1);
    const gor2 = cyl(0.30, 0.35, 0.14, 8, pal.main); gor2.position.set(0, 1.46, 0.02); c.add(gor2);
  }

  function buildSeraphHelmet(vk, pal) {   // epic: winged halo helm, gold arc visor
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.54, 1.26, 1.28, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = fbox(0.90, 1.46, 0.72, 0.85, pal.hi); crown.position.set(0, 1.56, -0.02); c.add(crown);
    const halo = cyl(0.62, 0.62, 0.05, 12, pal.accent);   // halo ring above the crown
    halo.rotation.x = Math.PI / 2; halo.position.set(0, 2.06, -0.10); c.add(halo);
    for (const sd of [1, -1]) {   // swept feather wings
      for (let k2 = 0; k2 < 3; k2++) {
        const f = box(0.10, 0.34 + k2 * 0.14, 0.30, pal.hi);
        f.rotation.z = -sd * (0.30 + k2 * 0.12);
        f.position.set(sd * (0.80 + k2 * 0.16), 1.34 + k2 * 0.10, -0.16); c.add(f);
      }
    }
    const bezel = fbox(1.24, 0.92, 0.44, 0.22, pal.faceDark); bezel.position.set(0, 0.84, 0.62); c.add(bezel);
    const arc = fbox(1.10, 0.80, 0.34, 0.16, pal.visor); arc.position.set(0, 0.84, 0.70); c.add(arc);
    const chin = fbox(1.22, 0.92, 0.44, 0.84, pal.main); chin.position.set(0, 0.30, 0.06); c.add(chin);
    const chinTrim = box(0.56, 0.10, 0.14, pal.accent); chinTrim.position.set(0, 0.44, 0.60); c.add(chinTrim);
  }
  function buildSeraphTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    for (const sd of [1, -1]) {
      const wing = box(0.44, 0.14, 0.16, pal.accent);
      wing.rotation.z = -sd * 0.5; wing.position.set(sd * 0.30, 0.74, 0.50); c.add(wing);
    }
    const gem = ico(0.14, 0, pal.visor); gem.scale.set(1, 1.3, 0.8); gem.position.set(0, 0.44, 0.52); c.add(gem);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const ctrim = box(1.10, 0.06, 0.70, pal.accent); ctrim.position.y = 1.24; c.add(ctrim);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.accent); spine.position.set(0, 0.58, -0.57); c.add(spine);
    epicClosure(c, pal);
  }

  function buildKrakenHelmet(vk, pal) {   // epic: deep-sea helm, tentacle mandibles, aqua compound eyes
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const dome = ico(1.0, 1, pal.main); dome.scale.set(0.92, 0.92, 0.86); dome.position.set(0, 1.10, -0.08); c.add(dome);
    const main = box(1.46, 1.10, 1.22, pal.main); main.position.set(0, 0.82, 0); c.add(main);
    for (const sd of [1, -1]) {   // curling tentacles down the cheeks
      for (let k2 = 0; k2 < 3; k2++) {
        const t = box(0.18 - k2 * 0.03, 0.30, 0.20, pal.hi);
        t.rotation.z = sd * (0.25 + k2 * 0.30);
        t.position.set(sd * (0.72 + k2 * 0.06), 0.66 - k2 * 0.26, 0.30 - k2 * 0.06); c.add(t);
      }
    }
    const bezel = box(1.16, 0.36, 0.20, pal.faceDark); bezel.position.set(0, 0.88, 0.58); c.add(bezel);
    for (const gx of [-0.34, -0.11, 0.11, 0.34]) {   // compound eye cluster
      const e = hexPlate(0.11, 0.07, pal.visor); e.rotation.x = Math.PI / 2; e.position.set(gx, 0.88, 0.68); c.add(e);
    }
    const beak = fbox(0.70, 0.40, 0.44, 0.60, pal.lo); beak.position.set(0, 0.34, 0.52); c.add(beak);
  }
  function buildKrakenTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    for (const sd of [1, -1]) for (const sy2 of [0.80, 0.56, 0.32]) {   // suckers
      const s2 = cyl(0.07, 0.07, 0.08, 8, pal.visor); s2.rotation.x = Math.PI / 2; s2.position.set(sd * 0.34, sy2, 0.50); c.add(s2);
    }
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.hi); spine.position.set(0, 0.58, -0.57); c.add(spine);
    epicClosure(c, pal);
  }

  function buildTitanHelmet(vk, pal) {   // epic: colossal bull horns, heavy brow, single band
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.62, 1.30, 1.34, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = box(1.44, 0.28, 1.16, pal.hi); crown.position.set(0, 1.62, -0.02); c.add(crown);
    for (const sd of [1, -1]) {   // thick curving horns
      for (let k2 = 0; k2 < 3; k2++) {
        const h = box(0.26 - k2 * 0.05, 0.26, 0.30, pal.hi);
        h.rotation.z = -sd * (0.30 + k2 * 0.35);
        h.position.set(sd * (0.86 + k2 * 0.18), 1.62 + k2 * 0.20, -0.02); c.add(h);
      }
    }
    const brow = box(1.52, 0.30, 0.28, pal.lo); brow.position.set(0, 1.20, 0.58); c.add(brow);
    const bezel = box(1.24, 0.30, 0.20, pal.faceDark); bezel.position.set(0, 0.86, 0.62); c.add(bezel);
    const band = box(1.08, 0.14, 0.07, pal.visor); band.position.set(0, 0.86, 0.72); c.add(band);
    const jaw = fbox(1.34, 1.00, 0.48, 0.86, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
  }
  function buildTitanTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.62, 1.18, 1.08, 0.68, pal.main); breast.position.y = 0.58; c.add(breast);
    const slab = box(1.10, 0.70, 0.18, pal.hi); slab.position.set(0, 0.66, 0.48); c.add(slab);
    for (const sd of [1, -1]) { const riv = cyl(0.06, 0.06, 0.09, 8, pal.accent); riv.rotation.x = Math.PI / 2; riv.position.set(sd * 0.42, 0.66, 0.56); c.add(riv); }
    const collar = box(1.10, 0.18, 0.70, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.30, 1.02, 0.26, pal.main); back.position.set(0, 0.58, -0.46); c.add(back);
    const spine = box(0.32, 0.90, 0.16, pal.hi); spine.position.set(0, 0.58, -0.58); c.add(spine);
    epicClosure(c, pal);
  }

  function buildWraithHelmet(vk, pal) {   // epic: hooded skull-face, violet hollow eyes
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.48, 1.24, 1.26, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const hood = fbox(1.30, 0.76, 1.02, 0.60, pal.hi); hood.position.set(0, 1.44, -0.10); c.add(hood);
    for (const sd of [1, -1]) {   // hood edges framing the face
      const edge = box(0.14, 1.06, 0.90, pal.hi);
      edge.rotation.z = sd * 0.10; edge.position.set(sd * 0.76, 1.02, 0.18); c.add(edge);
    }
    const brow = box(1.16, 0.16, 0.20, pal.lo); brow.rotation.x = 0.10; brow.position.set(0, 1.14, 0.58); c.add(brow);
    const recess = box(1.14, 0.56, 0.22, pal.faceDark); recess.position.set(0, 0.82, 0.60); c.add(recess);
    for (const sd of [1, -1]) {   // hollow sockets
      const e = hexPlate(0.16, 0.08, pal.visor); e.rotation.x = Math.PI / 2; e.position.set(sd * 0.28, 0.86, 0.70); c.add(e);
    }
    const teeth = box(0.86, 0.12, 0.16, pal.lo); teeth.position.set(0, 0.44, 0.60); c.add(teeth);
    const jaw = fbox(1.06, 0.72, 0.42, 0.76, pal.main); jaw.position.set(0, 0.26, 0.36); c.add(jaw);
  }
  function buildWraithTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.56, 1.12, 1.02, 0.64, pal.main); breast.position.y = 0.58; c.add(breast);
    for (let k2 = 0; k2 < 3; k2++) {   // exposed rib motif on the chest
      const rib = box(1.02 - k2 * 0.12, 0.10, 0.12, pal.hi); rib.position.set(0, 0.86 - k2 * 0.22, 0.48); c.add(rib);
    }
    const core = hexPlate(0.16, 0.08, pal.visor); core.rotation.x = Math.PI / 2; core.position.set(0, 0.30, 0.50); c.add(core);
    const collar = box(1.04, 0.16, 0.64, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.24, 0.98, 0.22, pal.main); back.position.set(0, 0.58, -0.44); c.add(back);
    const spine = box(0.26, 0.86, 0.12, pal.hi); spine.position.set(0, 0.58, -0.55); c.add(spine);
    epicClosure(c, pal);
  }

  function buildPhoenixHelmet(vk, pal) {   // epic: flame crest, beaked face, ember eyes
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.52, 1.24, 1.28, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const crown = fbox(0.92, 1.44, 0.68, 0.85, pal.hi); crown.position.set(0, 1.54, -0.02); c.add(crown);
    for (let k2 = 0; k2 < 4; k2++) {   // flame crest licking upward/back
      const f = box(0.16, 0.42 + k2 * 0.10, 0.16, k2 % 2 ? pal.accent : pal.hi);
      f.rotation.x = -0.20 - k2 * 0.10;
      f.position.set(0, 1.92 + k2 * 0.06, -0.10 - k2 * 0.18); c.add(f);
    }
    for (const sd of [1, -1]) {
      const wing = box(0.12, 0.44, 0.36, pal.accent);
      wing.rotation.z = -sd * 0.42; wing.position.set(sd * 0.80, 1.36, 0.10); c.add(wing);
    }
    const bezel = box(1.10, 0.32, 0.20, pal.faceDark); bezel.position.set(0, 0.90, 0.62); c.add(bezel);
    for (const sd of [1, -1]) {
      const e = box(0.30, 0.13, 0.07, pal.visor); e.rotation.z = sd * 0.28; e.position.set(sd * 0.26, 0.90, 0.72); c.add(e);
    }
    const beak = fbox(0.56, 0.30, 0.52, 0.55, pal.accent); beak.rotation.x = 0.20; beak.position.set(0, 0.44, 0.62); c.add(beak);
    const jaw = fbox(1.20, 0.90, 0.44, 0.82, pal.main); jaw.position.set(0, 0.28, 0.06); c.add(jaw);
  }
  function buildPhoenixTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    for (const sd of [1, -1]) {   // rising wing plumes
      const p2 = box(0.42, 0.14, 0.16, pal.accent);
      p2.rotation.z = -sd * 0.62; p2.position.set(sd * 0.32, 0.70, 0.50); c.add(p2);
    }
    const core = ico(0.15, 0, pal.visor); core.scale.set(1, 1.3, 0.8); core.position.set(0, 0.40, 0.52); c.add(core);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.accent); spine.position.set(0, 0.58, -0.57); c.add(spine);
    epicClosure(c, pal);
  }

  function buildMonarchHelmet(vk, pal) {   // epic: five-point crown, royal blue, violet lens
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('helmet', vk, 'mixamorigHead');
    const main = box(1.54, 1.26, 1.28, pal.main); main.position.set(0, 0.94, 0); c.add(main);
    const band = box(1.44, 0.20, 1.18, pal.accent); band.position.set(0, 1.58, -0.02); c.add(band);
    for (const gx of [-0.56, -0.28, 0, 0.28, 0.56]) {   // crown points
      const h = Math.abs(gx) < 0.01 ? 0.46 : Math.abs(gx) < 0.30 ? 0.36 : 0.26;
      const pt = fbox(0.20, 0.02, 0.20, 0.05, pal.accent); pt.scale.y = h / 0.02 * 0.02 / 0.02;
      const spike = fbox(0.18, 0.04, 0.18, 0.10, pal.accent);
      spike.scale.set(1, h / 0.04, 1); spike.position.set(gx, 1.70 + h / 2, -0.02); c.add(spike);
      const gem = ico(0.07, 0, pal.visor); gem.position.set(gx, 1.70 + h + 0.05, -0.02); c.add(gem);
    }
    const bezel = box(1.16, 0.44, 0.20, pal.faceDark); bezel.position.set(0, 0.86, 0.62); c.add(bezel);
    const lens = fbox(1.02, 0.72, 0.34, 0.18, pal.visor); lens.position.set(0, 0.86, 0.70); c.add(lens);
    const jaw = fbox(1.26, 0.94, 0.46, 0.84, pal.main); jaw.position.set(0, 0.30, 0.06); c.add(jaw);
    const jTrim = box(0.60, 0.10, 0.14, pal.accent); jTrim.position.set(0, 0.44, 0.60); c.add(jTrim);
  }
  function buildMonarchTorso(vk, pal) {
    if (!want(vk)) return;
    builtSets.add(vk);
    const c = canonContainer('torso', vk, 'mixamorigSpine1');
    const breast = fbox(1.58, 1.14, 1.04, 0.66, pal.main); breast.position.y = 0.58; c.add(breast);
    const upper = box(1.28, 0.26, 0.94, pal.hi); upper.position.set(0, 1.02, 0.02); c.add(upper);
    const sash = box(0.22, 1.06, 0.12, pal.accent); sash.rotation.z = 0.32; sash.position.set(0, 0.60, 0.50); c.add(sash);
    const gem = ico(0.16, 0, pal.visor); gem.scale.set(1, 1.25, 0.8); gem.position.set(0, 0.78, 0.52); c.add(gem);
    const collar = box(1.06, 0.16, 0.66, pal.lo); collar.position.y = 1.14; c.add(collar);
    const ctrim = box(1.10, 0.06, 0.70, pal.accent); ctrim.position.y = 1.24; c.add(ctrim);
    const back = box(1.26, 1.00, 0.24, pal.main); back.position.set(0, 0.58, -0.45); c.add(back);
    const spine = box(0.28, 0.88, 0.14, pal.accent); spine.position.set(0, 0.58, -0.57); c.add(spine);
    epicClosure(c, pal);
  }

  const bluePal = { main: m.blue, hi: m.blueHi, lo: m.blueLo, gun: m.gun, brass: m.brass,
                    accent: m.accent, visor: m.visor, faceDark: m.faceDark,
                    boot: m.steel, bootHi: m.steelHi, bootLo: m.steelLo };
  const greenPal = { main: m.green, hi: m.greenHi, lo: m.greenLo, gun: m.gun, brass: m.brass,
                     accent: m.accent, visor: m.visorGold, faceDark: m.faceDark,
                     boot: m.greenLo, bootHi: m.green, bootLo: m.greenDk };
  const scrapPal = { main: m.scrap, hi: m.scrapHi, lo: m.scrapLo, gun: m.gun, brass: m.brass,
                 accent: m.scrapLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.scrapLo, bootHi: m.scrap, bootLo: m.faceDark };
  buildCommonHelmet('scrap', scrapPal, { cap: 'flat',  bolts: true,  deco: 'patch' }); buildCommonTorso('scrap', scrapPal, { cap: 'flat',  bolts: true,  deco: 'patch' });
  buildMechaArms('scrap', scrapPal, { pauldron: 'strap', upperArm: false, forearm: false });
  buildMechaLegs('scrap', scrapPal, { boot: 'basic', thigh: false });
  const cadetPal = { main: m.cadet, hi: m.cadetHi, lo: m.cadetLo, gun: m.gun, brass: m.brass,
                 accent: m.cadetLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.cadetLo, bootHi: m.cadet, bootLo: m.faceDark };
  buildCommonHelmet('cadet', cadetPal, { cap: 'ridge', deco: 'stripe' }); buildCommonTorso('cadet', cadetPal, { chest: 'trap', deco: 'stripe' });
  buildMechaArms('cadet', cadetPal, { pauldron: 'flatp', upperArm: false, forearm: false });
  buildMechaLegs('cadet', cadetPal, { boot: 'basic', thigh: false });
  const dunePal = { main: m.dune, hi: m.duneHi, lo: m.duneLo, gun: m.gun, brass: m.brass,
                 accent: m.duneLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.duneLo, bootHi: m.dune, bootLo: m.faceDark };
  buildCommonHelmet('dune', dunePal, { cap: 'wedge', deco: 'bolts' }); buildCommonTorso('dune', dunePal, { chest: 'twin' });
  buildMechaArms('dune', dunePal, { pauldron: 'cap', upperArm: false, forearm: false });
  buildMechaLegs('dune', dunePal, { boot: 'wrap', thigh: false });
  const mossPal = { main: m.moss, hi: m.mossHi, lo: m.mossLo, gun: m.gun, brass: m.brass,
                 accent: m.mossLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.mossLo, bootHi: m.moss, bootLo: m.faceDark };
  buildCommonHelmet('moss', mossPal, { cap: 'drum' }); buildCommonTorso('moss', mossPal, { chest: 'vee' });
  buildMechaArms('moss', mossPal, { pauldron: 'none', upperArm: false, forearm: false });
  buildMechaLegs('moss', mossPal, { boot: 'basic', thigh: false });
  const ashPal = { main: m.ash, hi: m.ashHi, lo: m.ashLo, gun: m.gun, brass: m.brass,
                 accent: m.ashLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.ashLo, bootHi: m.ash, bootLo: m.faceDark };
  buildCommonHelmet('ash', ashPal, { cap: 'flat',  deco: 'stripe' }); buildCommonTorso('ash', ashPal, { chest: 'plate', deco: 'stripe' });
  buildMechaArms('ash', ashPal, { pauldron: 'flatp', upperArm: false, forearm: false });
  buildMechaLegs('ash', ashPal, { boot: 'slab', thigh: false });
  const slagPal = { main: m.slag, hi: m.slagHi, lo: m.slagLo, gun: m.gun, brass: m.brass,
                 accent: m.slagLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.slagLo, bootHi: m.slag, bootLo: m.faceDark };
  buildCommonHelmet('slag', slagPal, { cap: 'drum',  bolts: true, slit: true }); buildCommonTorso('slag', slagPal, { chest: 'trap', deco: 'bolts' });
  buildMechaArms('slag', slagPal, { pauldron: 'cap', upperArm: false, forearm: false });
  buildMechaLegs('slag', slagPal, { boot: 'slab', thigh: false });
  const tidePal = { main: m.tide, hi: m.tideHi, lo: m.tideLo, gun: m.gun, brass: m.brass,
                 accent: m.tideLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.tideLo, bootHi: m.tide, bootLo: m.faceDark };
  buildCommonHelmet('tide', tidePal, { cap: 'wedge' }); buildCommonTorso('tide', tidePal, { chest: 'twin' });
  buildMechaArms('tide', tidePal, { pauldron: 'none', upperArm: false, forearm: false });
  buildMechaLegs('tide', tidePal, { boot: 'wrap', thigh: false });
  const brawlerPal = { main: m.brawler, hi: m.brawlerHi, lo: m.brawlerLo, gun: m.gun, brass: m.brass,
                 accent: m.brawlerLo, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.brawlerLo, bootHi: m.brawler, bootLo: m.faceDark };
  buildCommonHelmet('brawler', brawlerPal, { cap: 'ridge', bolts: true, slit: true, deco: 'bolts' }); buildCommonTorso('brawler', brawlerPal, { chest: 'vee', deco: 'bolts' });
  buildMechaArms('brawler', brawlerPal, { pauldron: 'strap', upperArm: false, forearm: false });
  buildMechaLegs('brawler', brawlerPal, { boot: 'basic', thigh: false });
  buildBlueHelmet('blue', bluePal); buildBlueTorso('blue', bluePal);   // SENTINEL
  buildMechaArms('blue', bluePal, { upperArm: false }); buildMechaLegs('blue', bluePal, { thigh: false });
  buildSpartanHelmet('spartan', greenPal); buildSpartanTorso('spartan', greenPal);
  buildMechaArms('spartan', greenPal, { pauldron: 'domeTrim', fist: 'block' });
  buildMechaLegs('spartan', greenPal, { knee: { type: 'gem', mat: m.steelHi }, shinGuard: true });
  const shogunPal = { main: m.shogun, hi: m.shogunHi, lo: m.shogunLo, gun: m.gun, brass: m.brass,
                      accent: m.gold, visor: m.amber, faceDark: m.faceDark,
                      boot: m.gun, bootHi: m.steelLo, bootLo: m.faceDark };
  const glacierPal = { main: m.glacier, hi: m.glacierHi, lo: m.glacierLo, gun: m.gun, brass: m.brass,
                       accent: m.steelHi, visor: m.iceVisor, faceDark: m.faceDark,
                       boot: m.glacierLo, bootHi: m.glacier, bootLo: m.glacierDk };
  const hazardPal = { main: m.hazard, hi: m.hazardHi, lo: m.hazardLo, gun: m.gun, brass: m.brass,
                      accent: m.ink, visor: m.amber, faceDark: m.faceDark,
                      boot: m.ink, bootHi: m.hazardLo, bootLo: m.faceDark };
  const nightPal = { main: m.night, hi: m.nightHi, lo: m.nightLo, gun: m.gun, brass: m.brass,
                     accent: m.eyeRed, visor: m.eyeRed, faceDark: m.faceDark,
                     boot: m.nightLo, bootHi: m.night, bootLo: m.faceDark };
  const voidPal = { main: m.voidP, hi: m.voidHi, lo: m.voidLo, gun: m.gun, brass: m.brass,
                    accent: m.gold, visor: m.visorMagenta, faceDark: m.faceDark,
                    boot: m.voidLo, bootHi: m.voidP, bootLo: m.voidDk };
  const magmaPal = { main: m.red, hi: m.redHi, lo: m.redLo, gun: m.gun, brass: m.brass,
                     accent: m.ember, visor: m.ember, faceDark: m.faceDark,
                     boot: m.redLo, bootHi: m.red, bootLo: m.faceDark };
  buildMagmaHelmet('red', magmaPal); buildMagmaTorso('red', magmaPal);   // MAGMA
  buildMechaArms('red', magmaPal, { pauldron: 'slab', upperArm: false });
  buildMechaLegs('red', magmaPal, { thigh: false });
  buildShogunHelmet('shogun', shogunPal); buildShogunTorso('shogun', shogunPal);
  buildMechaArms('shogun', shogunPal, { pauldron: 'sode', fistBand: m.gold });
  buildMechaLegs('shogun', shogunPal, { boot: 'lacquer', knee: { type: 'ring', mat: m.gold }, hipSkirt: true });
  buildGlacierHelmet('glacier', glacierPal); buildGlacierTorso('glacier', glacierPal);
  buildMechaArms('glacier', glacierPal, { pauldron: 'dome', upperArm: false });
  buildMechaLegs('glacier', glacierPal, { boot: 'clean', thigh: false });
  buildHazardHelmet('hazard', hazardPal); buildHazardTorso('hazard', hazardPal);
  buildMechaArms('hazard', hazardPal, { pauldron: 'box', fist: 'block' });
  buildMechaLegs('hazard', hazardPal, { boot: 'steel', knee: { type: 'ring', mat: m.ink } });
  buildNighthawkHelmet('nighthawk', nightPal); buildNighthawkTorso('nighthawk', nightPal);
  buildMechaArms('nighthawk', nightPal, { pauldron: 'blade', fist: 'sharp' });
  buildMechaLegs('nighthawk', nightPal, { boot: 'sleek' });
  buildVoidHelmet('void', voidPal); buildVoidTorso('void', voidPal);
  buildMechaArms('void', voidPal, { pauldron: 'point', fistBand: m.gold });
  buildMechaLegs('void', voidPal, { boot: 'trim', knee: { type: 'gem', mat: m.visorMagenta } });

  const verdantPal = { main: m.verdant, hi: m.verdantHi, lo: m.verdantLo, gun: m.gun, brass: m.brass,
                 accent: m.steelHi, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.verdantLo, bootHi: m.verdant, bootLo: m.faceDark };
  buildVerdantHelmet('verdant', verdantPal); buildVerdantTorso('verdant', verdantPal);
  buildMechaArms('verdant', verdantPal, { pauldron: 'cap', upperArm: false });
  buildMechaLegs('verdant', verdantPal, { thigh: false, boot: 'wrap' });
  const copperPal = { main: m.copper, hi: m.copperHi, lo: m.copperLo, gun: m.gun, brass: m.brass,
                 accent: m.patina, visor: m.amber, faceDark: m.faceDark,
                 boot: m.copperLo, bootHi: m.copper, bootLo: m.faceDark };
  buildCopperHelmet('copper', copperPal); buildCopperTorso('copper', copperPal);
  buildMechaArms('copper', copperPal, { pauldron: 'flatp', upperArm: false });
  buildMechaLegs('copper', copperPal, { thigh: false });
  const cobaltPal = { main: m.cobalt, hi: m.cobaltHi, lo: m.cobaltLo, gun: m.gun, brass: m.brass,
                 accent: m.glacier, visor: m.iceVisor, faceDark: m.faceDark,
                 boot: m.cobaltLo, bootHi: m.cobalt, bootLo: m.faceDark };
  buildCobaltHelmet('cobalt', cobaltPal); buildCobaltTorso('cobalt', cobaltPal);
  buildMechaArms('cobalt', cobaltPal, { pauldron: 'stack', upperArm: false });
  buildMechaLegs('cobalt', cobaltPal, { thigh: false });
  const umbraPal = { main: m.umbra, hi: m.umbraHi, lo: m.umbraLo, gun: m.gun, brass: m.brass,
                 accent: m.violetTrim, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.umbraLo, bootHi: m.umbra, bootLo: m.faceDark };
  buildUmbraHelmet('umbra', umbraPal); buildUmbraTorso('umbra', umbraPal);
  buildMechaArms('umbra', umbraPal, { pauldron: 'dome', upperArm: false });
  buildMechaLegs('umbra', umbraPal, { thigh: false });
  const signalPal = { main: m.signal, hi: m.signalHi, lo: m.signalLo, gun: m.gun, brass: m.brass,
                 accent: m.glacier, visor: m.visorDim, faceDark: m.faceDark,
                 boot: m.signalLo, bootHi: m.signal, bootLo: m.faceDark };
  buildSignalHelmet('signal', signalPal); buildSignalTorso('signal', signalPal);
  buildMechaArms('signal', signalPal, { pauldron: 'flatp', upperArm: false });
  buildMechaLegs('signal', signalPal, { thigh: false });
  const viperPal = { main: m.viper, hi: m.viperHi, lo: m.viperLo, gun: m.gun, brass: m.brass,
                 accent: m.gun, visor: m.visorGreen, faceDark: m.faceDark,
                 boot: m.viperLo, bootHi: m.viper, bootLo: m.faceDark };
  buildViperHelmet('viper', viperPal); buildViperTorso('viper', viperPal);
  buildMechaArms('viper', viperPal, { pauldron: 'dome', fist: 'sharp' });
  buildMechaLegs('viper', viperPal, { boot: 'sleek', knee: { type: 'gem', mat: m.visorGreen } });
  const bastionPal = { main: m.bastion, hi: m.bastionHi, lo: m.bastionLo, gun: m.gun, brass: m.brass,
                 accent: m.bastBlue, visor: m.iceVisor, faceDark: m.faceDark,
                 boot: m.bastionLo, bootHi: m.bastion, bootLo: m.faceDark };
  buildBastionHelmet('bastion', bastionPal); buildBastionTorso('bastion', bastionPal);
  buildMechaArms('bastion', bastionPal, { pauldron: 'box', fist: 'block' });
  buildMechaLegs('bastion', bastionPal, { shinGuard: true });
  const corsairPal = { main: m.corsair, hi: m.corsairHi, lo: m.corsairLo, gun: m.gun, brass: m.brass,
                 accent: m.gold, visor: m.visorGold, faceDark: m.faceDark,
                 boot: m.corsairLo, bootHi: m.corsair, bootLo: m.faceDark };
  buildCorsairHelmet('corsair', corsairPal); buildCorsairTorso('corsair', corsairPal);
  buildMechaArms('corsair', corsairPal, { fistBand: m.gold });
  buildMechaLegs('corsair', corsairPal, { boot: 'trim', knee: { type: 'ring', mat: m.gold } });
  const tempestPal = { main: m.tempest, hi: m.tempestHi, lo: m.tempestLo, gun: m.gun, brass: m.brass,
                 accent: m.steelHi, visor: m.visor, faceDark: m.faceDark,
                 boot: m.tempestLo, bootHi: m.tempest, bootLo: m.faceDark };
  buildTempestHelmet('tempest', tempestPal); buildTempestTorso('tempest', tempestPal);
  buildMechaArms('tempest', tempestPal, { pauldron: 'blade' });
  buildMechaLegs('tempest', tempestPal, { boot: 'sleek', knee: { type: 'ring', mat: m.brass } });
  const wardenPal = { main: m.warden, hi: m.wardenHi, lo: m.wardenLo, gun: m.gun, brass: m.brass,
                 accent: m.gun, visor: m.amber, faceDark: m.faceDark,
                 boot: m.wardenLo, bootHi: m.warden, bootLo: m.faceDark };
  buildWardenHelmet('warden', wardenPal); buildWardenTorso('warden', wardenPal);
  buildMechaArms('warden', wardenPal, { pauldron: 'domeTrim', fist: 'block' });
  buildMechaLegs('warden', wardenPal, { boot: 'steel' });
  const seraphPal = { main: m.seraph, hi: m.seraphHi, lo: m.seraphLo, gun: m.gun, brass: m.brass,
                 accent: m.gold, visor: m.visorGold, faceDark: m.faceDark,
                 boot: m.seraphLo, bootHi: m.seraph, bootLo: m.faceDark };
  buildSeraphHelmet('seraph', seraphPal); buildSeraphTorso('seraph', seraphPal);
  buildMechaArms('seraph', seraphPal, { pauldron: 'point', fistBand: m.gold });
  buildMechaLegs('seraph', seraphPal, { boot: 'trim', knee: { type: 'gem', mat: m.visorGold } });
  const krakenPal = { main: m.kraken, hi: m.krakenHi, lo: m.krakenLo, gun: m.gun, brass: m.brass,
                 accent: m.patina, visor: m.visorAqua, faceDark: m.faceDark,
                 boot: m.krakenLo, bootHi: m.kraken, bootLo: m.faceDark };
  buildKrakenHelmet('kraken', krakenPal); buildKrakenTorso('kraken', krakenPal);
  buildMechaArms('kraken', krakenPal, { pauldron: 'dome', fist: 'sharp' });
  buildMechaLegs('kraken', krakenPal, { boot: 'clean', knee: { type: 'gem', mat: m.visorAqua } });
  const titanPal = { main: m.titan, hi: m.titanHi, lo: m.titanLo, gun: m.gun, brass: m.brass,
                 accent: m.brass, visor: m.amber, faceDark: m.faceDark,
                 boot: m.titanLo, bootHi: m.titan, bootLo: m.faceDark };
  buildTitanHelmet('titan', titanPal); buildTitanTorso('titan', titanPal);
  buildMechaArms('titan', titanPal, { pauldron: 'slab', fist: 'block' });
  buildMechaLegs('titan', titanPal, { boot: 'steel', shinGuard: true, knee: { type: 'ring', mat: m.brass } });
  const wraithPal = { main: m.wraith, hi: m.wraithHi, lo: m.wraithLo, gun: m.gun, brass: m.brass,
                 accent: m.violetTrim, visor: m.visorViolet, faceDark: m.faceDark,
                 boot: m.wraithLo, bootHi: m.wraith, bootLo: m.faceDark };
  buildWraithHelmet('wraith', wraithPal); buildWraithTorso('wraith', wraithPal);
  buildMechaArms('wraith', wraithPal, { pauldron: 'blade', fist: 'sharp' });
  buildMechaLegs('wraith', wraithPal, { boot: 'sleek', knee: { type: 'gem', mat: m.visorViolet } });
  const phoenixPal = { main: m.phoenix, hi: m.phoenixHi, lo: m.phoenixLo, gun: m.gun, brass: m.brass,
                 accent: m.gold, visor: m.ember, faceDark: m.faceDark,
                 boot: m.phoenixLo, bootHi: m.phoenix, bootLo: m.faceDark };
  buildPhoenixHelmet('phoenix', phoenixPal); buildPhoenixTorso('phoenix', phoenixPal);
  buildMechaArms('phoenix', phoenixPal, { pauldron: 'point', fistBand: m.gold });
  buildMechaLegs('phoenix', phoenixPal, { boot: 'lacquer', knee: { type: 'ring', mat: m.gold } });
  const monarchPal = { main: m.monarch, hi: m.monarchHi, lo: m.monarchLo, gun: m.gun, brass: m.brass,
                 accent: m.gold, visor: m.visorViolet, faceDark: m.faceDark,
                 boot: m.monarchLo, bootHi: m.monarch, bootLo: m.faceDark };
  buildMonarchHelmet('monarch', monarchPal); buildMonarchTorso('monarch', monarchPal);
  buildMechaArms('monarch', monarchPal, { pauldron: 'sode', fistBand: m.gold });
  buildMechaLegs('monarch', monarchPal, { boot: 'trim', hipSkirt: true, knee: { type: 'gem', mat: m.visorViolet } });
  // ---- Tier bulk: rarer sets read heavier. Scales registered armor groups.
  function setTierBulk(vk, bHead, bLimb) {
    for (const slot of ['helmet', 'torso'])
      for (const o of registry[slot][vk]) o.scale.multiplyScalar(bHead);
    for (const slot of ['armL', 'armR', 'legs'])
      for (const o of registry[slot][vk]) {
        if (o.userData.isBootHost && bLimb < 1) continue;   // never shrink boots
        o.scale.multiplyScalar(bLimb);
      }
  }
  for (const k of ['scrap', 'cadet', 'dune', 'moss', 'ash', 'slag', 'tide', 'brawler'])
    setTierBulk(k, 0.92, 0.90);
  for (const k of ['blue', 'red', 'glacier', 'verdant', 'copper', 'cobalt', 'umbra', 'signal'])
    setTierBulk(k, 0.97, 0.95);
  for (const k of ['shogun', 'void', 'seraph', 'kraken', 'titan', 'wraith', 'phoenix', 'monarch'])
    setTierBulk(k, 1.12, 1.15);

  // ---- Eye color system: recolors skeleton eyes + every helmet's eyes ----
  const EYE_COLORS = [
    ['WHITE', '#c9d2dd'], ['ICE', '#8fdcff'], ['CYAN', '#8ee9ff'], ['TEAL', '#4dd8c0'],
    ['GREEN', '#58e06a'], ['LIME', '#b8f03a'], ['GOLD', '#ffd34d'], ['AMBER', '#ffbf2e'],
    ['ORANGE', '#ff8a2e'], ['EMBER', '#ff5a1f'], ['RED', '#ff3a30'], ['CRIMSON', '#e0364e'],
    ['PINK', '#ff7ab8'], ['MAGENTA', '#e870ff'], ['VIOLET', '#a06bff'], ['BLUE', '#4d8aff'],
  ];
  const EYE_LEVELS = [0.6, 1.0, 1.6, 2.3, 3.2];
  const eyeMatCache = {};
  let eyeChoice = { hex: '#c9d2dd', level: 0 };   // WHITE / BRIGHT 1 by default
  function eyeMat(hex, level) {
    const k = hex + '_' + level;
    if (!eyeMatCache[k]) {
      eyeMatCache[k] = new THREE.MeshStandardMaterial({
        color: 0x14171c, metalness: 0.0, roughness: 0.4, flatShading: true,
        emissive: new THREE.Color(hex), emissiveIntensity: EYE_LEVELS[level],
      });
    }
    return eyeMatCache[k];
  }
  const isEyeMat = (mat) => !!(mat && mat.emissive && mat.emissive.getHex() !== 0);
  function applyEyesIn(list) {
    for (const g of list) g.traverse((o) => {
      if (!o.isMesh) return;
      const base = o.userData.origMat || o.material;
      if (!isEyeMat(base)) return;                    // ONLY real emissive eyes/visors
      if (!o.userData.origMat) o.userData.origMat = o.material;
      o.material = eyeChoice ? eyeMat(eyeChoice.hex, eyeChoice.level) : o.userData.origMat;
    });
  }
  // Whole-skeleton highlight (kept from a happy accident): tints every
  // skeleton mesh with a low-brightness emissive. NONE restores materials.
  let skelHighlight = null;
  const hlCache = {};
  function hlMat(hex) {
    if (!hlCache[hex]) {
      hlCache[hex] = new THREE.MeshStandardMaterial({
        color: 0x14171c, metalness: 0.0, roughness: 0.4, flatShading: true,
        emissive: new THREE.Color(hex), emissiveIntensity: EYE_LEVELS[0],
      });
    }
    return hlCache[hex];
  }
  function applySkelSurface() {
    for (const g of skelGroups) g.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.userData.origMat) o.userData.origMat = o.material;
      if (skelHighlight) { o.material = hlMat(skelHighlight); return; }
      const base = o.userData.origMat;
      o.material = (isEyeMat(base) && eyeChoice)
        ? eyeMat(eyeChoice.hex, eyeChoice.level) : base;
    });
  }
  function applyEyeChoice() {
    applySkelSurface();
    for (const vk of VKEYS) applyEyesIn(registry.helmet[vk]);
  }


  // ---- 4. Public API + initial state ----
  sceneRoot.userData.mecka = {
    slots: Object.keys(registry), variants: VKEYS.slice(),
    catalog: SET_CATALOG, tierColors: TIER_COLORS,
    builtSets: () => [...builtSets],
    setSkeleton: (i) => {
      clearSkeleton(); buildSkeletonMeshes(i);
      equip('armL', equipped.armL); equip('armR', equipped.armR);
      if (eyeChoice || skelHighlight) { applySkelSurface(); if (eyeChoice) for (const vk of VKEYS) applyEyesIn(registry.helmet[vk]); }
    },
    setEyeColor: (hex, level = 2) => {
      eyeChoice = hex ? { hex, level } : null;
      applyEyeChoice();
    },
    setSkeletonHighlight: (hex) => { skelHighlight = hex || null; applySkelSurface(); },
    eyeColors: EYE_COLORS.slice(), eyeLevels: EYE_LEVELS.length,
    getSkeleton: () => skelIndex, skeletonCount: SKEL_STYLES.length,
    equip, equipAll,
    getEquipped: (slot) => equipped[slot], getState: () => ({ ...equipped }),
  };
  applyEyeChoice();   // apply the default eye color to skeleton + all helmets

  const init = opts.equip === undefined ? 'blue' : opts.equip;
  if (init === null || typeof init === 'string') equipAll(init);
  else for (const [slot, v] of Object.entries(init)) equip(slot, v);

  return sceneRoot;
}
