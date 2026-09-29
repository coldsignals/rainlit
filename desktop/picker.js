// The "share your screen" chooser: screens first, then windows. Click one and press
// Share (or double-click it). Esc cancels.

const list = document.getElementById('list');
const shareBtn = document.getElementById('share');
const sound = document.getElementById('sound');
let chosen = null;
let native = { window: false, audio: false }; // (what the app can capture itself: see main.js)

const EVERYTHING = "Everything your computer is playing, except Rainlit itself, so your friend won't hear their own voice.";
const JUST_THE_APP = "Only the sound of the app you're sharing.";

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

// (A window picked: the note about games and videos lights up, where there is one; and the
// sound's just that app's, where the app can do that.)
function select(s, btn) {
  chosen = s.id;
  for (const b of list.querySelectorAll('.source')) b.setAttribute('aria-pressed', String(b === btn));
  const note = document.getElementById('window-note');
  if (note) note.classList.toggle('lit', !s.screen);
  document.getElementById('sound-what').textContent = !s.screen && native.window && native.audio ? JUST_THE_APP : EVERYTHING;
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
  native = data.native || native;
  document.getElementById('sound-row').hidden = !data.audio;
  const screens = data.sources.filter((s) => s.screen);
  const windows = data.sources.filter((s) => !s.screen);
  screens.forEach((s, i) => { if (screens.length > 1 && /^(Entire screen|Screen \d+)$/i.test(s.name)) s.name = `Screen ${i + 1}`; });
  // (Where the app can't capture a window itself, the engine grabs it the slow way, a few times a
  // second, so a game or a video shared on its own is choppy; a whole screen comes the fast way.)
  const note = screens.length && !native.window ? 'Games and videos are choppy when you share just their window. For those, share the whole screen.' : '';
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
