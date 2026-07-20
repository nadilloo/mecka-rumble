/* ============================================================
 * TeamBattle.js — M0: the headless team-battle core (RPG pivot).
 *
 * Wraps the existing 1v1 Fighter sim in an N-v-N scheduler.  Nothing in
 * here renders; nothing in here reads the clock or Math.random.  Feed it
 * a seed and the same battle replays frame-for-frame — that property is
 * what tools/battle_check.mjs proves, and it's what later milestones
 * (sweep/instant-resolve, ghost teams) are built on.
 *
 * What the wrapper owns (vs what the Fighter sim owns):
 *   - engagement: every unit is assigned ONE living opponent; the pair
 *     then runs the shipped 1v1 sim (frame data, stuns, pushback,
 *     corners, buffering) completely unchanged.
 *   - speed initiative: units enter the fight in speed order, decide
 *     faster, and resolve earlier within a frame.
 *   - the super gauge: fills from damage dealt AND taken; full = the
 *     auto brain fires the super (resolved as a direct 'super' strike).
 *   - waves: enemy groups spawn on clear, players persist (attrition).
 *   - malfunction: the mecha stun — damage builds hidden stress, the
 *     threshold trips a lockout, immunity prevents chain-tripping.
 *   - the event log: every meaningful beat, hashable for determinism.
 *
 * Battle shape target (D6): >= 2 minutes across 3-4 waves.  The knobs
 * live in CONFIG.team and were tuned by measurement in battle_check.
 *
 * Rendering note for M1: dead units stop being update()d, so their KO
 * clip freezes on frame one headlessly.  The battle screen should keep
 * ticking anim on dead units (visual-only) — sim state won't change.
 * ============================================================ */
import { CONFIG } from '../config.js';
import { clamp, mulberry32 } from '../utils/math.js';
import { Fighter } from './Fighter.js';
import { SET_CATALOG } from './MeckaKnightProcedural.js';
import { buildCatalog, indexParts, totalStats, SLOT_IDS } from './HangarCatalog.js';
import { classifyStats, counterMultiplier } from './StatClass.js';

const FRAME = 1 / 60;
const F = CONFIG.fighter;

/* Spawn columns per slot, mirrored by side (player negative x). */
const SLOT_X = [3.5, 5.0, 6.5, 8.0];

/* ---- Catalog singleton: 32 sets -> 160 parts, indexed once. ---- */
let _cat = null;
function catalog() {
  if (!_cat) {
    const c = buildCatalog(SET_CATALOG);
    _cat = { ...c, index: indexParts(c.parts) };
  }
  return _cat;
}
const SET_KEYS = new Set(SET_CATALOG.map((s) => s.key));

function uniformLoadout(setKey) {
  const out = {};
  for (const slot of SLOT_IDS) out[slot] = setKey;
  return out;
}

/* Shallow config merge, one level of nested objects deep — enough for
 * battle_check to override single knobs without cloning the world. */
function mergeCfg(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? { ...base[k], ...v }
      : v;
  }
  return out;
}

