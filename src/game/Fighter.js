/* ============================================================
   Fighter.js — Jammo edition
   Builds a Fighter by cloning a pre-loaded Jammo skinned mesh,
   applying the appropriate red/blue albedo, and driving its
   Mixamo-rigged animations via AnimationController (mixer).

   Side-locked collision and the X-clamp against the opponent
   are unchanged from before; only the mesh and animation
   backends changed.

   Facing (relative to world X axis):
     - this.facing = +1 → should face +X (right).  Character's
       modelled forward is +Z, so rotate +π/2 around Y.
     - this.facing = -1 → face -X (left).  Rotate -π/2 around Y.
   ============================================================ */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from '../config.js';
import { clamp, damp, sign } from '../utils/math.js';
import { AnimationController } from './AnimationController.js';

const C = CONFIG.fighter;
const B = CONFIG.battery;
const D = CONFIG.damage;

export class Fighter {
  /**
   * @param {object} opts
   *  - isPlayer, side (-1|+1), startX
   *  - assets: the manifest returned by AssetLoader.loadAllAssets()
   *  - onShoot, onDamageDealt
   */
  constructor(opts) {
    this.isPlayer       = !!opts.isPlayer;
    this.side           = opts.side || (opts.isPlayer ? -1 : 1);
    this.onShoot        = opts.onShoot || (() => {});
    this.onDamageDealt  = opts.onDamageDealt || (() => {});

    this.state = 'idle';
    this.stateTime = 0;
    this.invulnTime = 0;
    this.lockoutTime = 0;
    this.recentDamageTime = 0;
    this.shielding = false;

    this.hp = C.healthMax;
    this.battery = C.batteryMax;

    this.facing = this.side > 0 ? -1 : 1;  // face the center at start

    // Build the mesh — clones the shared Jammo armature + meshes.
    this.root = this._buildMesh(opts.assets);
    this.root.position.x = opts.startX || 0;
    this.root.position.y = 0;

    // Fighting-stance yaw.  Player faces +X (right) = orthodox
    // looking right.  CPU faces -X (left), and with the scale.x = -1
    // mirror applied to its cloned mesh in _buildMesh, that orthodox
    // pose reads as southpaw looking left.
    this.root.rotation.y = this.side < 0 ? Math.PI / 2 : -Math.PI / 2;

    // Animation backend.
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
    this._moveSpeed  = C.moveSpeed;
  }

  _buildMesh(assets) {
    // Root group that holds the cloned character + shadow + shield bubble.
    const root = new THREE.Group();

    // Clone the skinned character.  SkeletonUtils.clone is required
    // because a naive THREE.Object3D.clone() shares the Skeleton and
    // bone references across clones, which breaks animation.
    const cloned = cloneSkinned(assets.baseScene);
    cloned.scale.setScalar(CONFIG.fighter.meshScale);
    // Mirror the CPU on its local X axis.  Combined with the root
    // yaw of -π/2 (set in the constructor), this turns Jammo's
    // native orthodox stance into a visual southpaw stance — the
    // "forward" hand ends up on the character's right side instead
    // of its left, giving a classic Street Fighter style mirror of
    // the player.  Three.js handles the negative-determinant winding
    // order automatically for skinned meshes.
    if (!this.isPlayer) cloned.scale.x *= -1;

    // Apply per-fighter albedo + shared normal map.  Replace materials
    // on the body meshes (the "eyes" material is left alone).
    const albedo = this.isPlayer ? assets.textures.albedoRed
                                 : assets.textures.albedoBlue;
    const normal = assets.textures.normalMap;

    cloned.traverse((obj) => {
      if (!obj.isSkinnedMesh && !obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;

      const mat = obj.material;
      if (!mat) return;
      const matName = (mat.name || '').toLowerCase();

      if (matName.includes('eye')) {
        // Keep eyes bright and self-lit so they read clearly.
        const eyeMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: this.isPlayer ? 0x9fd7ff : 0xffe788,
          emissiveIntensity: 1.4,
          roughness: 0.2,
          metalness: 0.1,
        });
        obj.material = eyeMat;
      } else {
        // Body: apply albedo + normal, sensible PBR defaults.
        const bodyMat = new THREE.MeshStandardMaterial({
          map: albedo,
          normalMap: normal,
          roughness: 0.55,
          metalness: 0.25,
        });
        obj.material = bodyMat;
      }
    });

