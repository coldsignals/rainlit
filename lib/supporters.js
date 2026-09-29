'use strict';

// Supporting Rainlit: rainlit.app's supporter plan. $5 a month or $50 a year, and one-off tips,
// paid through Stripe, which sells it for Rainlit as the merchant of record (people see it as
// sold through Link): it handles sales tax and VAT, receipts, refunds and chargebacks. What
// supporters pay keeps rainlit.app free for everyone, and pays for what they use more of:
//   - bigger files (100 MB), more room for them (10 GB, or 50 GB with files kept in R2), a
//     bigger homepage (200 MB of pictures and songs, 500 pieces) and 1,000 notes;
//   - sharper screen sharing in voice channels (1080p at 60), while it fits in what Cloudflare
//     sends for free, and in what each supporter pays for (see sharpStreams);
//   - no slower start for new accounts (lib/abuse.js);
//   - homepage extras: more weather, and more text effects (lib/homepages.js);
//   - a badge that grows the longer they support. It keeps its level if they stop, and picks up
//     where it left off if they come back.
// The free tier stays as it is: nothing's taken from anyone to make a perk.
//
// Settings: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET (the signing secret of a webhook sending
// to /stripe/webhook). Without them there's no plan: a Rainlit server someone else runs sets its
// own limits for everyone. STRIPE_API overrides Stripe's address (tests).
//
// Kept here: whether someone supports and since when, their plan, when it renews or ends, and
// Stripe's ids for them. Never their card, name or address: Stripe has those.

const crypto = require('crypto');
const { db, transaction } = require('./db');
const settings = require('./settings');
const blobs = require('./blobs');

const KEY = String(process.env.STRIPE_SECRET_KEY || '').trim();
const WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const API = String(process.env.STRIPE_API || 'https://api.stripe.com').trim().replace(/\/+$/, '');
const VERSION = '2025-03-31.basil'; // (Managed Payments needs this one or later)
const enabled = Boolean(KEY && WEBHOOK_SECRET);

const DAY = 86_400_000;
const MB = 1024 * 1024;

// The plans, in US cents (Stripe shows each person the same in their own currency). Prices
// include any tax, so $5 is $5. Changing a price here makes a new one in Stripe for new
// supporters; those already supporting keep theirs.
const PLANS = {
  month: { cents: 500, interval: 'month', lookup: 'rainlit_supporter_month' },
  year: { cents: 5000, interval: 'year', lookup: 'rainlit_supporter_year' },
};
const TIP = { min: 200, max: 20000 }; // $2 to $200
const PRODUCT = 'rainlit_supporter';
const TIP_PRODUCT = 'rainlit_tip';
const TAX_CODE = 'txcd_10103000'; // Software as a service, personal use (Managed Payments sells it)

// What supporters get (the free tier's own numbers are the admin's, in lib/storage.js and
// server.js; a supporter always gets at least these).
const PERKS = {
  fileMb: 100,
  roomMb: 10 * 1024,
  roomR2Mb: 50 * 1024, // (with files in R2, where keeping them costs a sixteenth as much)
  homepageMb: 200,
  homepagePieces: 500,
  notes: 1000,
};

// Sharper screen sharing in voice channels, while this month's voice traffic fits in what
// Cloudflare sends for free (1,000 GB a month, shared with calls it relays), and each
// supporter's own sharper streams fit in what they pay (about 100 GB, at $0.05 a GB past it).
const VOICE_MONTHLY_GB = Number(process.env.VOICE_MONTHLY_GB) || 800;
const SHARP_PERSON_GB = Number(process.env.SHARP_PERSON_GB) || 100;

// The badge's levels, by how long someone's supported in all.
const LEVELS = [
  { id: 'drizzle', name: 'Drizzle', days: 0 },
  { id: 'shower', name: 'Shower', days: 90 },
  { id: 'downpour', name: 'Downpour', days: 180 },
  { id: 'storm', name: 'Storm', days: 365 },
  { id: 'monsoon', name: 'Monsoon', days: 730 },
  { id: 'lamplight', name: 'Lamplight', days: 1095 },
];

class SupportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let onChange = () => {};
const whenChanged = (fn) => { onChange = fn; };

// ---------- Who's supporting ----------

const active = (u) => Boolean(u && u.supporter_since);
const userById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(String(id)) || null;

// How long someone's supported, in all (every stretch of it), in days.
function daysOf(u, now = Date.now()) {
  const ms = (u.supporter_ms || 0) + (u.supporter_since ? Math.max(0, now - u.supporter_since) : 0);
  return Math.floor(ms / DAY);
}
function levelOf(days) {
  let level = LEVELS[0];
  for (const l of LEVELS) if (days >= l.days) level = l;
  return level;
}
// "3 months", about (a level's month counts from the day it's reached).
const monthsOf = (days) => Math.max(1, Math.floor((days + 3) / 30.4375));

// Their badge, for their profile (null if they've never supported): its level, and whether
// it's lit (they're supporting now) or keeping its level (they were).
function badgeOf(u) {
  if (!u || !u.supporter_first) return null;
  const days = daysOf(u);
  return { id: 'supporter', level: levelOf(days).id, months: monthsOf(days), lit: active(u), at: u.supporter_first };
}

// A stretch of supporting starts (unless one's going already)...
function begin(userId, at = Date.now()) {
  db.prepare('UPDATE users SET supporter_since = COALESCE(supporter_since, ?), supporter_first = COALESCE(supporter_first, ?) WHERE id = ?').run(at, at, userId);
}
// ...and ends: its time is kept, for the badge.
function end(userId, at = Date.now()) {
  const u = userById(userId);
  if (!u || !u.supporter_since) return;
  db.prepare('UPDATE users SET supporter_ms = supporter_ms + ?, supporter_since = NULL WHERE id = ? AND supporter_since IS NOT NULL')
    .run(Math.max(0, at - u.supporter_since), userId);
}

// What someone sees about their own supporting.
function statusOf(u) {
  const days = daysOf(u);
  const level = levelOf(days);
  const next = LEVELS.find((l) => l.days > days) || null;
  return {
    active: active(u), plan: u.supporter_plan || null, until: u.supporter_until || null, cancels: u.supporter_cancels || null,
    first: u.supporter_first || null, days, months: u.supporter_first ? monthsOf(days) : 0,
    level: u.supporter_first ? level.id : null, next: next ? { id: next.id, name: next.name, inDays: next.days - days } : null,
    manage: Boolean(u.stripe_customer), gift: u.supporter_plan === 'gift',
  };
}

// ---------- Perks ----------

const roomMb = () => (blobs.enabled ? PERKS.roomR2Mb : PERKS.roomMb);

// Whether someone's screen shares in voice channels are sharper now: they're supporting, and
// it fits (egress: this month's { total, sharp: { user id: bytes } } from lib/voice-cf.js).
function sharpStreams(u, egress) {
  if (!active(u)) return false;
  const e = egress || { total: 0, sharp: {} };
  return e.total < VOICE_MONTHLY_GB * 1024 * MB && ((e.sharp && e.sharp[u.id]) || 0) < SHARP_PERSON_GB * 1024 * MB;
}

// ---------- Stripe ----------

// Stripe's way of sending objects in a form: a[b][0][c]=d.
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, path, params, { quiet = [] } = {}) {
  const url = new URL(`${API}/v1${path}`);
  let body;
  if (params && method === 'GET') for (const [k, v] of form(params)) url.searchParams.append(k, v);
  else if (params) body = form(params).toString();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Stripe-Version': VERSION, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SupportError("Couldn't reach the payment service. Try again in a minute.", 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    if (!quiet.includes(res.status)) console.error(`[support] Stripe said no: ${method} ${path} ${res.status} ${e.code || e.type || ''} ${e.message || ''}`);
    const err = new SupportError("Payments aren't working right now. Try again later.", 502);
    Object.assign(err, { stripeStatus: res.status, stripeCode: e.code, stripeParam: e.param });
    throw err;
  }
  return data;
}

