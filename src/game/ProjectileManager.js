/* ============================================================
   ProjectileManager.js — v2
   Accepts `onDamageDealt(kind, amount, ownerIsPlayer)` so App
   can add hit pause + camera shake when projectiles connect.
   ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const P = CONFIG.projectile;
const D = CONFIG.damage;

export class ProjectileManager {
  constructor(scene, onDamageDealt) {
    this.scene = scene;
    this.alive = [];
    this.onDamageDealt = onDamageDealt || (() => {});
  }

  spawn(fromFighter, kind) {
    if (this.alive.length >= P.maxActive) {
      this._kill(this.alive[0]);
    }

    const isSuper = kind === 'super';
    const radius = isSuper ? P.superRadius : P.shootRadius;
    const color  = isSuper ? P.superColor  : P.shootColor;
    const speed  = isSuper ? P.superSpeed  : P.shootSpeed;
    const life   = isSuper ? P.superLifetime : P.shootLifetime;
    // Damage = action descriptor's damage × shooter's POWER stat.
    const baseDmg = (isSuper ? CONFIG.fighter.actions.super.damage
                              : CONFIG.fighter.actions.shoot.damage);
    const damage  = baseDmg * (fromFighter.stats?.power ?? 1);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 14, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    const face = fromFighter.facing;
    mesh.position.set(
      fromFighter.root.position.x + face * 0.9,
      1.35, 0
    );
    this.scene.add(mesh);

    // Outer glow.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.9, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2 })
    );
    mesh.add(glow);

    this.alive.push({
      mesh, glow,
      vx: face * speed,
      life, radius, damage, kind,
      ownerIsPlayer: fromFighter.isPlayer,
    });
  }

  update(dt, player, cpu) {
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const p = this.alive[i];
      p.mesh.position.x += p.vx * dt;
      p.life -= dt;
      p.glow.scale.setScalar(1 + Math.sin(performance.now() * 0.02) * 0.08);

      if (Math.abs(p.mesh.position.x) > CONFIG.stage.laneHalfWidth + 2 || p.life <= 0) {
        this._kill(p); continue;
      }

      const target = p.ownerIsPlayer ? cpu : player;
      if (!target.isKO()) {
        // If the target is crouching, the super projectile flies
        // overhead and misses entirely.  This is what the crouch
        // gesture exists for.
        if (target.crouching) continue;

        const gap = Math.hypot(
          target.root.position.x - p.mesh.position.x,
          1.2 - p.mesh.position.y
        );
        if (gap < (p.radius + 0.75)) {
          const dealt = target.takeHit(p.damage, p.mesh.position.x);
          if (dealt > 0) {
            this._burst(p.mesh.position.clone(), p.mesh.material.color);
            this.onDamageDealt(p.kind, dealt, p.ownerIsPlayer);
          }
          this._kill(p);
        }
      }
    }
  }

  _kill(p) {
    const i = this.alive.indexOf(p);
    if (i >= 0) this.alive.splice(i, 1);
    this.scene.remove(p.mesh);
    p.mesh.geometry.dispose(); p.mesh.material.dispose();
    p.glow.geometry.dispose(); p.glow.material.dispose();
  }

  _burst(pos, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.28, 18),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.position.copy(pos);
    ring.rotation.y = Math.PI / 2;
    this.scene.add(ring);

    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 300;
      if (t >= 1) {
        this.scene.remove(ring);
        ring.geometry.dispose(); ring.material.dispose();
        return;
      }
      ring.scale.setScalar(1 + t * 3.5);
      ring.material.opacity = 0.9 * (1 - t);
      requestAnimationFrame(tick);
    };
    tick();
  }
}
