# Rasterize tris_frame.json (NDC screen-space, pre-lit, pre-fogged) into a
# portrait 9:16 preview jpg.  Painter's algorithm on camera distance.
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from PIL import Image

data = json.load(open('tris_frame.json'))
data.sort(key=lambda t: -t['d'])                     # far first
polys = [[(t['v'][0], t['v'][1]), (t['v'][2], t['v'][3]), (t['v'][4], t['v'][5])] for t in data]
cols = [t['c'] for t in data]

fig = plt.figure(figsize=(4.5, 8.0), facecolor='#0a0a1a')
ax = fig.add_axes([0, 0, 1, 1])
ax.set_facecolor('#0a0a1a')
ax.add_collection(PolyCollection(polys, facecolors=cols,
                  edgecolors=(0, 0, 0, 0.10), linewidths=0.1))
ax.set_xlim(-1, 1); ax.set_ylim(-1, 1)
ax.set_aspect('auto'); ax.axis('off')
# thirds guides so composition is readable at a glance
for y in (-1/3, 1/3):
    ax.axhline(y, color='#ffffff', alpha=0.10, lw=0.6)
plt.savefig('_frame.png', dpi=120, facecolor='#0a0a1a')
plt.close()
im = Image.open('_frame.png').convert('RGB')
im.save('view_frame.jpg', quality=80)
print('view_frame.jpg', im.size)
