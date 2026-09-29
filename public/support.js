// The support page (lib/supporters.js): this month's costs, how you support Rainlit, and the
// ways to (Stripe's pages do the paying). From the apps, the page comes with a link (?k=...) that
// says who you are for half an hour, since your browser may not be signed in to Rainlit; it's
// kept for this tab, for when Stripe sends you back.
(async () => {
  const $ = (id) => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  let key = '';
  try {
    if (query.get('k')) sessionStorage.setItem('rainlit.supportKey', query.get('k'));
    key = sessionStorage.getItem('rainlit.supportKey') || '';
  } catch {
    key = query.get('k') || '';
  }
  const thanks = query.get('thanks') || '';
  if (query.has('k') || thanks) history.replaceState(null, '', '/support');

  async function call(method, path, body) {
    const url = method === 'GET' && key ? `${path}${path.includes('?') ? '&' : '?'}k=${encodeURIComponent(key)}` : path;
    const res = await fetch(`/api${url}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify({ ...body, ...(key ? { k: key } : {}) }) : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  const make = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter(Boolean));
    return n;
  };
  const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  const size = (mb) => (mb >= 1024 ? `${+(mb / 1024).toFixed(mb % 1024 ? 1 : 0)} GB` : `${mb} MB`);
  const date = (t) => new Date(t).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  const LEVELS = { drizzle: 'Drizzle', shower: 'Shower', downpour: 'Downpour', storm: 'Storm', monsoon: 'Monsoon', lamplight: 'Lamplight' };
  function length(months) {
    const part = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const y = Math.floor(months / 12);
    const m = months % 12;
    return y ? (m ? `${part(y, 'year')} and ${part(m, 'month')}` : part(y, 'year')) : part(Math.max(1, m), 'month');
  }

  let data;
  try {
    data = await call('GET', `/support${thanks ? `?thanks=${encodeURIComponent(thanks)}` : ''}`);
  } catch {
    return;
  }

  // ----- What everyone gets, and what supporters do (this server's own numbers) -----
  function fillPerks() {
    const f = data.free || {};
    const p = data.perks || {};
    const cell = (attr, name) => document.querySelector(`[${attr}="${name}"]`);
    if (f.fileMb) cell('data-free', 'fileMb').textContent = size(f.fileMb);
    if (p.fileMb) cell('data-perk', 'fileMb').textContent = size(Math.max(p.fileMb, f.fileMb || 0));
    if (f.roomMb) cell('data-free', 'roomMb').textContent = size(f.roomMb);
    if (p.roomMb) cell('data-perk', 'roomMb').textContent = size(Math.max(p.roomMb, f.roomMb || 0));
    if (f.homepageMb) cell('data-free', 'homepage').textContent = `${size(f.homepageMb)}, ${f.homepagePieces} pieces`;
    if (p.homepageMb) cell('data-perk', 'homepage').textContent = `${size(p.homepageMb)}, ${p.homepagePieces} pieces`;
    if (f.notes) cell('data-free', 'notes').textContent = f.notes.toLocaleString();
    if (p.notes) cell('data-perk', 'notes').textContent = Math.max(p.notes, f.notes || 0).toLocaleString();
  }
  fillPerks();

  // ----- This month's costs, and how much supporters cover -----
  if (data.month && data.month.costs) {
    const m = data.month;
    const share = Math.min(1, m.covered / m.costs);
    $('month').hidden = false;
    requestAnimationFrame(() => { $('month-bar').style.width = `${Math.round(share * 100)}%`; });
    const who = `${m.supporters} ${m.supporters === 1 ? 'supporter' : 'supporters'}`;
    $('month-text').textContent = share >= 1
      ? `Running Rainlit costs about ${money(m.costs)} a month, and this month's covered, by ${who}. Thank you!`
      : m.covered
        ? `Running Rainlit costs about ${money(m.costs)} a month. ${m.supporters ? `${who} ${m.supporters === 1 ? 'covers' : 'cover'}` : 'Tips cover'} ${money(m.covered)} of it (after the payment service's fees), and the person who runs it pays the rest.`
        : `Running Rainlit costs about ${money(m.costs)} a month. For now, the person who runs it pays all of it.`;
  }

  // ----- Back from Stripe -----
  if (thanks) {
    const box = $('thanks');
    box.hidden = false;
    box.append(make('p', {}, make('strong', { text: 'Thank you!' }), ' Every bit of it goes to keeping Rainlit running.'));
    if (data.me && !data.me.active) {
      // (Stripe's word can take a few seconds.)
      const wait = make('p', { class: 'small', text: 'Your perks are on their way…' });
      box.append(wait);
      for (let i = 0; i < 8 && !(data.me && data.me.active); i++) {
        await new Promise((r) => setTimeout(r, 2500));
        try { data = await call('GET', '/support'); } catch {}
      }
      wait.textContent = data.me && data.me.active ? 'Your perks are on.' : "Stripe's still confirming it: your perks will show up in Rainlit in a minute.";
    } else if (!data.me) {
      box.append(make('p', { class: 'small', text: 'Your perks will show up in Rainlit in a moment.' }));
    }
  }

  // ----- How you support, and the ways to -----
  const me = $('me');
  function busy(button, on) {
    button.disabled = on;
    if (on) button.dataset.text = button.textContent;
    button.textContent = on ? 'One moment…' : button.dataset.text || button.textContent;
  }
  async function goTo(button, path, body) {
    const error = me.querySelector('.error');
    if (error) error.remove();
    busy(button, true);
    try {
      const { url } = await call('POST', path, body);
      location.href = url;
    } catch (err) {
      busy(button, false);
      me.append(make('p', { class: 'error', role: 'alert', text: err.message }));
    }
  }

  function plans(again) {
    const monthly = data.plans.month.cents;
    const yearly = data.plans.year.cents;
    const saved = monthly * 12 - yearly;
    const box = make('div', { class: 'plans' });
    const month = make('button', { class: 'plan', type: 'button' }, make('strong', { text: `${money(monthly)} a month` }), make('span', { text: again ? 'Pick up where your badge left off' : 'Stop any time' }));
    const year = make('button', { class: 'plan best', type: 'button' }, make('strong', { text: `${money(yearly)} a year` }), make('span', { text: `Two months free (${money(saved)} less), and less lost to fees` }));
    month.addEventListener('click', () => goTo(month, '/support/checkout', { plan: 'month' }));
    year.addEventListener('click', () => goTo(year, '/support/checkout', { plan: 'year' }));
    box.append(month, year);
    return box;
  }

  function tipForm() {
    const amount = make('input', { type: 'number', min: String(data.tip.min / 100), max: String(data.tip.max / 100), step: '1', value: '5', 'aria-label': 'Tip, in dollars' });
    const send = make('button', { class: 'go quiet', type: 'button', text: 'Send a tip' });
    send.addEventListener('click', () => goTo(send, '/support/tip', { cents: Math.round(Number(amount.value) * 100) }));
    return make('div', { class: 'tip' }, make('span', { text: 'Or a one-off tip of $' }), amount, send);
  }

  if (!data.enabled) {
    if (data.me && data.me.active) {
      me.append(make('p', {}, make('strong', { text: "You're supporting Rainlit." }), ` ${LEVELS[data.me.level] || 'Drizzle'}, ${length(data.me.months)} so far. Thank you!`));
    } else {
      me.append(make('p', {}, make('strong', { text: 'Supporting opens soon.' }), ' This server doesn’t take payments yet.'));
    }
    me.hidden = false;
    return;
  }

  if (!data.me) {
    me.append(
      make('p', {}, make('strong', { text: 'Sign in to support Rainlit.' }), ' Your perks and badge go with your account.'),
      make('a', { class: 'go', href: '/?next=support', text: 'Sign in' }),
    );
    me.hidden = false;
    return;
  }

  const s = data.me;
  const badge = s.first ? make('img', { src: `/badges/supporter-${LEVELS[s.level] ? s.level : 'drizzle'}.svg`, alt: '', class: s.active ? '' : 'dim' }) : null;
  const who = make('small', { class: 'small', text: `As @${s.username}` });
  if (s.active && s.plan !== 'gift') {
    const when = s.cancels ? `It stops on ${date(s.cancels)}.` : s.until ? `It renews on ${date(s.until)}.` : '';
    me.append(make('div', { class: 'me-row' }, badge, make('div', {},
      make('p', {}, make('strong', { text: "You're supporting Rainlit. Thank you!" })),
      make('p', { text: `${LEVELS[s.level] || 'Drizzle'}, ${length(s.months)} so far, ${s.plan === 'year' ? 'yearly' : 'monthly'}. ${when}` }),
      who)));
    const manage = make('button', { class: 'go quiet', type: 'button', text: 'Manage, or stop' });
    manage.addEventListener('click', () => goTo(manage, '/support/manage', {}));
    me.append(manage, tipForm());
  } else if (s.active) {
    me.append(make('div', { class: 'me-row' }, badge, make('div', {},
      make('p', {}, make('strong', { text: "You're supporting Rainlit, as a gift." })),
      make('p', { text: `${LEVELS[s.level] || 'Drizzle'}, ${length(s.months)} so far, until ${date(s.until)}. To keep going after that:` }),
      who)), plans(false), tipForm());
  } else if (s.first) {
    me.append(make('div', { class: 'me-row' }, badge, make('div', {},
      make('p', {}, make('strong', { text: `You supported Rainlit for ${length(s.months)}.` })),
      make('p', { text: `Your badge is at ${LEVELS[s.level] || 'Drizzle'}${s.next ? `, ${s.next.inDays} days from ${s.next.name}` : ''}. Come back, and it picks up where it left off.` }),
      who)), plans(true), tipForm());
  } else {
    me.append(make('p', {}, make('strong', { text: 'Keep Rainlit lit.' }), ' Pick a plan: Stripe’s page takes it from there.'), who, plans(false), tipForm());
  }
  me.hidden = false;
})();