// Rainlit's products and prices in Stripe, made the first time they're needed (so there's
// nothing to set up by hand), and found again by name after that.
const products = new Set(); // (known to be there)
async function product(id, name, description) {
  if (products.has(id)) return;
  try {
    await stripe('GET', `/products/${id}`, undefined, { quiet: [404] }); // (not made yet, the first time)
  } catch (err) {
    if (err.stripeStatus !== 404) throw err;
    await stripe('POST', '/products', { id, name, description, tax_code: TAX_CODE });
  }
  products.add(id);
}

// A checkout session, as the customer Stripe knows them as (if it still does: someone can ask
// Link to delete what it has about them, and then they're a new customer).
async function session(u, params) {
  try {
    return await stripe('POST', '/checkout/sessions', { ...params, ...(u.stripe_customer ? { customer: u.stripe_customer } : {}) });
  } catch (err) {
    if (!u.stripe_customer || err.stripeCode !== 'resource_missing' || err.stripeParam !== 'customer') throw err;
    db.prepare('UPDATE users SET stripe_customer = NULL WHERE id = ?').run(u.id);
    return stripe('POST', '/checkout/sessions', params);
  }
}

let catalog = null;
function prices() {
  catalog ||= (async () => {
    const found = await stripe('GET', '/prices', { lookup_keys: Object.values(PLANS).map((p) => p.lookup), active: 'true', limit: 10 });
    const out = {};
    for (const [plan, p] of Object.entries(PLANS)) {
      const price = (found.data || []).find((x) => x.lookup_key === p.lookup && x.unit_amount === p.cents && x.currency === 'usd');
      if (price) out[plan] = price.id;
    }
    if (Object.keys(out).length < Object.keys(PLANS).length) {
      await product(PRODUCT, 'Rainlit supporter', 'Keeps rainlit.app free and running for everyone. Thank you!');
      for (const [plan, p] of Object.entries(PLANS)) {
        if (out[plan]) continue;
        const price = await stripe('POST', '/prices', {
          product: PRODUCT, currency: 'usd', unit_amount: p.cents, recurring: { interval: p.interval },
          tax_behavior: 'inclusive', lookup_key: p.lookup, transfer_lookup_key: 'true',
        });
        out[plan] = price.id;
      }
    }
    return out;
  })().catch((err) => {
    catalog = null;
    throw err;
  });
  return catalog;
}

// Where Stripe sends people back to: /support, with the checkout's id to say thank you.
const backTo = (origin) => ({
  success_url: `${origin}/support?thanks={CHECKOUT_SESSION_ID}`,
  cancel_url: `${origin}/support`,
});

// A checkout for a plan ('month' or 'year'): Stripe's page for it.
async function checkout(u, plan, origin) {
  if (!enabled) throw new SupportError("This Rainlit doesn't take support.", 404);
  if (!PLANS[plan]) throw new SupportError("That's not a plan.");
  if (active(u) && u.supporter_plan !== 'gift') throw new SupportError("You're already supporting Rainlit. Thank you!", 409);
  const s = await session(u, {
    mode: 'subscription',
    line_items: [{ price: (await prices())[plan], quantity: 1 }],
    managed_payments: { enabled: 'true' },
    client_reference_id: u.id,
    metadata: { rainlit_user: u.id },
    subscription_data: { metadata: { rainlit_user: u.id } },
    ...backTo(origin),
  });
  return s.url;
}

