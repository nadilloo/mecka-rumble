/* ============================================================
   config.js — All tuning values in one place.
   v2 changes:
   - Larger arena (laneHalfWidth)
   - More agile movement / snappier actions
   - minSeparation prevents fighters clipping through each other
   - DIFFICULTIES presets used by FighterAI
   ============================================================ */

export const CONFIG = {
  /* -------- Debug / dev flags -------- */
  debug: {
    showOverlay: true,
    logGestures: false,
    showFps: true,
  },

  /* -------- Stage -------- */
  // Which MECKA armour set each fighter wears.  Keys come from
  // SET_CATALOG in MeckaKnightProcedural.js (32 sets across 4 tiers:
  // e.g. common 'scrap', uncommon 'blue'/'red', rare 'spartan',
  // epic 'shogun').  Only the listed sets are built per fighter.
  mecka: {
    // Player wears a per-slot loadout, authored in the Mecka Hangar and
    // persisted to localStorage.  These are the first-run defaults.
    playerLoadout: { helmet: 'blue', torso: 'blue', armR: 'blue', armL: 'blue', legs: 'blue' },
    playerEye: { hex: '#8ee9ff', level: 2 },   // null = each set's branded eyes
    cpuSet: 'red',       // MAGMA — CPU still wears one uniform set
  },

  stage: {
    laneHalfWidth: 9.0,        // bigger arena (was 5.5)
    floorRadius: 9.5,
    floorY: 0,
    floorColor: 0x1b1830,
    backdropColor: 0x1a1530,
    ringColor: 0xff4d76,
  },

  /* -------- Fighters -------- */
  fighter: {
    healthMax: 100,
    batteryMax: 100,
    moveSpeed: 6.0,
    dashDistance: 3.0,
    dodgeDistance: 1.8,
    punchRange: 2.6,
    punchReach: 2.8,
    uppercutReach: 3.0,
    minSeparation: 2.4,

    // ---- Action descriptors ----
    // Each action specifies, in 60fps frames:
    //   startup     : commit phase, can be CANCELLED only by an INVULN flag.
    //                 During this phase: no hitbox, but the move is committed.
    //   active      : hit window
    //   recovery    : winding-down phase, CAN be cancelled into a follow-up
    //                 attack (this is how the dial-a-combo branches work).
    //   hitFrame    : frame at which the hit-check fires (within active)
    //   hitStun     : frames the VICTIM is locked when this attack hits.
    //                 Determines whether follow-up attacks combo.
    //   blockStun   : frames the BLOCKER is locked when this attack is blocked.
    //                 Shorter than hitStun → blocker recovers sooner.
    //   pushback    : world units fighters separate on hit/block.
    //   invuln      : optional [start, end] frame range (1-indexed) during
    //                 which the attacker is invulnerable. Used by uppercut.
    //
    // Frame-advantage formulae (informational, computed at runtime):
    //   onHit   = hitStun   - (active - 1) - recovery
    //   onBlock = blockStun - (active - 1) - recovery
    //
    // Hit-stop (a brief freeze on connect) is separate and doesn't count
    // against these frames.  See damage.hitStop below.
    actions: {
      // Tap chain — fast, safe, comboable.
      jab:      { startup: 4, active: 2, recovery: 8,  hitFrame: 5,
                  damage: 3.5, cost: 0,
                  hitStun: 16, blockStun: 10, pushback: 0.60 },
      cross:    { startup: 6, active: 3, recovery: 14, hitFrame: 7,
                  damage: 6.5, cost: 0,
                  hitStun: 20, blockStun: 14, pushback: 1.00 },

      // Heavy attacks — standalone or chain enders.
      hook:     { startup: 8, active: 3, recovery: 18, hitFrame: 9,
                  damage: 8, cost: 0,
                  hitStun: 22, blockStun: 16, pushback: 1.40 },

      // Reversal — invulnerable startup, very unsafe on block.
      uppercut: { startup: 6, active: 4, recovery: 30, hitFrame: 7,
                  damage: 10, cost: 0,
                  hitStun: 36, blockStun: 14, pushback: 2.00,
                  invuln: [1, 6] },

      // Projectiles & misc.
      shoot:    { startup: 4,  active: 0, recovery: 8,  hitFrame: 4,
                  damage: 4,  cost: 0 },
      super:    { startup: 12, active: 4, recovery: 16, hitFrame: 14,
                  damage: 11, cost: 0,
                  hitStun: 28, blockStun: 16, pushback: 1.60 },

      // Movement — no hitbox.
      dash:     { startup: 2, active: 10, recovery: 4, hitFrame: -1,
                  damage: 0, cost: 0 },
      dodge:    { startup: 2, active: 8,  recovery: 6, hitFrame: -1,
                  damage: 0, cost: 0,
                  invuln: [3, 10] },          // active-phase invuln + side-switch

      // Reaction states.
      counter:  { startup: 2, active: 8,  recovery: 16, hitFrame: -1,
                  damage: 0, cost: 0 },
      hit:      { startup: 0, active: 0,  recovery: 16, hitFrame: -1,
                  damage: 0, cost: 0 },        // duration is data-driven via stun frames
    },

    // ---- Combo scaling ----
    // Multiplier applied to damage based on hit count of an ongoing combo.
    // Hit 1 = 100%, hit 2 = 80%, etc.  Past index 4, the cap (0.50) holds.
    // Punches BUFFER rather than cancel (see Fighter._attack).  A queued punch
    // is released this many frames before the current one fully ends.
    //
    //   0 = the swing plays 100% through.  Looks cleanest, but jab -> hook
    //       drops by 2 frames and stops comboing entirely.
    //   3 = the swing plays 79-93% through (fully extended, connected, and
    //       most of the way retracted) AND jab -> hook -> jab still links.
    //
    // Measured, not guessed — the old behaviour let a punch cancel from the
    // FIRST recovery frame, i.e. a jab could be cut at 43% and restarted.
    // That is the stutter.
    linkWindowFrames: 3,

    comboScaling: [1.00, 0.80, 0.65, 0.55, 0.50],

    // ---- Hit-stop ----
    // Brief screen freeze when an attack connects.  Both attacker and
    // victim freeze for these frames.  Visual punch only.
    hitStopFrames:       4,
    hitStopFramesHeavy:  6,    // hook / uppercut / super

    // ---- Corner ----
    // When a fighter is at the lane wall, pushback that would push them
    // further out is instead redirected back into the attacker.
    cornerEpsilon: 0.05,        // distance-from-wall threshold

    invulnDuration: 0.30,        // i-frames after taking damage (legacy)
    counterWindow:  8 / 60,      // 8 frames to parry an incoming punch (legacy)
    counterStunDuration: 0.6,
    activeInvuln: ['dodge'],     // legacy — now derived from action.invuln field

    startSeparation: 7.0,
    // meshScale and groundLift are now per-character — see AssetLoader.js
  },

  /* -------- Battery economy -------- */
  battery: {
    disabled: true,                  // battery doesn't deplete for now
    shieldRegenMultiplier: 0.25,

    regenIdlePerSec:    14,
    regenMovingPerSec:   9,

    emptyLockoutSeconds: 2.0,
  },

  /* -------- Team battles (RPG pivot, M0) --------
     Knobs for the headless TeamBattle core.  The Fighter sim keeps its
     1v1 frame data; this block shapes the wrapper: N-v-N pacing, the
     super gauge, waves, and the malfunction (mecha stun) status.
     Numbers here were MEASURED against tools/battle_check.mjs — the
     canonical 2-uncommons-vs-3-waves battle must land >= 120 s. */
  team: {
    maxSlots: 4,                 // per side, hard cap (D6 point 1)
    timeoutSec: 300,             // stalemate guard; winner by hpFrac sum
    interWaveDelaySec: 1.4,      // breather between cleared wave and next spawn
    engageStaggerSec: 0.35,      // initiative: rank N enters N*this after spawn

    // Statline -> sim-multiplier anchor.  A neutral-tilt UNCOMMON set
    // (the SENTINEL-class baseline every player starts at) maps to 1.0x
    // on all three axes.  power/ref = damage out; ref/armor = damage in;
    // speed/ref = move speed, decision cadence, and initiative rank.
    refStats: { speed: 54, armor: 74, power: 67 },

    // HP pools.  RPG-scale: armour feeds the pool as well as mitigation.
    baseHp: 200,
    hpPerArmor: 2.6,

    // Super gauge — fills from damage BOTH ways (dealt and taken; taken
    // fills faster, the genre's comeback lever).  Full gauge = the auto
    // brain fires the super action.
    gauge: { max: 100, perDamageDealt: 0.55, perDamageTaken: 0.85 },

    // The super itself: resolved as a direct heavy strike through
    // takeHit('super') so the existing frame data (hitStun 28,
    // pushback 1.6) applies.  Damage is pre-power-multiplier.
    super: { damage: 30, malfStress: 15 },

    // Malfunction — the mecha stun (D6 point 8).  Damage taken builds
    // hidden stress; crossing the threshold trips the breaker: the unit
    // locks for `duration`, sparks (M1 FX), then gets an immunity window
    // so it can't be chain-tripped.  Supers add bonus stress on hit.
    malfunction: {
      threshold: 50, stressPerDamage: 0.80,
      duration: 1.1, decayPerSec: 4, immunitySec: 5,
    },

    // Auto-brain pacing.  Interval is divided by the unit's speed
    // multiplier — SPEED literally is attack cadence.
    brain: {
      baseInterval: 0.38, jitter: 0.14,
      aggression: 0.62,            // chance an in-range decision is an attack
      blockChance: 0.30, blockDur: 0.55,
      dodgeLowHp: 0.35, lowHpFrac: 0.30,
      standoffFrac: 0.85,          // approach to punchRange * this
    },

    // D2 stat-triangle (LOCKED, but wired OFF for M0 — the class fn is
    // built and tested; the damage edge switches on when glyph UI lands
    // in M3 so pacing and presentation arrive together).
    // POWER breaks ARMOR, ARMOR walls SPEED, SPEED outruns POWER.
    counterTriangle: { enabled: false, edge: 0.22, dominance: 0.40 },
  },

  /* -------- Damage -------- */
  damage: {
    // Per-action damage values live in fighter.actions.*.damage.
    shieldReduction: 0.15,
  },

  /* -------- Projectiles -------- */
  projectile: {
    shootSpeed: 13,
    shootRadius: 0.20,
    shootLifetime: 1.6,
    shootColor: 0x7afcff,

    superSpeed: 10,
    superRadius: 0.42,
    superLifetime: 2.2,
    superColor: 0xff80f0,

    maxActive: 16,
  },

  /* -------- Camera (tuned for larger arena) -------- */
  camera: {
    fov: 54,                   // wider — portrait framing is tight horizontally
    minDistance: 8.0,
    maxDistance: 22.0,         // further back so both fighters always fit
    distanceLerp: 3.0,
    positionLerp: 4.0,
    lookLerp: 5.5,
    heightEye: 2.4,
    heightLook: 1.0,
    zBase: 14.0,
    sidePan: 0.0,

    shakeDecay: 9.0,
    shakeMax: 0.55,
  },

  /* -------- Hit pause / impact feel -------- */
  impact: {
    hitPauseSmall: 0.045,
    hitPauseLarge: 0.10,
    shakeSmall: 0.18,
    shakeLarge: 0.45,
  },

  /* -------- Input / gesture thresholds -------- */
  input: {
    tapMaxMs: 220,
    holdMinMs: 380,
    tapMaxMovePx: 22,

    // Three-tier forward swipe length:
    shortSwipeMinPx: 35,         // jab if shorter than this -> ignored
    longSwipeMinPx: 110,         // promote jab to hook
    dashSwipeMinPx: 200,         // promote hook to dash

    dragDownMinPx: 90,
    shieldHoldMinPx: 35,         // any down-swipe of this length+ engages held shield

    horizontalBias: 1.2,
    verticalBias: 1.2,

    // Guard/dodge split.  The guard rises the instant you pull back; on
    // RELEASE we ask "was the pointer still moving?" — if yes it was a swipe
    // (dodge back), if it had settled it was a hold (shield in place).
    swipeRestMs: 90,           // idle longer than this at release = a hold
    swipeWindowMs: 90,         // look-back window for release velocity
    swipeReleaseMinPx: 14,     // motion inside that window to count as a swipe

    trailFade: 0.08,
  },

  /* -------- Default AI difficulty -------- */
  defaultDifficulty: 'off',

  /* -------- Default animation speed (multiplier applied to AnimationMixer) -------- */
  defaultAnimSpeed: 1.0,
  animSpeeds: [1.0, 1.25, 1.5, 2.0],

  /* -------- AI difficulty presets --------
     Each one is read by FighterAI._decide().  The `off` preset
     short-circuits the AI entirely — the CPU just idles, useful
     for testing movement / animations without an opponent.
  */
  difficulties: {
    off: {
      disabled: true,
    },
    easy: {
      reactionMin: 0.55, reactionMax: 1.20,
      punchChanceClose: 0.45,
      shootChanceMid: 0.25,
      superChanceIfFull: 0.0,
      shieldChanceIfIncoming: 0.18,
      dodgeChanceIfHpLow: 0.55,
      retreatHpThreshold: 0.30,
      batteryConservative: 35,
      postDamageRetreatSec: 0.0,
      postDamageRetreatChance: 0.0,
    },
    medium: {
      reactionMin: 0.32, reactionMax: 0.72,
      punchChanceClose: 0.62,
      shootChanceMid: 0.48,
      superChanceIfFull: 0.18,
      shieldChanceIfIncoming: 0.40,
      dodgeChanceIfHpLow: 0.55,
      retreatHpThreshold: 0.40,
      batteryConservative: 30,
      postDamageRetreatSec: 1.4,
      postDamageRetreatChance: 0.60,
    },
    hard: {
      reactionMin: 0.18, reactionMax: 0.45,
      punchChanceClose: 0.85,
      shootChanceMid: 0.65,
      superChanceIfFull: 0.40,
      shieldChanceIfIncoming: 0.65,
      dodgeChanceIfHpLow: 0.70,
      retreatHpThreshold: 0.50,
      batteryConservative: 22,
      postDamageRetreatSec: 0.80,
      postDamageRetreatChance: 0.40,
    },
  },

  /* -------- Visual tints -------- */
  tints: {
    player: { body: 0xe24b6a, accent: 0xffffff, ear: 0xb264ff, eye: 0x9fd7ff },
    cpu:    { body: 0x2fbfbf, accent: 0xffffff, ear: 0xff9246, eye: 0xffe788 },
  },

  /* ============================================================
     PARTS CATALOG (Workshop)
     5 categories × 5 variants each.  Each variant defines visual
     overlays attached to specific bones, plus stat deltas.

     Coordinate system: sizes and offsets are in WORLD UNITS.
     Each Mecka stands ~2 m tall (head ~y=2, hips ~y=1, feet ~y=0.5).
     Offsets are in world axes:
       Y = up
       Z = forward (out of screen)
       X = sideways (left/right)
     ============================================================ */
  parts: {
    head: [
      { id: 'std',     name: 'Standard',     stats: { power: 1.00, armor: 1.00, speed: 1.00 }, overlay: null },
      { id: 'helm',    name: 'Heavy Helm',   stats: { power: 1.00, armor: 0.80, speed: 0.92 },
        overlay: { shape: 'box',  bone: 'mixamorig:Head', size: [0.7, 0.18, 0.7], offset: [0, 0.4, 0], color: 0x666677 } },
      { id: 'visor',   name: 'Speed Visor',  stats: { power: 0.95, armor: 1.05, speed: 1.10 },
        overlay: { shape: 'box',  bone: 'mixamorig:Head', size: [0.7, 0.10, 0.10], offset: [0, 0.20, 0.32], color: 0x40c0ff } },
      { id: 'horn',    name: 'War Horn',     stats: { power: 1.15, armor: 1.05, speed: 0.95 },
        overlay: { shape: 'cone', bone: 'mixamorig:Head', size: [0.10, 0.45], offset: [0, 0.55, 0], color: 0xc04040 } },
      { id: 'antenna', name: 'Comm Antenna', stats: { power: 1.05, armor: 1.00, speed: 1.02 },
        overlay: { shape: 'cyl',  bone: 'mixamorig:Head', size: [0.04, 0.04, 0.7], offset: [0.18, 0.55, 0], color: 0xffaa00 } },
    ],
    leftArm: [
      { id: 'std',     name: 'Standard',     stats: { power: 1.00, armor: 1.00, speed: 1.00 }, overlay: null },
      { id: 'shield',  name: 'Buckler',      stats: { power: 0.95, armor: 0.75, speed: 0.96 },
        overlay: { shape: 'cyl',  bone: 'mixamorig:LeftHand', size: [0.30, 0.30, 0.10], offset: [0, 0, 0], color: 0x808090 } },
      { id: 'gauntlet',name: 'Gauntlet',     stats: { power: 1.10, armor: 0.92, speed: 0.97 },
        overlay: { shape: 'box',  bone: 'mixamorig:LeftForeArm', size: [0.36, 0.36, 0.36], offset: [0, 0, 0], color: 0xb04040 } },
      { id: 'blaster', name: 'Mini Blaster', stats: { power: 1.18, armor: 1.02, speed: 0.98 },
        overlay: { shape: 'box',  bone: 'mixamorig:LeftForeArm', size: [0.22, 0.22, 0.50], offset: [0, 0.06, 0.18], color: 0x404060 } },
      { id: 'light',   name: 'Carbon Plate', stats: { power: 0.98, armor: 1.00, speed: 1.10 },
        overlay: { shape: 'box',  bone: 'mixamorig:LeftArm', size: [0.32, 0.50, 0.32], offset: [0, 0, 0], color: 0x2a2a36 } },
    ],
    rightArm: [
      { id: 'std',     name: 'Standard',     stats: { power: 1.00, armor: 1.00, speed: 1.00 }, overlay: null },
      { id: 'shield',  name: 'Buckler',      stats: { power: 0.95, armor: 0.75, speed: 0.96 },
        overlay: { shape: 'cyl',  bone: 'mixamorig:RightHand', size: [0.30, 0.30, 0.10], offset: [0, 0, 0], color: 0x808090 } },
      { id: 'gauntlet',name: 'Gauntlet',     stats: { power: 1.10, armor: 0.92, speed: 0.97 },
        overlay: { shape: 'box',  bone: 'mixamorig:RightForeArm', size: [0.36, 0.36, 0.36], offset: [0, 0, 0], color: 0xb04040 } },
      { id: 'blaster', name: 'Mini Blaster', stats: { power: 1.18, armor: 1.02, speed: 0.98 },
        overlay: { shape: 'box',  bone: 'mixamorig:RightForeArm', size: [0.22, 0.22, 0.50], offset: [0, 0.06, 0.18], color: 0x404060 } },
      { id: 'light',   name: 'Carbon Plate', stats: { power: 0.98, armor: 1.00, speed: 1.10 },
        overlay: { shape: 'box',  bone: 'mixamorig:RightArm', size: [0.32, 0.50, 0.32], offset: [0, 0, 0], color: 0x2a2a36 } },
    ],
    torso: [
      { id: 'std',     name: 'Standard',      stats: { power: 1.00, armor: 1.00, speed: 1.00 }, overlay: null },
      { id: 'plate',   name: 'Plate Armor',   stats: { power: 1.00, armor: 0.70, speed: 0.85 },
        overlay: { shape: 'box',    bone: 'mixamorig:Spine2', size: [1.00, 0.85, 0.65], offset: [0, 0, 0.05], color: 0x556677 } },
      { id: 'jet',     name: 'Jet Pack',      stats: { power: 1.00, armor: 0.96, speed: 1.15 },
        overlay: { shape: 'box',    bone: 'mixamorig:Spine2', size: [0.55, 0.65, 0.30], offset: [0, 0, -0.50], color: 0xffaa00 } },
      { id: 'reactor', name: 'Power Reactor', stats: { power: 1.20, armor: 0.98, speed: 0.98 },
        overlay: { shape: 'sphere', bone: 'mixamorig:Spine2', size: [0.30],              offset: [0, 0, 0.50], color: 0xff4d76 } },
      { id: 'fins',    name: 'Cooling Fins',  stats: { power: 0.96, armor: 1.05, speed: 1.06 },
        overlay: { shape: 'box',    bone: 'mixamorig:Spine2', size: [1.20, 0.10, 0.55], offset: [0, 0.20, -0.30], color: 0x6688aa } },
    ],
    legs: [
      { id: 'std',     name: 'Standard',     stats: { power: 1.00, armor: 1.00, speed: 1.00 }, overlay: null },
      { id: 'tank',    name: 'Tank Boots',   stats: { power: 1.00, armor: 0.85, speed: 0.85 },
        overlay:  { shape: 'box', bone: 'mixamorig:LeftFoot',  size: [0.45, 0.30, 0.50], offset: [0, -0.10, 0.05], color: 0x556677 },
        overlay2: { shape: 'box', bone: 'mixamorig:RightFoot', size: [0.45, 0.30, 0.50], offset: [0, -0.10, 0.05], color: 0x556677 } },
      { id: 'spring',  name: 'Spring Coils', stats: { power: 1.00, armor: 1.05, speed: 1.18 },
        overlay:  { shape: 'cyl', bone: 'mixamorig:LeftLeg',  size: [0.14, 0.14, 0.55], offset: [0, -0.10, 0], color: 0xffd700 },
        overlay2: { shape: 'cyl', bone: 'mixamorig:RightLeg', size: [0.14, 0.14, 0.55], offset: [0, -0.10, 0], color: 0xffd700 } },
      { id: 'kick',    name: 'Power Kicks',  stats: { power: 1.15, armor: 0.96, speed: 0.98 },
        overlay:  { shape: 'box', bone: 'mixamorig:LeftFoot',  size: [0.50, 0.32, 0.62], offset: [0, -0.05, 0.10], color: 0xb04040 },
        overlay2: { shape: 'box', bone: 'mixamorig:RightFoot', size: [0.50, 0.32, 0.62], offset: [0, -0.05, 0.10], color: 0xb04040 } },
      { id: 'light',   name: 'Carbon Legs',  stats: { power: 0.98, armor: 1.00, speed: 1.12 },
        overlay:  { shape: 'cyl', bone: 'mixamorig:LeftLeg',  size: [0.18, 0.18, 0.55], offset: [0, 0, 0], color: 0x2a2a36 },
        overlay2: { shape: 'cyl', bone: 'mixamorig:RightLeg', size: [0.18, 0.18, 0.55], offset: [0, 0, 0], color: 0x2a2a36 } },
    ],
  },

  /* Default loadout when there's no saved preference. */
  defaultLoadout: {
    head: 'std', leftArm: 'std', rightArm: 'std', torso: 'std', legs: 'std',
  },
};
