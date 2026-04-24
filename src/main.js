/* ============================================================
   main.js — Entry point.
   Waits for DOM, preloads all assets (Jammo model + animations
   + textures), then constructs the App and starts the loop.
   ============================================================ */
import { App } from './core/App.js';
import { loadAllAssets } from './game/AssetLoader.js';

function showLoading(text) {
  let el = document.getElementById('loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading';
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 50;
      display: flex; align-items: center; justify-content: center;
      background: #05050a; color: #bfe8ff;
      font-family: ui-monospace, Menlo, Consolas, monospace;
      font-size: 13px; letter-spacing: 2px;
    `;
    document.body.appendChild(el);
  }
  el.textContent = text;
}
function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.remove();
}
function showError(err) {
  showLoading('');
  const el = document.getElementById('loading');
  if (!el) return;
  el.style.color = '#ffb0b0';
  el.style.whiteSpace = 'pre-wrap';
  el.style.padding = '32px';
  el.style.textAlign = 'left';
  el.textContent = 'Failed to start Mecka Rumble:\n\n' +
    (err && err.stack ? err.stack : (err && err.message) || err);
}

async function boot() {
  try {
    showLoading('LOADING ASSETS…');
    const assets = await loadAllAssets();
    const app = new App(assets);
    app.start();
    window.__mecka = app;
    hideLoading();
  } catch (err) {
    console.error(err);
    showError(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
