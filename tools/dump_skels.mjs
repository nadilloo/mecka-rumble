import { buildMeckaKnightScene } from './MeckaKnightProcedural.js';
import * as THREE from './three.module.js';
import { writeFileSync } from 'fs';
const root = buildMeckaKnightScene({ equip: null });
const api = root.userData.mecka;
api.setEyeColor(null);
const v = new THREE.Vector3();
for (let i = 0; i < api.skeletonCount; i++) {
  api.setSkeleton(i);
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pos = g.attributes.position;
    const arr = new Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      arr[k * 3] = +v.x.toFixed(4); arr[k * 3 + 1] = +v.y.toFixed(4); arr[k * 3 + 2] = +v.z.toFixed(4);
    }
    const mat = o.material;
    const e = (mat.emissive && mat.emissiveIntensity > 0.4) ? '#' + mat.emissive.getHexString() : '';
    out.push({ c: '#' + mat.color.getHexString(), e, v: arr });
  });
  writeFileSync(`tris_sk${i + 1}.json`, JSON.stringify(out));
}
console.log('dumped 25 skeleton states');
