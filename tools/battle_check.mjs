/* ============================================================
 * battle_check.mjs — proves the M0 TeamBattle core, headlessly,
 * BEFORE any rendering exists.
 *
 * What must hold:
 *   1. D2 stat-triangle pure functions (classify + counter edge)
 *   2. Determinism: same seed -> identical log hash AND final state;
 *      different seed -> different battle
 *   3. Speed initiative: engage order == speed order; in a ranged
 *      micro-duel the faster unit lands the first hit
 *   4. Gauges fill from damage BOTH ways, and full gauges actually
 *      convert into supers in real battles
 *   5. Waves spawn in order, only after the previous wave is cleared,
 *      after the inter-wave breather
 *   6. Malfunction: trips under stress, locks the unit (no attacks
 *      inside the window), respects the immunity spacing
 *   7. Battle shape: the canonical 2-uncommons-vs-3-waves battle runs
 *      >= 120 s (D6 point 3) and ends by KO, player winning
 *   8. Timeout path: stalemates resolve by survivor-weighted HP
 *   9. N-v-N: 1v1 and 4v3 both run clean
 *  10. KO retargeting: a unit that outlives its target finds the next
 *
 *   cd tools && node battle_check.mjs
 * ============================================================ */
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { TeamBattle } from '../src/game/TeamBattle.js';
import { classifyStats, counterMultiplier } from '../src/game/StatClass.js';
import { buildMeckaKnightScene } from '../src/game/MeckaKnightProcedural.js';
import { JAMMO_SKELETON } from '../src/game/meckaSkeletonData.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.log('  FAIL ' + m); fails++; } else console.log('  ok   ' + m); };

/* Synthetic clips, same pattern combat_check uses. */
const mkClip = (name, dur) => new THREE.AnimationClip(name, dur,
  JAMMO_SKELETON.slice(0, 8).map(b => new THREE.QuaternionKeyframeTrack(
    `${b.n}.quaternion`, new Float32Array([0, dur]),
    new Float32Array([...b.r, ...b.r]))));
const clips = {};
for (const n of ['idle', 'jab', 'cross', 'hook', 'uppercut', 'shield', 'dodge',
                 'dash', 'hit', 'ko', 'crouch', 'kick', 'roundhouse', 'victory'])
  clips[n] = mkClip(n, 1);
const assets = {
  clips,
  characters: {
    mecka: { procedural: true, meshScale: 2.0, groundLift: 0.85, autoFit: false,
             build: buildMeckaKnightScene },
  },
};

/* The canonical battle every shape number was tuned against. */
const canonical = (seed, overrides) => new TeamBattle({
  seed, assets, overrides,
  playerTeam: [{ set: 'blue', name: 'SENTINEL' }, { set: 'cobalt', name: 'COBALT' }],
  waves: [
    [{ set: 'scrap' }, { set: 'cadet' }],
    [{ set: 'moss' }, { set: 'ash' }],
    [{ set: 'red', name: 'MAGMA' }],
  ],
});

/* ============ 1. D2 stat-triangle pure functions ============ */
console.log('-- StatClass (D2, locked) --');
ok(classifyStats({ speed: 10, armor: 10, power: 30 }) === 'breaker', 'power-dominant -> breaker');
ok(classifyStats({ speed: 10, armor: 30, power: 10 }) === 'bulwark', 'armor-dominant -> bulwark');
ok(classifyStats({ speed: 30, armor: 10, power: 10 }) === 'striker', 'speed-dominant -> striker');
ok(classifyStats({ speed: 34, armor: 33, power: 33 }) === 'adaptive', 'no 40% share -> adaptive');
ok(classifyStats({ speed: 10, armor: 45, power: 45 }) === 'breaker', 'exact tie above bar -> power precedence');
ok(classifyStats({ speed: 20, armor: 41, power: 39 }, 0.40) === 'bulwark', 'threshold edge: 41% clears, 39% does not');
ok(Math.abs(counterMultiplier('breaker', 'bulwark', 0.22) - 1.22) < 1e-9, 'POWER breaks ARMOR (+22%)');
ok(Math.abs(counterMultiplier('bulwark', 'striker', 0.22) - 1.22) < 1e-9, 'ARMOR walls SPEED (+22%)');
ok(Math.abs(counterMultiplier('striker', 'breaker', 0.22) - 1.22) < 1e-9, 'SPEED outruns POWER (+22%)');
ok(Math.abs(counterMultiplier('bulwark', 'breaker', 0.22) - 0.78) < 1e-9, 'reverse edge is -22%');
ok(counterMultiplier('breaker', 'breaker', 0.22) === 1, 'mirror match is neutral');
ok(counterMultiplier('adaptive', 'breaker', 0.22) === 1 &&
   counterMultiplier('breaker', 'adaptive', 0.22) === 1, 'adaptive gives and takes no edge');
