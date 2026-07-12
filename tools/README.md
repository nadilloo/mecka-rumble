# MECKA validation & viewer pipeline

These scripts validate `src/game/MeckaKnightProcedural.js` and regenerate the
standalone offline viewer (`../mecka-viewer.html`).

## Setup (once per container)

The scripts need a local copy of three.js r0.160.0 next to them:

```bash
curl -sL https://registry.npmjs.org/three/-/three-0.160.0.tgz | tar xz
cp package/build/three.module.js .
mkdir -p addons && cp -r package/examples/jsm/* addons/
# then point the model's bare 'three' import at the local file:
sed "s|from 'three'|from './three.module.js'|" \
    ../src/game/MeckaKnightProcedural.js > MeckaKnightProcedural.js
```

## Run

First run only: `npm install` in the project root (pulls three + jsdom).

```bash
node boot_check.mjs       # BOOTS UIManager + MeckaHangar against the real
                          # index.html in jsdom, GPU stubbed.  Catches dead DOM
                          # refs and screens that can't be shown — the class of
                          # bug that `node --check` cannot see.  Run this ALWAYS.
node hangar_harness.mjs   # Hangar: mixed loadouts, 160 swaps, bones, eyes, ladder
node harness.mjs          # builds every equip state, dumps world-space tris
python3 verify_tiers.py   # tier contracts: coverage, bulk ladder, gloves/boots
python3 verify8.py        # SENTINEL suite
python3 verify_spartan.py # SPARTAN suite
python3 verify_variants.py# per-variant suite
python3 render_jpg.py <set>   # flat-shaded front/side/3-4 preview JPEG
python3 pack_viewer.py    # regenerate ../mecka-viewer.html (blob-URL bundle)
node test_chain.mjs       # smoke-test the viewer's import chain
```

**Always run `harness.mjs` (not just `node --check`) before regenerating the
viewer** — syntax checking alone once let a crash-on-construction bug through.