// A one-off tip, of any amount from $2 to $200.
async function tip(u, cents, origin) {
  if (!enabled) throw new SupportError("This Rainlit doesn't take support.", 404);
  const amount = Math.round(Number(cents));
  if (!(amount >= TIP.min && amount <= TIP.max)) throw new SupportError(`A tip can be from $${TIP.min / 100} to $${TIP.max / 100}.`);
  await product(TIP_PRODUCT, 'A tip for Rainlit', 'A one-off thank you that helps keep rainlit.app running.');
  const s = await session(u, {
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', unit_amount: amount, product: TIP_PRODUCT, tax_behavior: 'inclusive' }, quantity: 1 }],
    managed_payments: { enabled: 'true' },
    client_reference_id: u.id,
    metadata: { rainlit_user: u.id, tip: amount },
    ...backTo(origin),
  });
  return s.url;
}

// Changing their plan, their card, or stopping: Stripe's page for it (or Link's, where anything
// bought through Stripe's merchant of record can be looked after).
async function manageUrl(u, origin) {
  if (!enabled || !u.stripe_customer) return 'https://app.link.com';
  try {
    const s = await stripe('POST', '/billing_portal/sessions', { customer: u.stripe_customer, return_url: `${origin}/support` });
    return s.url;
  } catch {
    return 'https://app.link.com';
  }
}

// ---------- What Stripe tells us ----------