ok(CONFIG.team.counterTriangle.enabled === false, 'triangle damage edge ships OFF (glyph UI lands in M3)');

/* ============ 2. Determinism ============ */
console.log('-- Determinism --');
const rA = canonical(1).run();
const rB = canonical(1).run();
ok(rA.hash === rB.hash, `same seed -> identical log hash (${rA.hash})`);
ok(JSON.stringify(rA.units) === JSON.stringify(rB.units), 'same seed -> identical final unit state');
ok(rA.log.length === rB.log.length, `same seed -> identical event count (${rA.log.length})`);
const rC = canonical(2).run();
ok(rC.hash !== rA.hash, 'different seed -> different battle');

/* ============ 3. Speed initiative ============ */
console.log('-- Speed initiative --');
{
  const b = canonical(1);
  b.run();
  const engages = b.log.filter(e => e.type === 'engage').map(e => e.u);
  ok(engages.length === b.units.length &&
     new Set(engages).size === b.units.length,
     `every unit engages exactly once (${engages.length}/${b.units.length})`);
  // The strict contract: opening-field engages match the speed sort of
  // the opening field (later waves append their own ranked groups).
  const openField = b.units.filter(u => u.engageAt < 2).map(u => u.id);
  const openSorted = b.units.filter(u => openField.includes(u.id))
    .sort((x, y) => (y.speedMult - x.speedMult) || (x.id - y.id)).map(u => u.id);
  ok(JSON.stringify(engages.slice(0, openSorted.length)) === JSON.stringify(openSorted),
     `opening field engages fastest-first [${openSorted.join(',')}]`);
}
{
  // Micro-duel: both in punch range at spawn; only speed differs.
  const b = new TeamBattle({
    seed: 5, assets,
    playerTeam: [{ name: 'FAST', stats: { speed: 100, armor: 74, power: 67 }, x: -1.25 }],
    waves: [[{ name: 'SLOW', stats: { speed: 30, armor: 74, power: 67 }, x: 1.25 }]],
  });
  const fastId = b.units.find(u => u.name === 'FAST').id;
  while (b.state === 'running' && !b.log.some(e => e.type === 'hit')) b.step();
  const firstHit = b.log.find(e => e.type === 'hit');
  ok(firstHit && firstHit.a === fastId, 'faster unit lands the first hit of the duel');
}

/* ============ 4. Gauges fill both ways -> supers ============ */
console.log('-- Super gauge --');
{
  const b = canonical(3);
  const [u0, u1] = b.units;
  const G = CONFIG.team.gauge;
  b._onDamage(u0, u1, 10, false, 'jab');
  ok(Math.abs(u0.gauge - 10 * G.perDamageDealt) < 1e-9,
     `dealing 10 dmg fills the attacker +${10 * G.perDamageDealt}`);
  ok(Math.abs(u1.gauge - 10 * G.perDamageTaken) < 1e-9,
     `taking 10 dmg fills the victim +${10 * G.perDamageTaken} (comeback lever)`);
  ok(u1.gauge > u0.gauge, 'taking fills faster than dealing');
}
{
  const casts = rA.log.filter(e => e.type === 'supercast');
  const superHits = rA.log.filter(e => e.type === 'hit' && e.act === 'super' && e.dmg > 0);
  ok(casts.length >= 8, `full gauges convert to supers in real battles (${casts.length} casts)`);
  ok(superHits.length >= 4, `supers actually land (${superHits.length} clean super hits)`);
  const bothSides = new Set(casts.map(e => {
    const u = rA.units.find(x => x.id === e.u); return u && u.side;
  }));
  ok(bothSides.has('player') && bothSides.has('enemy'),
     'both sides reach full gauge (fills from both dealt AND taken)');
}

