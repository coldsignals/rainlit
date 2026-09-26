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

  setTimeout(() => {
    const auth = document.getElementById('auth');
    const app = document.getElementById('app');
    const starting = document.getElementById('starting');
    if (!auth || !app || !auth.hidden || !app.hidden) return; // it started
    if (starting && !starting.hidden) return; // it's waiting for the server, and says so
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
  }, 10000);
})();
