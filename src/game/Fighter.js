/* ============================================================
   Fighter.js
   Skinned Jammo character with fighting-game style action timing.

   Key concepts:
     - Every action is described by a frame budget:
         startup  → committed; another action cannot interrupt
         active   → hit window
         recovery → CAN be cancelled into another action
       This is what makes the controls feel responsive: as soon
       as a jab's recovery starts, you can already chain a hook,
       a dodge, an uppercut, etc.
     - Action descriptors live in CONFIG.fighter.actions and are
       expressed in 60fps frames.  Each frame = 1/60 s.
     - Loadout: each fighter is built with a parts loadout that
       attaches small overlay meshes to specific bones (so they
       follow animation) and applies stat multipliers:
         power → outgoing damage
         armor → incoming damage  (lower = tougher)
         speed → moveSpeed
   ============================================================ */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { clamp, damp, sign } from '../utils/math.js';
import { AnimationController } from './AnimationController.js';

const C = CONFIG.fighter;
const B = CONFIG.battery;
const D = CONFIG.damage;
const ACT = C.actions;
const FRAME = 1 / 60;

// Phase enum within an action.
const PHASE = { STARTUP: 0, ACTIVE: 1, RECOVERY: 2 };

export class Fighter {
  constructor(opts) {
    this.isPlayer       = !!opts.isPlayer;
    this.side           = opts.side || (opts.isPlayer ? -1 : 1);
    this.onShoot        = opts.onShoot || (() => {});
    this.onDamageDealt  = opts.onDamageDealt || (() => {});

    // ---- Loadout & derived stats ----
    this.loadout = opts.loadout || { ...CONFIG.defaultLoadout };
    this.stats = this._computeStats(this.loadout);

    // ---- Combat state ----
    this.state = 'idle';
    this.action = null;          // current active action descriptor (or null)
    this.invulnTime = 0;
    this.lockoutTime = 0;
    this.recentDamageTime = 0;
    this.shielding = false;
    this.counterReady = false;   // true during the parry window
    this.stunTime = 0;

    this.hp = C.healthMax;
    this.battery = C.batteryMax;
    this.facing = this.side > 0 ? -1 : 1;

    // Build mesh.
    this.root = this._buildMesh(opts.assets);
    this.root.position.x = opts.startX || 0;
    this.root.position.y = 0;
    this.root.rotation.y = this.side < 0 ? Math.PI / 2 : -Math.PI / 2;

    this.anim = new AnimationController(this._animRoot, opts.assets.clips);

    // Shield bubble.
    const shieldGeo = new THREE.SphereGeometry(0.95, 22, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x7afcff, transparent: true, opacity: 0.0, side: THREE.DoubleSide,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 1.05;
    this.shieldMesh.scale.setScalar(0);
    this.root.add(this.shieldMesh);

    this._moveTarget = this.root.position.x;
  }

  _computeStats(loadout) {
    let power = 1, armor = 1, speed = 1;
    for (const [cat, id] of Object.entries(loadout)) {
      const part = (CONFIG.parts[cat] || []).find(p => p.id === id);
      if (!part) continue;
      power *= part.stats.power;
      armor *= part.stats.armor;
      speed *= part.stats.speed;
    }
    return { power, armor, speed };
  }

  _buildMesh(assets) {
    const root = new THREE.Group();

    const cloned = cloneSkinned(assets.baseScene);
    cloned.scale.setScalar(C.meshScale);
    if (!this.isPlayer) cloned.scale.x *= -1;   // mirror CPU stance

    const albedo = this.isPlayer ? assets.textures.albedoRed
                                 : assets.textures.albedoBlue;
    const normal = assets.textures.normalMap;

    cloned.traverse((obj) => {
      if (!obj.isSkinnedMesh && !obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const matName = (obj.material?.name || '').toLowerCase();
      if (matName.includes('eye')) {
        obj.material = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: this.isPlayer ? 0x9fd7ff : 0xffe788,
          emissiveIntensity: 1.4,
          roughness: 0.2, metalness: 0.1,
        });
      } else {
        obj.material = new THREE.MeshStandardMaterial({
          map: albedo, normalMap: normal,
          roughness: 0.55, metalness: 0.25,
        });
      }
    });

    root.add(cloned);
    this._animRoot = cloned;

    // Attach part overlays (head, arms, torso, legs).
    this._attachOverlays(cloned);

    // Ground shadow.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    root.add(shadow);

    return root;
  }

