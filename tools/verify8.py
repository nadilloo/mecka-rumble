import json
import numpy as np

def load(tag):
    C, E = {}, {}
    for mm in json.load(open(f'tris_{tag}.json')):
        v = np.array(mm['v'], dtype=float).reshape(-1, 3)
        (C.setdefault(mm['c'], []) if not mm['e'] else E.setdefault(mm['e'], [])).append(v)
    return ({k: np.concatenate(v) for k, v in C.items()},
            {k: np.concatenate(v) for k, v in E.items()})

fails = []
def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
    if not cond: fails.append(name)

STEEL, STEELHI, STEELLO, FACED = '#5a6270', '#7d8698', '#3b414d', '#14171f'
VISOR = '#8ee9ff'
BLUE, BLUEHI, BLUELO = '#45526f', '#5c6d8f', '#2d3548'
GUN, BRASS, ACCENT = '#282c34', '#a8863f', '#d06a2c'

nC, nE = load('none'); bC, bE = load('blue')
sy = nE['#c9d2dd'][:, 1].mean()
skel = np.concatenate([nC[STEEL], nC[STEELHI], nC[STEELLO]])

# global skeleton HEAD bounds (topmost skeleton mass, above the shoulders)
SK = skel[skel[:, 1] > sy - 0.15]
skx, sky, skz = np.abs(SK[:,0]).max(), SK[:,1].max(), (SK[:,2].min(), SK[:,2].max())

# 1. blue helmet fully encloses the skeleton head (all six directions, w/ margin)
HB = np.concatenate([bC[BLUE], bC[BLUEHI]]); HB = HB[HB[:,1] > sy - 0.15]
check('helmet wider than skull',  np.abs(HB[:,0]).max() > skx + 0.02, f'{np.abs(HB[:,0]).max():.3f} vs {skx:.3f}')
check('helmet taller than skull',           HB[:,1].max() > sky + 0.04, f'{HB[:,1].max():.3f} vs {sky:.3f}')
check('helmet deeper than skull (front)',   HB[:,2].max() > skz[1] + 0.01, f'{HB[:,2].max():.3f} vs {skz[1]:.3f}')
check('helmet deeper than skull (back)',    HB[:,2].min() < skz[0] - 0.01, f'{HB[:,2].min():.3f} vs {skz[0]:.3f}')

# 2. segmented visor bar present & proud of the dark bezel
seg = bE[VISOR]; bez = bC[FACED]
check('visor segments present', len(seg) >= 7 * 8, f'{len(seg)} cyan verts')
check('visor proud of bezel',   seg[:,2].max() > bez[:,2].max() + 0.002, f'{seg[:,2].max():.3f} vs {bez[:,2].max():.3f}')

# 3. SENTINEL rework: helmet symmetric (antenna removed), twin studs above skull
HI = bC[BLUEHI]
check('studs rise above skull', HI[:,1].max() > sky + 0.03, f'stud top {HI[:,1].max():.3f} vs skull {sky:.3f}')
finL = HI[HI[:,0] < -0.20]; finR = HI[HI[:,0] > 0.20]
yL = finL[:,1].max() if len(finL) else 0; yR = finR[:,1].max() if len(finR) else 0
check('helmet symmetric (studs equal height)', abs(yL - yR) < 0.02, f'-X reach {yL:.3f} vs +X reach {yR:.3f}')

# 4. torso armor proud of the skeleton chest (width + front), w/ margin
def band(V, y0, y1): return V[(V[:,1] >= y0) & (V[:,1] <= y1)]
cb0, cb1 = sy - 0.33, sy - 0.24
sc = band(nC[STEEL], cb0, cb1); ac = band(bC[BLUE], cb0, cb1)
check('torso covers chest (width)', np.abs(ac[:,0]).max() > np.abs(sc[:,0]).max() + 0.03,
      f'{np.abs(ac[:,0]).max():.3f} vs {np.abs(sc[:,0]).max():.3f}')
check('torso covers chest (front)', ac[:,2].max() > sc[:,2].max() + 0.02,
      f'{ac[:,2].max():.3f} vs {sc[:,2].max():.3f}')
check('orange chevrons present', ACCENT in bC and len(bC[ACCENT]) >= 4 * 8, f'{len(bC.get(ACCENT, []))} verts')

# 5. boxing gloves at hands; skeleton grippers hidden in blue but present when bare
HX = 0.55
glove = bC[BLUE][np.abs(bC[BLUE][:,0]) > HX]
check('boxing gloves at hands', len(glove) > 0, f'glove verts |x|>{HX}: {len(glove)}, reach {np.abs(glove[:,0]).max():.3f}')
bare_fing = (np.abs(nC[STEELLO][:,0]) > 0.60).sum()
blue_fing = (np.abs(bC.get(STEELLO, np.empty((0,3)))[:,0]) > 0.60).sum() if STEELLO in bC else 0
check('skeleton grippers hidden under glove (blue)', blue_fing < bare_fing * 0.5,
      f'hand-zone steelLo verts: bare {bare_fing} -> blue {blue_fing}')
check('skeleton grippers show when bare', bare_fing > 0, f'{bare_fing} verts')

# 6. ribbed actuators + brass
check('ribbed actuators present', GUN in bC and len(bC[GUN]) > 300, f'{len(bC.get(GUN, []))} gun verts')
check('brass bushings present',   BRASS in bC and len(bC[BRASS]) > 100, f'{len(bC.get(BRASS, []))} brass verts')

# 7. sabatons enclose the skeleton feet
fy = 0.16
sf = skel[skel[:,1] < fy]
ARMOR_STEEL = ['#4d5461', '#6e7787', '#30353f']   # blue's grey boots (armor trim, not skeleton)
bsteel = np.concatenate([bC[c] for c in ARMOR_STEEL if c in bC]); bf = bsteel[bsteel[:,1] < fy]
check('sabatons cover feet (length)', bf[:,2].max() > sf[:,2].max() + 0.02, f'{bf[:,2].max():.3f} vs {sf[:,2].max():.3f}')
check('sabatons cover feet (width)',  np.abs(bf[:,0]).max() > np.abs(sf[:,0]).max() + 0.01, f'{np.abs(bf[:,0]).max():.3f} vs {np.abs(sf[:,0]).max():.3f}')

# 8. abdomen discs stay exposed under blue torso
g0, g1 = sy - 0.62, sy - 0.50
gs = band(nC[STEEL], g0, g1); gs = gs[np.abs(gs[:,0]) < 0.06]
check('abdomen exposed under blue', len(gs) > 0, f'skel disc verts {len(gs)}')

# 9. FULL-body symmetry (SENTINEL is now symmetric incl. head)
allv = np.concatenate(list(bC.values()) + list(bE.values()))
body = allv
Lb = body[body[:,0] > 0.02]; Rb = body[body[:,0] < -0.02]
check('body L/R symmetry (excl. head)',
      abs(Lb[:,0].mean() + Rb[:,0].mean()) < 0.006 and abs(len(Lb) - len(Rb)) / len(Lb) < 0.03,
      f'meanL {Lb[:,0].mean():.4f} meanR {Rb[:,0].mean():.4f}')

# 10. grounded / bounded
check('grounded/bounded', -0.09 < allv[:,1].min() < 0.06 and 1.5 < allv[:,1].max() < 2.0,
      f'y {allv[:,1].min():.3f}..{allv[:,1].max():.3f}')

print('\n' + ('ALL CHECKS PASSED' if not fails else f'{len(fails)} FAILURES: ' + ', '.join(fails)))
exit(1 if fails else 0)