/* ============ 5. Waves ============ */
console.log('-- Waves --');
{
  const waves = rA.log.filter(e => e.type === 'wave');
  ok(waves.length === 3 && waves.map(w => w.i).join(',') === '0,1,2',
     'exactly 3 waves, in order');
  ok(rA.wavesSpawned === 3, 'result reports 3 waves spawned');
  // Every enemy of wave N is KO'd before wave N+1 spawns.
  const b = canonical(1); b.run();
  // Reconstruct wave membership from spawn order: enemies are pushed in
  // spawn order, so consecutive slices of `size` map back to their wave.
  const enemyUnits = b.units.filter(u => u.side === 'enemy');
  const waveEvents = b.log.filter(e => e.type === 'wave');
  const idsByWave = []; let cursor = 0;
  waveEvents.forEach((we, i) => { idsByWave[i] = enemyUnits.slice(cursor, cursor + we.size).map(u => u.id); cursor += we.size; });
  let cleared = true;
  for (let i = 1; i < waveEvents.length; i++) {
    const spawnT = waveEvents[i].t;
    for (const id of idsByWave[i - 1]) {
      const koEv = b.log.find(e => e.type === 'ko' && e.u === id);
      if (!koEv || koEv.t > spawnT) cleared = false;
    }
  }
  ok(cleared, 'wave N+1 spawns only after every wave-N enemy is KO');
  // The breather: spawn comes >= interWaveDelaySec after the clearing KO.
  const delay = CONFIG.team.interWaveDelaySec;
  let breathers = true;
  for (let i = 1; i < waveEvents.length; i++) {
    const lastKo = Math.max(...idsByWave[i - 1].map(id =>
      b.log.find(e => e.type === 'ko' && e.u === id).t));
    const gap = waveEvents[i].t - lastKo;
    if (gap < delay - 0.02 || gap > delay + 0.25) breathers = false;
  }
  ok(breathers, `inter-wave breather ~${delay}s holds`);
}

/* ============ 6. Malfunction (the mecha stun) ============ */
console.log('-- Malfunction --');
{
  const malfs = rA.log.filter(e => e.type === 'malfunction');
  ok(malfs.length >= 3, `malfunctions occur under sustained damage (${malfs.length} this battle)`);
  const dur = CONFIG.team.malfunction.duration;
  // A locked unit throws no attacks inside its window.
  let locked = true;
  for (const m of malfs) {
    const inside = rA.log.filter(e => e.type === 'hit' && e.a === m.u &&
      e.t > m.t + 1e-6 && e.t < m.t + dur - 1e-6);
    if (inside.length) locked = false;
  }
  ok(locked, 'malfunctioned units land no hits during the lockout');
  // Immunity spacing per unit.
  const gapMin = dur + CONFIG.team.malfunction.immunitySec;
  const byUnit = {};
  for (const m of malfs) (byUnit[m.u] ||= []).push(m.t);
  let spaced = true;
  for (const ts of Object.values(byUnit)) {
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] < gapMin - 0.05) spaced = false;
  }
  ok(spaced, `immunity window holds (>= ${gapMin}s between trips on one unit)`);
}
{
  // Forced trip: stress over threshold -> stun engages within one frame.
  const b = canonical(9);
  const victim = b.units[0];
  victim.stress = CONFIG.team.malfunction.threshold + 10;
  b.step();
  ok(victim.fighter.stunTime > 0, 'crossing the stress threshold stuns the fighter');
  ok(b.log.some(e => e.type === 'malfunction' && e.u === victim.id),
     'the trip is logged as a malfunction event');
  ok(victim.stress === 0, 'stress resets after the trip');
}

/* ============ 7. Battle shape (D6: >= 2 minutes) ============ */
console.log('-- Battle shape --');
ok(rA.winner === 'player' && rA.reason === 'ko',
   `canonical battle ends by KO, player wins (${rA.winner}/${rA.reason})`);
ok(rA.t >= 120, `canonical battle runs >= 120s (${rA.t}s)`);
ok(rA.t < CONFIG.team.timeoutSec, `...and ends well before the ${CONFIG.team.timeoutSec}s timeout`);
{
  // Shape holds across seeds, not just the tuned one.
  const durations = [7, 42].map(s => canonical(s).run());
  ok(durations.every(r => r.t >= 120 && r.reason === 'ko'),
     `shape holds across seeds (${durations.map(r => r.t + 's').join(', ')})`);
  // M2 pacing locks — tuned by measurement (8 seeds: 180-237s, all KO).
  ok(rA.t <= 260, `canonical stays clear of the timeout ceiling (${rA.t}s <= 260s)`);
  const hpm = rA.log.filter(e => e.type === 'hit' && e.dmg > 0).length / (rA.t / 60);
  ok(hpm >= 40 && hpm <= 100,
     `hit cadence in the tuned band (${hpm.toFixed(1)} hits/min in 40..100)`);
}

/* ============ 7b. The duel window (M2) ============ */
// 1v1 runs the tighter cycle.duel loop; measured 70-99s across 8 seeds
// with mixed winners (blue vs red is a fair matchup).
console.log('-- Duel window --');
{
  const duel = (seed) => new TeamBattle({
    seed, assets,
    playerTeam: [{ set: 'blue' }],
    waves: [[{ set: 'red' }]],
  }).run();
  const rs = [1, 2, 3].map(duel);
  ok(rs.every(r => r.reason === 'ko'), 'duels end by KO');
  ok(rs.every(r => r.t >= 45 && r.t <= 110),
     `duels land in the 45-110s window (${rs.map(r => r.t.toFixed(0) + 's').join(', ')})`);
}

