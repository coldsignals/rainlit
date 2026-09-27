// If Rainlit doesn't manage to start (a script error, or it can't reach the server), say
// so on screen with what went wrong, instead of leaving a blank page. Loads before app.js.
(() => {
  const problems = [];
  addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : '';
    problems.push(`${e.message || (e.target && e.target.src ? `Couldn't load ${e.target.src}` : 'Error')}${where}`);
  }, true);
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    problems.push(`Promise: ${(r && (r.message || r.name)) || String(r)}`);
  });

  const started = () => {
    const auth = document.getElementById('auth');
    const app = document.getElementById('app');
    return Boolean(auth && app && (!auth.hidden || !app.hidden));
  };
  // Nothing went wrong, it's just slow (a weak signal, or the server restarting for an
  // update): say it's connecting, and give it longer before calling it a failure.
  let patience = 10000;
  const look = () => {
    if (started()) return;
    const starting = document.getElementById('starting');
    // (app.js is running, waiting for the server, and says so.)
    if (window.rainlitRunning && starting && !starting.hidden) return setTimeout(look, 5000);
    if (!problems.length && patience) {
      patience = 0;
      if (starting) starting.hidden = false;
      return setTimeout(look, 15000);
    }
    fail();
  };
  setTimeout(look, 10000);

  function fail() {
    const details = [
      ...problems,
      `Capacitor: ${window.Capacitor ? `yes (${window.Capacitor.getPlatform && window.Capacitor.getPlatform()})` : 'no'}`,
      navigator.userAgent,
    ].join('\n');
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;padding:24px;'
      + 'background:#151b28;color:#eceaf3;font:15px/1.5 system-ui,sans-serif;text-align:center';
    const inner = document.createElement('div');
    inner.style.cssText = 'max-width:520px;display:grid;gap:14px;justify-items:center';
    const title = document.createElement('strong');
    title.style.fontSize = '20px';
    title.textContent = "Rainlit didn't start";
    const text = document.createElement('p');
    text.style.cssText = 'margin:0;color:#a9b4c8';
    text.textContent = 'Try again. If it keeps happening, send what\'s below to whoever runs Rainlit.';
    const pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;max-width:100%;max-height:40vh;overflow:auto;padding:12px;border-radius:10px;'
      + 'background:#0e121c;color:#a9b4c8;font-size:12px;text-align:left;white-space:pre-wrap;word-break:break-word;user-select:text';
    pre.textContent = details;
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Try again';
    again.style.cssText = 'border:0;border-radius:999px;padding:12px 24px;background:#f5b94a;color:#22190a;font:inherit;font-weight:700';
    again.addEventListener('click', () => location.reload());
    inner.append(title, text, pre, again);
    box.append(inner);
    document.body.append(box);
    // (If it gets going after all, this goes away by itself.)
    const watch = setInterval(() => {
      if (!started()) return;
      clearInterval(watch);
      box.remove();
    }, 1000);
  }
})();

// Your Size (Settings > Size) goes on before anything is drawn, so nothing jumps.
try {
  const size = Number(localStorage.getItem('rainlit.uiScale'));
  const root = document.documentElement;
  if (size > 0 && size !== 1 && 'zoom' in root.style) {
    root.style.zoom = String(size);
    root.style.setProperty('--zoom', String(size));
  }
} catch {}
