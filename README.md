# Mecka Rumble — Prototype

A portrait-oriented, swipe-driven 1v1 3D fighting game prototype built with
plain HTML, CSS, ES modules, and Three.js. Top 60% of the screen is the 3D
combat viewport; bottom 40% is a dedicated gesture input panel.

---

## How to run

There is no build step. You just need any static web server because ES module
imports require `http(s)://` URLs, not `file://`.

Pick whichever one-liner you have handy from the project folder:

```bash
# Python 3
python3 -m http.server 8080

# Node (no install)
npx serve -p 8080

# PHP
php -S localhost:8080
```

Then open `http://localhost:8080/` on your phone or in a desktop browser
(DevTools → toggle device toolbar → iPhone/Pixel portrait works great).

All code loads from the CDN-hosted Three.js module map defined in
`index.html`, so no `npm install` is required.

To deploy, just upload the whole folder to any static host
(Netlify drop, Vercel, GitHub Pages, Cloudflare Pages, S3, etc.).

---

## Controls (in the bottom panel)

| Gesture              | Action                                        |
|----------------------|-----------------------------------------------|
| Tap                  | Shoot projectile                              |
| Tap & Hold           | Super Shot (bigger, costlier)                 |
| Swipe →  (forward)   | Punch if close, Dash if far                   |
| Swipe ← (back)       | Dodge / backstep                              |
| Drag Down (hold)     | Shield while held (drains battery)            |

*Forward direction auto-flips if the player ends up on the right side.*

Keyboard (desktop):
- **P** — pause
- **R** — reset the round

---

## File layout

```
mecka-rumble/
├── index.html
├── styles.css
└── src/
    ├── main.js
    ├── config.js                # all tunable values
    ├── core/
    │   ├── App.js               # wires everything together
    │   ├── Renderer.js          # Three.js renderer + DPR clamp
    │   └── Loop.js              # rAF + dt clamp
    ├── input/
    │   └── InputManager.js      # pointer events + gesture recognition
    ├── game/
    │   ├── BattleScene.js       # scene, lights, floor, backdrop
    │   ├── FightCamera.js       # side-view follow + dolly camera
    │   ├── Fighter.js           # procedural mecka + state machine + stats
    │   ├── FighterAI.js         # CPU decision loop
    │   ├── AnimationController.js
    │   └── ProjectileManager.js
    ├── ui/
    │   └── UIManager.js         # HUD bars, announcer, debug, pause
    └── utils/
        ├── math.js              # lerp / clamp / damp helpers
        └── debug.js
```

---

## How to swap the placeholder Meckas for real models later

The procedural robot is built in `Fighter.js` → `_buildMesh()`, which returns
a `THREE.Group` used as `this.root`. Everything downstream only talks to:

- `this.root` (world transform: position.x, rotation.y)
- `this.rig.{ torso, head, armL, armR, legL, legR }` (animation targets)

To swap in a GLTF model:

1. Replace the contents of `_buildMesh()` with a `GLTFLoader().loadAsync()` call.
2. After the model loads, walk its bone hierarchy and store references into
   `this.rig` with the same names (`torso`, `head`, `armL`, …). Either:
   - Keep `AnimationController` driving those bone rotations procedurally, or
   - Replace `AnimationController` with a `THREE.AnimationMixer` and call
     `mixer.clipAction(clip).play()` inside the existing state transitions
     (`dashForward()`, `punch()`, `shoot()`, etc.).
3. Nothing else in the game needs to change — combat, camera, input, and AI
   all treat the fighter as an opaque controller.

Because combat movement is authoritative in code (not root motion), your
GLTF clips can be pure pose animations with the root locked at origin.

---

## What to tweak first (good starting knobs in `config.js`)

- `fighter.moveSpeed`, `dashDistance`, `dodgeDistance` — game feel.
- `input.swipeMinDistPx`, `holdMinMs` — gesture sensitivity.
- `camera.minDistance` / `maxDistance` — framing / "zoom punch".
- `battery.*` and `damage.*` — pacing / TTK.
- `ai.reactionMin/Max` and `punchChanceClose` — difficulty.
- `tints.player` / `tints.cpu` — palette swap for quick variants.
- `debug.showOverlay`, `debug.showFps` — toggle on-screen diagnostics.

---

## The MECKA — one character, 32 armour sets

There is exactly one playable character: the **MECKA**, a procedurally
generated robot built in code (`src/game/MeckaKnightProcedural.js`) on Jammo's
extracted 59-bone skeleton, so all 13 Mixamo clips bind 1:1.  Jammo and Knight
were retired as selectable characters on 2026-07-12.

Armour is **not GLB files**.  A "part" is the pair *(set, slot)* — 32 sets ×
5 slots (`helmet · torso · armL · armR · legs`) = 160 parts, all generated at
build time and toggled by an equip registry.  Rarity ladder:
**COMMON → UNCOMMON → RARE → EPIC**, signalled primarily by skeleton coverage
(see `MECKA_GUIDELINES.md`).

### Mecka Hangar (`src/game/MeckaHangar.js`)

The customisation screen, reached from the main menu.  Portrait split: a Three
viewport up top (pedestal, drag-to-spin, five anchor nodes joined to the real
bones by live SVG leader lines, rarity flash on equip) over a datapad panel
(stat bars with ghost/delta preview, filtered inventory grid, eye-colour
picker).  It persists to `localStorage` under `mecka.hangar.v1` and writes
through to `CONFIG.mecka.playerLoadout` / `playerEye`, which is what `Fighter`
reads when it builds.

The Hangar builds **all 32 sets** (~3,150 meshes, ~170 visible) because it
swaps live.  `Fighter` passes `opts.sets` so a battle build only constructs
the 1–5 sets the loadout actually names (~620 meshes).  Don't conflate the two.

Data lives in `src/game/HangarCatalog.js`.  Stats are *derived*, never
hand-authored:

    value = TIER_MAGNITUDE[tier] × SLOT_PROFILE[slot][stat] × (1 + archetype_tilt)

## Known limitations / next upgrades

- No sound (easy to add — see `Fighter._spawnHitFX` for a hook point).
- Very small arena: no knock-back into walls, no ring-out.
- AI has difficulty levels but no combo reading.
- Only one match; no round/best-of logic.
- Hangar stats are cosmetic — `Fighter._computeStats()` still reads the legacy
  `CONFIG.defaultLoadout`.  Wiring Hangar stats to combat is a *balance*
  decision, not a plumbing one.
- Inventory cards show a slot glyph, not a render.  160 runtime thumbnails
  would stall the GPU on mobile; bake a sprite atlas offline with
  `tools/render_jpg.py` instead.
- Dodge side-switch (passing through the opponent to escape a corner) is still
  only half-built: the i-frames exist, the movement doesn't.
- No accessibility pass (colorblind bars, screen reader labels).
- No haptics. Easy win: `navigator.vibrate(10)` on punch/hit.

Good next steps:
1. Add sound with a single `AudioListener` on the camera + buffered sources.
2. Bake per-part thumbnails into a sprite atlas for the Hangar grid.
3. Decide whether Hangar stats should drive combat, then tune.
4. Add post-processing (Bloom on projectiles) — only if perf budget allows.
