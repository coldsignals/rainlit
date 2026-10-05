'use strict';

// Homepages in the app: looking at someone's (full screen), and making your own. Editing, a
// drawer at the bottom holds things to add (text, stickers, pictures, tape and paper) and the
// page's settings; on the page, a piece is dragged to move it, and its handles resize and turn
// it. Everything saves as you go. Drawing a page is homepage.js; keeping it, lib/homepages.js.

(() => {
  const H = window.Homepage;
  const $ = (id) => document.getElementById(id);
  // What the app lends this (Homepage.connect, in public/app.js): api(), openUrl(), report(),
  // pickEmoji(), spaceEmoji(), me() and offersSupport() (whether this app can mention supporting
  // Rainlit: the Play Store's can't).
  let app = null;

  const state = {
    data: null, // what the server sent: { owner, doc, views, mine, visibility, usage, limitMb, piecesMax, supporter }
    doc: null, // the page as it is here (editing changes it)
    mounted: null, // { canvas, ctx, fit }
    editing: false,
    picked: null, // the id of the piece being changed
    tab: 'write',
    undo: [],
    redo: [],
    saveTimer: null,
    saving: false,
    dirty: false,
    again: false,
    typing: false, // (the text box's changes make one step of Undo)
  };

  const PALETTE = ['#ffffff', '#fff59d', '#ffd23f', '#ff9f43', '#ef4d5e', '#6b2737', '#ff8cc6', '#ffd0e6', '#c9b3ff', '#a57bff', '#8ae4ff', '#4c8dff', '#1f2c4a', '#9be3c1', '#6ad07a', '#2f4a3a', '#a86a3d', '#7a7590', '#4b5563', '#2b2233', '#000000'];
  const TAPE_COLORS = ['#f4a9c8', '#8fd3ff', '#9be3c1', '#ffe28a', '#c9b3ff', '#ff9f8a'];
  const WRITE = [
    { label: 'Title', p: { font: 'script', size: 48, color: '#ffffff', c3: '#ff7eb6', fx: 'glow', text: 'my corner of the web', w: 460, align: 'center' } },
    { label: 'Note', p: { font: 'hand', size: 28, color: '#3a2e2a', c2: '#fff59d', box: 'note', text: 'a little note', w: 220, align: 'center' } },
    { label: 'Label', p: { font: 'typewriter', size: 20, color: '#ffffff', c2: '#2b2233', box: 'label', text: 'LABEL', w: 200 } },
    { label: 'Speech bubble', p: { font: 'comic', size: 22, color: '#2b2233', c2: '#ffffff', box: 'bubble', text: 'hi!!', w: 200 } },
    { label: 'Caution', p: { font: 'tiny', size: 20, bold: true, color: '#1a1a1a', c2: '#ffd23f', box: 'hazard', text: 'UNDER CONSTRUCTION', w: 330, align: 'center' } },
    { label: 'Old web', p: { font: 'times', size: 30, color: '#0000ee', text: 'Welcome to my Home Page!', w: 420, align: 'center' } },
    { label: 'Rainbow', p: { font: 'bubble', size: 44, fx: 'rainbow', text: 'rainbow!!', w: 320, align: 'center' } },
    { label: 'Wavy', p: { font: 'bubble', size: 36, color: '#8ae4ff', fx: 'wave', text: 'wheee', w: 260, align: 'center' } },
    { label: 'Scrolling', p: { font: 'pixel', size: 26, color: '#ffe14d', fx: 'marquee', text: '*** thanks for stopping by ***', w: 420 } },
    { label: 'Terminal', p: { font: 'terminal', size: 24, color: '#39ff6a', c2: '#0b0f0b', box: 'box', text: 'C:\\> hello world_', w: 300 } },
    { label: 'Neon', p: { font: 'neon', size: 40, color: '#ffd0e6', fx: 'glow', c3: '#ff3fa4', text: 'OPEN', w: 240, align: 'center' } },
    { label: 'Spooky', p: { font: 'spooky', size: 44, color: '#8dff6a', fx: 'shadow', c3: '#2a1f33', text: 'boo!', w: 200, align: 'center' } },
    { label: 'Gothic', p: { font: 'gothic', size: 40, color: '#ffffff', fx: 'outline', c3: '#000000', text: 'Darkness', w: 280, align: 'center' } },
    { label: 'Marker', p: { font: 'marker', size: 32, color: '#2b2233', c2: '#ffe28a', box: 'highlight', text: 'important!!', w: 280 } },
  ];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const newId = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v) => Math.round(v * 10) / 10;
  const piece = (id) => (state.doc && state.doc.pieces.find((p) => p.id === id)) || null;
  const nodeOf = (id) => state.mounted && state.mounted.canvas.querySelector(`.hp-piece[data-id="${CSS.escape(id)}"]`);
  const scale = () => Number(getComputedStyle($('hp-page')).getPropertyValue('--hp-scale')) || 1;
  const snapshot = () => JSON.stringify(state.doc);

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter(Boolean));
    return n;
  }

  // A message over the page for a few seconds (the app's own sits under this full-screen view).
  let noteTimer = null;
  function note(text, ms = 3500) {
    const n = $('hp-toast');
    n.textContent = text;
    n.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { n.hidden = true; }, ms);
  }

  // ---------- Opening one ----------

  async function open(who, { edit = false } = {}) {
    const dialog = $('homepage');
    Object.assign(state, { data: null, doc: null, editing: false, picked: null, undo: [], redo: [], dirty: false, trying: null, glowTold: false });
    dialog.classList.remove('hp-editing');
    $('hp-dock').hidden = true;
    $('hp-message').hidden = true;
    $('hp-page').replaceChildren();
    $('hp-page').removeAttribute('style');
    $('hp-name').textContent = 'Homepage';
    $('hp-sub').textContent = '';
    $('hp-view-actions').hidden = true;
    $('hp-edit-actions').hidden = true;
    if (!dialog.open) dialog.showModal();
    $('hp-page').focus({ preventScroll: true }); // (so the keyboard scrolls it)
    let data;
    try {
      data = await app.api('GET', `/homepages/${encodeURIComponent(who)}`);
    } catch (err) {
      $('hp-message').textContent = err.message;
      $('hp-message').hidden = false;
      return;
    }
    state.data = data;
    state.doc = clone(data.doc || H.starter());
    draw();
    renderBar();
    if (edit && data.mine) startEditing();
  }

  function close() {
    const dialog = $('homepage');
    if (dialog.open) dialog.close();
  }

  // The page, drawn again (keeping where it's scrolled to).
  function draw() {
    const page = $('hp-page');
    const top = page.scrollTop;
    const doc = state.trying ? tried() : state.doc;
    const { owner, views, pet, mine } = state.data;
    state.mounted = H.mount(page, { owner, doc, views, pet, mine }, { edit: state.editing, report: app.report });
    page.scrollTop = top;
    if (state.editing) drawPicked();
  }

  function renderBar() {
    const { owner, mine } = state.data;
    $('hp-name').textContent = state.doc.title || `${owner.displayName}'s homepage`;
    const visits = mine ? ` · ${state.data.views} ${state.data.views === 1 ? 'visit' : 'visits'}` : '';
    $('hp-sub').textContent = `${location.host}/@${owner.username}${visits}`;
    $('hp-view-actions').hidden = state.editing;
    $('hp-edit-actions').hidden = !state.editing;
    $('hp-edit').hidden = !mine;
    $('hp-report').hidden = mine;
  }

  // ---------- Looking ----------

  function onPageClick(e) {
    if (state.editing) return;
    // Links open in a browser (in the apps, the system's), except to another homepage here: that
    // opens right here.
    const a = e.target.closest('a.hp-piece, a.hp-shelf-item');
    if (!a || !a.href) return;
    e.preventDefault();
    const u = new URL(a.href);
    const page = u.origin === location.origin && /^\/@([a-z0-9_.]{2,32})$/i.exec(u.pathname);
    if (page) open(`@${page[1]}`);
    else app.openUrl(a.href);
  }

  async function copyLink() {
    const { owner } = state.data;
    const url = `${location.origin}/@${owner.username}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return note(url, 8000);
    }
    const who = state.data.mine
      ? { everyone: 'Anyone can open it.', friends: 'Your friends can open it.', spaces: 'Your friends and people in your spaces can open it.' }[state.data.visibility]
      : '';
    note(`Link copied. ${who || ''}`.trim());
  }

  function report() {
    const { owner } = state.data;
    app.report({ userId: owner.id, name: owner.displayName, homepage: true });
  }

  // ---------- Editing ----------

  function startEditing() {
    state.editing = true;
    state.picked = null;
    $('homepage').classList.add('hp-editing');
    $('hp-dock').hidden = false;
    renderBar();
    draw();
    renderTray();
    updateUndo();
    setSaved(state.data.doc ? 'Saved' : 'Not saved yet');
  }

  async function stopEditing() {
    await flush();
    state.trying = null;
    state.editing = false;
    state.picked = null;
    $('homepage').classList.remove('hp-editing');
    $('hp-dock').hidden = true;
    renderBar();
    draw();
  }

  function setSaved(text, problem = false) {
    $('hp-saved').textContent = text;
    $('hp-saved').classList.toggle('problem', problem);
  }

  // A change to the page: one step of Undo, then drawn again and saved.
  function change(fn) {
    if (state.catching) {
      state.caught = fn; // (trying a Glow extra on: see tryOn)
      return;
    }
    const before = snapshot();
    state.trying = null;
    fn(state.doc);
    commit(before);
  }

  // A Glow extra, for someone without Glow: tried on. It's drawn on the page (a copy of it), never
  // saved; the same one again, or any real change, ends it. Glow's box shows the first time.
  function tryOn(key, label, onPick) {
    if (state.trying && state.trying.key === key) {
      state.trying = null;
    } else {
      state.catching = true;
      try {
        onPick(key); // (its change, caught instead of made)
      } finally {
        state.catching = false;
      }
      if (!state.caught) return;
      state.trying = { key, label, fn: state.caught };
      state.caught = null;
    }
    draw();
    renderTray();
    if (state.trying && !state.glowTold && app && app.openGlow) {
      state.glowTold = true;
      app.openGlow({ because: `${label} comes with Glow. It's on your page to see, but not saved.` });
    }
  }

  function tried() {
    const doc = clone(state.doc);
    try {
      state.trying.fn(doc);
    } catch {}
    return doc;
  }

  function commit(before) {
    if (before === snapshot()) return;
    state.undo.push(before);
    if (state.undo.length > 100) state.undo.shift();
    state.redo = [];
    growPage();
    draw();
    renderTray();
    updateUndo();
    scheduleSave();
  }

  // The page gets longer to fit whatever's near its bottom.
  function growPage() {
    let bottom = 0;
    for (const p of state.doc.pieces) bottom = Math.max(bottom, p.y + (p.h || 0));
    if (bottom + 160 > state.doc.height) state.doc.height = clamp(Math.ceil((bottom + 240) / 100) * 100, 600, 6000);
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    state.doc = JSON.parse(state.undo.pop());
    afterHistory();
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    state.doc = JSON.parse(state.redo.pop());
    afterHistory();
  }

  function afterHistory() {
    state.trying = null;
    if (state.picked && !piece(state.picked)) state.picked = null;
    draw();
    renderTray();
    updateUndo();
    scheduleSave();
  }

  function updateUndo() {
    $('hp-undo').disabled = !state.undo.length;
    $('hp-redo').disabled = !state.redo.length;
  }

  // Saving: a moment after the last change, the whole page.
  function scheduleSave() {
    state.dirty = true;
    setSaved('Saving…');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(save, 900);
  }

  async function save() {
    clearTimeout(state.saveTimer);
    if (state.saving) {
      state.again = true;
      return;
    }
    state.saving = true;
    state.dirty = false;
    try {
      const data = await app.api('PUT', '/homepages/me', { doc: state.doc });
      Object.assign(state.data, { doc: data.doc, usage: data.usage, visibility: data.visibility, pet: data.pet || null });
      if (!state.dirty) setSaved('Saved');
    } catch (err) {
      state.dirty = true;
      setSaved(err.status === 413 ? 'Too big to save' : "Couldn't save. Trying again…", true);
      state.saveTimer = setTimeout(save, 5000);
    } finally {
      state.saving = false;
      if (state.again) {
        state.again = false;
        save();
      }
    }
  }

  async function flush() {
    clearTimeout(state.saveTimer);
    if (state.dirty && !state.saving) await save();
    for (let i = 0; state.saving && i < 50; i++) await new Promise((r) => setTimeout(r, 100));
  }

  // ---------- Picking and moving pieces ----------

  function pick(id) {
    if (state.trying && id !== state.picked) state.trying = null;
    state.picked = id;
    state.typing = false;
    drawPicked();
    renderTray();
  }

  // The box around the picked piece, with its handles.
  function drawPicked() {
    const canvas = state.mounted && state.mounted.canvas;
    if (!canvas) return;
    for (const n of canvas.querySelectorAll('.hp-select')) n.remove();
    for (const n of canvas.querySelectorAll('.hp-picked')) n.classList.remove('hp-picked');
    const p = piece(state.picked);
    const node = p && nodeOf(p.id);
    if (!node) return;
    node.classList.add('hp-picked');
    const h = heightOf(p, node);
    const box = el('div', { class: 'hp-select', style: { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${h}px`, transform: `rotate(${p.r || 0}deg)` } },
      el('span', { class: 'hp-handle hp-h-turn', 'data-kind': 'turn', title: 'Turn (or press R)' }),
      el('span', { class: 'hp-handle hp-h-scale', 'data-kind': 'scale', title: 'Resize' }),
      p.t === 'text' ? el('span', { class: 'hp-handle hp-h-width', 'data-kind': 'width', title: 'Width' }) : null);
    canvas.append(box);
  }

  // Text is as tall as its words; everything else, as it's set.
  function heightOf(p, node = nodeOf(p.id)) {
    return p.t === 'text' && node ? node.offsetHeight : p.h;
  }

  // Redraws one piece in place (while it's being dragged or typed into).
  function redrawPiece(p) {
    const old = nodeOf(p.id);
    if (!old) return;
    const fresh = H.pieceEl(p, state.mounted.ctx);
    fresh.classList.add('hp-picked');
    old.replaceWith(fresh);
    const box = state.mounted.canvas.querySelector('.hp-select');
    if (box) {
      const h = heightOf(p, fresh);
      Object.assign(box.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${h}px`, transform: `rotate(${p.r || 0}deg)` });
    }
  }

  function onPointerDown(e) {
    if (!state.editing || e.button > 0) return;
    const handle = e.target.closest('.hp-handle');
    if (handle && state.picked) return gesture(e, handle.dataset.kind);
    const node = e.target.closest('.hp-piece');
    if (node) {
      const already = state.picked === node.dataset.id;
      if (!already) pick(node.dataset.id);
      // On a touch screen, the first touch picks it (so a page covered in pieces still scrolls);
      // then it can be dragged.
      if (already || e.pointerType !== 'touch') gesture(e, 'move');
      return;
    }
    if (e.target.closest('.hp-room') || e.target === $('hp-page')) {
      if (state.picked) pick(null);
    }
  }

  function gesture(e, kind) {
    const p = piece(state.picked);
    if (!p) return;
    e.preventDefault();
    const page = $('hp-page');
    const canvas = state.mounted.canvas;
    const s = scale();
    const at = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / s, y: (ev.clientY - r.top) / s };
    };
    const start = at(e);
    const h0 = heightOf(p);
    const g = { x: p.x, y: p.y, w: p.w, h: h0, r: p.r || 0, size: p.size, cx: p.x + p.w / 2, cy: p.y + h0 / 2 };
    const local = (pt) => {
      const a = (-g.r * Math.PI) / 180;
      const dx = pt.x - g.cx;
      const dy = pt.y - g.cy;
      return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
    };
    const l0 = local(start);
    const before = snapshot();
    let moved = false;
    try {
      page.setPointerCapture(e.pointerId);
    } catch {} // (a pointer that's already up)

    const move = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      const pt = at(ev);
      if (!moved && Math.hypot(pt.x - start.x, pt.y - start.y) * s < 3) return;
      moved = true;
      if (kind === 'move') {
        p.x = round(clamp(g.x + pt.x - start.x, -p.w + 24, H.WIDTH - 24));
        p.y = round(clamp(g.y + pt.y - start.y, -h0 + 24, 5980));
      } else if (kind === 'turn') {
        const a0 = Math.atan2(start.y - g.cy, start.x - g.cx);
        const a1 = Math.atan2(pt.y - g.cy, pt.x - g.cx);
        let r = g.r + ((a1 - a0) * 180) / Math.PI;
        r = ((((r + 180) % 360) + 360) % 360) - 180;
        if (!ev.shiftKey) for (const snap of [-180, -90, -45, 0, 45, 90, 180]) if (Math.abs(r - snap) < 4) r = snap;
        p.r = round(r);
      } else if (kind === 'width') {
        const l = local(pt);
        p.w = round(clamp((g.w * Math.abs(l.x)) / Math.max(1, Math.abs(l0.x)), 40, 1600));
        p.x = round(g.cx - p.w / 2);
      } else if (p.t === 'tape' || p.t === 'paper') {
        // (these stretch any way)
        const l = local(pt);
        p.w = round(clamp((g.w * Math.abs(l.x)) / Math.max(1, Math.abs(l0.x)), 16, 1600));
        p.h = round(clamp((g.h * Math.abs(l.y)) / Math.max(1, Math.abs(l0.y)), 10, 2400));
        p.x = round(g.cx - p.w / 2);
        p.y = round(g.cy - p.h / 2);
      } else {
        // (everything else keeps its shape)
        const d0 = Math.hypot(start.x - g.cx, start.y - g.cy) || 1;
        const f = clamp(Math.hypot(pt.x - g.cx, pt.y - g.cy) / d0, 16 / Math.min(g.w, g.h), 1600 / Math.max(g.w, g.h));
        p.w = round(g.w * f);
        p.h = round(g.h * f);
        if (p.t === 'text') p.size = round(clamp(g.size * f, 8, 240));
        p.x = round(g.cx - p.w / 2);
        p.y = round(g.cy - p.h / 2);
      }
      redrawPiece(p);
    };
    const end = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      page.removeEventListener('pointermove', move);
      page.removeEventListener('pointerup', end);
      page.removeEventListener('pointercancel', end);
      if (page.hasPointerCapture(e.pointerId)) page.releasePointerCapture(e.pointerId);
      if (!moved) return;
      if (p.t === 'text') p.h = round(heightOf(p));
      commit(before);
    };
    page.addEventListener('pointermove', move);
    page.addEventListener('pointerup', end);
    page.addEventListener('pointercancel', end);
  }

  function onDoubleClick(e) {
    if (!state.editing) return;
    const node = e.target.closest('.hp-piece');
    const p = node && piece(node.dataset.id);
    if (p && p.t === 'text') {
      pick(p.id);
      const box = $('hp-tray').querySelector('textarea');
      if (box) {
        box.focus();
        box.select();
      }
    }
  }

  function onKey(e) {
    if (!state.editing || !$('homepage').open) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('dialog[open]:not(#homepage)')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if (mod && k === 'y') {
      e.preventDefault();
      return redo();
    }
    const p = piece(state.picked);
    if (!p) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      return remove();
    }
    if (mod && k === 'd') {
      e.preventDefault();
      return duplicate();
    }
    if (!mod && k === 'r') {
      e.preventDefault();
      return change(() => { p.r = round(((((p.r || 0) + (e.shiftKey ? -15 : 15) + 180) % 360) + 360) % 360 - 180); });
    }
    const step = e.shiftKey ? 10 : 1;
    const arrows = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
    if (arrows[k]) {
      e.preventDefault();
      change(() => {
        p.x = round(p.x + arrows[k][0]);
        p.y = round(p.y + arrows[k][1]);
      });
    }
  }

  // The Escape key (and Android's back button): let go of the piece, then stop editing, then close.
  function back() {
    const dialog = $('homepage');
    if (!dialog.open) return false;
    if (H.closeTopPopup($('hp-page'))) return true;
    if (state.editing && state.picked) {
      pick(null);
      return true;
    }
    if (state.editing) {
      stopEditing();
      return true;
    }
    return false;
  }

  // ---------- Adding and changing pieces ----------

  // Where to put something new: the middle of what's showing of the page.
  function spot(w, h) {
    const page = $('hp-page');
    const s = scale();
    const y = (page.scrollTop + page.clientHeight / 2) / s;
    const jitter = () => Math.round((Math.random() - 0.5) * 60);
    return { x: round(clamp(H.WIDTH / 2 - w / 2 + jitter(), 0, H.WIDTH - w)), y: round(Math.max(20, y - h / 2 + jitter())) };
  }

  function add(fields) {
    const p = { id: newId(), r: round((Math.random() - 0.5) * 8), ...fields };
    if (fields.x === undefined) Object.assign(p, spot(p.w, p.h));
    change((doc) => doc.pieces.push(p));
    pick(p.id);
    return p;
  }

  function addText(preset) {
    const p = add({
      t: 'text', text: 'your words', font: 'rainlit', size: 28, color: '#2b2233', c2: '#fff59d', c3: '#ff7eb6',
      fx: 'none', box: 'none', align: 'left', bold: false, italic: false, href: '', w: 300, h: 60, ...clone(preset),
    });
    const box = $('hp-tray').querySelector('textarea');
    if (box && p) {
      box.focus();
      box.select();
    }
  }

  function addSticker(fields) {
    add({ t: 'sticker', outline: true, href: '', ...fields });
  }

  function addPixel(name) {
    const rows = H.PIXEL[name];
    const unit = 5;
    addSticker({ set: 'pixel', name, w: rows[0].length * unit, h: rows.length * unit });
  }

  function remove() {
    const id = state.picked;
    if (!id) return;
    state.picked = null;
    change((doc) => { doc.pieces = doc.pieces.filter((p) => p.id !== id); });
  }

  function duplicate() {
    const p = piece(state.picked);
    if (!p) return;
    const copy = { ...clone(p), id: newId(), x: round(p.x + 24), y: round(p.y + 24) };
    change((doc) => doc.pieces.push(copy));
    pick(copy.id);
  }

  function restack(dir) {
    const id = state.picked;
    change((doc) => {
      const i = doc.pieces.findIndex((p) => p.id === id);
      if (i < 0) return;
      const [p] = doc.pieces.splice(i, 1);
      doc.pieces.splice(dir > 0 ? doc.pieces.length : 0, 0, p);
    });
  }

  // Pictures and videos: uploaded, then onto the page at a sensible size (or a picture behind it).
  async function upload(files, { background = false } = {}) {
    for (const file of files) {
      if (!background && /^video\//.test(file.type)) {
        const f = await uploadVideo(file);
        if (!f) continue;
        const k = Math.min(1, 360 / Math.max(f.shape.w, f.shape.h));
        add({ t: 'video', file: f.id, frame: 'none', caption: '', href: '', w: round(Math.max(48, f.shape.w * k)), h: round(Math.max(48, f.shape.h * k)) });
        continue;
      }
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
        note(`${file.name}: pictures can be PNG, JPG, GIF or WebP${background ? '' : ', and videos MP4 or WebM'}.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        note(`${file.name} is too big: pictures can be up to 5 MB.`);
        continue;
      }
      setSaved('Uploading…');
      try {
        const { file: f, usage } = await app.api('POST', '/homepages/me/files', file);
        state.data.usage = usage;
        if (background) {
          change((doc) => { doc.bg = { ...doc.bg, kind: 'image', file: f.id, fit: doc.bg.fit || 'cover' }; });
          continue;
        }
        const { w, h } = await sizeOf(f.url);
        const k = Math.min(1, 320 / Math.max(w, h));
        add({ t: 'image', file: f.id, frame: 'none', caption: '', href: '', w: round(Math.max(24, w * k)), h: round(Math.max(24, h * k)) });
      } catch (err) {
        note(err.message);
        setSaved(state.dirty ? 'Saving…' : 'Saved');
      }
    }
  }

  // A video's size, from this browser playing it: null if it can't (one made with a codec it
  // doesn't have, say), and 0 by 0 if there's no picture in it.
  function videoShape(file) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      let timer = 0;
      const done = (shape) => {
        clearTimeout(timer);
        v.onloadedmetadata = v.onerror = null;
        v.removeAttribute('src');
        v.load();
        URL.revokeObjectURL(url);
        resolve(shape);
      };
      timer = setTimeout(() => done(null), 10_000);
      v.muted = true;
      v.preload = 'metadata';
      v.onloadedmetadata = () => done({ w: v.videoWidth || 0, h: v.videoHeight || 0 });
      v.onerror = () => done(null);
      v.src = url;
    });
  }

  // A video, uploaded (once it's been checked it plays here): the file, and its shape. Or null.
  async function uploadVideo(file) {
    if (file.size > 20 * 1024 * 1024) return void note(`${file.name} is too big: videos can be up to 20 MB.`);
    const shape = await videoShape(file);
    if (!shape) return void note(`${file.name} won't play in this browser. Videos can be MP4 (H.264) or WebM.`);
    if (!shape.w || !shape.h) return void note(`${file.name} has no picture in it. (A song? Add it with the music player, in Old web.)`);
    setSaved('Uploading…');
    try {
      const { file: f, usage } = await app.api('POST', '/homepages/me/files', file);
      state.data.usage = usage;
      if (f.kind !== 'video') {
        setSaved(state.dirty ? 'Saving…' : 'Saved');
        return void note(`${file.name} isn't a video. Videos can be MP4 or WebM.`);
      }
      return { ...f, shape };
    } catch (err) {
      note(err.message);
      setSaved(state.dirty ? 'Saving…' : 'Saved');
      return null;
    }
  }

  // A video for a piece to pop up when it's clicked: picked, uploaded, and handed on (with its name).
  function videoButton(label, onDone) {
    const input = el('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      const f = await uploadVideo(file);
      if (f) onDone(f, file.name.trim().slice(0, 60));
    });
    return el('label', { class: 'hp-item wide hp-upload-btn' }, el('span', { text: label }), input);
  }

  // A song for a music player: a new player, or a different song for one (`piece`).
  async function uploadSong(file, piece = null) {
    if (file.size > 10 * 1024 * 1024) return note(`${file.name} is too big: songs can be up to 10 MB.`);
    setSaved('Uploading…');
    try {
      const { file: f, usage } = await app.api('POST', '/homepages/me/files', file);
      state.data.usage = usage;
      if (f.kind !== 'audio') {
        setSaved(state.dirty ? 'Saving…' : 'Saved');
        return note(`${file.name} isn't a song. Songs can be MP3, M4A, OGG, FLAC or WAV.`);
      }
      const title = file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').trim().slice(0, 80);
      if (piece) change(() => Object.assign(piece, { file: f.id, title: title || piece.title }));
      else add({ t: 'music', file: f.id, title, style: 'tunebox', color: '#a57bff', w: 300, h: 64 });
    } catch (err) {
      note(err.message);
      setSaved(state.dirty ? 'Saving…' : 'Saved');
    }
  }

  // Covers for a shelf (by its id: it may have changed by the time they're uploaded): pictures,
  // or found from a link (a game's store page, an album...).
  async function addCovers(id, files) {
    for (const file of files) {
      const shelf = piece(id);
      if (!shelf) return;
      if (shelf.items.length >= 8) return note('A shelf holds 8. Add another shelf for more.');
      if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
        note(`${file.name}: pictures can be PNG, JPG, GIF or WebP.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        note(`${file.name} is too big: pictures can be up to 5 MB.`);
        continue;
      }
      setSaved('Uploading…');
      try {
        const { file: f, usage } = await app.api('POST', '/homepages/me/files', file);
        state.data.usage = usage;
        const now = piece(id);
        if (now) change(() => now.items.push({ file: f.id, title: file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 60), href: '' }));
      } catch (err) {
        note(err.message);
        setSaved(state.dirty ? 'Saving…' : 'Saved');
      }
    }
  }

  async function addCoverFrom(id, url) {
    const shelf = piece(id);
    if (!shelf || !url.trim()) return;
    if (shelf.items.length >= 8) return note('A shelf holds 8. Add another shelf for more.');
    setSaved('Looking it up…');
    try {
      const found = await app.api('POST', '/homepages/me/cover', { url: /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}` });
      state.data.usage = found.usage;
      const now = piece(id);
      if (now) change(() => now.items.push({ file: found.file.id, title: (found.title || '').slice(0, 60), href: found.href }));
      else setSaved(state.dirty ? 'Saving…' : 'Saved');
    } catch (err) {
      note(err.message);
      setSaved(state.dirty ? 'Saving…' : 'Saved');
    }
  }

  function songButton(label, piece = null) {
    const input = el('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.ogg,.oga,.opus,.flac,.wav' });
    input.addEventListener('change', () => {
      const f = input.files[0];
      input.value = '';
      if (f) uploadSong(f, piece);
    });
    return el('label', { class: 'hp-item wide hp-upload-btn' }, el('span', { text: label }), input);
  }

  function sizeOf(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 300 });
      img.onerror = () => resolve({ w: 300, h: 300 });
      img.src = url;
    });
  }

  // ---------- The drawer ----------

  const TABS = [['write', 'Write'], ['stickers', 'Stickers'], ['pictures', 'Pictures'], ['tape', 'Tape & paper'], ['oldweb', 'Old web'], ['pet', 'Pet'], ['page', 'Page']];

  function renderTabs() {
    const tabs = $('hp-tabs');
    tabs.replaceChildren(...TABS.map(([key, label]) => el('button', {
      class: 'hp-tab', type: 'button', role: 'tab', 'aria-selected': String(!state.picked && state.tab === key), text: label,
      onclick: () => {
        state.tab = key;
        state.friendPicker = false;
        if (state.picked) pick(null);
        else renderTray();
      },
    })));
  }

  function renderTray() {
    if (!state.editing) return;
    renderTabs();
    const tray = $('hp-tray');
    const top = tray.scrollTop;
    const p = piece(state.picked);
    tray.replaceChildren(...(p ? pickedPanel(p) : { write: writeTab, stickers: stickersTab, pictures: picturesTab, tape: tapeTab, oldweb: oldWebTab, pet: petTab, page: pageTab }[state.tab]()));
    if (p) tray.scrollTop = top;
  }

  const h3 = (text) => el('h3', { text });

  function writeTab() {
    const items = WRITE.map(({ label, p }) => {
      const f = H.FONTS[p.font] || H.FONTS.rainlit;
      const sample = el('span', { text: label, style: { fontFamily: f.css, fontSize: `${Math.min(22, 17 * (f.scale || 1))}px` } });
      return el('button', { class: 'hp-item wide hp-write-item', type: 'button', title: `Add ${label.toLowerCase()} text`, onclick: () => addText(p) }, sample);
    });
    const me = el('button', {
      class: 'hp-item wide', type: 'button', text: 'Your profile card',
      onclick: () => add({ t: 'me', style: 'card', color: '#fffaf0', font: 'rainlit', w: 240, h: 270 }),
    });
    return [h3('Add words'), el('div', { class: 'hp-grid' }, ...items), h3('About you'), el('div', { class: 'hp-grid' }, me)];
  }

  function stickersTab() {
    const sticker = (name) => el('button', { class: 'hp-item', type: 'button', title: H.PIXEL_NAMES[name] || name, onclick: () => addPixel(name) },
      el('img', { src: H.pixelSrc(name), alt: H.PIXEL_NAMES[name] || name }));
    const desktop = new Set(H.DESKTOP);
    const out = [h3('Pixel stickers'), el('div', { class: 'hp-grid' }, ...Object.keys(H.PIXEL).filter((n) => !desktop.has(n)).map(sticker)),
      h3('From an old desktop'), el('div', { class: 'hp-grid' }, ...H.DESKTOP.filter((n) => H.PIXEL[n]).map(sticker)), h3('Any emoji'),
      el('div', { class: 'hp-grid' }, el('button', {
        class: 'hp-item wide', type: 'button', text: 'Pick an emoji…',
        onclick: () => app.pickEmoji((picked) => {
          if (picked && picked.unicode) addSticker({ set: 'emoji', emoji: picked.unicode, w: 88, h: 88 });
          else if (picked && picked.custom) addSticker({ set: 'custom', emoji: picked.custom.id, name: picked.custom.name, w: 88, h: 88 });
        }),
      }))];
    const mine = app.spaceEmoji();
    if (mine.length) {
      out.push(h3("Your spaces' emoji"), el('div', { class: 'hp-grid' }, ...mine.map((e) => el('button', {
        class: 'hp-item custom', type: 'button', title: `:${e.name}:`,
        onclick: () => addSticker({ set: 'custom', emoji: e.id, name: e.name, w: 88, h: 88 }),
      }, el('img', { src: `/emoji/${e.id}`, alt: `:${e.name}:` })))));
    }
    return out;
  }

  function usageText() {
    const mb = (state.data.usage || 0) / (1024 * 1024);
    return `${mb < 0.1 && mb > 0 ? '0.1' : mb.toFixed(1)} MB of ${state.data.limitMb || 40} MB used.`;
  }

  function uploadButton(label, opts = {}) {
    const accept = `image/png,image/jpeg,image/gif,image/webp${opts.background ? '' : ',video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v'}`;
    const input = el('input', { type: 'file', accept, multiple: !opts.background });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = '';
      upload(files, opts);
    });
    return el('label', { class: 'hp-item wide hp-upload-btn' }, el('span', { text: label }), input);
  }

  function picturesTab() {
    return [
      h3('Pictures, GIFs and videos'),
      el('div', { class: 'hp-grid' }, uploadButton('Add pictures or videos…')),
      el('p', { class: 'hp-note-small', text: `Pictures can be PNG, JPG, GIF or WebP (up to 5 MB each), and videos MP4 or WebM (up to 20 MB; they play without their sound till a visitor turns it on). ${usageText()} Pick one on the page to give it a frame (an old window, say), a caption, or something to do when it's clicked: open a link, or pop up a video.` }),
    ];
  }

  function tapeTab() {
    const tapes = [];
    for (const style of Object.keys(H.TAPES)) {
      for (const color of TAPE_COLORS.slice(0, style === 'plain' ? 6 : 3)) {
        const sample = { id: 'x', t: 'tape', x: 0, y: 0, w: 64, h: 30, r: 0, style, color };
        const node = H.pieceEl(sample, { edit: true, owner: {}, fileUrl: () => '' });
        Object.assign(node.style, { position: 'static', transform: 'none' });
        tapes.push(el('button', { class: 'hp-item hp-swatch', type: 'button', title: `${H.TAPES[style]} tape`, onclick: () => add({ t: 'tape', style, color, w: 150, h: 34 }) }, node));
      }
    }
    const papers = Object.entries(H.PAPERS).map(([style, label]) => {
      const color = { sticky: '#fff59d', kraft: '#c9a27a' }[style] || '#fffdf6';
      const sample = { id: 'x', t: 'paper', x: 0, y: 0, w: 60, h: 48, r: 0, style, color };
      const node = H.pieceEl(sample, { edit: true, owner: {}, fileUrl: () => '' });
      Object.assign(node.style, { position: 'static', transform: 'none', boxShadow: 'none' });
      return el('button', { class: 'hp-item hp-paper-item', type: 'button', title: label, onclick: () => add({ t: 'paper', style, color, w: style === 'sticky' ? 220 : 300, h: style === 'sticky' ? 220 : 360 }) }, node);
    });
    return [h3('Tape'), el('div', { class: 'hp-grid' }, ...tapes), h3('Paper (put words on it)'), el('div', { class: 'hp-grid' }, ...papers)];
  }

  function oldWebTab() {
    return [
      h3('From the old web'),
      el('div', { class: 'hp-grid' },
        el('button', {
          class: 'hp-item wide', type: 'button', text: 'Visitor counter',
          onclick: () => add({ t: 'counter', style: 'odometer', label: 'visitors', color: '#39ff6a', w: 240, h: 80 }),
        }),
        el('button', {
          class: 'hp-item wide', type: 'button', text: 'Guestbook',
          onclick: () => add({ t: 'guestbook', style: 'paper', title: 'sign my guestbook!', color: '#fffdf6', font: 'hand', w: 300, h: 380 }),
        }),
        el('button', {
          class: 'hp-item wide', type: 'button', text: 'Ask me anything',
          onclick: () => add({ t: 'ask', style: 'paper', title: 'ask me anything!', color: '#fffdf6', font: 'hand', anon: true, w: 320, h: 420 }),
        }),
        songButton('Music player (pick a song)…'),
        el('button', {
          class: 'hp-item wide', type: 'button', text: 'Shelf',
          onclick: () => add({ t: 'shelf', style: 'wood', items: [], labels: true, w: 520, h: 210 }),
        }),
        el('button', {
          class: 'hp-item wide', type: 'button', text: 'Taskbar',
          onclick: () => {
            // (Along the bottom of what's showing, the page's width.)
            const page = $('hp-page');
            const y = (page.scrollTop + page.clientHeight) / scale() - 50;
            add({ t: 'taskbar', style: 'window', label: 'start', x: 0, y: round(Math.max(0, y)), r: 0, w: H.WIDTH, h: 36 });
          },
        }),
        el('button', {
          class: 'hp-item wide', type: 'button', text: 'Friend button…', 'aria-expanded': String(Boolean(state.friendPicker)),
          onclick: () => {
            state.friendPicker = !state.friendPicker;
            renderTray();
          },
        })),
      ...(state.friendPicker ? friendPicker() : []),
      ...(supporter() || glowOffered() ? [el('div', { style: { marginTop: '14px' } }, perkBox(el('div', { class: 'hp-grid' }, glowItem('fortune', 'Fortune ball', 'The fortune ball', {
        t: 'fortune', color: '#b98bff', label: 'ask me something, then click me', answers: [], w: 200, h: 250,
      })), tryingNow('piece:')))] : []),
      el('p', { class: 'hp-note-small', text: 'Visitors sign your guestbook themselves (you can delete anything in it). In an "ask me anything" box, they ask you things (anonymously, if you let them), and what you answer shows on your page. Songs can be MP3, M4A, OGG, FLAC or WAV, up to 10 MB, and only play when a visitor presses play. A shelf shows off favourite games, music or shows by their covers. A friend button (like the old web\'s little 88x31 badges) takes visitors to a friend\'s page. A taskbar has a start button and a clock (each visitor\'s own time). A fortune ball answers whatever visitors ask it.' }),
    ];
  }

  // A friend button: pick whose page it goes to, and it's made from them (their name, their card's
  // colours and font if they've made one, and a sticker), ready to change. Or one of your own, to
  // link anywhere.
  function friendPicker() {
    const friends = (app.friends ? app.friends() : []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
    return [
      h3('Whose page?'),
      friends.length
        ? el('div', { class: 'hp-friends' }, ...friends.map((f) => el('button', {
          class: 'hp-friend', type: 'button', title: `A button to ${f.displayName}'s page`, onclick: () => addFriendButton(f),
        }, app.face(f), el('span', { text: f.displayName }))))
        : el('p', { class: 'hp-note-small', text: 'Once you have friends on Rainlit, a button can take visitors to their pages.' }),
      ...(friends.length ? [el('p', { class: 'hp-note-small', text: 'It opens their page for whoever they let see it.' })] : []),
      el('div', { class: 'hp-grid' }, el('button', {
        class: 'hp-item wide', type: 'button', text: 'Your own (link it anywhere)',
        onclick: () => {
          state.friendPicker = false;
          add({ t: 'button', text: 'my page', icon: 'flame', style: 'bevel', c1: '#1b2a8f', c2: '#ffffff', font: 'tiny', href: '', w: 132, h: 46.5 });
        },
      })),
    ];
  }

  // (Stickers about as wide as they're tall, so the name has room beside them.)
  const BUTTON_STICKERS = ['heart', 'star', 'sparkle', 'moon', 'flame', 'raindrop', 'leaf', 'mushroom', 'music', 'bolt', 'coffee', 'rocket', 'headphones', 'smiley', 'ghost', 'umbrella', 'floppy', 'cherry'];
  const BUTTON_COLORS = ['#1b2a8f', '#11706b', '#5b2a86', '#7a1f3d', '#245c2f', '#3a4157', '#8a3b12', '#111111'];

  function addFriendButton(f) {
    state.friendPicker = false;
    // (The same sticker and colour each time for the same friend, unless their card has colours.)
    const n = [...f.username].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const card = f.card;
    const c1 = card ? card.c1 : BUTTON_COLORS[n % BUTTON_COLORS.length];
    add({
      t: 'button', text: buttonWords(f.displayName), icon: BUTTON_STICKERS[n % BUTTON_STICKERS.length], style: 'bevel',
      c1, c2: H.light(c1) ? '#1d1a24' : '#ffffff', font: card && card.font !== 'rainlit' && H.FONTS[card.font] ? card.font : 'tiny',
      href: `${location.origin}/@${f.username}`, w: 132, h: 46.5,
    });
  }

  // A name on a button: one line if it's short, otherwise two (split at the space nearest the middle).
  function buttonWords(name) {
    const s = name.trim().slice(0, 40);
    if (s.length <= 8 || !s.includes(' ')) return s;
    const mid = s.length / 2;
    let at = -1;
    for (let i = s.indexOf(' '); i >= 0; i = s.indexOf(' ', i + 1)) if (at < 0 || Math.abs(i - mid) < Math.abs(at - mid)) at = i;
    return `${s.slice(0, at)}\n${s.slice(at + 1)}`;
  }

  // ---------- Glow's ----------
  const supporter = () => Boolean(state.data && state.data.supporter);
  // (Whether this app can show Glow: not the Play Store's.)
  const glowOffered = () => (!app ? true : app.glowShown ? app.glowShown() : !app.offersSupport || app.offersSupport());
  // What's being tried on, if its key starts with `prefix` (without it).
  const tryingNow = (prefix) => (state.trying && state.trying.key.startsWith(prefix) ? state.trying.key.slice(prefix.length) : null);
  const seeGlow = () => app && app.openGlow && app.openGlow();

  // Glow's things together, in a box in the Glow colours with its name on a tag across the top
  // (like Glow's themes in Settings), and, while one's tried on, a note that it isn't saved.
  function perkBox(content, trying) {
    const note = trying ? el('p', { class: 'hp-perk-note' },
      `Trying ${state.trying.label.replace(/^The /, 'the ')} on: it isn't saved. `,
      el('button', { class: 'hp-perk-more', type: 'button', text: 'See Glow', onclick: seeGlow })) : null;
    return el('div', { class: 'hp-perks', role: 'group', 'aria-label': 'Comes with Glow' },
      el('button', { class: 'hp-perk-tag', type: 'button', title: "What's Glow?", text: (app && app.perkName) || 'Glow', onclick: seeGlow }),
      content, note);
  }

  // A piece that comes with Glow: added, or (without Glow) tried on.
  function glowItem(key, text, label, fields) {
    const trying = tryingNow('piece:') === key;
    return el('button', {
      class: `hp-item wide${trying ? ' hp-chip-trying' : ''}`, type: 'button', text,
      title: supporter() ? undefined : 'Comes with Glow: try it on',
      onclick: () => {
        if (supporter()) return add(clone(fields));
        tryOn(`piece:${key}`, label, () => {
          const p = { id: newId(), r: 0, ...clone(fields) };
          Object.assign(p, spot(p.w, p.h));
          change((doc) => doc.pieces.push(p));
        });
      },
    });
  }

  // ---------- Your pet ----------
  // Your pet lives in its room in the app (the button by your profile), where you pick it and look
  // after it. Here: whether it lives on your page too, wandering about it for visitors to pet.
  function petTab() {
    const pet = app && app.pet ? app.pet() : null;
    const room = () => app && app.openPet && app.openPet();
    if (!pet) {
      return [h3('A pet for your page'),
        el('p', { class: 'hp-note-small', text: "Adopt a pixel pet (a cat, a dog or a fish) and it can live here too: it wanders about your page, naps, and comes to see what visitors' pointers are up to, and anyone who can see your page can pet it." }),
        el('div', { class: 'hp-row' }, el('button', { class: 'hp-tool dark', type: 'button', text: 'Adopt a pet…', onclick: room }))];
    }
    const info = H.PETS[pet.kind] || H.PETS.cat;
    const name = pet.name || `Your ${info.label.toLowerCase()}`;
    const home = el('button', {
      class: 'hp-chip', type: 'button', 'aria-pressed': String(Boolean(pet.home)), text: `${name} lives on your page`,
      onclick: () => app.petHome(!pet.home),
    });
    return [h3('Your pet'),
      el('div', { class: 'hp-pet-here' }, H.petEl(pet.kind, pet.coat),
        el('div', {}, el('strong', { text: name }),
          el('p', { class: 'hp-note-small', text: pet.home ? 'It wanders about your page, and anyone who can see your page can pet it.' : "It's only in its room for now." }),
          el('div', { class: 'hp-row' }, home, el('button', { class: 'hp-tool', type: 'button', text: 'Its room…', onclick: room })))),
      el('p', { class: 'hp-note-small', text: 'Feed it and play with it in its room (the button by your profile), whenever you like.' })];
  }

  // Your pet changed (in its room): your page shows it as it is now.
  function petChanged(pet) {
    if (!$('homepage').open || !state.data || !state.data.mine) return;
    state.data.pet = pet && pet.home ? pet : null;
    draw();
    if (state.editing && !state.picked && state.tab === 'pet') renderTray();
  }

  // Choices, as a row of chips. Glow's extras (`extras`) have a little raindrop; for anyone else
  // they're there to try on (unless one's on the page already: that's theirs), and in an app that
  // can't mention Glow, they're left out. (`ns`: what the row's keys are tried on as, where
  // another row has the same ones.)
  // (The extras go together after the rest, in a box in the Glow colours: perkBox.)
  function chips(options, current, onPick, style, extras = [], ns = '') {
    const offered = glowOffered();
    // (Trying one of this row's on: that's the one lit.)
    const tried = tryingNow(ns);
    const trying = tried !== null && Object.prototype.hasOwnProperty.call(options, tried) ? tried : null;
    const chip = ([key, label]) => {
      const extra = extras.includes(key);
      const locked = extra && !supporter() && key !== current;
      if (locked && !offered) return null;
      return el('button', {
        class: `hp-chip${extra ? ' hp-chip-extra' : ''}${key === trying ? ' hp-chip-trying' : ''}`, type: 'button',
        'aria-pressed': String((trying || current) === key), text: label,
        style: style ? style(key) : undefined,
        title: extra ? (locked ? 'Comes with Glow: try it on' : "One of Glow's extras") : undefined,
        onclick: () => (locked ? tryOn(ns + key, label, () => onPick(key)) : onPick(key)),
      });
    };
    const all = Object.entries(options);
    const row = el('div', { class: 'hp-chips' }, ...all.filter(([key]) => !extras.includes(key)).map(chip).filter(Boolean));
    const perks = all.filter(([key]) => extras.includes(key)).map(chip).filter(Boolean);
    if (!perks.length) return row;
    return el('div', { class: 'hp-chip-sets' }, row, perkBox(el('div', { class: 'hp-chips' }, ...perks), trying));
  }

  function colors(current, onPick) {
    const picker = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#ffffff', 'aria-label': 'Any color' });
    picker.addEventListener('change', () => onPick(picker.value));
    return el('div', { class: 'hp-colors' },
      ...PALETTE.map((c) => el('button', {
        class: 'hp-color', type: 'button', title: c, 'aria-pressed': String((current || '').toLowerCase() === c), style: { background: c }, onclick: () => onPick(c),
      })),
      el('label', { class: 'hp-color-pick', title: 'Any color' }, picker));
  }

  const field = (label, ...kids) => el('div', { class: 'hp-field' }, el('span', { text: label }), ...kids);

  function pageTab() {
    const doc = state.doc;
    const bg = doc.bg;
    const setBg = (fields) => change((d) => { d.bg = { ...d.bg, ...fields }; });
    // (A picture's there to go back to once one's been used.)
    const kinds = bg.file ? { pattern: 'Pattern', color: 'Color', image: 'Picture' } : { pattern: 'Pattern', color: 'Color' };
    const out = [h3('Background'), chips(kinds, bg.kind, (kind) => setBg({ kind }))];
    if (bg.kind === 'pattern') {
      // (Glow's move: they're in its box, to try on.)
      const tryingPattern = tryingNow('pattern:');
      const swatch = ([key, label]) => {
        const locked = H.PERKS.pattern.includes(key) && !supporter() && key !== bg.pattern;
        if (locked && !glowOffered()) return null;
        const on = (tryingPattern || bg.pattern) === key;
        const pickIt = () => setBg({ pattern: key });
        return el('button', {
          class: `hp-item hp-swatch${key === tryingPattern ? ' hp-chip-trying' : ''}`, type: 'button', title: locked ? `${label} (comes with Glow: try it on)` : label,
          'aria-pressed': String(on), style: { padding: '3px', outline: on && key !== tryingPattern ? '2px solid #3b2f25' : '' },
          onclick: () => (locked ? tryOn(`pattern:${key}`, label, pickIt) : pickIt()),
        }, H.patternSwatch(key, bg.c1, bg.c2));
      };
      const all = Object.entries(H.PATTERNS);
      out.push(el('div', { class: 'hp-grid', style: { marginTop: '10px' } }, ...all.filter(([key]) => !H.PERKS.pattern.includes(key)).map(swatch).filter(Boolean)));
      const moving = all.filter(([key]) => H.PERKS.pattern.includes(key)).map(swatch).filter(Boolean);
      if (moving.length) out.push(el('div', { style: { marginTop: '14px' } }, perkBox(el('div', { class: 'hp-grid' }, ...moving), tryingPattern)));
    }
    if (bg.kind !== 'image') {
      out.push(field(bg.kind === 'pattern' ? 'Background color' : 'Color', colors(bg.c1, (c) => setBg({ c1: c }))));
      if (bg.kind === 'pattern') out.push(field('Pattern color', colors(bg.c2, (c) => setBg({ c2: c }))));
    }
    out.push(el('div', { class: 'hp-grid', style: { margin: '10px 0' } }, uploadButton(bg.file ? 'A different picture…' : 'Use a picture…', { background: true })));
    if (bg.kind === 'image') out.push(field('Picture', chips({ cover: 'Fill the page', tile: 'Repeat it' }, bg.fit, (fit) => setBg({ fit }))));

    out.push(h3('Weather'), chips(H.SKIES, bg.sky, (sky) => setBg({ sky }), null, H.PERKS.sky));

    // What visitors see as they move their pointer about, and click (Glow's). Picking one shows it.
    const fx = doc.effects || {};
    const setFx = (fields) => {
      change((d) => { d.effects = { trail: 'none', click: 'none', ...(d.effects || {}), ...fields }; });
      setTimeout(() => H.showEffects($('hp-page'), fields), 60);
    };
    if (supporter() || glowOffered() || fx.trail || fx.click) {
      out.push(h3('For your visitors'),
        field('A trail behind their pointer', chips(H.TRAILS, fx.trail || 'none', (trail) => setFx({ trail }), null, H.PERKS.trail, 'trail:')),
        field('When they click', chips(H.CLICKS, fx.click || 'none', (click) => setFx({ click }), null, H.PERKS.click, 'click:')));
    }

    const length = el('input', { type: 'range', min: '600', max: '6000', step: '100', value: String(doc.height) });
    length.addEventListener('change', () => change((d) => { d.height = Number(length.value); }));
    const title = el('input', { type: 'text', maxlength: '60', value: doc.title || '', placeholder: `${state.data.owner.displayName}'s homepage` });
    title.addEventListener('change', () => change((d) => { d.title = title.value.trim().slice(0, 60); }));
    out.push(h3('The page'), el('div', { class: 'hp-two' }, field('Its name (on the tab, and at the top)', title), field('Length', length)));

    const vis = state.data.visibility;
    out.push(h3('Who can see it'), chips({ friends: 'Friends', spaces: 'Friends and people in your spaces', everyone: 'Anyone with the link' }, vis, async (v) => {
      try {
        const data = await app.api('PUT', '/homepages/me', { visibility: v });
        state.data.visibility = data.visibility;
        renderTray();
        note(v === 'everyone' ? `Anyone can open ${location.host}/@${state.data.owner.username} now, even without Rainlit.` : 'Saved.');
      } catch (err) {
        note(err.message);
      }
    }), el('p', { class: 'hp-note-small', style: { marginTop: '8px' }, text: `Its link: ${location.host}/@${state.data.owner.username}` }),
    el('div', { class: 'hp-row' }, el('button', { class: 'hp-tool', type: 'button', text: 'Copy the link', onclick: copyLink })));

    const reset = el('button', {
      class: 'hp-tool danger', type: 'button', text: 'Start over',
      onclick: () => {
        if (!reset.dataset.sure) {
          reset.dataset.sure = '1';
          reset.textContent = 'Click again to clear the page';
          return;
        }
        state.picked = null;
        change((d) => { Object.assign(d, clone(H.starter())); });
      },
    });
    out.push(h3('Start over'), el('p', { class: 'hp-note-small', text: 'Back to the "under construction" page everyone starts with. (Undo brings yours back.)' }), reset);
    return out;
  }

  // The picked piece's settings.
  function pickedPanel(p) {
    const set = (fields) => change(() => Object.assign(p, fields));
    const words = (label, key, max, placeholder) => {
      const input = el('input', { type: 'text', maxlength: String(max), value: p[key] || '', placeholder });
      input.addEventListener('change', () => set({ [key]: input.value.trim() }));
      return field(label, input);
    };
    const fonts = (key) => chips(Object.fromEntries(Object.entries(H.FONTS).map(([k, f]) => [k, f.label])), p[key], (font) => set({ [key]: font }), (k) => ({ fontFamily: H.FONTS[k].css }));
    const head = el('div', { class: 'hp-picked-head' },
      el('strong', { text: H.PIECE_NAMES[p.t] || 'Piece' }),
      el('button', { class: 'hp-tool', type: 'button', text: 'To front', title: 'On top of everything', onclick: () => restack(1) }),
      el('button', { class: 'hp-tool', type: 'button', text: 'To back', title: 'Behind everything', onclick: () => restack(-1) }),
      el('button', { class: 'hp-tool', type: 'button', text: 'Copy', title: 'Another one (Ctrl+D)', onclick: duplicate }),
      el('button', { class: 'hp-tool danger', type: 'button', text: 'Delete', title: 'Delete (Del)', onclick: remove }),
      el('button', { class: 'hp-tool dark', type: 'button', text: 'Done', onclick: () => pick(null) }));
    const out = [head];
    const linkField = () => {
      const input = el('input', { type: 'url', inputmode: 'url', placeholder: 'https://… (optional)', value: p.href || '' });
      input.addEventListener('change', () => {
        const v = input.value.trim();
        if (v && !/^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i.test(v)) return note("That doesn't look like a link.");
        set({ href: v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : '' });
      });
      return field('Link (opens when someone clicks it)', input);
    };
    // What a click does: nothing, open a link, or pop up a video (in a Rain95 window, say).
    const clickField = () => {
      const asked = state.clicks && state.clicks.id === p.id ? state.clicks.mode : null;
      const mode = p.pop ? 'video' : p.href ? 'link' : asked || 'none';
      const choose = (m) => {
        state.clicks = { id: p.id, mode: m };
        if (m === 'none' && (p.href || p.pop)) set({ href: '', pop: '', popName: '' });
        else if (m === 'link' && p.pop) set({ pop: '', popName: '' });
        else if (m === 'video' && p.href) set({ href: '' });
        else renderTray();
      };
      const out = [field('When someone clicks it', chips({ none: 'Nothing', link: 'Opens a link', video: 'Pops up a video' }, mode, choose))];
      if (mode === 'link') out.push(linkField());
      if (mode === 'video') {
        out.push(el('div', { class: 'hp-grid' }, videoButton(p.pop ? 'A different video…' : 'Pick a video…', (f, name) => set({ pop: f.id, popName: name, popWin: p.popWin || 'window', href: '' }))));
        if (p.pop) {
          out.push(field('Its window', chips(H.WINDOWS, p.popWin || 'window', (popWin) => set({ popWin }))),
            words("The window's name", 'popName', 60, 'video.mp4'),
            el('div', { class: 'hp-row' }, el('button', {
              class: 'hp-tool', type: 'button', text: 'Try it',
              onclick: () => H.popVideo(p, { fileUrl: (id) => `/homepage-files/${id}` }, $('hp-page')),
            })),
            el('p', { class: 'hp-note-small', text: 'It pops up somewhere over your page, playing with its sound, till it\'s closed. Every click pops up another (five at most).' }));
        } else {
          out.push(el('p', { class: 'hp-note-small', text: 'MP4 or WebM, up to 20 MB.' }));
        }
      }
      return out;
    };
    const windowName = (fallback) => {
      if (!['window', 'xp', 'mac', 'browser'].includes(p.frame) && p.frame !== 'photo') return [];
      const cap = el('input', { type: 'text', maxlength: '60', value: p.caption || '', placeholder: p.frame === 'photo' ? 'a caption' : fallback });
      cap.addEventListener('change', () => set({ caption: cap.value.trim() }));
      return [field(p.frame === 'photo' ? 'Caption' : "The window's name", cap)];
    };

    if (p.t === 'text') {
      const box = el('textarea', { maxlength: '1000', rows: '3' });
      box.value = p.text;
      box.addEventListener('input', () => {
        if (!state.typing) {
          state.typing = true;
          state.undo.push(snapshot());
          state.redo = [];
          updateUndo();
        }
        p.text = box.value || ' ';
        redrawPiece(p);
        scheduleSave();
      });
      box.addEventListener('blur', () => {
        state.typing = false;
        if (!box.value.trim()) remove();
      });
      // (Sliding it is one step of Undo.)
      const size = el('input', { type: 'range', min: '10', max: '160', step: '1', value: String(Math.round(p.size)) });
      let sizeBefore = null;
      size.addEventListener('input', () => {
        if (!sizeBefore) sizeBefore = snapshot();
        p.size = Number(size.value);
        redrawPiece(p);
      });
      size.addEventListener('change', () => {
        const before = sizeBefore || snapshot();
        sizeBefore = null;
        p.size = Number(size.value);
        commit(before);
      });
      out.push(field('Words', box),
        field('Font', chips(Object.fromEntries(Object.entries(H.FONTS).map(([k, f]) => [k, f.label])), p.font, (font) => set({ font }),
          (k) => ({ fontFamily: H.FONTS[k].css, fontSize: `${Math.min(18, 15 * (H.FONTS[k].scale || 1))}px` }))),
        el('div', { class: 'hp-two' },
          field('Size', size),
          field('Line up', chips({ left: 'Left', center: 'Middle', right: 'Right' }, p.align, (align) => set({ align })))),
        el('div', { class: 'hp-row' },
          el('button', { class: 'hp-chip', type: 'button', 'aria-pressed': String(Boolean(p.bold)), text: 'Bold', style: { fontWeight: 700 }, onclick: () => set({ bold: !p.bold }) }),
          el('button', { class: 'hp-chip', type: 'button', 'aria-pressed': String(Boolean(p.italic)), text: 'Italic', style: { fontStyle: 'italic' }, onclick: () => set({ italic: !p.italic }) })),
        field('Color', colors(p.color, (color) => set({ color }))),
        field('Box', chips(H.BOXES, p.box, (b) => set({ box: b }))));
      if (p.box !== 'none') out.push(field(p.box === 'highlight' ? 'Highlighter color' : 'Box color', colors(p.c2, (c2) => set({ c2 }))));
      out.push(field('Effect', chips(H.EFFECTS, p.fx, (fx) => set({ fx }), null, H.PERKS.fx)));
      if (['shadow', 'outline', 'glow', 'lamplight'].includes(p.fx)) out.push(field(`${H.EFFECTS[p.fx]} color`, colors(p.c3, (c3) => set({ c3 }))));
      out.push(...clickField());
    } else if (p.t === 'image') {
      out.push(field('Frame', chips(H.FRAMES, p.frame, (frame) => set({ frame }), null, H.PERKS.frame)), ...windowName('untitled.gif'), ...clickField());
    } else if (p.t === 'video') {
      out.push(el('p', { class: 'hp-note-small', text: 'It plays over and over without its sound while it\'s on the screen, and visitors can turn the sound on. (For someone who\'d rather things didn\'t move, only when they press play.)' }),
        field('Frame', chips(H.FRAMES, p.frame, (frame) => set({ frame }), null, H.PERKS.frame)), ...windowName('untitled.mpg'), ...clickField());
    } else if (p.t === 'taskbar') {
      out.push(el('p', { class: 'hp-note-small', text: "An old desktop's taskbar. Its clock shows each visitor their own time." }),
        field('Kind', chips(H.TASKBARS, p.style, (style) => set({ style }))),
        words('The start button says', 'label', 12, 'start'));
    } else if (p.t === 'sticker') {
      out.push(el('div', { class: 'hp-row' }, el('button', {
        class: 'hp-chip', type: 'button', 'aria-pressed': String(p.outline !== false), text: 'White edge',
        onclick: () => set({ outline: p.outline === false }),
      })), ...clickField());
    } else if (p.t === 'tape') {
      out.push(field('Kind', chips(H.TAPES, p.style, (style) => set({ style }))), field('Color', colors(p.color, (color) => set({ color }))));
    } else if (p.t === 'paper') {
      out.push(field('Kind', chips(H.PAPERS, p.style, (style) => set({ style }))), field('Color', colors(p.color, (color) => set({ color }))));
    } else if (p.t === 'me') {
      out.push(el('p', { class: 'hp-note-small', text: 'Your picture, name and status, as they are on your profile.' }),
        field('Kind', chips(H.ME_STYLES, p.style, (style) => set({ style }))),
        field(p.style === 'card' ? 'Card color' : 'Name color', colors(p.color, (color) => set({ color }))),
        field('Font', chips(Object.fromEntries(Object.entries(H.FONTS).map(([k, f]) => [k, f.label])), p.font, (font) => set({ font }),
          (k) => ({ fontFamily: H.FONTS[k].css }))));
    } else if (p.t === 'counter') {
      out.push(el('p', { class: 'hp-note-small', text: `Like the hit counters of old, it counts every visit but yours (${state.data.views} so far).` }),
        field('Kind', chips(H.COUNTERS, p.style, (style) => set({ style }))),
        words('Words with it', 'label', 40, 'visitors'),
        field('Color', colors(p.color, (color) => set({ color }))));
    } else if (p.t === 'guestbook') {
      out.push(el('p', { class: 'hp-note-small', text: 'Anyone who can see your page can sign it (they can delete what they wrote). Delete anything in it with its ×.' }),
        words('Its title', 'title', 40, 'sign my guestbook!'),
        field('Kind', chips(H.GUESTBOOKS, p.style, (style) => set({ style }))),
        field(p.style === 'retro' ? 'Color (for "Dark" and "Paper")' : 'Color', colors(p.color, (color) => set({ color }))),
        field('Title font', fonts('font')));
    } else if (p.t === 'ask') {
      // (Whose questions you've stopped, by reporting one: they can be let back.)
      const stops = el('p', { class: 'hp-note-small', hidden: true });
      app.api('GET', `/homepages/${encodeURIComponent(state.data.owner.id)}/questions`).then((d) => {
        if (!d.stoppedCount) return;
        const again = el('button', {
          class: 'hp-tool', type: 'button', text: 'Let them ask again',
          onclick: async () => {
            try {
              await app.api('DELETE', '/homepages/me/question-stops');
              stops.hidden = true;
              note('Everyone can ask you questions again.');
            } catch (err) {
              note(err.message);
            }
          },
        });
        stops.replaceChildren(`You've stopped ${d.stoppedCount === 1 ? "someone's questions" : `${d.stoppedCount} people's questions`} (by reporting them). `, again);
        stops.hidden = false;
      }).catch(() => {});
      out.push(el('p', { class: 'hp-note-small', text: 'Anyone signed in who can see your page can ask you something. Only you see a question until you answer it; then everyone who can see your page can read both. Answer, delete or report them on your page (after Done).' }),
        el('div', { class: 'hp-row' }, el('button', {
          class: 'hp-chip', type: 'button', 'aria-pressed': String(p.anon !== false), text: 'Anonymous questions',
          title: "Let people ask without you seeing who they are", onclick: () => set({ anon: p.anon === false }),
        })),
        stops,
        words('Its title', 'title', 40, 'ask me anything!'),
        field('Kind', chips(H.ASKS, p.style, (style) => set({ style }))),
        field(p.style === 'retro' ? 'Color (for "Dark" and "Paper")' : 'Color', colors(p.color, (color) => set({ color }))),
        field('Title font', fonts('font')));
    } else if (p.t === 'music') {
      out.push(el('p', { class: 'hp-note-small', text: 'It plays when a visitor presses play, over and over, never by itself.' }),
        words("The song's name", 'title', 80, 'a song'),
        field('Kind', chips(H.MUSICS, p.style, (style) => set({ style }))),
        field('Color', colors(p.color, (color) => set({ color }))),
        el('div', { class: 'hp-grid' }, songButton('A different song…', p)));
    } else if (p.t === 'shelf') {
      const lines = p.items.map((it, i) => {
        const title = el('input', { type: 'text', maxlength: '60', value: it.title || '', placeholder: 'its name' });
        title.addEventListener('change', () => change(() => { p.items[i].title = title.value.trim(); }));
        const href = el('input', { type: 'url', inputmode: 'url', value: it.href || '', placeholder: 'a link (optional)' });
        href.addEventListener('change', () => {
          const v = href.value.trim();
          change(() => { p.items[i].href = v ? (/^https?:\/\//i.test(v) ? v : `https://${v}`) : ''; });
        });
        const move = (d) => change(() => {
          const [x] = p.items.splice(i, 1);
          p.items.splice(clamp(i + d, 0, p.items.length), 0, x);
        });
        return el('div', { class: 'hp-shelf-line' },
          el('img', { src: `/homepage-files/${it.file}`, alt: '' }),
          el('div', { class: 'hp-shelf-fields' }, title, href),
          el('div', { class: 'hp-shelf-tools' },
            el('button', { class: 'hp-tool', type: 'button', text: '←', title: 'Move it left', disabled: i === 0, onclick: () => move(-1) }),
            el('button', { class: 'hp-tool', type: 'button', text: '→', title: 'Move it right', disabled: i === p.items.length - 1, onclick: () => move(1) }),
            el('button', { class: 'hp-tool danger', type: 'button', text: '×', title: 'Take it off the shelf', onclick: () => change(() => p.items.splice(i, 1)) })));
      });
      const files = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true });
      files.addEventListener('change', () => {
        const picked = [...files.files];
        files.value = '';
        addCovers(p.id, picked);
      });
      const from = el('input', { type: 'url', inputmode: 'url', placeholder: 'a link to a game, an album, a film…' });
      const find = el('button', { class: 'hp-tool', type: 'button', text: 'Add it', onclick: () => addCoverFrom(p.id, from.value) });
      from.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCoverFrom(p.id, from.value);
        }
      });
      out.push(field(`On the shelf (${p.items.length} of 8)`, ...lines),
        el('div', { class: 'hp-grid', style: { marginBottom: '10px' } }, el('label', { class: 'hp-item wide hp-upload-btn' }, el('span', { text: 'Add covers…' }), files)),
        field('Or find one from a link (its cover and name)', el('div', { class: 'hp-row' }, from, find)),
        field('Kind', chips(H.SHELVES, p.style, (style) => set({ style }))),
        el('div', { class: 'hp-row' }, el('button', {
          class: 'hp-chip', type: 'button', 'aria-pressed': String(p.labels !== false), text: 'Name tags',
          onclick: () => set({ labels: p.labels === false }),
        })));
    } else if (p.t === 'button') {
      const text = el('textarea', { maxlength: '40', rows: '2' });
      text.value = p.text || '';
      text.addEventListener('change', () => set({ text: text.value.split('\n').slice(0, 2).join('\n') }));
      const icons = el('div', { class: 'hp-chips' },
        el('button', { class: 'hp-chip', type: 'button', 'aria-pressed': String(!p.icon), text: 'None', onclick: () => set({ icon: '' }) }),
        ...Object.keys(H.PIXEL).map((name) => el('button', {
          class: 'hp-chip hp-icon-chip', type: 'button', title: H.PIXEL_NAMES[name] || name, 'aria-pressed': String(p.icon === name), onclick: () => set({ icon: name }),
        }, el('img', { src: H.pixelSrc(name), alt: H.PIXEL_NAMES[name] || name }))));
      out.push(field('Its words (two lines at most)', text),
        field('Kind', chips(H.BUTTONS, p.style, (style) => set({ style }))),
        el('div', { class: 'hp-two' },
          field(p.style === 'dark' ? 'Glow color' : 'Color', colors(p.c1, (c1) => set({ c1 }))),
          field('Words color', colors(p.c2, (c2) => set({ c2 })))),
        field('A sticker on it', icons),
        field('Font', fonts('font')),
        ...clickField());
    } else if (p.t === 'fortune') {
      const answers = el('textarea', { rows: '5', maxlength: '1300', placeholder: 'one answer on each line (or leave it empty for its forecasts: "The clouds say yes.", "Foggy... ask again."...)' });
      answers.value = (p.answers || []).join('\n');
      answers.addEventListener('change', () => set({ answers: answers.value.split('\n').map((a) => a.trim().slice(0, 60)).filter(Boolean).slice(0, 20) }));
      out.push(el('p', { class: 'hp-note-small', text: 'Visitors ask it something, then click it for an answer.' }),
        words('Words with it', 'label', 50, 'ask me something, then click me'),
        field('Its glow', colors(p.color, (color) => set({ color }))),
        field('Its answers (up to 20)', answers));
    }
    return out;
  }

  // ---------- Setting up ----------

  function connect(lent) {
    app = lent;
    const page = $('hp-page');
    page.addEventListener('pointerdown', onPointerDown);
    page.addEventListener('dblclick', onDoubleClick);
    page.addEventListener('click', onPageClick);
    document.addEventListener('keydown', onKey);
    $('hp-edit').addEventListener('click', startEditing);
    $('hp-done').addEventListener('click', stopEditing);
    $('hp-undo').addEventListener('click', undo);
    $('hp-redo').addEventListener('click', redo);
    $('hp-copy').addEventListener('click', copyLink);
    $('hp-report').addEventListener('click', report);
    $('hp-close').addEventListener('click', async () => {
      if (state.editing) await flush();
      close();
    });
    const dialog = $('homepage');
    // Escape: one thing at a time (see back()).
    dialog.addEventListener('cancel', (e) => {
      if (back()) e.preventDefault();
    });
    dialog.addEventListener('close', () => {
      H.hush($('hp-page'));
      if (state.dirty) save();
      state.editing = false;
      dialog.classList.remove('hp-editing');
    });
    let fitTimer = null;
    new ResizeObserver(() => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        if (!state.mounted || !dialog.open) return;
        state.mounted.fit();
        if (state.editing) drawPicked();
      }, 60);
    }).observe(page);
  }

  // Someone signed your guestbook: if your page is showing, it shows what they wrote.
  function onSigned(from) {
    if (!$('homepage').open || !state.data || !state.data.mine) return false;
    if (!state.editing) H.reloadGuestbooks($('hp-page'), state.mounted.ctx);
    note(`${from} signed your guestbook!`);
    return true;
  }

  // Someone asked you a question (from: their name, or null if they asked anonymously): if your
  // page is showing, it shows up in your box.
  function onAsked(from) {
    if (!$('homepage').open || !state.data || !state.data.mine) return false;
    if (!state.editing) H.reloadQuestions($('hp-page'), state.mounted.ctx);
    note(from ? `${from} asked you a question!` : 'Someone asked you a question!');
    return true;
  }

  // A question you asked was answered: if their page is showing, the answer shows up.
  function onAnswered(ownerId, by) {
    if (!$('homepage').open || !state.data || state.data.owner.id !== ownerId) return false;
    if (!state.editing) H.reloadQuestions($('hp-page'), state.mounted.ctx);
    note(`${by} answered your question!`);
    return true;
  }

  Object.assign(H, { connect, open, close, back, onSigned, onAsked, onAnswered, petChanged, isOpen: () => $('homepage').open });
})();
