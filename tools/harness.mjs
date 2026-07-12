import * as THREE from './three.module.js';
import { buildMeckaKnightScene } from './MeckaKnightProcedural.js';
import fs from 'fs';

const root = buildMeckaKnightScene({ equip: null });
root.updateMatrixWorld(true);
const api = root.userData.mecka;
api.setEyeColor(null);   // dump branded per-set eye colors, not the user default
if (!api) throw new Error('missing userData.mecka API');

let bonesN = 0;
root.traverse(o => { if (o.isBone) bonesN++; });

function shown(o) {
  for (let n = o; n; n = n.parent) if (n.visible === false) return false;
  return true;
}
function dump(tag) {
  let meshes = 0, tris = 0;
  const out = [];
  root.traverse(o => {
    if (!o.isMesh || !shown(o)) return;
    meshes++;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    const arr = [];
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      arr.push(+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4));
    }
    tris += p.count / 3;
    const m = o.material;
    const hasEmissive = m.emissive && m.emissive.getHex() !== 0;
    out.push({ c: '#' + m.color.getHexString(),
               e: hasEmissive ? '#' + m.emissive.getHexString() : null, v: arr });
  });
  fs.writeFileSync('tris_' + tag + '.json', JSON.stringify(out));
  return { meshes, tris };
}

const states = {
  none: () => api.equipAll(null),
  blue: () => api.equipAll('blue'),
  red:  () => api.equipAll('red'),
  spartan: () => api.equipAll('spartan'),
  shogun: () => api.equipAll('shogun'),
  glacier: () => api.equipAll('glacier'),
  hazard: () => api.equipAll('hazard'),
  nighthawk: () => api.equipAll('nighthawk'),
  void: () => api.equipAll('void'),
  verdant: () => api.equipAll('verdant'),
  copper: () => api.equipAll('copper'),
  cobalt: () => api.equipAll('cobalt'),
  umbra: () => api.equipAll('umbra'),
  signal: () => api.equipAll('signal'),
  viper: () => api.equipAll('viper'),
  bastion: () => api.equipAll('bastion'),
  corsair: () => api.equipAll('corsair'),
  tempest: () => api.equipAll('tempest'),
  warden: () => api.equipAll('warden'),
  seraph: () => api.equipAll('seraph'),
  kraken: () => api.equipAll('kraken'),
  titan: () => api.equipAll('titan'),
  wraith: () => api.equipAll('wraith'),
  phoenix: () => api.equipAll('phoenix'),
  monarch: () => api.equipAll('monarch'),
  scrap: () => api.equipAll('scrap'),
  cadet: () => api.equipAll('cadet'),
  dune: () => api.equipAll('dune'),
  moss: () => api.equipAll('moss'),
  ash: () => api.equipAll('ash'),
  slag: () => api.equipAll('slag'),
  tide: () => api.equipAll('tide'),
  brawler: () => api.equipAll('brawler'),
  mix:  () => { api.equipAll(null);
                api.equip('helmet', 'blue'); api.equip('torso', 'red');
                api.equip('armL', 'blue');   api.equip('legs', 'red'); },
};
const report = { bones: bonesN };
for (const [tag, fn] of Object.entries(states)) { fn(); report[tag] = dump(tag); }
const bb = new THREE.Box3().setFromObject(root);
report.size = bb.getSize(new THREE.Vector3()).toArray().map(n => +n.toFixed(3));
console.log(JSON.stringify(report));
