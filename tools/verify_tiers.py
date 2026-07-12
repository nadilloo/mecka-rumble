import json, sys
import numpy as np

def loadT(tag):
    T = []
    for mm in json.load(open(f'tris_{tag}.json')):
        v = np.array(mm['v'], dtype=float).reshape(-1, 3, 3)
        T.append((mm['c'], v))
    return T

def load(tag):
    C, E = {}, {}
    for mm in json.load(open(f'tris_{tag}.json')):
        v = np.array(mm['v'], dtype=float).reshape(-1, 3)
        (C.setdefault(mm['c'], []) if not mm['e'] else E.setdefault(mm['e'], [])).append(v)
    return ({k: np.concatenate(v) for k, v in C.items()},
            {k: np.concatenate(v) for k, v in E.items()})

SKEL = {'#5a6270', '#7d8698', '#3b414d'}
TIERS = {'scrap': 'common', 'cadet': 'common', 'dune': 'common', 'moss': 'common',
         'ash': 'common', 'slag': 'common', 'tide': 'common', 'brawler': 'common',
         'blue': 'uncommon', 'red': 'uncommon', 'glacier': 'uncommon',
         'spartan': 'rare', 'hazard': 'rare', 'nighthawk': 'rare',
         'shogun': 'epic', 'void': 'epic',
         'verdant': 'uncommon', 'copper': 'uncommon', 'cobalt': 'uncommon',
         'umbra': 'uncommon', 'signal': 'uncommon',
         'viper': 'rare', 'bastion': 'rare', 'corsair': 'rare',
         'tempest': 'rare', 'warden': 'rare',
         'seraph': 'epic', 'kraken': 'epic', 'titan': 'epic',
         'wraith': 'epic', 'phoenix': 'epic', 'monarch': 'epic'}

nC, nE = load('none')
sy = nE['#c9d2dd'][:, 1].mean()
steel = np.concatenate([nC[c] for c in SKEL if c in nC])

# upper-arm reference band (left arm, T-pose)
arm = steel[(steel[:, 1] > sy - 0.36) & (steel[:, 1] < sy - 0.10) &
            (steel[:, 0] > 0.22) & (steel[:, 0] < 0.62)]
x0, x1 = arm[:, 0].min(), arm[:, 0].max()
mx0, mx1 = x0 + 0.40 * (x1 - x0), x0 + 0.72 * (x1 - x0)
armY, armZ = arm[:, 1].mean(), arm[:, 2].mean()

# abdomen band + skeleton spine z-extents
ab0, ab1v = sy - 0.62, sy - 0.50
disc = steel[(steel[:, 1] >= ab0) & (steel[:, 1] <= ab1v) & (np.abs(steel[:, 0]) < 0.06)]
dz0, dz1 = disc[:, 2].min(), disc[:, 2].max()

# neck band just under the skull
headMin = steel[steel[:, 1] > sy - 0.15][:, 1].min()
nk0, nk1 = headMin - 0.12, headMin - 0.02

thigh = steel[(steel[:, 1] > 0.28) & (steel[:, 1] < 0.50) &
              (np.abs(steel[:, 0]) > 0.05) & (np.abs(steel[:, 0]) < 0.30)]
thY, thZ = thigh[:, 1].mean(), thigh[:, 2].mean()
chest = steel[(steel[:, 1] > 0.84) & (steel[:, 1] < 0.92) & (np.abs(steel[:, 0]) < 0.10)]
zc2 = chest[:, 2].mean()
helmW = {}

fails = []
def check(name, cond, detail=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''))
    if not cond: fails.append(name)

