/* ============================================================
   AssetLoader.js
   Loads everything the game needs at boot:

   - Two character packs:
       jammo  (red & blue albedos, shared normal map, scale 2.0)
       knight (single dark-armor albedo, scale 5.5 — knight.glb's
               armature scale of 0.01 means it needs more
               compensation than Jammo's 0.28)
   - 13 animation GLBs (Idle, Jab, Hook, Cross, Uppercut, Punching,
     Shooting, Dash, Dodge, Hit, Shield, Dying, CelebratingVictory)

   All animation clips use Mixamo's standard `mixamorig:*` bone
   naming convention, so a single set of clips drives both the
   Jammo and Knight rigs.  Bones referenced by a clip but missing
   from a particular rig are simply ignored by AnimationMixer.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = './assets';

// Animation manifest: keys match Fighter state names.
const ANIMATIONS = [
  ['idle',     'Idle.glb'],
  ['jab',      'Jab.glb'],
  ['hook',     'Hook.glb'],
  ['cross',    'Cross.glb'],
  ['uppercut', 'Uppercut.glb'],
  ['punch',    'Punching.glb'],     // generic fallback
  ['shoot',    'Shooting.glb'],
  ['dash',     'Dash.glb'],
  ['dodge',    'Dodge.glb'],
  ['hit',      'Hit.glb'],
  ['shield',   'Shield.glb'],
  ['ko',       'Dying.glb'],
  ['victory',  'CelebratingVictory.glb'],
];

// Character pack manifest.  Each pack defines its mesh GLB and
// its texture(s).  Per-pack mesh-scale and ground-lift compensate
// for differences in the base armature scale and bind-pose origin.
const CHARACTERS = {
  jammo: {
    mesh: 'jammo.glb',
    textures: {
      albedoRed:  'red_jammo_albedo_alpha.png',
      albedoBlue: 'blue_jammo_albedo_alpha.png',
      normal:     'jammo_normal.png',
    },
    meshScale: 2.0,
    groundLift: 0.85,
  },
  knight: {
    mesh: 'knight.glb',
    textures: {
      // Knight has a single dark-armor texture for both player and
      // CPU usage.  No separate red/blue tints — the user picks
      // Knight or Jammo at character select.
      albedo: 'knight_albedo.png',
    },
    // Knight's combined armature scale (0.01) AND tiny mesh-space
    // geometry (~0.02 units tall) put it at ~1mm world height
    // without compensation.  To match Jammo's ~0.88-unit world
    // height we need a very large meshScale: 4400.  This isn't a
    // bug — the model was authored at a different scale.
    meshScale: 4400,
    // Knight's mesh pivot is at body center (y=0 in mesh-local is the
    // midpoint of the body), unlike Jammo whose pivot is at the feet.
    // groundLift here is half the world-space height (~0.44) so the
    // feet land on the floor instead of below it.
    groundLift: 0.44,
  },
};

export async function loadAllAssets() {
  const gltfLoader = new GLTFLoader();
  const texLoader  = new THREE.TextureLoader();

  const load = (url) => new Promise((res, rej) =>
    gltfLoader.load(url, res, undefined, rej)
  );
  const loadTex = (url) => new Promise((res, rej) =>
    texLoader.load(url, res, undefined, rej)
  );

  // Build flat lists for parallel loading.
  const meshUrls = [];
  const texEntries = [];   // { charId, key, url }
  for (const [charId, pack] of Object.entries(CHARACTERS)) {
    meshUrls.push({ charId, url: `${BASE}/${pack.mesh}` });
    for (const [key, file] of Object.entries(pack.textures)) {
      texEntries.push({ charId, key, url: `${BASE}/textures/${file}` });
    }
  }

  // Kick everything off in parallel.
  const [meshGltfs, texs, animGltfs] = await Promise.all([
    Promise.all(meshUrls.map(({ url }) => load(url))),
    Promise.all(texEntries.map(({ url }) => loadTex(url))),
    Promise.all(ANIMATIONS.map(([, file]) => load(`${BASE}/animations/${file}`))),
  ]);

  // Set color spaces on textures.  Albedos are sRGB; normal maps stay linear.
  texs.forEach((t, i) => {
    const key = texEntries[i].key;
    if (key.toLowerCase().includes('albedo')) t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;     // glTF convention
  });

  // Assemble per-character pack data.
  const characters = {};
  meshUrls.forEach(({ charId }, i) => {
    characters[charId] = {
      baseScene: meshGltfs[i].scene,
      meshScale: CHARACTERS[charId].meshScale,
      groundLift: CHARACTERS[charId].groundLift,
      textures: {},
    };
  });
  texs.forEach((t, i) => {
    const { charId, key } = texEntries[i];
    characters[charId].textures[key] = t;
  });

  // Strip root motion from each animation clip.  Mixamo exports
  // translate the character through world space via two paths:
  //   1. The Armature root node ("Armature", "Armature.001") — pure
  //      world-space movement which the game-logic layer handles.
  //   2. The Hips bone — adds body sway plus a vertical Y component
  //      that lifts the character to stand height in the bind pose.
  //      We zero X and Z but keep Y so the body lifts properly.
  //
  // Three.js's PropertyBinding.sanitizeNodeName() strips ':' from
  // bone names, so 'mixamorig:Hips.position' becomes
  // 'mixamorigHips.position'.  Regex below tolerates either form.
  const ARMATURE_POS_RE = /(^|\.)Armature(\.\d+)?\.position$/;
  const HIPS_POS_RE     = /(^|\.)mixamorig:?Hips\.position$/;
  const clips = {};
  ANIMATIONS.forEach(([name], i) => {
    const anims = animGltfs[i].animations;
    if (!anims || anims.length === 0) return;
    const clip = anims[0];
    for (const track of clip.tracks) {
      if (ARMATURE_POS_RE.test(track.name)) {
        for (let j = 0; j < track.values.length; j++) track.values[j] = 0;
      } else if (HIPS_POS_RE.test(track.name)) {
        for (let j = 0; j < track.values.length; j += 3) {
          track.values[j]     = 0;
          track.values[j + 2] = 0;
        }
      }
    }
    clips[name] = clip;
  });

  return {
    characters,        // { jammo: {...}, knight: {...} }
    clips,             // shared animation clips, keyed by action name
  };
}
