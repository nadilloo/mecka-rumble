/* ============================================================
   FighterAI.js — v2
   Simple CPU state machine, now parameterised by a difficulty
   preset object from CONFIG.difficulties.  Medium and Hard also
   implement "retreat after taking damage": for a short window
   after being hit, the AI has a higher probability of backing
   off instead of pressing the attack.
   ============================================================ */
import { CONFIG } from '../config.js';
import { randRange } from '../utils/math.js';

const F = CONFIG.fighter;

export class FighterAI {
  /**
   * @param {Fighter} me            the fighter this AI controls
   * @param {Fighter} opponent
   * @param {ProjectileManager} projectiles
   * @param {object} diff           one entry from CONFIG.difficulties
   */
  constructor(me, opponent, projectiles, diff) {
    this.me  = me;
    this.opp = opponent;
    this.projectiles = projectiles;
    this.diff = diff;
    this.nextDecisionIn = 0.4;
    this.shieldFor = 0;
  }

  setDifficulty(diff) { this.diff = diff; }

  update(dt) {
    if (this.me.isKO() || this.opp.isKO()) {
      this.me.setShielding(false);
      return;
    }
    if (this.diff.disabled) {
      this.me.setShielding(false);
      return;
    }

    // Held shield decays.
    if (this.shieldFor > 0) {
      this.shieldFor -= dt;
      this.me.setShielding(this.shieldFor > 0);
    }

    this.nextDecisionIn -= dt;
    if (this.nextDecisionIn > 0) return;
    this.nextDecisionIn = randRange(this.diff.reactionMin, this.diff.reactionMax);
    this._decide();
  }

  _decide() {
    const me  = this.me;
    const opp = this.opp;
    const diff = this.diff;
    const gap = Math.abs(me.root.position.x - opp.root.position.x);
    const battery = me.battery;
    const hpLow = me.hp / F.healthMax < diff.retreatHpThreshold;

    /* ---- Reactive defense: incoming projectile? ---- */
    const incoming = this._incomingProjectile();
    if (incoming && Math.random() < diff.shieldChanceIfIncoming && battery > 20) {
      this.shieldFor = 0.6;
      this.me.setShielding(true);
      return;
    }

    /* ---- "Just got hit" behavior (Medium/Hard) ----
       This implements the "seek distance when taking damage" rule.
       For `postDamageRetreatSec` after being hit, the AI has a
       high chance to dodge back instead of pressing the fight. */
    const justHit =
      diff.postDamageRetreatSec > 0 &&
      me.recentDamageTime > (1.5 - diff.postDamageRetreatSec);
    if (justHit && Math.random() < diff.postDamageRetreatChance) {
      // If far, shoot back while retreating.  If close, dodge back.
      if (gap < F.punchRange * 2 && me.dodgeBack(opp.root.position.x)) return;
      if (battery > 12 && me.shoot()) return;
    }

    /* ---- HP-based retreat ---- */
    if (hpLow && Math.random() < diff.dodgeChanceIfHpLow) {
      me.dodgeBack(opp.root.position.x);
      return;
    }

    /* ---- Range-based offense ---- */
    if (gap <= F.punchRange) {
      // Melee range — pick jab or hook based on aggression.
      if (Math.random() < diff.punchChanceClose) {
        const aggressive = Math.random() < 0.4;
        const ok = aggressive ? me.hook() : me.jab();
        if (!ok) me.dodgeBack(opp.root.position.x);
      } else {
        me.dodgeBack(opp.root.position.x);
      }
      return;
    }

    if (gap <= F.punchRange + 2.8) {
      // Mid range.
      if (battery > diff.batteryConservative && Math.random() < diff.shootChanceMid) {
        if (!me.shoot()) me.dashForward(opp.root.position.x);
      } else {
        me.dashForward(opp.root.position.x);
      }
      return;
    }

    // Far range.  Super occasionally if battery is topped up.
    if (battery >= F.batteryMax - 5 && Math.random() < diff.superChanceIfFull) {
      if (me.superShot()) return;
    }
    if (battery > diff.batteryConservative && Math.random() < 0.45) {
      me.shoot();
    } else {
      me.dashForward(opp.root.position.x);
    }
  }

  _incomingProjectile() {
    const me = this.me;
    for (const p of this.projectiles.alive) {
      if (p.ownerIsPlayer !== me.isPlayer) {
        const dx = me.root.position.x - p.mesh.position.x;
        const toward = Math.sign(p.vx) === Math.sign(dx);
        if (toward && Math.abs(dx) < 3.6) return p;
      }
    }
    return null;
  }
}