/* FNV-1a over the serialized log — cheap, dependency-free fingerprint. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export class TeamBattle {
  /**
   * @param {object} opts
   *   seed        integer — drives every brain decision
   *   assets      same shape the Fighter takes (clips + characters)
   *   playerTeam  array (1..maxSlots) of unit specs
   *   waves       array of arrays of unit specs (1..maxSlots each)
   *   overrides   optional partial CONFIG.team for tests/tuning
   *
   * Unit spec: { name?, set?, loadout?, stats?, hpMax?, x? }
   *   loadout ({slot:setKey}) wins over set (uniform); stats skips the
   *   catalog entirely (tests).  x pins the spawn column.
   */
  constructor(opts) {
    this.cfg = mergeCfg(CONFIG.team, opts.overrides);
    this.assets = opts.assets;
    this.rng = mulberry32((opts.seed ?? 1) >>> 0);
    this.seed = (opts.seed ?? 1) >>> 0;

    this.t = 0;
    this.state = 'running';
    this.winner = null;
    this.reason = null;
    this.log = [];
    this.units = [];
    this._nextId = 0;
    this._order = [];            // initiative order (speed desc, id asc)
    this._interWaveTimer = null;

    const pTeam = (opts.playerTeam || []).slice(0, this.cfg.maxSlots);
    this.waves = (opts.waves || []).map((w) => w.slice(0, this.cfg.maxSlots));
    if (!pTeam.length) throw new Error('TeamBattle: empty player team');
    if (!this.waves.length) throw new Error('TeamBattle: no waves');
    this._nextWave = 0;

    for (let i = 0; i < pTeam.length; i++) this._spawnUnit(pTeam[i], 'player', i);
    this._spawnWave();           // wave 0 is on the field at t=0

    // Initiative stagger for the OPENING field: players and wave 0 rank
    // together, so the fastest unit in the battle engages first — that
    // is the assertable speed-initiative contract.
    const openers = this.units.slice().sort(
      (a, b) => (b.speedMult - a.speedMult) || (a.id - b.id));
    openers.forEach((u, rank) => {
      u.engageAt = rank * this.cfg.engageStaggerSec;
    });
  }

  /* ---------------- Spawning ---------------- */

  _resolveSpec(spec) {
    const setKey = spec.set || 'cadet';
    if (!spec.stats && !SET_KEYS.has(setKey)) {
      throw new Error(`TeamBattle: unknown set '${setKey}'`);
    }
    if (spec.loadout) {
      for (const k of Object.values(spec.loadout)) {
        if (!SET_KEYS.has(k)) throw new Error(`TeamBattle: unknown set '${k}'`);
      }
    }
    const loadout = spec.loadout ? { ...spec.loadout } : uniformLoadout(setKey);
    const statline = spec.stats
      ? { ...spec.stats }
      : totalStats(loadout, catalog().index);
    return { loadout, statline };
  }

  _spawnUnit(spec, side, slot, engageBase = null) {
    const { loadout, statline } = this._resolveSpec(spec);
    const ref = this.cfg.refStats;
    const unit = {
      id: this._nextId++,
      name: spec.name || (spec.set ? spec.set.toUpperCase() : `unit${this._nextId}`),
      side, slot, statline, loadout,
      klass: classifyStats(statline, this.cfg.counterTriangle.dominance),
      powerBase: statline.power / ref.power,
      speedMult: Math.max(0.05, statline.speed / ref.speed),
      hpMax: spec.hpMax || Math.round(this.cfg.baseHp + statline.armor * this.cfg.hpPerArmor),
      gauge: 0,
      stress: 0,
      immunityUntil: 0,
      dead: false,
      engaged: false,
      engageAt: engageBase ?? this.t,
      target: null,
      decisionIn: 0,
      blockUntil: 0,
      fighter: null,
    };
    const sideSign = side === 'player' ? -1 : 1;
    const startX = spec.x ?? sideSign * SLOT_X[Math.min(slot, SLOT_X.length - 1)];
    unit.fighter = new Fighter({
      assets: this.assets,
      character: 'mecka',
      isPlayer: side === 'player',
      side: sideSign,
      startX,
      meckaEquip: loadout,
      hpMax: unit.hpMax,
      stats: {
        power: unit.powerBase,                          // counter fold on retarget
        armor: ref.armor / Math.max(1, statline.armor), // lower = tougher
        speed: unit.speedMult,
      },
      onShoot: (fighter, kind) => this._resolveShot(unit, kind),
      onDamageDealt: (act, dealt, blocked) =>
        this._onDamage(unit, unit.target, dealt, blocked, act),
    });
    this.units.push(unit);
    this._order = this.units.slice().sort(
      (a, b) => (b.speedMult - a.speedMult) || (a.id - b.id));
    return unit;
  }

  _spawnWave() {
    const idx = this._nextWave;
    const specs = this.waves[idx];
    this._nextWave++;
    const spawned = [];
    for (let i = 0; i < specs.length; i++) {
      spawned.push(this._spawnUnit(specs[i], 'enemy', i));
    }
    // Later waves rank their own entry stagger among themselves.
    const ranked = spawned.slice().sort(
      (a, b) => (b.speedMult - a.speedMult) || (a.id - b.id));
    ranked.forEach((u, rank) => {
      u.engageAt = this.t + rank * this.cfg.engageStaggerSec;
    });
    this._log('wave', { i: idx, size: specs.length });
  }

  /* ---------------- Damage / gauge / stress plumbing ---------------- */

  _onDamage(attacker, victim, dealt, blocked, act) {
    if (!victim) return;
    const G = this.cfg.gauge;
    if (dealt > 0) {
      attacker.gauge = clamp(attacker.gauge + dealt * G.perDamageDealt, 0, G.max);
      victim.gauge = clamp(victim.gauge + dealt * G.perDamageTaken, 0, G.max);
      victim.stress += dealt * this.cfg.malfunction.stressPerDamage;
      if (act === 'super') victim.stress += this.cfg.super.malfStress;
    }
    this._log('hit', {
      a: attacker.id, v: victim.id, act,
      dmg: Math.round(dealt * 100) / 100, blocked: !!blocked,
    });
  }

  _resolveShot(unit, kind) {
    if (kind !== 'super') return;               // brain never fires 'shoot'
    const tgt = unit.target;
    if (!tgt || tgt.fighter.isKO()) {
      this._log('superwhiff', { a: unit.id });
      return;
    }
    // Direct heavy strike through takeHit so 'super' frame data applies
    // (hitStun 28, pushback 1.6).  stats.power already carries the
    // counter fold when the triangle is enabled.
    const dmg = this.cfg.super.damage * unit.fighter.stats.power;
    const res = tgt.fighter.takeHit(
      dmg, unit.fighter.root.position.x, false, 'super');
    if (res.dealt > 0 || res.blocked) {
      unit.fighter.hitStopTime = Math.max(
        unit.fighter.hitStopTime, F.hitStopFramesHeavy * FRAME);
    }
    this._onDamage(unit, tgt, res.dealt || 0, !!res.blocked, 'super');
  }

  /* ---------------- Targeting ---------------- */

  _retarget(unit) {
    const foes = this.units.filter(
      (u) => u.side !== unit.side && !u.fighter.isKO());
    if (!foes.length) {
      unit.target = null;
      unit.fighter.stats.power = unit.powerBase;
      return;
    }
    const myX = unit.fighter.root.position.x;
    let best = null, bestD = Infinity;
    for (const f of foes) {
      const d = Math.abs(f.fighter.root.position.x - myX);
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && f.id < (best?.id ?? Infinity))) {
        best = f; bestD = d;
      }
    }
    if (best !== unit.target) {
      unit.target = best;
      // D2 seam: the counter edge folds into outgoing power per
      // engagement.  Flag off -> multiplier 1 -> powerBase unchanged.
      const tri = this.cfg.counterTriangle;
      const mult = tri.enabled
        ? counterMultiplier(unit.klass, best.klass, tri.edge) : 1;
      unit.fighter.stats.power = unit.powerBase * mult;
      this._log('target', { a: unit.id, v: best.id });
    }
  }

  /* ---------------- The auto brain ---------------- */

  _brainTick(unit) {
    const f = unit.fighter;
    const B = this.cfg.brain;
    if (this.t < unit.engageAt) return;
    if (!unit.engaged) {
      unit.engaged = true;
      this._log('engage', { u: unit.id });
    }

    // Timed block release.
    if (unit.blockUntil && this.t >= unit.blockUntil) {
      f.setShielding(false);
      unit.blockUntil = 0;
    }

    const tgt = unit.target;

    // Continuous approach: steer to a standoff just inside punch range.
    // The pair side-lock (minSeparation) is the real stopper.
    if (tgt && f.stunTime <= 0 && f.hitstunTime <= 0 && f.blockstunTime <= 0) {
      const tx = tgt.fighter.root.position.x;
      const myx = f.root.position.x;
      const toward = Math.sign(tx - myx) || 1;
      f.setMoveTarget(tx - toward * F.punchRange * B.standoffFrac);
    }

    unit.decisionIn -= FRAME;
    if (unit.decisionIn > 0) return;
    unit.decisionIn = (B.baseInterval + this.rng() * B.jitter) / unit.speedMult;

    if (!tgt || !f.canAct(0)) return;

    // Full gauge -> the super, before anything else (Auto heuristic).
    if (unit.gauge >= this.cfg.gauge.max) {
      if (f.superShot()) {
        unit.gauge = 0;
        this._log('supercast', { u: unit.id });
        return;
      }
    }

    const gap = Math.abs(tgt.fighter.root.position.x - f.root.position.x);
    if (gap <= F.punchRange) {
      const r = this.rng();
      if (r < B.aggression) {
        const r2 = this.rng();
        if (r2 < 0.44) f.jab();
        else if (r2 < 0.74) f.cross();
        else if (r2 < 0.92) f.hook();
        else f.uppercut();
      } else {
        const r3 = this.rng();
        if (r3 < B.blockChance) {
          f.setShielding(true);
          unit.blockUntil = this.t + B.blockDur;
        } else if (f.hpFrac() < B.lowHpFrac && r3 < B.blockChance + B.dodgeLowHp) {
          f.dodgeBack(tgt.fighter.root.position.x);
        }
        // else: hold ground this beat.
      }
    } else if (gap > F.punchRange + 2.5 && this.rng() < 0.5) {
      f.dashForward(tgt.fighter.root.position.x);
    }
  }

  /* ---------------- Frame step ---------------- */

  step() {
    if (this.state !== 'running') return;
    this.t += FRAME;

    // ---- End / wave conditions (previous frame's outcomes) ----
    const livingP = this.units.filter((u) => u.side === 'player' && !u.fighter.isKO());
    const livingE = this.units.filter((u) => u.side === 'enemy' && !u.fighter.isKO());
    if (!livingP.length) return this._end('enemy', 'ko');
    if (!livingE.length) {
      if (this._nextWave < this.waves.length) {
        if (this._interWaveTimer === null) {
          this._interWaveTimer = this.cfg.interWaveDelaySec;
        }
        this._interWaveTimer -= FRAME;
        if (this._interWaveTimer <= 0) {
          this._interWaveTimer = null;
          this._spawnWave();
        }
      } else {
        return this._end('player', 'ko');
      }
    }
    if (this.t >= this.cfg.timeoutSec) {
      const score = (side) => this.units
        .filter((u) => u.side === side)
        .reduce((s, u) => s + u.fighter.hpFrac(), 0);
      // Survivor-weighted hpFrac sum; ties go to the enemy (defender).
      return this._end(score('player') > score('enemy') ? 'player' : 'enemy',
        'timeout');
    }

    const M = this.cfg.malfunction;
    for (const u of this._order) {
      if (u.dead) continue;
      const f = u.fighter;

      // Stress decays; crossing the threshold trips a malfunction.
      u.stress = Math.max(0, u.stress - M.decayPerSec * FRAME);
      if (u.stress >= M.threshold && this.t >= u.immunityUntil && !f.isKO()) {
        f.setShielding(false);
        f.stun(M.duration);
        // stun() nulls the action, which would strand a super wind-up's
        // _pendingShot forever (gauge spent, shot never fires).  The
        // malfunction EATS the super instead — deterministic and cruel.
        f._pendingShot = null;
        f.setMoveTarget(f.root.position.x);
        u.stress = 0;
        u.blockUntil = 0;
        u.immunityUntil = this.t + M.duration + M.immunitySec;
        this._log('malfunction', { u: u.id });
      }

      // Stunned units don't keep walking to a stale move target.
      if (f.stunTime > 0 || f.hitstunTime > 0 || f.blockstunTime > 0) {
        f.setMoveTarget(f.root.position.x);
      }
    }

    // ---- Retarget, decide, resolve — all in initiative order ----
    for (const u of this._order) {
      if (u.dead) continue;
      if (!u.target || u.target.fighter.isKO()) this._retarget(u);
    }
    for (const u of this._order) {
      if (u.dead) continue;
      this._brainTick(u);
    }
    for (const u of this._order) {
      if (u.dead) continue;
      const opp = u.target || u;         // no foes left mid-wave: self-idle
      u.fighter.update(FRAME, opp === u ? u.fighter : opp.fighter);
    }

    // ---- KO sweep ----
    for (const u of this.units) {
      if (!u.dead && u.fighter.isKO()) {
        u.dead = true;
        u.fighter.setShielding(false);
        u.fighter.setMoveTarget(u.fighter.root.position.x);
        this._log('ko', { u: u.id, side: u.side });
      }
    }
  }

  run() {
    const cap = Math.ceil((this.cfg.timeoutSec + 5) / FRAME);
    let n = 0;
    while (this.state === 'running' && n < cap) { this.step(); n++; }
    if (this.state === 'running') this._end('enemy', 'stepcap');
    return this.result();
  }

  /* ---------------- Bookkeeping ---------------- */

  _end(winner, reason) {
    if (this.state !== 'running') return;
    this.state = 'ended';
    this.winner = winner;
    this.reason = reason;
    this._log('end', { winner, reason });
  }

  _log(type, fields) {
    this.log.push({ t: Math.round(this.t * 1000) / 1000, type, ...fields });
  }

  logHash() {
    return fnv1a(this.log.map((e) => JSON.stringify(e)).join('\n'));
  }

  snapshot() {
    return this.units.map((u) => ({
      id: u.id, name: u.name, side: u.side, klass: u.klass,
      hp: Math.round(u.fighter.hp * 100) / 100, hpMax: u.hpMax,
      gauge: Math.round(u.gauge * 10) / 10,
      x: Math.round(u.fighter.root.position.x * 100) / 100,
      dead: u.dead,
    }));
  }

  result() {
    return {
      winner: this.winner, reason: this.reason,
      t: Math.round(this.t * 100) / 100,
      wavesSpawned: this._nextWave,
      seed: this.seed,
      hash: this.logHash(),
      log: this.log,
      units: this.snapshot(),
    };
  }
}
