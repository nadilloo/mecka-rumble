import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib import colors as mcolors
from PIL import Image

tag = sys.argv[1]
L = np.array([0.40, 0.80, 0.50]); L = L / np.linalg.norm(L)
data = json.load(open('tris_' + tag + '.json'))

# precompute triangles once
TRIS, BASE, EMIS = [], [], []
for mm in data:
    v = np.array(mm['v'], dtype=float).reshape(-1, 3, 3)
    b = np.array(mcolors.to_rgb(mm['c']))
    e = np.array(mcolors.to_rgb(mm['e'])) if mm['e'] else None
    for tri in v:
        TRIS.append(tri); BASE.append(b); EMIS.append(e)
TRIS = np.array(TRIS)

def view(ax, proj, depth, title, yaw=None):
    T = TRIS.copy()
    if yaw is not None:
        c, s = np.cos(yaw), np.sin(yaw)
        R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        T = T @ R.T
    polys, cols, deps = [], [], []
    for i in range(len(T)):
        tri = T[i]
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        ln = np.linalg.norm(n)
        if ln < 1e-10: continue
        n /= ln
        if EMIS[i] is not None:
            col = np.clip(EMIS[i] * 1.15, 0, 1)
        else:
            col = np.clip(BASE[i] * (0.26 + 0.74 * abs(float(n @ L))), 0, 1)
        polys.append(tri[:, :2] if proj == 'xy' else np.stack([-tri[:, 2], tri[:, 1]], 1))
        cols.append(col)
        deps.append(tri[:, 2].mean() if depth == 'z' else -tri[:, 2].mean() if depth == '-z' else tri[:, 0].mean() if depth == 'x' else -tri[:, 0].mean())
    order = np.argsort(deps)
    ax.add_collection(PolyCollection([polys[i] for i in order], facecolors=[cols[i] for i in order],
                      edgecolors=(0, 0, 0, 0.18), linewidths=0.15))
    ax.set_aspect('equal'); ax.autoscale(); ax.set_facecolor('#0c0e13')
    ax.set_title(title, color='#aab2c2', fontsize=10); ax.axis('off')

fig, axes = plt.subplots(1, 3, figsize=(12.6, 6.2), facecolor='#0c0e13')
view(axes[0], 'xy', 'z', tag + ' — front')
view(axes[1], 'zy', 'x', tag + ' — side')
view(axes[2], 'xy', 'z', tag + ' — 3/4', yaw=-0.7)
plt.tight_layout()
plt.savefig('_tmp_' + tag + '.png', dpi=110, facecolor='#0c0e13')
plt.close()
im = Image.open('_tmp_' + tag + '.png').convert('RGB')
im.thumbnail((1100, 1100))
im.save('view_' + tag + '.jpg', quality=72)
print('view_' + tag + '.jpg', im.size)
