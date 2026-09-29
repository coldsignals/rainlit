// The "share your screen" chooser: screens first, then windows. Click one and press
// Share (or double-click it). Esc cancels.

const list = document.getElementById('list');
const shareBtn = document.getElementById('share');
const sound = document.getElementById('sound');
let chosen = null;

function card(s) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'source';
  btn.setAttribute('aria-pressed', 'false');
  btn.title = s.name;
  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = '';
  img.src = s.thumb;
  const label = document.createElement('div');
  label.className = 'label';
  if (s.icon) {
    const icon = document.createElement('img');
    icon.alt = '';
    icon.src = s.icon;
    label.append(icon);
  }
  const name = document.createElement('span');
  name.textContent = s.name;
  label.append(name);
  btn.append(img, label);
  btn.addEventListener('click', () => select(s, btn));
  btn.addEventListener('dblclick', () => { select(s, btn); share(); });
  return btn;
}

// (A window picked: the note about games and videos lights up.)
function select(s, btn) {
  chosen = s.id;
  for (const b of list.querySelectorAll('.source')) b.setAttribute('aria-pressed', String(b === btn));
  const note = document.getElementById('window-note');
  if (note) note.classList.toggle('lit', !s.screen);
  shareBtn.disabled = false;
}

function section(title, items, note = '') {
  if (!items.length) return [];
  const h = document.createElement('h2');
  h.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.append(...items.map(card));
  if (!note) return [h, grid];
  const p = document.createElement('p');
  p.className = 'note';
  p.id = 'window-note';
  p.textContent = note;
  return [h, p, grid];
}

function share() {
  if (chosen) window.picker.choose(chosen, sound.checked);
}

(async () => {
  const data = await window.picker.sources();
  if (!data) return;
  document.getElementById('sound-row').hidden = !data.audio;
  const screens = data.sources.filter((s) => s.screen);
  const windows = data.sources.filter((s) => !s.screen);
  screens.forEach((s, i) => { if (screens.length > 1 && /^(Entire screen|Screen \d+)$/i.test(s.name)) s.name = `Screen ${i + 1}`; });
  // (On Windows, the app's engine grabs a single window the slow way, a few times a second, so
  // a game or a video shared on its own is choppy; a whole screen comes the fast way.)
  const note = screens.length ? 'Games and videos are choppy when you share just their window. For those, share the whole screen.' : '';
  list.replaceChildren(...section('Screens', screens), ...section('Windows', windows, note));
  if (!data.sources.length) list.innerHTML = '<p class="empty">Nothing to share was found.</p>';
  const first = list.querySelector('.source');
  if (first) first.focus();
})();

shareBtn.addEventListener('click', share);
document.getElementById('cancel').addEventListener('click', () => window.picker.cancel());
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.picker.cancel();
  if (e.key === 'Enter' && chosen && !(e.target instanceof HTMLButtonElement)) share();
});