/* ============ 7c. Ranged volleys (M2) ============ */
console.log('-- Ranged volleys --');
{
  const vols = rA.log.filter(e => e.type === 'volley');
  ok(vols.length >= 40, `anchors keep the air busy (${vols.length} volleys)`);
  ok(vols.every(v => v.kind === 'bolt' || v.kind === 'shell'),
     'every volley is a bolt or a shell');
  // Damage lands on the arrival tick: each volley's flight seconds are
  // honored — find a matching bolt/shell hit at ~t+fs for the openers.
  let timed = 0, checked = 0;
  for (const v of vols.slice(0, 12)) {
    checked++;
    const lands = rA.log.some(e => e.type === 'hit' &&
      e.a === v.a && e.act === v.kind &&
      Math.abs(e.t - (v.t + v.fs)) < 0.05);
    if (lands) timed++;
  }
  // Not every volley connects (target may die mid-flight), but most of
  // the opening dozen should land on schedule.
  ok(timed >= checked * 0.6,
     `volley damage lands on the arrival tick (${timed}/${checked} on schedule)`);
  const hitKinds = new Set(rA.log.filter(e => e.type === 'hit').map(e => e.act));
  ok(hitKinds.has('bolt'), 'bolt chip damage appears in the log');
}

/* ============ 8. Timeout path ============ */
console.log('-- Timeout --');
{
  const b = new TeamBattle({
    seed: 11, assets,
    overrides: { timeoutSec: 6, brain: { ...CONFIG.team.brain, aggression: 0 } },
    playerTeam: [{ set: 'cadet' }, { set: 'cadet' }],
    waves: [[{ set: 'cadet' }]],
  });
  const r = b.run();
  ok(r.reason === 'timeout', 'pacifist stalemate hits the timeout');
  ok(r.winner === 'player', 'timeout resolves by survivor-weighted HP (2 full > 1 full)');
}

/* ============ 9. N-v-N scale ============ */
console.log('-- N-v-N --');
{
  const duel = new TeamBattle({
    seed: 21, assets,
    playerTeam: [{ set: 'blue' }],
    waves: [[{ set: 'scrap' }]],
  }).run();
  ok(duel.winner === 'player' || duel.winner === 'enemy',
     `1v1 runs clean (${duel.winner} in ${duel.t}s)`);
  const brawl = new TeamBattle({
    seed: 22, assets,
    playerTeam: [{ set: 'blue' }, { set: 'red' }, { set: 'glacier' }, { set: 'umbra' }],
    waves: [[{ set: 'scrap' }, { set: 'cadet' }, { set: 'moss' }],
            [{ set: 'ash' }, { set: 'slag' }, { set: 'tide' }]],
  }).run();
  ok(brawl.winner === 'player' || brawl.winner === 'enemy',
     `4v3 x2 waves runs clean (${brawl.winner} in ${brawl.t}s, ${brawl.log.length} events)`);
  ok(brawl.units.length === 10, 'all 10 units spawned and tracked');
}

/* ============ 10. KO retargeting ============ */
console.log('-- Retargeting --');
{
  const b = new TeamBattle({
    seed: 31, assets,
    playerTeam: [{ set: 'shogun', name: 'BOSS' }],
    waves: [[{ set: 'scrap' }, { set: 'cadet' }]],
  });
  const r = b.run();
  const bossId = b.units.find(u => u.name === 'BOSS').id;
  const victims = new Set(r.log.filter(e => e.type === 'hit' && e.a === bossId && e.dmg > 0)
    .map(e => e.v));
  ok(r.winner === 'player' && victims.size === 2,
     `epic 1v2: outlives its target and hits both (${victims.size} distinct victims)`);
  const targets = r.log.filter(e => e.type === 'target' && e.a === bossId);
  ok(targets.length >= 2, `retarget events logged (${targets.length})`);
}

/* ============ misc guards ============ */
console.log('-- Guards --');
{
  let threw = false;
  try {
    new TeamBattle({ seed: 1, assets, playerTeam: [{ set: 'notaset' }], waves: [[{ set: 'scrap' }]] });
  } catch { threw = true; }
  ok(threw, 'unknown set key throws loudly');
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL PASS — the team-battle core is deterministic and holds the D6 shape');
process.exit(fails ? 1 : 0);
