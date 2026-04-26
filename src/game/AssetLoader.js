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
// New per-action animations replace the fallbacks for jab, hook,
// uppercut, dash, dodge, hit, plus a fresh `cross` move.  The
// `punch` slot is kept as a generic fallback for anything we
// don't have a dedicated clip for yet (sweep, counter).
const ANIMATIONS = [
  ['idle',     'Idle.glb'],
  ['jab',      'Jab.glb'],
  ['hook',     'Hook.glb'],
  ['cross',    'Cross.glb'],
  ['uppercut', 'Uppercut.glb'],
  ['punch',    'Punching.glb'],   // generic fallback
  ['shoot',    'Shooting.glb'],
  ['dash',     'Dash.glb'],
  ['dodge',    'Dodge.glb'],
  ['hit',      'Hit.glb'],
  ['shield',   'Shield.glb'],
  ['ko',       'Dying.glb'],
  ['victory',  'CelebratingVictory.glb'],
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
  // Strip root motion from animation clips.  Mixamo exports translate
  // the character through world space via TWO separate places:
  //   1. The Armature root node (e.g. "Armature.001") — moves the
  //      entire skeleton in world space.  This is the main culprit
  //      for the "teleport" effect when Dodge / Dash play.
  //   2. The Hips bone — adds extra body sway and (importantly) a
  //      vertical Y component that is what lifts the character to
  //      stand height in the bind pose.  We must KEEP the hips Y so
  //      the character doesn't sink into the floor, but we should
  //      zero the X/Z so the body doesn't drift around.
  //
  // We also need to be tolerant of name sanitization: Three.js's
  // PropertyBinding.sanitizeNodeName strips ':' from bone names, so
  // 'mixamorig:Hips' becomes 'mixamorigHips' in the track name.
  const ARMATURE_POS_RE = /(^|\.)Armature(\.\d+)?\.position$/;
  const HIPS_POS_RE     = /(^|\.)mixamorig:?Hips\.position$/;
  const clips = {};
  ANIMATIONS.forEach(([name], i) => {
    const anims = animGltfs[i].animations;
    if (!anims || anims.length === 0) return;
    const clip = anims[0];
    for (const track of clip.tracks) {
      if (ARMATURE_POS_RE.test(track.name)) {
        // Zero ALL components of the armature translation — this is
        // pure world-space movement that the game logic handles.
        for (let j = 0; j < track.values.length; j++) track.values[j] = 0;
      } else if (HIPS_POS_RE.test(track.name)) {
        // Zero only X (j) and Z (j+2).  Keep Y so the body lifts.
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
