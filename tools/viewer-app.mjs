import * as THREE from 'three';
import { OrbitControls } from 'addons:OrbitControls';
import { GLTFLoader } from 'addons:GLTFLoader';
import { RoomEnvironment } from 'addons:RoomEnvironment';
import { buildMeckaKnightScene, SET_CATALOG, TIER_COLORS } from 'app:model';

const ANIM_BASE = 'https://nadilloo.github.io/mecka-rumble/assets/animations/';
const CLIP_FILES = {
  Idle: 'Idle.glb', Jab: 'Jab.glb', Cross: 'Cross.glb', Hook: 'Hook.glb',
  Uppercut: 'Uppercut.glb', Dodge: 'Dodge.glb', Shield: 'Shield.glb',
  Hit: 'Hit.glb', Dash: 'Dash.glb', Victory: 'CelebratingVictory.glb',
};

const statusEl = document.getElementById('status');
const setStatus = (t) => { statusEl.textContent = t; };
const READY = 'T-pose · drag to orbit · pinch to zoom';

const stage = document.getElementById('stage');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x0b0d12);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 2.4, 7.8);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.85, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.5;
controls.maxDistance = 16;
controls.maxPolarAngle = 1.52;

const hemi = new THREE.HemisphereLight(0x9db2d8, 0x11141b, 0.55);
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.0);
scene.add(amb);
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(3.2, 6.5, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4; key.shadow.camera.right = 4;
key.shadow.camera.top = 6;   key.shadow.camera.bottom = -2;
key.shadow.camera.updateProjectionMatrix();
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7d96ff, 0.9);
rim.position.set(-4, 3.5, -4.5);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.0);
fill.position.set(-3.5, 1.5, 4.5);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(6, 48),
  new THREE.MeshStandardMaterial({ color: 0x151821, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Same framing as in-game (meshScale 2.0, groundLift 0.85). Start BARE, T-pose.
const model = buildMeckaKnightScene({ equip: null });
const api = model.userData.mecka;
model.scale.setScalar(2.0);
model.position.y = 0.85;
scene.add(model);

// Bind-pose snapshot so T-POSE reset is exact after any animation.
const bindPose = [];
model.traverse((o) => {
  if (o.isBone) bindPose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
});

// ---- Animations: dropdown, loaded from the deployed game (needs internet) ----
const mixer = new THREE.AnimationMixer(model);
const loader = new GLTFLoader();
const actions = new Map();

async function loadClip(name) {
  if (actions.has(name)) return actions.get(name);
  const res = await fetch(ANIM_BASE + CLIP_FILES[name]);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  const gltf = await new Promise((ok, err) => loader.parse(buf, '', ok, err));
  const clip = gltf.animations && gltf.animations[0];
  if (!clip) throw new Error('no clip in ' + CLIP_FILES[name]);
  const action = mixer.clipAction(clip);
  actions.set(name, action);
  return action;
}

function resetTPose() {
  mixer.stopAllAction();
  for (const [b, p, q, s] of bindPose) {
    b.position.copy(p); b.quaternion.copy(q); b.scale.copy(s);
  }
  setStatus(READY);
}

const animSel = document.getElementById('anim');
animSel.add(new Option('T-POSE (reset)', 'tpose'));
for (const name of Object.keys(CLIP_FILES)) animSel.add(new Option(name, name));
animSel.value = 'tpose';
animSel.addEventListener('change', async () => {
  const v = animSel.value;
  if (v === 'tpose') { resetTPose(); return; }
  try {
    setStatus('loading ' + v + '…');
    const action = await loadClip(v);
    mixer.stopAllAction();
    action.reset().play();
    setStatus('playing ' + v + ' · drag to orbit');
  } catch (e) {
    animSel.value = 'tpose';
    resetTPose();
    setStatus(v + ' needs internet (' + e.message + ')');
  }
});

// ---- Skeleton picker: flip through the 25 numbered frame designs ----
const skelSel = document.getElementById('skelsel');
for (let i = 0; i < api.skeletonCount; i++) skelSel.add(new Option('SKELETON #' + (i + 1), String(i)));
skelSel.value = String(api.getSkeleton());
function applySkel(i) {
  const n = ((i % api.skeletonCount) + api.skeletonCount) % api.skeletonCount;
  api.setSkeleton(n);
  skelSel.value = String(n);
}
skelSel.addEventListener('change', () => applySkel(parseInt(skelSel.value, 10)));
document.getElementById('skprev').addEventListener('click', () => applySkel(api.getSkeleton() - 1));
document.getElementById('sknext').addEventListener('click', () => applySkel(api.getSkeleton() + 1));

// ---- Eye color: skeleton eyes + every helmet's eyes ----
const eyeColorSel = document.getElementById('eyecolor');
for (const [label, hex] of api.eyeColors) eyeColorSel.add(new Option(label, hex));
eyeColorSel.value = '#c9d2dd';
const eyeLvlSel = document.getElementById('eyelvl');
for (let i = 0; i < api.eyeLevels; i++) eyeLvlSel.add(new Option('BRIGHT ' + (i + 1), String(i)));
eyeLvlSel.value = '0';
function applyEyeUI() {
  api.setEyeColor(eyeColorSel.value, parseInt(eyeLvlSel.value, 10));
}
eyeColorSel.addEventListener('change', applyEyeUI);
eyeLvlSel.addEventListener('change', applyEyeUI);

// ---- Skeleton highlight (NONE / RED / GREEN / BLUE at brightness 1) ----
const hlSel = document.getElementById('skelhl');
for (const [label, hex] of [['HIGHLIGHT: NONE', ''], ['HIGHLIGHT: RED', '#ff3a30'],
                            ['HIGHLIGHT: GREEN', '#58e06a'], ['HIGHLIGHT: BLUE', '#4d8aff']]) {
  hlSel.add(new Option(label, hex));
}
hlSel.addEventListener('change', () => api.setSkeletonHighlight(hlSel.value || null));

// ---- Lighting presets ----
const RIGS = {
  OMNI:    { key: [0.7, 0xffffff, [3.0, 4.0, 3.0], false], rim: [0.7, 0xffffff], fill: 0.7, hemi: 0.8, amb: 0.85, exp: 1.0 },
  DEFAULT: { key: [2.4, 0xffffff, [3.2, 6.5, 4.2], true], rim: [0.9, 0x7d96ff], hemi: 0.55, amb: 0.0, exp: 1.0 },
  FLAT:    { key: [0.0, 0xffffff, [3.2, 6.5, 4.2], false], rim: [0.0, 0x7d96ff], hemi: 1.15, amb: 0.9, exp: 1.0 },
  STUDIO:  { key: [3.4, 0xffffff, [4.0, 7.0, 5.0], true], rim: [1.6, 0xbcd0ff], hemi: 0.35, amb: 0.15, exp: 1.05 },
  WARM:    { key: [2.8, 0xffc07a, [5.0, 3.4, 4.0], true], rim: [0.8, 0x5d76ff], hemi: 0.30, amb: 0.08, exp: 1.0 },
  NIGHT:   { key: [0.55, 0x9db2ff, [2.0, 5.0, 3.0], true], rim: [1.5, 0x5d76ff], hemi: 0.12, amb: 0.02, exp: 0.95 },
  TOP:     { key: [3.2, 0xffffff, [0.0, 9.0, 0.6], true], rim: [0.35, 0x7d96ff], hemi: 0.25, amb: 0.05, exp: 1.0 },
};
const lightSel = document.getElementById('lightsel');
for (const name of ['DEFAULT', 'FLAT', 'OMNI', 'STUDIO', 'WARM', 'NIGHT', 'TOP']) lightSel.add(new Option(name, name));
lightSel.addEventListener('change', () => {
  const R = RIGS[lightSel.value];
  key.intensity = R.key[0]; key.color.set(R.key[1]);
  key.position.set(...R.key[2]); key.castShadow = R.key[3];
  rim.intensity = R.rim[0]; rim.color.set(R.rim[1]);
  hemi.intensity = R.hemi; amb.intensity = R.amb;
  fill.intensity = R.fill || 0;
  renderer.toneMappingExposure = R.exp;
});

// ---- Sets (tier-grouped, rarity dots) + per-slot pickers ----
const tierHex = (t) => '#' + TIER_COLORS[t].toString(16).padStart(6, '0');
const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic'];
const setsEl = document.getElementById('sets');
const setBtns = new Map();

const bareBtn = document.createElement('button');
bareBtn.id = 'bare';
bareBtn.textContent = 'BARE SKELETON';
bareBtn.addEventListener('click', () => { api.equipAll(null); syncUI(); });
setsEl.appendChild(bareBtn);
setBtns.set(null, bareBtn);

for (const tier of TIER_ORDER) {
  const group = SET_CATALOG.filter((s) => s.tier === tier);
  if (!group.length) continue;
  const th = document.createElement('div');
  th.className = 'tierhead';
  th.textContent = tier.toUpperCase();
  setsEl.appendChild(th);
  for (const s of group) {
    const b = document.createElement('button');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = tierHex(tier);
    b.appendChild(dot);
    b.appendChild(document.createTextNode(s.label));
    b.addEventListener('click', () => { api.equipAll(s.key); syncUI(); });
    setsEl.appendChild(b);
    setBtns.set(s.key, b);
  }
}

const SLOT_DEFS = [
  ['helmet', 'Helm'], ['torso', 'Torso'],
  ['armL', 'L·Arm'], ['armR', 'R·Arm'], ['legs', 'Legs'],
];
const slotsEl = document.getElementById('slots');
const slotSels = new Map();
for (const [slot, label] of SLOT_DEFS) {
  const row = document.createElement('div'); row.className = 'srow';
  const lab = document.createElement('span'); lab.className = 'slabel'; lab.textContent = label;
  const sel = document.createElement('select');
  sel.add(new Option('BARE', ''));
  for (const tier of TIER_ORDER) {
    const group = SET_CATALOG.filter((s) => s.tier === tier);
    if (!group.length) continue;
    const og = document.createElement('optgroup');
    og.label = tier.toUpperCase();
    for (const s of group) og.appendChild(new Option(s.label, s.key));
    sel.appendChild(og);
  }
  sel.addEventListener('change', () => { api.equip(slot, sel.value || null); syncUI(); });
  row.appendChild(lab); row.appendChild(sel);
  slotsEl.appendChild(row);
  slotSels.set(slot, sel);
}

function syncUI() {
  const st = api.getState();
  for (const [slot, sel] of slotSels) sel.value = st[slot] || '';
  const vals = Object.values(st);
  const uniform = vals.every((v) => v === vals[0]) ? vals[0] : undefined;
  for (const [k, b] of setBtns) {
    b.classList.toggle('active', uniform !== undefined && k === uniform);
  }
}
syncUI();

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  mixer.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
});
setStatus(READY);
