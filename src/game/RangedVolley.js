/* ============================================================
 * RangedVolley.js — M2: the visual layer for anchor-fired projectiles.
 *
 * Purely presentational.  TeamBattle schedules the volley, resolves the
 * damage on the arrival tick, and logs a 'volley' event at fire time;
 * BattleScreen forwards that event here with world positions and the
 * same flight seconds, so the impact flash lands on the frame the
 * damage does.  Nothing in here touches the sim.
 *
 * MECKA style rules apply: native geometries, flat shading, no text.
 * Side tint follows the CPU-tint direction (player blue, enemy crimson).
 * ============================================================ */
import * as THREE from 'three';

const TINT = {
  player: { core: 0x2d54d0, glow: 0x6a8cff },
  enemy:  { core: 0xa01f28, glow: 0xff6a5a },
};
const POOL = 10;                 // per kind+side; oldest recycled beyond this
const FLASH_SEC = 0.16;

function makeMats() {
  const m = {};
  for (const side of ['player', 'enemy']) {
    const t = TINT[side];
    m[side] = {
      body: new THREE.MeshStandardMaterial({
        color: t.core, emissive: t.glow, emissiveIntensity: 1.4,
        flatShading: true, roughness: 0.5, metalness: 0.2,
      }),
      flash: new THREE.MeshBasicMaterial({
        color: t.glow, transparent: true, opacity: 0.9,
      }),
    };
  }
  return m;
}

export class RangedVolley {
  constructor(scene) {
    this.scene = scene;
    this.mats = makeMats();
    this.live = [];
    this.flashes = [];
    this._free = { bolt_player: [], bolt_enemy: [], shell_player: [], shell_enemy: [] };
    this._freeFlash = [];
  }

  _build(kind, side) {
    const mat = this.mats[side].body;
    if (kind === 'bolt') {
      const g = new THREE.OctahedronGeometry(0.11, 0);
      g.scale(1, 1, 3.4);                       // an elongated dart
      return new THREE.Mesh(g, mat);
    }
    // shell: squat icosahedron with a short cone tail
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), mat));
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 5), mat);
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.22;
    grp.add(tail);
    return grp;
  }

  _acquire(kind, side) {
    const key = `${kind}_${side}`;
    let m = this._free[key].pop();
    if (!m) {
      const inUse = this.live.filter((p) => p.key === key);
      if (inUse.length >= POOL) {               // recycle the oldest
        const old = inUse[0];
        this.live.splice(this.live.indexOf(old), 1);
        m = old.mesh;
      } else {
        m = this._build(kind, side);
        this.scene.add(m);
      }
    }
    m.visible = true;
    return m;
  }

  /** @param {object} o  { from:Vector3, to:Vector3, kind, side, flightSec } */
  spawn(o) {
    const mesh = this._acquire(o.kind, o.side);
    mesh.position.copy(o.from);
    this.live.push({
      key: `${o.kind}_${o.side}`,
      kind: o.kind, side: o.side, mesh,
      from: o.from.clone(), to: o.to.clone(),
      t: 0, fs: Math.max(0.05, o.flightSec),
      apex: o.kind === 'shell'
        ? 2.5 + o.from.distanceTo(o.to) * 0.12   // longer lobs hang higher
        : 0,
    });
  }

  _impact(p) {
    let f = this._freeFlash.pop();
    if (!f) {
      if (this.flashes.length >= POOL) return;
      f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0),
        this.mats[p.side].flash.clone());
      this.scene.add(f);
    }
    f.material.color.setHex(TINT[p.side].glow);
    f.material.opacity = 0.9;
    f.visible = true;
    f.position.copy(p.to);
    f.scale.setScalar(0.4);
    this.flashes.push({ mesh: f, t: 0 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      const u = Math.min(1, p.t / p.fs);
      p.mesh.position.lerpVectors(p.from, p.to, u);
      if (p.kind === 'shell') {
        p.mesh.position.y += p.apex * 4 * u * (1 - u);   // ballistic arc
        p.mesh.rotation.x += dt * 9;                      // tumble
      } else {
        p.mesh.lookAt(p.to);                              // dart flies point-first
      }
      if (u >= 1) {
        this._impact(p);
        p.mesh.visible = false;
        this._free[p.key].push(p.mesh);
        this.live.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const u = Math.min(1, f.t / FLASH_SEC);
      f.mesh.scale.setScalar(0.4 + u * 1.1);
      f.mesh.material.opacity = 0.9 * (1 - u);
      if (u >= 1) {
        f.mesh.visible = false;
        this._freeFlash.push(f.mesh);
        this.flashes.splice(i, 1);
      }
    }
  }
}