    root.add(cloned);
    this._animRoot = cloned;     // AnimationMixer attaches here

    // Ground shadow disc.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.42,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    root.add(shadow);

    return root;
  }

  /* --------------------- Stat helpers --------------------- */
  hpFrac()  { return clamp(this.hp / C.healthMax, 0, 1); }
  batFrac() { return clamp(this.battery / C.batteryMax, 0, 1); }
  isKO()    { return this.state === 'ko'; }
  isBusy()  { return ['dashing','dodging','punching','shooting','supering','hit','ko'].includes(this.state); }

  canAct(cost = 0) {
    if (this.isKO() || this.lockoutTime > 0) return false;
    if (this.isBusy() && this.state !== 'shielding') return false;
    return this.battery >= cost;
  }

  _spend(cost) {
    this.battery = Math.max(0, this.battery - cost);
    if (this.battery <= 0) this.lockoutTime = B.emptyLockoutSeconds;
  }
  _setState(s, dur) { this.state = s; this.stateTime = dur; }

  /* --------------------- Actions --------------------- */
  dashForward(opponentX) {
    if (!this.canAct(B.dashCost)) return false;
    this._spend(B.dashCost);
    this._setState('dashing', C.dashDuration);
    this.anim.play('dash', C.dashDuration);
    const dir = sign(opponentX - this.root.position.x) || this.facing;
    this._moveTarget = this.root.position.x + dir * C.dashDistance;
    return true;
  }

  dodgeBack(opponentX) {
    if (!this.canAct(B.dodgeCost)) return false;
    this._spend(B.dodgeCost);
    this._setState('dodging', C.dodgeDuration);
    this.anim.play('dodge', C.dodgeDuration);
    const dir = sign(this.root.position.x - opponentX) || -this.facing;
    this._moveTarget = this.root.position.x + dir * C.dodgeDistance;
    return true;
  }

  punch() {
    if (!this.canAct(B.punchCost)) return false;
    this._spend(B.punchCost);
    this._setState('punching', C.punchDuration);
    this.anim.play('punch', C.punchDuration);
    this._punchHitChecked = false;
    return true;
  }

  shoot() {
    if (!this.canAct(B.shootCost)) return false;
    this._spend(B.shootCost);
    this._setState('shooting', C.shootDuration);
    this.anim.play('shoot', C.shootDuration);
    this._pendingShot = { kind: 'shoot', at: C.shootDuration * 0.4 };
    return true;
  }

  superShot() {
    if (!this.canAct(B.superCost)) return false;
    this._spend(B.superCost);
    this._setState('supering', C.superChargeDuration + 0.2);
    this.anim.play('super', C.superChargeDuration + 0.2);
    this._pendingShot = { kind: 'super', at: C.superChargeDuration };
    return true;
  }

  setShielding(on) {
    if (this.isKO() || this.lockoutTime > 0 || this.isBusy()) {
      this.shielding = false;
      this.shieldMesh.userData.target = 0;
      return;
    }
    if (on && !this.shielding) {
      this.shielding = true;
      this.state = 'shielding';
      this.anim.play('shield', 999);
      this.shieldMesh.userData.target = 1;
    } else if (!on && this.shielding) {
      this.shielding = false;
      this.state = 'idle';
      this.anim.stop();
      this.shieldMesh.userData.target = 0;
    }
  }

  /** Called externally when this fighter wins the round. */
  celebrate() { this.anim.play('victory'); }

  takeHit(damage, fromX) {
    if (this.invulnTime > 0 || this.isKO()) return 0;
    let dealt = damage;
    if (this.shielding) dealt *= D.shieldReduction;
    this.hp = Math.max(0, this.hp - dealt);
    this.invulnTime = C.invulnDuration;
    this.recentDamageTime = 1.5;

    if (this.hp <= 0) {
      this._setState('ko', 999);
      this.anim.play('ko', 1.2);
      this.setShielding(false);
      return dealt;
    }

    const dir = sign(this.root.position.x - fromX) || -this.facing;
    this._moveTarget = this.root.position.x + dir * 0.45;

    if (!this.shielding) {
      this._setState('hit', C.hitReactDuration);
      this.anim.play('hit', C.hitReactDuration);
    }
    return dealt;
  }

  /* --------------------- Frame update --------------------- */
  update(dt, opponent) {
    // Both fighters always face the camera (CPU is mirrored on X
    // via negative scale in _buildMesh), so there's no yaw animation
    // to apply.  `this.facing` is kept as a game-logic value — it
    // tells projectiles/dashes which direction (+X or -X) to travel.
    const oppX = opponent.root.position.x;
    this.facing = this.side < 0 ? 1 : -1;

    // 2. State timer.
    if (this.stateTime > 0) {
      this.stateTime -= dt;
      if (this.stateTime <= 0 && this.state !== 'ko') {
        if (this.state !== 'shielding') this.state = 'idle';
        this.stateTime = 0;
      }
    }
    if (this.invulnTime  > 0) this.invulnTime  -= dt;
    if (this.lockoutTime > 0) this.lockoutTime -= dt;
    if (this.recentDamageTime > 0) this.recentDamageTime -= dt;

    // 3. Move toward target X.
    const cur = this.root.position.x;
    const dx = this._moveTarget - cur;
    const maxStep = this._moveSpeed * dt;
    const step = clamp(dx, -maxStep, maxStep);
    let newX = cur + step;

    // 4. Side lock.  Player (-1) can't cross right of opponent;
    //    CPU (+1) can't cross left of opponent.
    const gap = C.minSeparation;
    if (this.side < 0) newX = Math.min(newX, oppX - gap);
    else               newX = Math.max(newX, oppX + gap);
    newX = clamp(newX, -CONFIG.stage.laneHalfWidth, CONFIG.stage.laneHalfWidth);
    this.root.position.x = newX;

    // 5. Scheduled projectile spawn.
    if (this._pendingShot) {
      this._pendingShot.at -= dt;
      if (this._pendingShot.at <= 0) {
        this.onShoot(this, this._pendingShot.kind);
        this._pendingShot = null;
      }
    }

    // 6. Punch hit-check window.
    if (this.state === 'punching' && !this._punchHitChecked) {
      const progress = 1 - this.stateTime / C.punchDuration;
      if (progress > 0.3) {
        const gapX = Math.abs(oppX - this.root.position.x);
        if (gapX <= C.punchReach) {
          const dealt = opponent.takeHit(D.punch, this.root.position.x);
          if (dealt > 0) {
            this._spawnHitFX(opponent.root.position.clone().setY(1.2));
            this.onDamageDealt('punch', dealt);
          }
        }
        this._punchHitChecked = true;
      }
    }

    // 7. Battery regen.
    let regen = B.regenIdlePerSec;
    if (this.shielding) regen = B.regenShieldPerSec;
    else if (this.state === 'dashing' || this.state === 'dodging') regen = B.regenMovingPerSec;
    if (this.lockoutTime > 0) regen = 0;
    this.battery = Math.min(C.batteryMax, this.battery + regen * dt);

    // 8. Shield drain.
    if (this.shielding) {
      this.battery = Math.max(0, this.battery - B.shieldDrainPerSec * dt);
      if (this.battery <= 0) this.setShielding(false);
    }

    // 9. Shield bubble tween.
    const targetScale = this.shieldMesh.userData.target || 0;
    const ns = damp(this.shieldMesh.scale.x, targetScale, 12, dt);
    this.shieldMesh.scale.setScalar(ns);
    this.shieldMesh.material.opacity = 0.30 * ns;

    // 10. Drive skeletal animation.
    this.anim.update(dt, this.facing);
  }

  _spawnHitFX(pos) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffcc, transparent: true, opacity: 0.95,
      })
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
