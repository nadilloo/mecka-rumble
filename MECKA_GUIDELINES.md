# MECKA Set Production Guidelines (v1 — locked 2026-07-09)

Target roster: **32 sets, 8 per tier.** Tiers: COMMON, UNCOMMON, RARE, EPIC.
All sets ride the same skeleton, proportions, and equip system (5 slots).

## The rarity ladder

Primary signal = **skeleton exposure**. Secondary = shape complexity, palette
richness, eye design, head silhouette.

| | COMMON | UNCOMMON | RARE | EPIC |
|---|---|---|---|---|
| Coverage | ~25–40% | ~55–70% | ~80–90% | ~100% |
| Exposed skeleton | face frame, abdomen, upper arms, thighs, no back plate | abdomen + upper arms | abdomen gap only | none (ab cover + gorget) |
| Head family | open half-helm frames | box / drum / wedge | sculpted (dome+mandibles, kabuto, brim, chines) | exotic (great-helm, horns, halo, layered crown) |
| Flair budget | 0 features, ≤3 plates/region | 1 small feature | 1–2 signature features + styled limbs | 2–3 features, glowing seams/gems, one-off geometry |
| Palette | 1 muted hue + gunmetal | 1 hue + 1 accent, steel trim | two-tone + brass/gold | 3 tones + gold/exotic metals |
| Eye pool (new sets) | skeleton visor showing / dim plain slit (~1.2 emissive) | slit, twin dots, plain band | grate, mono-eye, goggle wrap, trapezoid, angled pair | cross-slit, tri-optic, arc visor, lancet pair (~1.7 emissive) |
| Armor meshes | ~40–60 | ~70–90 | ~90–110 | ~110–140 |
| Silhouette bulk | thin straps (×0.90 limbs, ×0.92 head) | light plate (×0.95/×0.97) | full plate (×1.0) | heavy plate (×1.15/×1.12) |

## Hard rules (all tiers)

1. **Gloves always.** Skeleton gripper fingers are never exposed on an equipped
   set (bad for punching). BARE state may show them.
   Gloves render **+20% oversized** at every tier — punching is the point.
2. Helmet must fully enclose the skeleton skull; torso must cover the chest;
   feet always get footwear.
3. Symmetry is the default. RARE and EPIC may deliberately break it when the
   design earns it (off-center optics, single horn); COMMON/UNCOMMON never do.
4. Flat shading, native THREE geometries only, no text decals, no engraved
   panel lines. `.position.set()` only.
5. **Bulk scales with rarity.** Rarer pieces look bigger, thicker, more
   protective. Machine-checked: mean helmet width must strictly increase
   common → uncommon → rare → epic (`verify_tiers.py` bulk-ladder contract).
6. Identity features of shipped sets are grandfathered — tier governs
   coverage/trim; it does not retroactively delete a set's signature.

## Current 8 (tier assignments, locked)

UNCOMMON: SENTINEL (blue), MAGMA (red), GLACIER · RARE: SPARTAN, HAZARD,
NIGHTHAWK · EPIC: SHOGUN, VOID. Keys in code stay lowercase legacy
(`blue`, `red`, ...).

## Rarity dots (UI)

COMMON `#9aa4b2` gray · UNCOMMON `#3fbf5a` green · RARE `#3b82f6` blue ·
EPIC `#a855f7` purple. Shown beside every set name in the viewer and on every
card + anchor node in the Hangar.

**Changed 2026-07-12** (was green/blue/yellow/purple). COMMON now reads drab and
GREEN means uncommon, matching the convention players already know. Defined once,
in `TIER_COLORS` (MeckaKnightProcedural.js); the viewer and `HangarCatalog.RARITY`
both read it, and a harness assertion fails if they drift apart.

## Production loop (every batch)

1. Pitch names + one-line themes → approval.
2. Build against this rubric; register in `SET_CATALOG`.
3. Node harness + tier contract tests (coverage assertions per tier) + full
   verification suite must pass.
4. Software renders + contact sheet → on-phone viewer gate (the real judge).
5. Ship module + viewer + previews in sync.

## Skeleton (locked composite, 2026-07-10)

Default skeleton = user composite: boxy head −10% with recessed twin eye
sockets, rib-cage torso −10% funneling down (1.0/1.0/0.9/0.81), hex-nut spine
+ matching nut-stack neck, wedge feet, octo joints, round-finger grippers,
lighter steel (0x5a6270 family), muted-white eyes by default. Eye color is
user-selectable (16 colors × 5 brightness) and applies to skeleton + all
helmet eyes. Contracts are calibrated to this skeleton.

## Parts library (reusable in future sets — variety is king)

Skeleton-picker shapes flagged for reuse in mecka sets: helmet silhouettes
from skeletons #4 (drum) and #7 (tapered tri); torso constructions from
#1 (open frame), #3 (drum core), #5 (X-brace), #11 (twin columns).
Principle: the higher the shape variety across the roster, the better.

## Roster status — COMPLETE (32/32)

**COMMON (8):** SCRAP · CADET · DUNE · MOSS · ASH · SLAG · TIDE · BRAWLER
**UNCOMMON (8):** SENTINEL · MAGMA · GLACIER · VERDANT · COPPER · COBALT · UMBRA · SIGNAL
**RARE (8):** SPARTAN · HAZARD · NIGHTHAWK · VIPER · BASTION · CORSAIR · TEMPEST · WARDEN
**EPIC (8):** SHOGUN · VOID · SERAPH · KRAKEN · TITAN · WRAITH · PHOENIX · MONARCH

All 32 pass the tier contracts (coverage by tier, bulk ladder, enclosure,
symmetry, gloves/boots, grounding) plus the legacy per-set suites.
Epics share `epicClosure()` for the sealed abdomen ring + gorget.
