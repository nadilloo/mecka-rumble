import fs from 'fs';
const { ORDER, SOURCES } = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
const urls = {};
for (const key of ORDER) {
  if (key === 'app:main') continue;               // DOM-dependent; skip
  let code = SOURCES[key];
  for (const [spec, u] of Object.entries(urls)) {
    code = code.split(`from '${spec}'`).join(`from '${u}'`);
    code = code.split(`from "${spec}"`).join(`from "${u}"`);
  }
  urls[key] = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
}
const three = await import(urls['three']);
const gl = await import(urls['addons:GLTFLoader']);
const oc = await import(urls['addons:OrbitControls']);
const re = await import(urls['addons:RoomEnvironment']);
if (!gl.GLTFLoader || !oc.OrbitControls || !re.RoomEnvironment)
  throw new Error('addon export missing');
const mod = await import(urls['app:model']);
const root = mod.buildMeckaKnightScene({ equip: null });
const api = root.userData.mecka;
function countShown() {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o; p; p = p.parent) if (p.visible === false) return;
    n++;
  });
  return n;
}
const a = countShown();
api.equipAll('blue');  const b = countShown();
api.equipAll('red');   const r = countShown();
api.equip('torso', 'blue'); api.equip('helmet', null);
const mx = countShown();
if (!(b > a && r > a && mx > a && mx < r))
  throw new Error(`equip counts off: bare=${a} blue=${b} red=${r} mix=${mx}`);
console.log(`CHAIN_OK bare=${a} blue=${b} red=${r} mix=${mx} three_r${three.REVISION}`);
