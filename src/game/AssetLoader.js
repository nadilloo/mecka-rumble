/* ============================================================
   AssetLoader.js
   One-stop loader for:
     - jammo.glb (base skinned character)
     - 8 animation GLBs (Idle / Punching / Shooting / DashForward /
       DodgeBackward / Shield / Dying / CelebratingVictory)
     - 3 textures (red & blue albedos, shared normal map)

   All animations come from Mixamo-rigged GLBs whose bone tracks
   already target `mixamorig:*` names that match jammo.glb's
   skeleton, so they can be applied directly via AnimationMixer
   without retargeting.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = './assets';

// Internal list: [action-name, file] — keys match Fighter state names.
const ANIMATIONS = [
  ['idle',    'Idle.glb'],
  ['punch',   'Punching.glb'],
  ['shoot',   'Shooting.glb'],
  ['dash',    'DashForward.glb'],
  ['dodge',   'DodgeBackward.glb'],
  ['shield',  'Shield.glb'],
  ['ko',      'Dying.glb'],
  ['victory', 'CelebratingVictory.glb'],
];

export async function loadAllAssets() {
  const gltfLoader = new GLTFLoader();
  const texLoader  = new THREE.TextureLoader();

  const load = (url) => new Promise((res, rej) =>
    gltfLoader.load(url, res, undefined, rej)
  );
  const loadTex = (url) => new Promise((res, rej) =>
    texLoader.load(url, res, undefined, rej)
  );

  // Kick everything off in parallel.
  const [
    baseGltf,
    albedoRed,
    albedoBlue,
    normalMap,
    ...animGltfs
  ] = await Promise.all([
    load(`${BASE}/jammo.glb`),
    loadTex(`${BASE}/textures/red_jammo_albedo_alpha.png`),
    loadTex(`${BASE}/textures/blue_jammo_albedo_alpha.png`),
    loadTex(`${BASE}/textures/jammo_normal.png`),
    ...ANIMATIONS.map(([, file]) => load(`${BASE}/animations/${file}`)),
  ]);

  // Three.js r160 uses SRGBColorSpace for diffuse, LinearSRGBColorSpace for data maps.
  albedoRed.colorSpace  = THREE.SRGBColorSpace;
  albedoBlue.colorSpace = THREE.SRGBColorSpace;
  albedoRed.flipY  = false;   // glTF convention — already baked to bottom-left UV
  albedoBlue.flipY = false;
  normalMap.flipY  = false;

  // Map each gltf's first animation clip to its name, and strip the
  // horizontal root motion baked into Mixamo clips.  Mixamo exports
  // translate the hip bone through world space (e.g. DashForward
  // slides the character forward), which conflicts with the game's
  // own position logic and makes fighters appear to teleport.
  //
  // IMPORTANT: Three.js's PropertyBinding.sanitizeNodeName() strips
  // the ':' from the bone name, so the track ends up named
  // 'mixamorigHips.position', not 'mixamorig:Hips.position'.  We
  // match with a regex that's tolerant of both forms.
  const HIPS_POS_RE = /(^|\.)mixamorig:?Hips\.position$/;
  const clips = {};
  ANIMATIONS.forEach(([name], i) => {
    const anims = animGltfs[i].animations;
    if (!anims || anims.length === 0) return;
    const clip = anims[0];
    for (const track of clip.tracks) {
      if (HIPS_POS_RE.test(track.name)) {
        // Zero only X (i) and Z (i+2) — the horizontal root motion
        // that makes the character translate forward in DashForward,
        // backward in DodgeBackward, etc.  KEEP Y (i+1) because the
        // hips bone translates the entire body upward at runtime;
        // zeroing it makes the character sink into the floor.
        for (let j = 0; j < track.values.length; j += 3) {
          track.values[j]     = 0;  // X
          track.values[j + 2] = 0;  // Z
        }
      }
    }
    clips[name] = clip;
  });

  return {
    baseScene: baseGltf.scene,   // the jammo armature + meshes
    clips,                       // { idle, punch, shoot, dash, dodge, shield, ko, victory }
    textures: {
      albedoRed,
      albedoBlue,
      normalMap,
    },
  };
}
