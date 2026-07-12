import json, os

ROOT = '/home/claude'
PROJ = ROOT + '/mecka-rumble-v3'
TP   = ROOT + '/threepkg'

def read(p):
    return open(p, encoding='utf-8').read()

SOURCES = {
    'three': read(TP + '/build/three.module.js'),
    '../utils/BufferGeometryUtils.js': read(TP + '/examples/jsm/utils/BufferGeometryUtils.js'),
    'addons:OrbitControls':  read(TP + '/examples/jsm/controls/OrbitControls.js'),
    'addons:GLTFLoader':     read(TP + '/examples/jsm/loaders/GLTFLoader.js'),
    'addons:RoomEnvironment': read(TP + '/examples/jsm/environments/RoomEnvironment.js'),
    './meckaSkeletonData.js': read(PROJ + '/src/game/meckaSkeletonData.js'),
    'app:model': read(PROJ + '/src/game/MeckaKnightProcedural.js'),
    'app:main':  read(ROOT + '/scratch/viewer-app.mjs'),
}
ORDER = ['three', '../utils/BufferGeometryUtils.js', 'addons:OrbitControls',
         'addons:GLTFLoader', 'addons:RoomEnvironment', './meckaSkeletonData.js',
         'app:model', 'app:main']

json.dump({'ORDER': ORDER, 'SOURCES': SOURCES},
          open(ROOT + '/scratch/sources.json', 'w'))

src_json = json.dumps(SOURCES, ensure_ascii=True).replace('</', '<\\/')
order_json = json.dumps(ORDER)

HTML = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>MECKA — skeleton & armor viewer (v7)</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0b0d12;overflow:hidden;color:#c6cddc;
  font-family:ui-monospace,Menlo,Consolas,monospace}
body{display:flex;flex-direction:column}
#stage{position:relative;flex:0 0 55%}
#c{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
#logo{position:absolute;top:10px;left:12px;color:#7d96ff;letter-spacing:4px;
  font-size:13px;font-weight:700;user-select:none;pointer-events:none}
#status{position:absolute;left:12px;bottom:8px;color:#5b6478;font-size:11px;
  letter-spacing:.5px;pointer-events:none}
#panel{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:12px 12px 26px;border-top:1px solid #1c2230;background:#0e1118}
.sec{margin-bottom:16px}
.stitle{color:#5b6478;font-size:10px;letter-spacing:3px;margin-bottom:8px}
select{width:100%;background:#1a1f2b;border:1px solid #2a3145;color:#c6cddc;
  font:inherit;font-size:13px;padding:8px 10px;border-radius:8px}
#sets{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.tierhead{grid-column:1/-1;color:#5b6478;font-size:10px;letter-spacing:2px;margin-top:6px}
button{display:flex;align-items:center;gap:8px;background:#1a1f2b;
  border:1px solid #2a3145;color:#c6cddc;font:inherit;font-size:12px;
  padding:9px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
button:hover{background:#232a3a}
button.active{background:#2a4ec2;border-color:#3a5ed6;color:#fff}
.dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px}
#bare{grid-column:1/-1;justify-content:center}
.dualrow{display:flex;gap:8px}
.dualrow select{flex:1}
.skrow{display:flex;gap:8px;align-items:center}
.skrow select{flex:1}
.skrow button{padding:9px 14px;flex:0 0 auto}
#slots .srow{display:flex;align-items:center;gap:10px;margin-bottom:8px}
#slots .slabel{width:52px;color:#8a93a8;font-size:12px;flex:0 0 52px}
#slots select{flex:1}
</style>
</head>
<body>
<div id="stage">
  <canvas id="c"></canvas>
  <span id="logo">M E C K A</span>
  <div id="status">booting…</div>
</div>
<div id="panel">
  <div class="sec"><div class="stitle">ANIMATION</div><select id="anim"></select></div>
  <div class="sec"><div class="stitle">SKELETON</div>
    <div class="skrow"><button id="skprev">&#9664;</button><select id="skelsel"></select><button id="sknext">&#9654;</button></div>
    <div class="skrow" style="margin-top:8px"><select id="skelhl"></select></div>
  </div>
  <div class="sec"><div class="stitle">EYES</div>
    <div class="dualrow"><select id="eyecolor"></select><select id="eyelvl"></select></div>
  </div>
  <div class="sec"><div class="stitle">LIGHTING</div><select id="lightsel"></select></div>
  <div class="sec"><div class="stitle">SETS</div><div id="sets"></div></div>
  <div class="sec"><div class="stitle">SLOTS</div><div id="slots"></div></div>
</div>
<script id="SRC" type="application/json">@SRC@</script>
<script>
(function () {
  var SOURCES = JSON.parse(document.getElementById('SRC').textContent);
  var ORDER = @ORDER@;
  var urls = {};
  for (var i = 0; i < ORDER.length; i++) {
    var key = ORDER[i];
    var code = SOURCES[key];
    for (var spec in urls) {
      code = code.split("from '" + spec + "'").join("from '" + urls[spec] + "'");
      code = code.split('from "' + spec + '"').join('from "' + urls[spec] + '"');
    }
    urls[key] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  }
  import(urls['app:main']).catch(function (e) {
    var s = document.getElementById('status');
    if (s) s.textContent = 'boot error: ' + e.message;
    console.error(e);
  });
})();
</script>
</body>
</html>
"""

out = HTML.replace('@SRC@', src_json).replace('@ORDER@', order_json)
path = PROJ + '/mecka-viewer.html'
open(path, 'w', encoding='utf-8').write(out)
print('viewer written:', path, os.path.getsize(path), 'bytes')