// A webhook's Stripe-Signature, checked against its body: t=when,v1=signature[,v1=...].
function verify(raw, header, now = Date.now()) {
  if (!WEBHOOK_SECRET) return false;
  const parts = String(header || '').split(',').map((s) => s.trim().split('='));
  const t = Number((parts.find(([k]) => k === 't') || [])[1]);
  const sigs = parts.filter(([k, v]) => k === 'v1' && /^[a-f0-9]{64}$/.test(v || '')).map(([, v]) => Buffer.from(v, 'hex'));
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.`).update(raw).digest();
  return sigs.some((s) => crypto.timingSafeEqual(s, expected));
}

const LIVE = new Set(['active', 'trialing', 'past_due']); // (past due: Stripe's still trying their card)

// A subscription as Stripe has it now, for whoever it's for.
function apply(userId, sub, now = Date.now()) {
  const u = userById(userId);
  if (!u) return;
  const item = (sub.items && sub.items.data && sub.items.data[0]) || {};
  const periodEnd = (item.current_period_end || sub.current_period_end || 0) * 1000 || null;
  const interval = (item.price && item.price.recurring && item.price.recurring.interval) || (item.plan && item.plan.interval) || null;
  const live = LIVE.has(sub.status);
  // (An older one of theirs ending, when a newer one, or a gift, is what they have now.)
  if (!live && (u.supporter_plan === 'gift' || (u.stripe_subscription && u.stripe_subscription !== sub.id))) return;
  const cancels = live && (sub.cancel_at || sub.cancel_at_period_end) ? (sub.cancel_at ? sub.cancel_at * 1000 : periodEnd) : null;
  transaction(() => {
    db.prepare(`UPDATE users SET stripe_customer = COALESCE(?, stripe_customer), stripe_subscription = ?, supporter_plan = ?,
      supporter_until = ?, supporter_cancels = ? WHERE id = ?`)
      .run(typeof sub.customer === 'string' ? sub.customer : null, sub.id, interval, periodEnd, cancels, u.id);
    if (live) begin(u.id, now);
    else end(u.id, Math.min(now, (sub.ended_at || sub.canceled_at || now / 1000) * 1000));
  });
  onChange(u.id);
}

// Who a subscription's for: the account it was bought from (kept on it), or its customer.
function ownerOf(sub, hint) {
  const id = (sub.metadata && sub.metadata.rainlit_user) || hint;
  if (id && userById(id)) return String(id);
  const r = typeof sub.customer === 'string' && db.prepare('SELECT id FROM users WHERE stripe_customer = ?').get(sub.customer);
  return r ? r.id : null;
}

// Stripe's word for it, fetched fresh (events can arrive out of order, or twice).
async function syncSubscription(subId, hint) {
  const sub = await stripe('GET', `/subscriptions/${encodeURIComponent(subId)}`);
  const who = ownerOf(sub, hint);
  if (who) apply(who, sub);
}

// A finished checkout: their customer id kept, then the subscription, or the tip.
async function onCheckout(s) {
  const userId = s.client_reference_id || (s.metadata && s.metadata.rainlit_user);
  if (!userId || !userById(userId)) return;
  if (typeof s.customer === 'string') db.prepare('UPDATE users SET stripe_customer = ? WHERE id = ?').run(s.customer, userId);
  if (s.mode === 'subscription' && s.subscription) {
    await syncSubscription(typeof s.subscription === 'string' ? s.subscription : s.subscription.id, userId);
  } else if (s.mode === 'payment' && s.payment_status === 'paid' && s.metadata && s.metadata.tip) {
    db.prepare('INSERT OR IGNORE INTO tips (session_id, user_id, cents, at) VALUES (?, ?, ?, ?)')
      .run(s.id, userId, Math.round(Number(s.metadata.tip)) || 0, Date.now());
    onChange(userId, { tip: true });
  }
}

// An event from the webhook (already checked). Each is handled once; if handling it fails,
// Stripe sends it again later.
async function onEvent(event) {
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return;
  if (!db.prepare('INSERT OR IGNORE INTO stripe_events (id, type, at) VALUES (?, ?, ?)').run(event.id, event.type, Date.now()).changes) return;
  try {
    const o = (event.data && event.data.object) || {};
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') await onCheckout(o);
    else if (event.type.startsWith('customer.subscription.') && typeof o.id === 'string') await syncSubscription(o.id, o.metadata && o.metadata.rainlit_user);
  } catch (err) {
    db.prepare('DELETE FROM stripe_events WHERE id = ?').run(event.id);
    throw err;
  }
}

// Back from Stripe's page (/support?thanks=...): that checkout, checked with Stripe for whoever's
// back, so their perks are there at once (the webhook may take a few seconds).
async function confirm(u, sessionId) {
  if (!enabled || !/^cs_[A-Za-z0-9_]{8,200}$/.test(String(sessionId || ''))) return;
  const s = await stripe('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (s.client_reference_id !== u.id || s.status !== 'complete') return;
  await onCheckout(s);
}

// Deleting an account stops its subscription at once (nobody's left to support as). Returns
// whether it's stopped (or there wasn't one).
async function forget(u) {
  if (!u || !u.stripe_subscription || !active(u) || u.supporter_plan === 'gift') return true;
  if (!enabled) return true;
  try {
    await stripe('DELETE', `/subscriptions/${encodeURIComponent(u.stripe_subscription)}`);
    return true;
  } catch (err) {
    if (err.stripeStatus === 404) return true; // (Stripe hasn't got it any more)
    console.error(`[support] Couldn't stop @${u.username}'s subscription (${u.stripe_subscription}).`);
    return false;
  }
}

// ---------- Gifts (from the admin) ----------

// Some months of supporting, as a thank-you (they count for the badge too). Not for someone
// supporting through Stripe already.
function gift(userId, months) {
  const u = userById(userId);
  if (!u) throw new SupportError("That account isn't there any more.", 404);
  const n = Math.round(Number(months));
  if (!(n >= 1 && n <= 36)) throw new SupportError('From 1 to 36 months.');
  if (active(u) && u.supporter_plan !== 'gift') throw new SupportError('They support Rainlit already.', 409);
  const from = active(u) && u.supporter_until > Date.now() ? u.supporter_until : Date.now();
  transaction(() => {
    db.prepare("UPDATE users SET supporter_plan = 'gift', supporter_until = ?, supporter_cancels = NULL WHERE id = ?").run(from + n * 30 * DAY, u.id);
    begin(u.id);
  });
  onChange(u.id);
}
function endGift(userId) {
  const u = userById(userId);
  if (!u || u.supporter_plan !== 'gift') return false;
  transaction(() => {
    end(u.id);
    db.prepare('UPDATE users SET supporter_until = NULL WHERE id = ?').run(u.id);
  });
  onChange(u.id);
  return true;
}

// ---------- Looking after it ----------

// Every hour: gifts that have run out end, and a subscription well past what was paid for is
// checked with Stripe (in case its "ended" never came through).
async function sweep(now = Date.now()) {
  const due = db.prepare('SELECT * FROM users WHERE supporter_since IS NOT NULL AND supporter_until IS NOT NULL AND supporter_until < ?').all(now);
  for (const u of due) {
    if (u.supporter_plan === 'gift') {
      end(u.id, u.supporter_until);
      onChange(u.id);
    } else if (enabled && u.stripe_subscription && u.supporter_until < now - 2 * DAY) {
      await syncSubscription(u.stripe_subscription, u.id).catch(() => {});
    }
  }
  db.prepare('DELETE FROM stripe_events WHERE at < ?').run(now - 30 * DAY);
}
setInterval(() => sweep().catch(() => {}), 3600_000).unref();

// ---------- This month (the support page's bar, and Admin) ----------

// What running rainlit.app costs a month, in cents: the admin says, in Admin.
const costs = () => Math.max(0, Math.round(Number(settings.get('supportCosts', 0)) || 0));
function setCosts(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new SupportError('That needs to be a number of dollars.');
  settings.set('supportCosts', Math.round(n * 100));
}

// About how much supporters cover this month, after the payment service's fees (about 6.4%
// and 30 cents each time): each monthly supporter's $5, a twelfth of each yearly one's $50,
// and this month's tips.
const net = (cents) => Math.max(0, cents * 0.936 - 30);
function month(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const count = (plan) => db.prepare('SELECT COUNT(*) n FROM users WHERE supporter_since IS NOT NULL AND supporter_plan = ?').get(plan).n;
  const monthly = count('month');
  const yearly = count('year');
  const tips = db.prepare('SELECT cents FROM tips WHERE at >= ?').all(start).map((t) => t.cents);
  const covered = Math.round(monthly * net(PLANS.month.cents) + (yearly * net(PLANS.year.cents)) / 12 + tips.reduce((s, c) => s + net(c), 0));
  return { costs: costs(), covered, supporters: monthly + yearly, tips: tips.length };
}

// What the support page shows everyone.
function plan() {
  const m = month();
  return {
    enabled,
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { cents: p.cents }])),
    tip: TIP, perks: { ...PERKS, roomMb: roomMb() }, levels: LEVELS,
    month: m.costs ? { costs: m.costs, covered: m.covered, supporters: m.supporters } : null,
  };
}

// ---------- One-time links (from the apps to the website) ----------
// The apps open /support in a browser, which may not be signed in: the link says who it's for,
// for half an hour, and only for starting a checkout or seeing how they support.

const links = new Map(); // hashed token -> { userId, until }
function linkFor(userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  for (const [k, v] of links) if (v.until < now) links.delete(k);
  links.set(crypto.createHash('sha256').update(token).digest('hex'), { userId, until: now + 30 * 60_000 });
  return token;
}
function userForLink(token) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const l = links.get(crypto.createHash('sha256').update(token).digest('hex'));
  return l && l.until > Date.now() ? userById(l.userId) : null;
}

module.exports = {
  enabled, PLANS, TIP, PERKS, LEVELS, SupportError, whenChanged,
  active, daysOf, levelOf, badgeOf, statusOf, roomMb, sharpStreams, VOICE_MONTHLY_GB, SHARP_PERSON_GB,
  checkout, tip, manageUrl, verify, onEvent, confirm, forget, gift, endGift, sweep,
  costs, setCosts, month, plan, linkFor, userForLink,
  _test: { form, apply, begin, end },
};
