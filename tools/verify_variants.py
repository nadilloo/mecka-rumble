import json, sys
import numpy as np

def load(tag):
    C, E = {}, {}
    for mm in json.load(open(f'tris_{tag}.json')):
        v = np.array(mm['v'], dtype=float).reshape(-1, 3)
        (C.setdefault(mm['c'], []) if not mm['e'] else E.setdefault(mm['e'], [])).append(v)
    return ({k: np.concatenate(v) for k, v in C.items()},
            {k: np.concatenate(v) for k, v in E.items()})

STEEL, STEELHI, STEELLO = '#5a6270', '#7d8698', '#3b414d'
FACED, GUN, BRASS = '#14171f', '#282c34', '#a8863f'

CFG = {
  'red':       dict(main='#7e2a1f', hi='#9a3c2c', lo='#571a12', em='#ff5a1f',
                    boots=['#571a12', '#7e2a1f', '#14171f'], crest=0.30),
  'shogun':    dict(main='#a63428', hi='#c2483a', lo='#781f16', em='#ffbf2e',
                    boots=['#282c34', '#30353f', '#14171f'], crest=0.35),
  'glacier':   dict(main='#dde4ea', hi='#f1f5f8', lo='#a9b4bf', em='#8fdcff',
                    boots=['#a9b4bf', '#dde4ea', '#7e8a96'], crest=0.22),
  'hazard':    dict(main='#e3a91c', hi='#f3c246', lo='#b07f10', em='#ffbf2e',
                    boots=['#16181d', '#b07f10', '#14171f'], crest=0.30),
  'nighthawk': dict(main='#262a32', hi='#3d434f', lo='#14171c', em='#ff3a30',
                    boots=['#14171c', '#262a32', '#14171f'], crest=0.22),
  'void':      dict(main='#46286f', hi='#5c3a8e', lo='#2f1a4b', em='#e870ff',
                    boots=['#2f1a4b', '#46286f', '#241239'], crest=0.40),
}

nC, nE = load('none')
sy = nE['#c9d2dd'][:, 1].mean()
skel = np.concatenate([nC[STEEL], nC[STEELHI], nC[STEELLO]])
SK = skel[skel[:, 1] > sy - 0.15]
skx, skyTop = np.abs(SK[:, 0]).max(), SK[:, 1].max()
skzF, skzB = SK[:, 2].max(), SK[:, 2].min()
bare_fingers = (np.abs(nC[STEELLO][:, 0]) > 0.60).sum()
fy = 0.16
sfeet = skel[skel[:, 1] < fy]

