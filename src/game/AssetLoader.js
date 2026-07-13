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
import { CONFIG } from '../config.js';
import { buildMeckaKnightScene } from './MeckaKnightProcedural.js';
import { buildCrouchClip } from './proceduralClips.js';

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
//
// IMPORTANT: meshScale here is a STARTING point.  For Knight we
// auto-correct after loading by measuring the actual world-space
// bbox of the cloned character and rescaling to match a target
// world height.  This avoids hand-tuning across rigs that were
// authored at radically different scales (Jammo's mesh-space body
// is ~1.57 units tall, Knight's is ~0.02 units tall).
const TARGET_WORLD_HEIGHT = 1.8;   // approximate Jammo height in world units after meshScale=2.0

const CHARACTERS = {
  // Jammo and Knight were retired 2026-07-12.  There is one playable
  // character now — the MECKA — and it is customised in the Hangar.
  mecka: {
    procedural: true,
    meshScale: 2.0,
    groundLift: 0.85,
    autoFit: false,
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

  // Build flat lists for parallel loading.  Procedural packs have
  // no GLB or textures to fetch — they're built in code below.
  const meshUrls = [];
  const texEntries = [];   // { charId, key, url }
  for (const [charId, pack] of Object.entries(CHARACTERS)) {
    if (pack.procedural) continue;
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
  // Procedural packs: build the scene graph in code.
  for (const [charId, pack] of Object.entries(CHARACTERS)) {
    if (!pack.procedural) continue;
    // Preview scene: build ONLY the player's set.  Building all 32 sets
    // creates ~3,150 meshes (~170 visible) and Three.js still walks every
    // node in updateMatrixWorld each frame — far too heavy for mobile.
    const lo = CONFIG.mecka.playerLoadout;
    const previewSets = [...new Set(Object.values(lo))];   // 1–5 sets, not 32
    const baseScene = buildMeckaKnightScene({ sets: previewSets, equip: lo });
    // Restore each set's branded eye/visor colours (the model defaults to
    // the viewer's white eye pick; in-game we want SPARTAN gold, MAGMA
    // ember, VOID magenta, etc).
    baseScene.userData.mecka.setEyeColor(null);
    characters[charId] = {
      baseScene,
      build: buildMeckaKnightScene,   // Fighter builds its own set per side
      meshScale: pack.meshScale,
      groundLift: pack.groundLift,
      textures: {},
      procedural: true,
    };
  }
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

  // ---- Procedural clips ----
  // Generated here, AFTER the loop above: that loop zeroes hips local x/z on
  // every LOADED clip, and local z is the vertical axis.  Run this earlier and
  // the crouch's hip drop would be stripped right back out.
  // Built from the idle pose so it carries a track for every bone idle drives —
  // an untracked bone reverts toward the T-pose bind pose under blending.
  if (clips.idle) {
    clips.crouch = buildCrouchClip(clips.idle);
  }

  // ---- Auto-fit pass for character packs that opted in ----
  // Some rigs (e.g. Knight) are authored at very different scales
  // than Jammo.  Rather than hand-tune meshScale / groundLift, we
  // measure the actual rendered bbox once and set these values to
  // produce a consistent fight-ready size with feet on the floor.
  // Uses dynamic import to grab cloneSkinned at runtime (avoids
  // pulling SkeletonUtils into the cold-load path for non-autofit
  // packs).
  const { clone: cloneSkinned } = await import('three/addons/utils/SkeletonUtils.js');
  for (const charId of Object.keys(CHARACTERS)) {
    if (!CHARACTERS[charId].autoFit) continue;
    const pack = characters[charId];
    // Make a sample clone with the placeholder meshScale (1.0).
    const sample = cloneSkinned(pack.baseScene);
    sample.scale.setScalar(1.0);
    sample.updateMatrixWorld(true);

    // Measure the world-space bbox of the sample.
    const box = new THREE.Box3().setFromObject(sample);
    if (!box.isEmpty()) {
      const measuredHeight = box.max.y - box.min.y;
      const scale = TARGET_WORLD_HEIGHT / measuredHeight;
      pack.meshScale = scale;
      // Place the feet on the floor: with the new scale, the bottom
      // of the bbox in mesh-local is at (box.min.y * scale) — to
      // make that land at world Y = 0, set groundLift = -box.min.y * scale.
      pack.groundLift = -box.min.y * scale;
      console.log(`[autoFit] ${charId}: measured h=${measuredHeight.toFixed(4)} → meshScale=${scale.toFixed(2)}, groundLift=${pack.groundLift.toFixed(2)}`);
    }
  }

  return {
    characters,        // { mecka: {...} }
    clips,             // shared animation clips, keyed by action name
  };
}
