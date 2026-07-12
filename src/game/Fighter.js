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
const STAGE = CONFIG.stage;
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
    this.character      = opts.character || 'jammo';
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
    this.shielding = false;       // legacy alias for blocking
    this.crouching = false;        // true while CROUCH_DOWN is held
    this.stunTime = 0;

    // ---- Fighting-game state (new) ----
    // Hit / block stun: when > 0, fighter cannot act.  Counted down
    // in seconds (frames / 60) so we don't drift if the loop runs at
    // off-60Hz.  When stun > 0 and the fighter was in an action, the
    // action is replaced with the appropriate reaction state.
    this.hitstunTime  = 0;
    this.blockstunTime = 0;

    // Combo counter — how many hits we've taken in the current
    // "combo window".  Resets when we exit hitstun.  Used by the
    // ATTACKER's damage scaling, but it's tracked on the VICTIM
    // because that's where the chain lives.
    this.comboCount = 0;
    this.comboResetTimer = 0;     // small grace period after stun ends

    // Hit-stop: brief mutual freeze when an attack connects.  When
    // > 0, the fighter's animation and action timer are paused.
    // Both attacker and victim get the same hit-stop value so they
    // freeze simultaneously.
    this.hitStopTime = 0;

    // Pushback velocity — applied to root.position.x with damping.
    // Set when the fighter is hit, blocks, or hits an opponent at
    // the corner (corner pushback reverses onto the attacker).
    this.pushbackVel = 0;

    this.hp = C.healthMax;
    this.battery = C.batteryMax;
    this.facing = this.side > 0 ? -1 : 1;

    // Pick the requested character pack from the asset manifest.
    const pack = opts.assets.characters[this.character]
              || opts.assets.characters.jammo;
    this._pack = pack;

    // Build mesh.
    this.root = this._buildMesh(opts.assets, pack);
    this.root.position.x = opts.startX || 0;
    // Lift the character so feet sit ON the floor.  Use the pack's
    // groundLift since different rigs have different bind-pose origins.
    this.root.position.y = pack.groundLift;
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

  _buildMesh(assets, pack) {
    const root = new THREE.Group();

    // Procedural packs build a FRESH scene per fighter, because each side
    // wears a different MECKA set (CONFIG.mecka).  GLB packs clone the one
    // loaded scene.  Passing `sets` keeps the build to a single armour set:
    // building all 32 makes ~3,150 meshes (~170 visible) and Three.js walks
    // every node in updateMatrixWorld each frame — far too heavy for mobile.
    const meckaSet = pack.procedural
      ? (this.isPlayer ? CONFIG.mecka.playerSet : CONFIG.mecka.cpuSet)
      : null;
    const cloned = pack.procedural
      ? pack.build({ sets: [meckaSet], equip: meckaSet })
      : cloneSkinned(pack.baseScene);
    cloned.scale.setScalar(pack.meshScale);
    if (!this.isPlayer) cloned.scale.x *= -1;   // mirror CPU stance

    if (pack.procedural) {
      // Procedural characters author their own materials — never override
      // them with albedo textures.  Player vs CPU now read apart because
      // they wear DIFFERENT SETS, which replaces the old colour-tint hack
      // (that tint was keyed on userData.tintRole, which only SENTINEL's
      // materials ever carried, and used long-dead v1 palette hexes).
      cloned.userData.mecka.setEyeColor(null);   // branded per-set eye/visor colours
      cloned.traverse((obj) => {
        if (!obj.isMesh && !obj.isSkinnedMesh) return;
        obj.castShadow = true;
        obj.receiveShadow = true;
      });
      root.add(cloned);
      this._animRoot = cloned;
    } else {
    // Pick the right albedo for this fighter.  Jammo has separate
    // red/blue textures keyed off isPlayer; Knight has just one
    // shared "knight" albedo (its color identity comes from being a
    // different character entirely, not a red/blue tint).
    const t = pack.textures;
    const albedo = t.albedo
                ? t.albedo
                : (this.isPlayer ? t.albedoRed : t.albedoBlue);
    const normal = t.normal || null;

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
        const matOpts = {
          map: albedo,
          roughness: 0.55, metalness: 0.25,
        };
        if (normal) matOpts.normalMap = normal;
        obj.material = new THREE.MeshStandardMaterial(matOpts);
      }
    });

    root.add(cloned);
    this._animRoot = cloned;
    }

    // Attach part overlays (head, arms, torso, legs).  Jammo only —
    // the workshop parts catalog is shaped around Jammo's body.
    if (!pack.procedural) this._attachOverlays(cloned);

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

  /** Walk the loadout and create overlay meshes that follow specific
   *  bones each frame.  Overlays are NOT children of the bones (which
   *  caused coordinate-space confusion with the rotated Mixamo
   *  armature).  Instead they're children of the Fighter root, and
   *  each frame `_updateOverlays()` copies the bone's world matrix
   *  into them.  Sizes and offsets in CONFIG are in world units —
   *  what you see is what you get.
   */
  _attachOverlays(charRoot) {
    const bones = {};
    charRoot.traverse((o) => { if (o.isBone) bones[o.name] = o; });

    // Hold (mesh, bone, localOffset) tuples for per-frame updating.
    this._overlayTracks = [];

    const addOverlay = (def) => {
      if (!def) return;
      const bone = bones[def.bone];
      if (!bone) {
        console.warn(`[overlay] bone not found: ${def.bone}`);
        return;
      }
      let geo;
      const s = def.size;
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
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData.isPartOverlay = true;

      // Add to the Fighter root, not the bone.  Manually update
      // each frame from the bone's world transform.
      this.root.add(mesh);

      this._overlayTracks.push({
        mesh,
        bone,
        offset: new THREE.Vector3(...(def.offset || [0, 0, 0])),
      });
    };

    for (const [cat, id] of Object.entries(this.loadout)) {
      const part = (CONFIG.parts[cat] || []).find(p => p.id === id);
      if (!part) continue;
      addOverlay(part.overlay);
      addOverlay(part.overlay2);
    }
  }

  /** Per-frame: copy each tracked bone's world transform onto its
   *  overlay mesh, then offset the mesh in world space. */
  _updateOverlays() {
    if (!this._overlayTracks || this._overlayTracks.length === 0) return;
    const tmpPos = new THREE.Vector3();
    const tmpQuat = new THREE.Quaternion();
    const tmpScale = new THREE.Vector3();
    const offsetWorld = new THREE.Vector3();
    // Cache the inverse of the Fighter root's world matrix so we can
    // express the bone's world position in Fighter-root-local space.
    const rootInverse = new THREE.Matrix4().copy(this.root.matrixWorld).invert();

    for (const track of this._overlayTracks) {
      track.bone.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
      // Transform bone world position into Fighter-root-local space.
      const localPos = tmpPos.clone().applyMatrix4(rootInverse);
      // Apply the world-up offset (Y is world up).
      track.mesh.position.copy(localPos).add(track.offset);
      // Pass through scale magnitude (uniform) and a pure Y rotation so
      // the box doesn't stay axis-aligned to the world bizarrely.
      track.mesh.quaternion.identity();
      track.mesh.scale.set(1, 1, 1);
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

  /** Is the current action invulnerable on this exact frame?
   *  Reads the action's `invuln: [start, end]` range (1-indexed,
   *  inclusive).  Returns false for any action without an invuln
   *  range, or when no action is active. */
  _isInvuln() {
    if (!this.action) return false;
    const d = ACT[this.action.name];
    if (!d || !d.invuln) return false;
    // Frame number is 1-indexed for designer ergonomics:
    // elapsedFrames 0 → frame 1.
    const f = this.action.elapsedFrames + 1;
    return f >= d.invuln[0] && f <= d.invuln[1];
  }

  /** Can this fighter start a new action right now?
   *  Yes if: idle, OR in the recovery phase of the current action,
   *  AND not in stun, hitstop, or any other locked state. */
  canAct(cost = 0) {
    if (this.isKO() || this.lockoutTime > 0 || this.stunTime > 0) return false;
    // New: hitstun and blockstun also block new actions.
    if (this.hitstunTime > 0 || this.blockstunTime > 0) return false;
    // New: hit-stop freezes everything.
    if (this.hitStopTime > 0) return false;
    if (!B.disabled && this.battery < cost) return false;
    if (this.action) {
      const ph = this._phase();
      if (ph !== PHASE.RECOVERY) return false;
    }
    return true;
  }

  _spend(cost) {
    if (B.disabled) return;   // battery depletion turned off
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
    // Tell the animator to play this action and stretch the clip
    // to the action's frame budget so timing matches visuals.
    this.anim.playFor(name, this.action.durationSec);
    return true;
  }

  /* ---------------- Action API ---------------- */
  jab()      { if (this.crouching) return false; return this.canAct(ACT.jab.cost)      && this._startAction('jab'); }
  hook()     { if (this.crouching) return false; return this.canAct(ACT.hook.cost)     && this._startAction('hook'); }
  cross()    { if (this.crouching) return false; return this.canAct(ACT.cross.cost)    && this._startAction('cross'); }
  uppercut() { if (this.crouching) return false; return this.canAct(ACT.uppercut.cost) && this._startAction('uppercut'); }

  shoot() {
    // Regular shot was removed — taps now fire jabs (handled by App
    // routing).  We still expose a stub here in case anything legacy
    // calls it; it just no-ops rather than fail loudly.
    return false;
  }
  superShot() {
    if (!this.canAct(ACT.super.cost)) return false;
    if (this.crouching) return false;
    this._spend(ACT.super.cost);
    this._startAction('super');
    this._pendingShot = { kind: 'super', frames: ACT.super.hitFrame };
    return true;
  }

  dashForward(opponentX) {
    if (!this.canAct(ACT.dash.cost)) return false;
    if (this.crouching) return false;
    this._spend(ACT.dash.cost);
    this._startAction('dash');
    const dir = sign(opponentX - this.root.position.x) || this.facing;
    this._moveTarget = this.root.position.x + dir * C.dashDistance;
    return true;
  }
  dodgeBack(opponentX) {
    if (!this.canAct(ACT.dodge.cost)) return false;
    if (this.crouching) return false;
    this._spend(ACT.dodge.cost);
    this._startAction('dodge');
    const dir = sign(this.root.position.x - opponentX) || -this.facing;
    this._moveTarget = this.root.position.x + dir * C.dodgeDistance;
    return true;
  }

  /* Counter has been removed. */

  /** Spend the action's cost (called once at startup-phase commit). */
  _spendActionCost() {
    if (!this.action || this.action._spent) return;
    const d = ACT[this.action.name];
    if (d.cost) this._spend(d.cost);
    this.action._spent = true;
  }

  /* ---------------- Block (formerly Shield) ----------------
   * Internally still called `shielding` — the renaming is at the
   * input/UI layer, not in the simulation.  Block reduces incoming
   * damage and slows battery regen, same as before.
   */
  toggleShield() { this._setShield(!this.shielding); }
  setShielding(on) { this._setShield(on); }
  setBlocking(on)  { this._setShield(on); }    // explicit alias
  _setShield(on) {
    if (this.isKO() || this.lockoutTime > 0) on = false;
    if (this.crouching) on = false;             // can't block while crouched
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

  /* ---------------- Crouch ----------------
   * While crouching:
   *   - cannot start any other action (jab, dash, etc)
   *   - regular projectiles miss (handled in ProjectileManager)
   *   - melee attacks land but at reduced damage (handled in takeHit)
   *   - super projectile flies overhead (handled in ProjectileManager)
   */
  setCrouching(on) {
    if (this.isKO() || this.lockoutTime > 0) on = false;
    if (this.shielding) on = false;             // can't crouch while blocking
    if (this.action && this._phase() !== PHASE.RECOVERY) on = false;

    if (on && !this.crouching) {
      this.crouching = true;
      this.state = 'crouching';
      this.action = null;
      // No dedicated crouch animation — bring the body lower visually
      // by lowering the root.  Standing height comes back on release.
      this._origRootY = this.root.position.y;
      this.root.position.y = (this._origRootY ?? 0) - 0.4;
    } else if (!on && this.crouching) {
      this.crouching = false;
      this.state = 'idle';
      this.root.position.y = this._origRootY ?? 0;
    }
  }

  celebrate() { this.anim.play('victory'); this.action = null; }

  /* ---------------- Damage in ---------------- */
  /** Apply an incoming attack.  Returns an object describing what
   *  happened, so the caller (the attacker's update loop) can react —
   *  e.g. enter mutual hit-stop, apply mirrored pushback, increment
   *  the attacker's hit counter for FX.
   *
   *  Result shape:
   *     { dealt, blocked, missed, invuln, ko, attackName }
   *
   *  - missed:  true if the hit didn't connect (crouch dodge / invuln)
   *  - blocked: true if the defender was blocking
   *  - invuln:  true if startup-invuln saved the defender (e.g. uppercut)
   *  - ko:      true if this hit took HP to 0 */
  takeHit(damage, fromX, isPunch = false, attackName = null) {
    if (this.isKO()) {
      return { dealt: 0, missed: true, ko: true, attackName };
    }

    // i-frames after a previous hit (small grace window so a single
    // attack doesn't multi-hit).
    if (this.invulnTime > 0) {
      return { dealt: 0, missed: true, attackName };
    }

    // Frame-data invulnerability — if the defender is currently in
    // an invuln frame range of their own action (uppercut startup,
    // dodge active), the attack whiffs entirely.
    if (this._isInvuln()) {
      return { dealt: 0, missed: true, invuln: true, attackName };
    }

    // Crouch dodging: jab/cross/super are "high" attacks that whiff
    // entirely against a crouching target.  Hook and uppercut still
    // connect.
    if (this.crouching && (attackName === 'jab' || attackName === 'cross' || attackName === 'super')) {
      return { dealt: 0, missed: true, attackName };
    }

    const ad = ACT[attackName] || {};
    const blocked = this.shielding && !this.crouching;

    // Apply combo scaling if this is a follow-up hit during an
    // existing combo.  Scaling does not apply to blocked hits.
    let scale = 1.0;
    if (!blocked) {
      const idx = Math.min(this.comboCount, C.comboScaling.length - 1);
      scale = C.comboScaling[idx];
    }

    let dealt = damage * this.stats.armor * scale;
    if (blocked) dealt *= D.shieldReduction;     // chip damage on block

    this.hp = Math.max(0, this.hp - dealt);
    this.invulnTime = 0.05;        // short i-frame so one attack can't double-hit
    this.recentDamageTime = 1.5;

    // Apply stun.  Use frame data if present, else a short fallback.
    const hitStunFrames   = ad.hitStun   ?? 14;
    const blockStunFrames = ad.blockStun ?? 8;

    if (blocked) {
      this.blockstunTime = Math.max(this.blockstunTime, blockStunFrames * FRAME);
      // Combo counter does NOT advance on block — but it doesn't reset either.
    } else {
      this.hitstunTime = Math.max(this.hitstunTime, hitStunFrames * FRAME);
      this.comboCount += 1;
      this.comboResetTimer = 0;     // any new hit clears the grace timer
    }

    // Apply pushback on the victim.  Direction = away from attacker.
    // On hit, full pushback applies.  On block, the block absorbs
    // some of the momentum so the defender slides less (0.70×).
    // The wall clamp in update() handles the cornered case — a
    // cornered defender simply doesn't move regardless.
    const pushback = ad.pushback ?? 0;
    if (pushback > 0) {
      const dirX = sign(this.root.position.x - fromX) || -this.facing;
      const defenderPushback = blocked ? pushback * 0.70 : pushback;
      this.pushbackVel += dirX * defenderPushback * 12;
    }

    // Hit-stop: brief mutual freeze.  Heavy attacks freeze longer.
    const heavy = (attackName === 'hook' || attackName === 'uppercut' || attackName === 'super');
    const stopFrames = heavy ? C.hitStopFramesHeavy : C.hitStopFrames;
    this.hitStopTime = Math.max(this.hitStopTime, stopFrames * FRAME);

    if (this.hp <= 0) {
      this.state = 'ko';
      this.action = null;
      this.anim.play('ko');
      this._setShield(false);
      return { dealt, ko: true, attackName };
    }

    // Interrupt current action with a hit reaction (unless we were
    // blocking — block stun keeps the block animation).
    if (!blocked && !this.crouching) {
      this._startAction('hit');
      // Stretch the hit anim to fill the hitstun duration so the
      // reaction visually matches the lock window.
      this.action.durationSec = this.hitstunTime;
      this.anim.playFor('hit', this.hitstunTime);
    }

    return { dealt, blocked, attackName };
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

    // ---- Hit-stop: brief mutual freeze on attack connect ----
    // When > 0, ALL other timers and the action timer are frozen.
    // This is the visual "punch impact" feel — both characters
    // appear to pause for a few frames so the hit reads clearly.
    if (this.hitStopTime > 0) {
      this.hitStopTime -= dt;
      // While frozen, freeze the animation playhead too.
      this.anim.setPaused(true);
      // Skip ALL the rest of update — no action progression,
      // no movement, no other timer countdown.  The opponent's
      // own update handles their freeze independently.
      return;
    } else {
      this.anim.setPaused(false);
    }

    // Timers (regular flow once not in hit-stop).
    if (this.invulnTime  > 0) this.invulnTime  -= dt;
    if (this.lockoutTime > 0) this.lockoutTime -= dt;
    if (this.recentDamageTime > 0) this.recentDamageTime -= dt;
    if (this.stunTime    > 0) {
      this.stunTime -= dt;
      if (this.stunTime <= 0 && this.state === 'stun') this.state = 'idle';
    }

    // ---- Hit stun / block stun ----
    if (this.hitstunTime > 0) {
      this.hitstunTime -= dt;
      if (this.hitstunTime <= 0) {
        this.hitstunTime = 0;
        // End hit reaction, return to idle.  Combo counter has a
        // small grace window before resetting so visual hits that
        // arrive 1-2 frames late still register as part of the combo.
        if (this.action && this.action.name === 'hit') {
          this.action = null;
          this.state = 'idle';
          this.anim.stop();
        }
        this.comboResetTimer = 0.20;     // 200ms grace
      }
    }
    if (this.blockstunTime > 0) {
      this.blockstunTime -= dt;
      if (this.blockstunTime <= 0) this.blockstunTime = 0;
    }

    // Combo grace countdown — once expired, reset combo counter.
    if (this.comboResetTimer > 0 && this.hitstunTime <= 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) {
        this.comboCount = 0;
      }
    }

    // ---- Pushback application + decay ----
    // Pushback is a velocity that decays exponentially.  Each frame
    // we move the fighter by the current velocity, then damp it.
    if (Math.abs(this.pushbackVel) > 0.01) {
      this.root.position.x += this.pushbackVel * dt;
      // Critically-damped decay: ~6× per second feels punchy but
      // doesn't slide forever.
      this.pushbackVel = damp(this.pushbackVel, 0, 8, dt);
      // Clamp to lane.
      this.root.position.x = clamp(
        this.root.position.x,
        -STAGE.laneHalfWidth, STAGE.laneHalfWidth
      );
      // If we hit the wall, kill the velocity so we don't pile up.
      if (Math.abs(this.root.position.x) >= STAGE.laneHalfWidth - 0.001) {
        this.pushbackVel = 0;
      }
    } else {
      this.pushbackVel = 0;
    }

    // Defensive NaN guard.  Chrome Mobile's WebGL is stricter about
    // non-finite values in transform matrices than other browsers —
    // a single NaN can blank the entire canvas.  We self-heal here
    // by resetting any non-finite state to safe values so the bug
    // cannot persist across frames.
    if (!Number.isFinite(this.root.position.x) ||
        !Number.isFinite(this.pushbackVel)) {
      console.warn('[Fighter] non-finite state detected, recovering',
        { x: this.root.position.x, v: this.pushbackVel });
      this.root.position.x = clamp(this._moveTarget || 0,
        -STAGE.laneHalfWidth, STAGE.laneHalfWidth);
      this.pushbackVel = 0;
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
          ['jab','hook','cross','uppercut'].includes(this.action.name)) {
        const reach = this.action.name === 'uppercut' ? C.uppercutReach
                    :                                   C.punchReach;
        const gapX = Math.abs(oppX - this.root.position.x);
        if (gapX <= reach) {
          const baseDmg = this.action.damage * this.stats.power;
          const result = opponent.takeHit(
            baseDmg, this.root.position.x, true, this.action.name
          );

          // Mutual hit-stop on connect (both blocked and clean hits).
          // The defender's hit-stop is set inside takeHit; this matches it.
          if (result.dealt > 0 || result.blocked) {
            const heavy = (this.action.name === 'hook' || this.action.name === 'uppercut');
            const stopFrames = heavy ? C.hitStopFramesHeavy : C.hitStopFrames;
            this.hitStopTime = Math.max(this.hitStopTime, stopFrames * FRAME);

            // Pushback on the attacker.  Normally fighters separate
            // on hit/block, but when the DEFENDER is at the corner,
            // the pushback they "would have" taken is redirected
            // back into the attacker — so the attacker gets shoved
            // away from the corner instead.  This is the classic
            // anti-cornering mechanic.
            const ad = ACT[this.action.name] || {};
            const pushback = ad.pushback ?? 0;
            if (pushback > 0) {
              const myDir = sign(this.root.position.x - oppX) || this.facing;
              const wallEdge = STAGE.laneHalfWidth - C.cornerEpsilon;
              const defAtCorner = Math.abs(opponent.root.position.x) >= wallEdge;
              // Pushback amount depends on hit vs block AND whether
              // the defender is cornered.  Four cases:
              //   HIT uncornered   = 0.20×  (low recoil — extend combo)
              //   HIT cornered     = 2.00×  (anti-corner shove)
              //   BLOCK uncornered = 0.80×  (mutual separation)
              //   BLOCK cornered   = 2.40×  (cornered block = breathing room)
              let attackerPushback;
              if (result.blocked) {
                attackerPushback = defAtCorner ? pushback * 2.40 : pushback * 0.80;
              } else {
                attackerPushback = defAtCorner ? pushback * 2.00 : pushback * 0.20;
              }
              this.pushbackVel += myDir * attackerPushback * 12;
            }
          }

          if (result.dealt > 0) {
            this._spawnHitFX(opponent.root.position.clone().setY(1.2));
            this.onDamageDealt(this.action.name, result.dealt, result.blocked);
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
    if (this.action && (this.action.name === 'dash' || this.action.name === 'dodge')) {
      regen = B.regenMovingPerSec;
    }
    // While shielding, regen is slower (no direct drain).
    if (this.shielding) regen *= B.shieldRegenMultiplier;
    if (this.lockoutTime > 0) regen = 0;
    this.battery = Math.min(C.batteryMax, this.battery + regen * dt);

    // Shield bubble tween.
    const targetScale = this.shieldMesh.userData.target || 0;
    const ns = damp(this.shieldMesh.scale.x, targetScale, 12, dt);
    this.shieldMesh.scale.setScalar(ns);
    this.shieldMesh.material.opacity = 0.30 * ns;

    this.anim.update(dt, this.facing);
    this._updateOverlays();
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
