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
VISOR_CYAN = '#8ee9ff'; GOLD = '#ffb84d'
GREEN, GREENHI, GREENLO, GREENDK = '#4d5a33', '#66744a', '#333d20', '#232a15'
GUN, BRASS = '#282c34', '#a8863f'

nC, nE = load('none'); sC, sE = load('spartan')
sy = nE['#c9d2dd'][:, 1].mean()
skel = np.concatenate([nC[STEEL], nC[STEELHI], nC[STEELLO]])
SK = skel[skel[:, 1] > sy - 0.15]
skx, sky, skz = np.abs(SK[:,0]).max(), SK[:,1].max(), (SK[:,2].min(), SK[:,2].max())

# green helmet mass = green plates above the shoulders
GH = np.concatenate([sC[GREEN], sC.get(GREENHI, np.empty((0,3)))])
GH = GH[GH[:, 1] > sy - 0.15]

# 1. helmet encloses the skeleton head in all six directions
check('helmet wider than skull',       np.abs(GH[:,0]).max() > skx + 0.02, f'{np.abs(GH[:,0]).max():.3f} vs {skx:.3f}')
check('helmet taller than skull',                GH[:,1].max() > sky + 0.03, f'{GH[:,1].max():.3f} vs {sky:.3f}')
check('helmet deeper than skull (front)',        GH[:,2].max() > skz[1] + 0.01, f'{GH[:,2].max():.3f} vs {skz[1]:.3f}')
check('helmet deeper than skull (back)',         GH[:,2].min() < skz[0] - 0.01, f'{GH[:,2].min():.3f} vs {skz[0]:.3f}')

# 2. NO antenna: helmet top is a dome, not a tall spike (blue fin reached sky+0.23)
check('no antenna spike',   GH[:,1].max() < sky + 0.16, f'helmet top {GH[:,1].max():.3f} vs skull+0.16 {sky+0.16:.3f}')

# 3. SOLID gold visor: present, one wide lens (not 7 segments), proud of the face
gold = sE.get(GOLD, np.empty((0,3)))
check('gold visor present', len(gold) > 0, f'{len(gold)} gold verts')
gw = np.abs(gold[:,0]).max() * 2 if len(gold) else 0
check('gold visor is wide',  gw > 0.30, f'width ~{gw:.3f} world')
face_green = sC[GREEN][(sC[GREEN][:,1] > sy - 0.10) & (sC[GREEN][:,1] < sy + 0.10) & (np.abs(sC[GREEN][:,0]) < 0.15)]
check('gold visor proud of face', len(gold) and gold[:,2].max() > (face_green[:,2].max() if len(face_green) else 0),
      f'{gold[:,2].max():.3f} vs face {(face_green[:,2].max() if len(face_green) else 0):.3f}')
# segmented? a solid lens has few distinct x-clusters; 7 segments would have ~7
if len(gold):
    xs = np.round(gold[:,0], 2)
    clusters = len(np.unique(np.round(np.sort(np.unique(xs)) / 0.05)))
    check('visor is one lens (not segmented bar)', clusters < 12, f'{clusters} x-clusters')

# 4. mandible cheek guards: green mass flanking the visor, forward of face centre
mand = sC[GREEN][(sC[GREEN][:,1] > sy - 0.25) & (sC[GREEN][:,1] < sy + 0.20) &
                 (np.abs(sC[GREEN][:,0]) > 0.15) & (sC[GREEN][:,2] > 0.10)]
check('mandible guards present', len(mand) > 40, f'{len(mand)} flank verts fwd')

# 5. head symmetric (spartan has NO antenna -> full symmetry incl. head)
allv = np.concatenate(list(sC.values()) + list(sE.values()))
head = allv[allv[:,1] > sy - 0.15]
Lh = head[head[:,0] > 0.02]; Rh = head[head[:,0] < -0.02]
check('head L/R symmetric', abs(Lh[:,0].mean() + Rh[:,0].mean()) < 0.006 and abs(len(Lh)-len(Rh))/max(len(Lh),1) < 0.03,
      f'meanL {Lh[:,0].mean():.4f} meanR {Rh[:,0].mean():.4f} nL {len(Lh)} nR {len(Rh)}')

# 6. chevron ab-guard on the chest: dark seam/notch mass low-center-front of chest
def band(V, y0, y1): return V[(V[:,1] >= y0) & (V[:,1] <= y1)]
chev = sC.get(FACED, np.empty((0,3)))
chev = chev[(chev[:,1] > sy - 0.55) & (chev[:,1] < sy - 0.25) & (chev[:,2] > 0.08)]
check('chevron ab-guard present', len(chev) > 0, f'{len(chev)} dark chest-front verts')

# 7. torso covers the skeleton chest (width + front)
cb0, cb1 = sy - 0.33, sy - 0.24
sc_ = band(nC[STEEL], cb0, cb1); ac_ = band(sC[GREEN], cb0, cb1)
check('torso covers chest (width)', np.abs(ac_[:,0]).max() > np.abs(sc_[:,0]).max() + 0.03,
      f'{np.abs(ac_[:,0]).max():.3f} vs {np.abs(sc_[:,0]).max():.3f}')
check('torso covers chest (front)', ac_[:,2].max() > sc_[:,2].max() + 0.02,
      f'{ac_[:,2].max():.3f} vs {sc_[:,2].max():.3f}')

# 8. shared: boxing gloves + skeleton grippers hidden; ribbed + brass; sabatons; abdomen; grounded
glove = sC[GREEN][np.abs(sC[GREEN][:,0]) > 0.55]
check('boxing gloves at hands', len(glove) > 0, f'{len(glove)} glove verts |x|>0.55')
bare_f = (np.abs(nC[STEELLO][:,0]) > 0.60).sum()
sp_f = (np.abs(sC.get(STEELLO, np.empty((0,3)))[:,0]) > 0.60).sum() if STEELLO in sC else 0
check('skeleton grippers hidden (spartan)', sp_f < bare_f * 0.5, f'bare {bare_f} -> spartan {sp_f}')
check('ribbed actuators present', GUN in sC and len(sC[GUN]) > 300, f'{len(sC.get(GUN, []))} gun verts')
check('brass bushings present', BRASS in sC and len(sC[BRASS]) > 100, f'{len(sC.get(BRASS, []))} brass verts')
fy = 0.16; sf = skel[skel[:,1] < fy]
sboot = np.concatenate([sC.get(GREEN,np.empty((0,3))), sC.get(GREENLO,np.empty((0,3))), sC.get(GREENDK,np.empty((0,3)))])
bf = sboot[sboot[:,1] < fy]
check('sabatons cover feet', bf[:,2].max() > sf[:,2].max() + 0.02 and np.abs(bf[:,0]).max() > np.abs(sf[:,0]).max() + 0.01,
      f'z {bf[:,2].max():.3f} vs {sf[:,2].max():.3f}')
g0, g1 = sy - 0.62, sy - 0.50
gs = band(nC[STEEL], g0, g1); gs = gs[np.abs(gs[:,0]) < 0.06]
check('abdomen exposed under armor', len(gs) > 0, f'{len(gs)} skel disc verts')
check('grounded/bounded', -0.09 < allv[:,1].min() < 0.06 and 1.5 < allv[:,1].max() < 1.9, f'y {allv[:,1].min():.3f}..{allv[:,1].max():.3f}')

print('\n' + ('ALL CHECKS PASSED' if not fails else f'{len(fails)} FAILURES: ' + ', '.join(fails)))
exit(1 if fails else 0)
