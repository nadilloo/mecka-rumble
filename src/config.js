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
    moveSpeed: 6.0,            // more agile (was 3.6)
    dashDistance: 3.0,         // bigger dashes (was 2.0)
    dodgeDistance: 1.8,
    punchRange: 1.7,
    punchReach: 1.9,
    minSeparation: 1.05,       // physical body radius — never closer than this

    // Snappier action durations
    punchDuration: 0.26,
    dashDuration: 0.22,
    dodgeDuration: 0.20,
    shootDuration: 0.26,
    superChargeDuration: 0.55,
    hitReactDuration: 0.22,
    invulnDuration: 0.42,

    startSeparation: 7.0,      // initial gap (was 5.0)
    meshScale: 2.0,            // scale applied to the cloned Jammo mesh
  },

  /* -------- Battery economy -------- */
  battery: {
    dashCost:  18,
    dodgeCost: 16,
    punchCost: 12,
    shootCost: 8,
    superCost: 35,
    shieldDrainPerSec: 10,

    regenIdlePerSec:    14,
    regenMovingPerSec:   9,
    regenShieldPerSec:   4,

    emptyLockoutSeconds: 2.0,
  },

  /* -------- Damage -------- */
  damage: {
    punch: 10,
    shoot: 8,
    superShot: 22,
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
    tapMaxMs: 180,
    holdMinMs: 420,
    tapMaxMovePx: 20,
    swipeMinDistPx: 95,
    dragDownMinPx: 90,

    horizontalBias: 1.2,
    verticalBias: 1.2,

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
};