total_fails = {}
for tag, cfg in CFG.items():
    fails = []
    def check(name, cond, detail=''):
        print(('PASS ' if cond else 'FAIL ') + f'[{tag}] ' + name + (f'  [{detail}]' if detail else ''))
        if not cond: fails.append(name)
    C, E = load(tag)
    plates = np.concatenate([C[c] for c in (cfg['main'], cfg['hi'], cfg['lo']) if c in C])
    em = E.get(cfg['em'], np.empty((0, 3)))
    allv = np.concatenate(list(C.values()) + list(E.values()))

    H = plates[plates[:, 1] > sy - 0.15]
    check('helmet wider than skull', np.abs(H[:, 0]).max() > skx + 0.02, f'{np.abs(H[:,0]).max():.3f} vs {skx:.3f}')
    check('helmet taller than skull', H[:, 1].max() > skyTop + 0.02, f'{H[:,1].max():.3f} vs {skyTop:.3f}')
    check('helmet deeper (front)', H[:, 2].max() > skzF + 0.01, f'{H[:,2].max():.3f} vs {skzF:.3f}')
    check('helmet deeper (back)', H[:, 2].min() < skzB - 0.01, f'{H[:,2].min():.3f} vs {skzB:.3f}')
    top_all = allv[allv[:, 1] > sy - 0.15][:, 1].max()
    check('crest within allowance', top_all < skyTop + cfg['crest'], f'{top_all:.3f} vs {skyTop + cfg["crest"]:.3f}')

    check('emissive present', len(em) > 20, f'{len(em)} verts')
    if len(em):
        head_em = em[em[:, 1] > sy - 0.20]
        check('head emissive present', len(head_em) > 0, f'{len(head_em)}')
        if len(head_em):
            ey = head_em[:, 1].mean()
            band = plates[(np.abs(plates[:, 1] - ey) < 0.06) & (np.abs(plates[:, 0]) < 0.13)]
            fz = band[:, 2].max() if len(band) else 0
            check('emissive proud of central face', head_em[:, 2].max() > fz - 0.005, f'{head_em[:,2].max():.3f} vs {fz:.3f}')

    cb = plates[(plates[:, 1] >= sy - 0.33) & (plates[:, 1] <= sy - 0.24)]
    sc = nC[STEEL][(nC[STEEL][:, 1] >= sy - 0.33) & (nC[STEEL][:, 1] <= sy - 0.24)]
    check('torso covers chest (width)', np.abs(cb[:, 0]).max() > np.abs(sc[:, 0]).max() + 0.03,
          f'{np.abs(cb[:,0]).max():.3f} vs {np.abs(sc[:,0]).max():.3f}')
    check('torso covers chest (front)', cb[:, 2].max() > sc[:, 2].max() + 0.02,
          f'{cb[:,2].max():.3f} vs {sc[:,2].max():.3f}')

    glove = C.get(cfg['main'], np.empty((0, 3)))
    check('gloves present', (np.abs(glove[:, 0]) > 0.55).sum() > 100, f'{(np.abs(glove[:,0])>0.55).sum()}')
    vf = (np.abs(C.get(STEELLO, np.empty((0, 3)))[:, 0]) > 0.60).sum() if STEELLO in C else 0
    check('skeleton grippers hidden', vf < bare_fingers * 0.5, f'bare {bare_fingers} -> {vf}')
    check('ribbed actuators', GUN in C and len(C[GUN]) > 300, f'{len(C.get(GUN, []))}')
    check('brass bushings', BRASS in C and len(C[BRASS]) > 100, f'{len(C.get(BRASS, []))}')

    boots = np.concatenate([C[b] for b in cfg['boots'] if b in C]) if any(b in C for b in cfg['boots']) else np.empty((0, 3))
    bf = boots[boots[:, 1] < fy]
    check('sabatons cover feet', len(bf) > 0 and bf[:, 2].max() > sfeet[:, 2].max() + 0.02
          and np.abs(bf[:, 0]).max() > np.abs(sfeet[:, 0]).max() + 0.01,
          f'z {bf[:,2].max() if len(bf) else 0:.3f} vs {sfeet[:,2].max():.3f}')

    gsk = nC[STEEL][(nC[STEEL][:, 1] >= sy - 0.62) & (nC[STEEL][:, 1] <= sy - 0.50)]
    gsk = gsk[np.abs(gsk[:, 0]) < 0.06]
    check('abdomen exposed', len(gsk) > 0, f'{len(gsk)}')

    head = allv[allv[:, 1] > sy - 0.15]
    Lh, Rh = head[head[:, 0] > 0.02], head[head[:, 0] < -0.02]
    check('head L/R symmetric', abs(Lh[:, 0].mean() + Rh[:, 0].mean()) < 0.006
          and abs(len(Lh) - len(Rh)) / max(len(Lh), 1) < 0.03,
          f'L {Lh[:,0].mean():.4f} R {Rh[:,0].mean():.4f} nL {len(Lh)} nR {len(Rh)}')
    check('grounded/bounded', -0.09 < allv[:, 1].min() < 0.06 and 1.5 < allv[:, 1].max() < 1.95,
          f'y {allv[:,1].min():.3f}..{allv[:,1].max():.3f}')
    if fails: total_fails[tag] = fails
    print()

print('ALL VARIANTS PASS' if not total_fails else 'FAILURES: ' + json.dumps(total_fails))
sys.exit(1 if total_fails else 0)