  /** Walk the loadout and parent overlay meshes to the correct bones.
   *  Parts are defined in approximate world-space units (e.g. a 0.5m
   *  helm).  We compensate for the armature's internal scale (0.28
   *  in Mixamo Jammo) so the size/offset numbers in CONFIG match
   *  what you actually see on screen. */
  _attachOverlays(charRoot) {
    const bones = {};
    charRoot.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
    });

    // Mixamo Jammo armature scales bones by 0.28.  Inverse so the
    // CONFIG sizes are roughly real-world centimeters.
    const ARMATURE_SCALE = 0.28;
    const compensate = 1 / ARMATURE_SCALE;

    const addOverlay = (def) => {
      if (!def) return;
      const bone = bones[def.bone];
      if (!bone) {
        console.warn(`[overlay] bone not found: ${def.bone}`);
        return;
      }
      let geo;
      const s = def.size.map(v => v * compensate);
      switch (def.shape) {
        case 'box':    geo = new THREE.BoxGeometry(s[0], s[1], s[2]); break;
        case 'sphere': geo = new THREE.SphereGeometry(s[0], 16, 12); break;
        case 'cyl':    geo = new THREE.CylinderGeometry(s[0], s[1], s[2], 16); break;
        case 'cone':   geo = new THREE.ConeGeometry(s[0], s[1], 16); break;
        default: return;
      }
      const mat = new THREE.MeshStandardMaterial({
        color: def.color ?? 0x888888,
        roughness: 0.45, metalness: 0.4,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const o = (def.offset || [0, 0, 0]).map(v => v * compensate);
      mesh.position.set(o[0], o[1], o[2]);
      mesh.userData.isPartOverlay = true;
      bone.add(mesh);
    };

    for (const [cat, id] of Object.entries(this.loadout)) {
      const part = (CONFIG.parts[cat] || []).find(p => p.id === id);
      if (!part) continue;
      addOverlay(part.overlay);
      addOverlay(part.overlay2);
    }
  }

  /* ---------------- Stat helpers ---------------- */
  hpFrac()  { return clamp(this.hp / C.healthMax, 0, 1); }
  batFrac() { return clamp(this.battery / C.batteryMax, 0, 1); }
  isKO()    { return this.state === 'ko'; }
  isShielding() { return this.shielding; }

  /** Phase of the current action, or null if not in an action. */
  _phase() {
    if (!this.action) return null;
    const a = this.action;
    if (a.elapsedFrames < a.startup) return PHASE.STARTUP;
    if (a.elapsedFrames < a.startup + a.active) return PHASE.ACTIVE;
    return PHASE.RECOVERY;
  }

  /** Can this fighter start a new action right now?
   *  Yes if: idle, OR in the recovery phase of the current action. */
  canAct(cost = 0) {
    if (this.isKO() || this.lockoutTime > 0 || this.stunTime > 0) return false;
    if (this.battery < cost) return false;
    if (this.action) {
      const ph = this._phase();
      if (ph !== PHASE.RECOVERY) return false;
    }
    return true;
  }

  _spend(cost) {
    this.battery = Math.max(0, this.battery - cost);
    if (this.battery <= 0) this.lockoutTime = B.emptyLockoutSeconds;
  }

  /** Begin an action by name.  Reads the descriptor from CONFIG. */
  _startAction(name) {
    const d = ACT[name];
    if (!d) return false;
    this.action = {
      name,
      startup: d.startup, active: d.active, recovery: d.recovery,
      total: d.startup + d.active + d.recovery,
      hitFrame: d.hitFrame,
      damage: d.damage,
      hitChecked: false,
      elapsedFrames: 0,
      durationSec: (d.startup + d.active + d.recovery) * FRAME,
    };
    this.state = name;
    // Drop shield when committing to an attack.
    if (this.shielding) this._setShield(false);
    // Clear counter window if we were in one.
    this.counterReady = false;
    // Tell the animator to play this action and stretch the clip
    // to the action's frame budget so timing matches visuals.
    this.anim.playFor(name, this.action.durationSec);
    return true;
  }

  /* ---------------- Action API ---------------- */
  jab()      { return this.canAct(ACT.jab.cost)      && this._startAction('jab'); }
  hook()     { return this.canAct(ACT.hook.cost)     && this._startAction('hook'); }
  uppercut() { return this.canAct(ACT.uppercut.cost) && this._startAction('uppercut'); }
  sweep()    { return this.canAct(ACT.sweep.cost)    && this._startAction('sweep'); }

  shoot() {
    if (!this.canAct(ACT.shoot.cost)) return false;
    this._spend(ACT.shoot.cost);
    this._startAction('shoot');
    this._pendingShot = { kind: 'shoot', frames: ACT.shoot.hitFrame };
    return true;
  }
  superShot() {
    if (!this.canAct(ACT.super.cost)) return false;
    this._spend(ACT.super.cost);
    this._startAction('super');
    this._pendingShot = { kind: 'super', frames: ACT.super.hitFrame };
    return true;
  }

  dashForward(opponentX) {
    if (!this.canAct(ACT.dash.cost)) return false;
    this._spend(ACT.dash.cost);
    this._startAction('dash');
    const dir = sign(opponentX - this.root.position.x) || this.facing;
    this._moveTarget = this.root.position.x + dir * C.dashDistance;
    return true;
  }
  dodgeBack(opponentX) {
    if (!this.canAct(ACT.dodge.cost)) return false;
    this._spend(ACT.dodge.cost);
    this._startAction('dodge');
    const dir = sign(this.root.position.x - opponentX) || -this.facing;
    this._moveTarget = this.root.position.x + dir * C.dodgeDistance;
    return true;
  }
  counter() {
    if (!this.canAct(ACT.counter.cost)) return false;
    this._spend(ACT.counter.cost);
    this._startAction('counter');
    this.counterReady = true;
    return true;
  }

  /** Spend the action's cost (called once at startup-phase commit). */
  _spendActionCost() {
    if (!this.action || this.action._spent) return;
    const d = ACT[this.action.name];
    if (d.cost) this._spend(d.cost);
    this.action._spent = true;
  }

  /* ---------------- Shield ---------------- */
  toggleShield() { this._setShield(!this.shielding); }
  setShielding(on) { this._setShield(on); }
  _setShield(on) {
    if (this.isKO() || this.lockoutTime > 0) on = false;
    if (this.action && this._phase() !== PHASE.RECOVERY) on = false;

    if (on && !this.shielding) {
      this.shielding = true;
      this.state = 'shielding';
      this.action = null;
      this.anim.play('shield');
      this.shieldMesh.userData.target = 1;
    } else if (!on && this.shielding) {
      this.shielding = false;
      this.state = 'idle';
      this.anim.stop();
      this.shieldMesh.userData.target = 0;
    }
  }

  celebrate() { this.anim.play('victory'); this.action = null; }

  /* ---------------- Damage in ---------------- */
  takeHit(damage, fromX, isPunch = false) {
    if (this.invulnTime > 0 || this.isKO()) return 0;

    // Active-phase invulnerability (e.g. dodge i-frames).
    if (this.action && this._phase() === PHASE.ACTIVE
        && C.activeInvuln.includes(this.action.name)) {
      return 0;
    }

    // Counter parries punches into stun on the attacker.
    if (this.counterReady && isPunch && this.action?.name === 'counter') {
      // Caller handles attacker stun — return -1 to signal a parry.
      this.counterReady = false;
      return -1;
    }

    let dealt = damage * this.stats.armor;
    if (this.shielding) dealt *= D.shieldReduction;
    this.hp = Math.max(0, this.hp - dealt);
    this.invulnTime = C.invulnDuration;
    this.recentDamageTime = 1.5;

    if (this.hp <= 0) {
      this.state = 'ko';
      this.action = null;
      this.anim.play('ko');
      this._setShield(false);
      return dealt;
    }

    // No physical knockback — getting hit deals damage but doesn't
    // shove the fighter.  Hit reaction interrupts the current action
    // (unless we were shielding).
    if (!this.shielding) {
      this._startAction('hit');
    }
    return dealt;
  }

  stun(duration) {
    this.stunTime = Math.max(this.stunTime, duration);
    this.action = null;
    this.state = 'stun';
    this.anim.play('hit');
  }

  /* ---------------- Frame update ---------------- */
  update(dt, opponent) {
    const oppX = opponent.root.position.x;
    this.facing = this.side < 0 ? 1 : -1;

    // Timers.
    if (this.invulnTime  > 0) this.invulnTime  -= dt;
    if (this.lockoutTime > 0) this.lockoutTime -= dt;
    if (this.recentDamageTime > 0) this.recentDamageTime -= dt;
    if (this.stunTime    > 0) {
      this.stunTime -= dt;
      if (this.stunTime <= 0 && this.state === 'stun') this.state = 'idle';
    }

    // Action progression.
    if (this.action) {
      // Spend cost on first frame of startup if not already.
      this._spendActionCost();

      this.action.elapsedFrames += dt / FRAME;
      const ph = this._phase();

      // Active-phase: melee hit-check on the configured frame.
      if (ph === PHASE.ACTIVE && !this.action.hitChecked &&
          this.action.elapsedFrames >= this.action.hitFrame &&
          ['jab','hook','uppercut','sweep'].includes(this.action.name)) {
        const reach = this.action.name === 'uppercut' ? C.uppercutReach
                    : this.action.name === 'sweep'    ? C.sweepReach
                    :                                   C.punchReach;
        const gapX = Math.abs(oppX - this.root.position.x);
        if (gapX <= reach) {
          const baseDmg = this.action.damage * this.stats.power;
          const result = opponent.takeHit(baseDmg, this.root.position.x, true);
          if (result === -1) {
            // Parried — opponent counters.  Stun us briefly.
            this.stun(C.counterStunDuration);
            this.action = null;
          } else if (result > 0) {
            this._spawnHitFX(opponent.root.position.clone().setY(1.2));
            this.onDamageDealt(this.action.name, result);
          }
        }
        this.action.hitChecked = true;
      }

      // Pending projectile spawn (shoot/super).
      if (this._pendingShot) {
        this._pendingShot.frames -= dt / FRAME;
        if (this._pendingShot.frames <= 0) {
          this.onShoot(this, this._pendingShot.kind);
          this._pendingShot = null;
        }
      }

      // Action ended.
      if (this.action && this.action.elapsedFrames >= this.action.total) {
        // Hit reaction & ko don't auto-return through here (ko stays).
        if (this.state !== 'ko') {
          this.state = 'idle';
        }
        this.action = null;
      }
    }

    // Movement.
    const speed = C.moveSpeed * this.stats.speed;
    const cur = this.root.position.x;
    const dx = this._moveTarget - cur;
    const maxStep = speed * dt;
    let newX = cur + clamp(dx, -maxStep, maxStep);

    // Side lock.
    const gap = C.minSeparation;
    if (this.side < 0) newX = Math.min(newX, oppX - gap);
    else               newX = Math.max(newX, oppX + gap);
    newX = clamp(newX, -CONFIG.stage.laneHalfWidth, CONFIG.stage.laneHalfWidth);
    this.root.position.x = newX;

    // Battery regen.
    let regen = B.regenIdlePerSec;
    if (this.shielding) regen = B.regenShieldPerSec;
    else if (this.action && (this.action.name === 'dash' || this.action.name === 'dodge')) regen = B.regenMovingPerSec;
    if (this.lockoutTime > 0) regen = 0;
    this.battery = Math.min(C.batteryMax, this.battery + regen * dt);

    if (this.shielding) {
      this.battery = Math.max(0, this.battery - B.shieldDrainPerSec * dt);
      if (this.battery <= 0) this._setShield(false);
    }

    // Shield bubble tween.
    const targetScale = this.shieldMesh.userData.target || 0;
    const ns = damp(this.shieldMesh.scale.x, targetScale, 12, dt);
    this.shieldMesh.scale.setScalar(ns);
    this.shieldMesh.material.opacity = 0.30 * ns;

    this.anim.update(dt, this.facing);
  }

  /* Hit FX (unchanged) */
  _spawnHitFX(pos) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.95 })
    );
    flash.position.copy(pos);
    if (!this.root.parent) return;
    this.root.parent.add(flash);

    const sparks = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, 0.09),
        new THREE.MeshBasicMaterial({ color: 0xffeecc, transparent: true, opacity: 1 })
      );
      s.position.copy(pos);
      const ang = (i / 6) * Math.PI * 2;
      const speed = 2.8 + Math.random() * 1.2;
      s.userData.vx = Math.cos(ang) * speed;
      s.userData.vy = Math.sin(ang) * speed + 1.5;
      this.root.parent.add(s);
      sparks.push(s);
    }

    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 380;
      if (t >= 1) {
        flash.parent?.remove(flash);
        flash.geometry.dispose(); flash.material.dispose();
        for (const s of sparks) {
          s.parent?.remove(s);
          s.geometry.dispose(); s.material.dispose();
        }
        return;
      }
      flash.scale.setScalar(1 + t * 2.2);
      flash.material.opacity = 0.95 * (1 - t);
      const dtF = 1 / 60;
      for (const s of sparks) {
        s.position.x += s.userData.vx * dtF;
        s.position.y += s.userData.vy * dtF;
        s.userData.vy -= 8 * dtF;
        s.material.opacity = 1 - t;
        s.rotation.x += 0.4; s.rotation.y += 0.3;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
}