zc = disc[:, 2].mean()
for tag, tier in TIERS.items():
    C, E = load(tag)
    armor = [C[c] for c in C if c not in SKEL] + [E[c] for c in E if c != '#c9d2dd']
    A = np.concatenate(armor)

    # upper arm: calibrated window between shoulder and elbow actuator
    ua = A[(A[:, 0] > 0.21) & (A[:, 0] < 0.335) &
           (np.abs(A[:, 1] - armY) < 0.10) & (np.abs(A[:, 2] - armZ) < 0.22)]
    if tier in ('common', 'uncommon'):
        check(f'[{tag}/{tier}] upper arm EXPOSED', len(ua) < 220, f'{len(ua)} armor verts')
    else:
        check(f'[{tag}/{tier}] upper arm COVERED', len(ua) > 300, f'{len(ua)} armor verts')

    # abdomen: RAYCAST occlusion — fire horizontal rays outward from spine
    # points in the gap band; open tiers let most escape, epics block them.
    ATRIS = np.concatenate([t for col, t in loadT(tag)
                            if col not in SKEL and col != '#c9d2dd'])
    v0, e1, e2 = ATRIS[:, 0], ATRIS[:, 1] - ATRIS[:, 0], ATRIS[:, 2] - ATRIS[:, 0]
    def ray_blocked(orig, d):
        h = np.cross(d, e2); a = np.einsum('ij,ij->i', e1, h)
        ok = np.abs(a) > 1e-9
        f = np.zeros_like(a); f[ok] = 1.0 / a[ok]
        sv = orig - v0
        u = f * np.einsum('ij,ij->i', sv, h)
        q = np.cross(sv, e1)
        vv = f * np.dot(q, d)
        t = f * np.einsum('ij,ij->i', q, e2)
        return np.any(ok & (u >= 0) & (u <= 1) & (vv >= 0) & (u + vv <= 1)
                      & (t > 0.02) & (t < 0.60))
    escapes, total = 0, 0
    for yS in (0.652, 0.668, 0.684):
        orig = np.array([0.0, yS, zc])
        for k in range(8):
            th = k * np.pi / 4
            d = np.array([np.sin(th), 0.0, np.cos(th)])
            total += 1
            if not ray_blocked(orig, d): escapes += 1
    if tier == 'epic':
        check(f'[{tag}/{tier}] abdomen SEALED', escapes <= 3, f'{escapes}/{total} rays escape')
    else:
        check(f'[{tag}/{tier}] abdomen OPEN', escapes >= 10, f'{escapes}/{total} rays escape')

    JOINT = {'#282c34', '#a8863f', '#14171f'}
    P_ = np.concatenate([C[c] for c in C if c not in SKEL and c not in JOINT] +
                        [E[c] for c in E if c != '#c9d2dd'])
    if tier == 'common':
        th_arm = P_[(P_[:, 1] > 0.28) & (P_[:, 1] < 0.42) & (np.abs(P_[:, 0]) > 0.06) &
                   (np.abs(P_[:, 0]) < 0.30) & (np.abs(P_[:, 2] - thZ) < 0.25)]
        check(f'[{tag}/{tier}] thighs EXPOSED', len(th_arm) < 40, f'{len(th_arm)} armor verts')
        backEsc = sum(0 if ray_blocked(np.array([0.0, 0.88, zc2]),
                                       np.array([np.sin(t2), 0.0, np.cos(t2)])) else 1
                      for t2 in (3 * np.pi / 4, np.pi, 5 * np.pi / 4))
        check(f'[{tag}/{tier}] back OPEN (no back plate)', backEsc >= 2, f'{backEsc}/3 back rays escape')
        check(f'[{tag}/{tier}] gloves mandatory', (np.abs(A[:, 0]) > 0.55).sum() > 100,
              f'{(np.abs(A[:,0])>0.55).sum()} glove verts')
        check(f'[{tag}/{tier}] boots mandatory', (A[:, 1] < 0.16).sum() > 150,
              f'{(A[:,1]<0.16).sum()} boot verts')
    else:
        th_arm = P_[(P_[:, 1] > 0.28) & (P_[:, 1] < 0.42) & (np.abs(P_[:, 0]) > 0.06) &
                   (np.abs(P_[:, 0]) < 0.30) & (np.abs(P_[:, 2] - thZ) < 0.25)]
        if tier == 'uncommon':
            check(f'[{tag}/{tier}] thighs EXPOSED', len(th_arm) < 40, f'{len(th_arm)} armor verts')
        else:
            check(f'[{tag}/{tier}] thighs covered', len(th_arm) > 60, f'{len(th_arm)} armor verts')
    helmW[tag] = np.abs(A[A[:, 1] > sy - 0.15][:, 0]).max()

    # neck: gorget rim mass for epics; open window clear for others
    nkE = A[(A[:, 1] >= 1.00) & (A[:, 1] <= 1.11)]
    nkE = nkE[np.sqrt(nkE[:, 0] ** 2 + nkE[:, 2] ** 2) < 0.26]
    nkO = A[(A[:, 1] >= 1.062) & (A[:, 1] <= 1.108)]
    nkO = nkO[np.sqrt(nkO[:, 0] ** 2 + nkO[:, 2] ** 2) < 0.24]
    if tier == 'epic':
        check(f'[{tag}/{tier}] gorget PRESENT', len(nkE) > 150, f'{len(nkE)} verts in 1.00..1.11')
    else:
        check(f'[{tag}/{tier}] neck open', len(nkO) < 25, f'{len(nkO)} verts in gap window')

tierW = {}
for t2, tr in TIERS.items(): tierW.setdefault(tr, []).append(helmW[t2])
mW = {tr: float(np.mean(v)) for tr, v in tierW.items()}
check('bulk ladder: epic > rare > uncommon > common (mean helm width)',
      mW['epic'] > mW['rare'] > mW['uncommon'] > mW['common'],
      ' '.join(f'{tr}:{mW[tr]:.3f}' for tr in ('common', 'uncommon', 'rare', 'epic')))

print()
print('ALL TIER CONTRACTS PASS' if not fails else f'{len(fails)} FAILURES')
sys.exit(1 if fails else 0)
