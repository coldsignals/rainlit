'use strict';

// A record of your time with a friend on Rainlit (GET /api/friends/:id/record), to keep, print or
// save as a PDF: a page with how many calls you've had and how long they lasted, each one (when,
// how long, who rang, and missed ones), time together in voice channels and group calls (from your
// own call record, if you keep one: lib/callrecord.js), how many messages each of you has sent,
// and, if you'd like, the messages themselves (what both of you sent: it's your conversation).
//
// Its calls come from the conversation's notes (kept while it's saving: "Call, 1 h 12 min") and
// from your own call record, each call once. Times are given in your time zone, by Rainlit's
// server's clock.

const { db } = require('./db');
const dms = require('./dms');
const callrecord = require('./callrecord');
const { cleanTz } = require('./people');

const DAY = 86_400_000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const json = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };

function person(id) {
  const u = id && db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(id);
  return u ? { name: u.display_name || u.username, username: u.username } : { name: 'Someone whose account is gone', username: null };
}

// "1 h 12 min", "4 min", "40 s"; long ones in hours: "312 hours 40 minutes".
function length(ms, long = false) {
  const s = Math.round(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (long && (h || m)) return h ? `${h.toLocaleString('en-US')} hour${h === 1 ? '' : 's'} ${m} minute${m === 1 ? '' : 's'}` : `${m} minute${m === 1 ? '' : 's'}`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

// Your calls with a friend: from the conversation's notes, and your own record, each once.
function callsBetween(userId, friendId) {
  const dmId = dms.dmIdOf(userId, friendId);
  const notes = db.prepare("SELECT author_id, kind, meta, created_at FROM messages WHERE dm_id = ? AND kind IN ('call', 'saving') ORDER BY created_at, rowid").all(dmId);
  const calls = [];
  const missed = [];
  const saving = [];
  let started = null;
  for (const n of notes) {
    const meta = json(n.meta);
    if (n.kind === 'saving') {
      saving.push({ at: n.created_at, on: Boolean(meta.on), by: n.author_id });
    } else if (meta.started) {
      if (started) calls.push({ start: started.at, end: null, by: started.by }); // (it never said how long: the server stopped)
      started = { at: n.created_at, by: n.author_id };
    } else if (meta.missed) {
      missed.push({ at: n.created_at, by: n.author_id });
    } else if (meta.durationMs != null) {
      const start = n.created_at - Number(meta.durationMs);
      const by = started && Math.abs(started.at - start) < 5000 ? started.by : null;
      if (started && !by) calls.push({ start: started.at, end: null, by: started.by });
      calls.push({ start, end: n.created_at, by });
      started = null;
    }
  }
  if (started) calls.push({ start: started.at, end: null, by: started.by, going: Date.now() - started.at < 12 * 3600_000 });
  // (Your own record: the same calls, or ones the conversation didn't keep.)
  const mine = callrecord.withFriend(userId, friendId);
  for (const c of mine.calls) {
    const same = calls.find((x) => Math.abs(x.start - c.start) < 5000);
    if (same) {
      if (!same.end && c.end) same.end = c.end;
      if (!same.by && c.by) same.by = c.by;
    } else {
      calls.push({ ...c, mine: true });
    }
  }
  calls.sort((a, b) => a.start - b.start);
  return { calls, missed, saving, voice: mine.voice };
}

function build(userId, friendId, { from = null, to = null, withMessages = false, tz = 'UTC', locale = 'en-US', now = Date.now() } = {}) {
  tz = cleanTz(tz) || 'UTC';
  try {
    locale = Intl.DateTimeFormat.supportedLocalesOf([String(locale)])[0] || 'en-US';
  } catch {
    locale = 'en-US';
  }
  const fmt = (opts) => new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });
  const dayName = fmt({ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dayShort = fmt({ year: 'numeric', month: 'long', day: 'numeric' });
  const clock = fmt({ hour: 'numeric', minute: '2-digit' });
  const monthName = fmt({ year: 'numeric', month: 'long' });
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (ms) => keyFmt.format(ms); // 2026-10-09, in your time zone
  const inRange = (ms) => (from == null || ms >= from) && (to == null || ms < to);

  const me = person(userId);
  const them = person(friendId);
  const nameOf = (id) => (id === userId ? me.name : id === friendId ? them.name : null);
  const dmId = dms.dmIdOf(userId, friendId);
  const all = callsBetween(userId, friendId);
  const calls = all.calls.filter((c) => inRange(c.start));
  const missed = all.missed.filter((m) => inRange(m.at));
  const voice = all.voice.filter((v) => inRange(v.start));
  const saving = all.saving.filter((s) => inRange(s.at));
  const friendship = db.prepare("SELECT created_at FROM friendships WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)) AND status = 'accepted'").get(userId, friendId, friendId, userId);
  const counted = (id) => db.prepare(`SELECT COUNT(*) n FROM messages WHERE dm_id = ? AND author_id = ? AND kind IN ('text', 'file', 'gif')${from != null ? ' AND created_at >= ?' : ''}${to != null ? ' AND created_at < ?' : ''}`)
    .get(dmId, id, ...(from != null ? [from] : []), ...(to != null ? [to] : [])).n;
  const sent = { me: counted(userId), them: counted(friendId) };
  const span = db.prepare(`SELECT MIN(created_at) first, MAX(created_at) last FROM messages WHERE dm_id = ?${from != null ? ' AND created_at >= ?' : ''}${to != null ? ' AND created_at < ?' : ''}`)
    .get(dmId, ...(from != null ? [from] : []), ...(to != null ? [to] : []));

  // ----- Summing up -----
  const done = calls.filter((c) => c.end);
  const total = done.reduce((n, c) => n + (c.end - c.start), 0);
  const longest = done.reduce((a, c) => (!a || c.end - c.start > a.end - a.start ? c : a), null);
  const days = new Set(calls.map((c) => dayKey(c.start)));
  for (const v of voice) days.add(dayKey(v.start));
  const firstDay = calls.length || voice.length ? Math.min(...calls.map((c) => c.start), ...voice.map((v) => v.start)) : null;
  const lastDay = calls.length || voice.length ? Math.max(...calls.map((c) => c.start), ...voice.map((v) => v.start)) : null;
  const daysAcross = firstDay != null ? Math.round((Date.parse(`${dayKey(lastDay)}T00:00:00Z`) - Date.parse(`${dayKey(firstDay)}T00:00:00Z`)) / DAY) + 1 : 0;
  const voiceTotal = voice.reduce((n, v) => n + v.together, 0);
  const rang = { me: calls.filter((c) => c.by === userId).length, them: calls.filter((c) => c.by === friendId).length };

  const months = new Map();
  const month = (ms) => {
    const k = dayKey(ms).slice(0, 7);
    if (!months.has(k)) months.set(k, { at: ms, calls: 0, time: 0, days: new Set(), voice: 0 });
    return months.get(k);
  };
  for (const c of calls) {
    const m = month(c.start);
    m.calls++;
    if (c.end) m.time += c.end - c.start;
    m.days.add(dayKey(c.start));
  }
  for (const v of voice) {
    const m = month(v.start);
    m.voice += v.together;
    m.days.add(dayKey(v.start));
  }

  // ----- The page -----
  const title = `Calls and messages between ${me.name} and ${them.name}`;
  const handle = (p) => (p.username ? ` (@${esc(p.username)})` : '');
  const out = [];
  out.push(`<!doctype html><html lang="${esc(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`);
  out.push(`<title>${esc(title)}</title><style>
  body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1b1f27; background: #fff; max-width: 900px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 32px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #1b1f27; }
  h3 { font-size: 15px; margin: 22px 0 6px; color: #3b4352; }
  .made { color: #4a5262; margin: 0 0 18px; } .note { color: #4a5262; font-size: 13px; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0; }
  .facts dt { font-weight: 600; } .facts dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #d6dae2; vertical-align: top; }
  th { background: #f1f3f7; font-weight: 600; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  tr.missed td { color: #8a5a00; } .day { margin-top: 18px; font-weight: 700; } .msg { margin: 2px 0 2px 0; padding-left: 64px; text-indent: -64px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .msg time { display: inline-block; width: 60px; text-indent: 0; color: #5d6574; font-variant-numeric: tabular-nums; } .who { font-weight: 600; } .aside { color: #5d6574; font-style: italic; }
  @media print { body { padding: 0; font-size: 12px; } h2 { break-after: avoid; } tr, .msg { break-inside: avoid; } .print-hint { display: none; } }
  .print-hint { background: #eef4ff; border: 1px solid #c8d8f4; border-radius: 8px; padding: 8px 12px; font-size: 13px; }
</style></head><body>`);
  out.push(`<h1>${esc(title)}</h1>`);
  out.push(`<p class="made">${esc(me.name)}${handle(me)} and ${esc(them.name)}${handle(them)}, on Rainlit. Saved by ${esc(me.name)} on ${esc(dayShort.format(now))} at ${esc(clock.format(now))}.`);
  if (from != null || to != null) {
    out.push(` From ${from != null ? esc(dayShort.format(from)) : 'the start'} to ${to != null ? esc(dayShort.format(to - 1)) : 'today'}.`);
  }
  out.push(` Times are ${esc(tz)} time.</p>`);
  out.push('<p class="print-hint">To keep it as a PDF: print it (Ctrl+P, or Share &gt; Print on a phone) and pick "Save as PDF".</p>');

  out.push('<h2>In short</h2><dl class="facts">');
  const fact = (k, v) => out.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`);
  if (friendship) fact('Friends on Rainlit since', esc(dayShort.format(friendship.created_at)));
  fact('Calls', calls.length
    ? `${calls.length.toLocaleString('en-US')}${rang.me || rang.them ? ` (${esc(me.name)} rang ${rang.me.toLocaleString('en-US')}, ${esc(them.name)} rang ${rang.them.toLocaleString('en-US')})` : ''}`
    : 'None in this record');
  if (done.length) {
    fact('Time on calls', `${esc(length(total, true))}, ${esc(length(total / done.length))} on average`);
    fact('Longest call', `${esc(length(longest.end - longest.start))}, on ${esc(dayShort.format(longest.start))}`);
  }
  if (voice.length) fact('Together in voice channels and group calls', `${esc(length(voiceTotal, true))}, ${voice.length.toLocaleString('en-US')} time${voice.length === 1 ? '' : 's'}`);
  if (days.size) fact('Days you talked', `${days.size.toLocaleString('en-US')} of the ${daysAcross.toLocaleString('en-US')} days from ${esc(dayShort.format(firstDay))} to ${esc(dayShort.format(lastDay))}`);
  if (missed.length) fact('Missed calls', missed.length.toLocaleString('en-US'));
  fact('Messages', sent.me + sent.them
    ? `${(sent.me + sent.them).toLocaleString('en-US')} (${esc(me.name)} sent ${sent.me.toLocaleString('en-US')}, ${esc(them.name)} ${sent.them.toLocaleString('en-US')})${span.first ? `, from ${esc(dayShort.format(span.first))} to ${esc(dayShort.format(span.last))}` : ''}`
    : 'None saved in this record');
  out.push('</dl>');

  if (months.size) {
    out.push(`<h3>Month by month</h3><table><thead><tr><th>Month</th><th class="n">Calls</th><th class="n">Time on calls</th>${voice.length ? '<th class="n">In voice channels</th>' : ''}<th class="n">Days you talked</th></tr></thead><tbody>`);
    for (const k of [...months.keys()].sort()) {
      const m = months.get(k);
      out.push(`<tr><td>${esc(monthName.format(m.at))}</td><td class="n">${m.calls}</td><td class="n">${esc(length(m.time))}</td>${voice.length ? `<td class="n">${esc(length(m.voice))}</td>` : ''}<td class="n">${m.days.size}</td></tr>`);
    }
    out.push('</tbody></table>');
  }

  out.push('<h2>Calls</h2>');
  if (!calls.length && !missed.length) out.push('<p class="note">No calls in this record.</p>');
  else {
    out.push('<table><thead><tr><th>Day</th><th>Started</th><th>Ended</th><th class="n">Length</th><th>Rang</th></tr></thead><tbody>');
    const rows = [...calls.map((c) => ({ at: c.start, c })), ...missed.map((m) => ({ at: m.at, m }))].sort((a, b) => a.at - b.at);
    for (const { c, m } of rows) {
      if (m) {
        out.push(`<tr class="missed"><td>${esc(dayName.format(m.at))}</td><td>${esc(clock.format(m.at))}</td><td></td><td class="n">Missed</td><td>${esc(nameOf(m.by) || '')}</td></tr>`);
        continue;
      }
      const end = c.end ? esc(clock.format(c.end)) + (dayKey(c.end) !== dayKey(c.start) ? ` (${esc(dayShort.format(c.end))})` : '') : c.going ? 'still going' : '';
      out.push(`<tr><td>${esc(dayName.format(c.start))}</td><td>${esc(clock.format(c.start))}</td><td>${end}</td><td class="n">${c.end ? esc(length(c.end - c.start)) : '<span class="aside">not known</span>'}</td><td>${esc(nameOf(c.by) || '')}</td></tr>`);
    }
    out.push('</tbody></table>');
  }
  if (voice.length) {
    out.push(`<h3>Together in voice channels and group calls</h3><table><thead><tr><th>Day</th><th>Where</th><th>From</th><th class="n">Together</th></tr></thead><tbody>`);
    for (const v of voice) out.push(`<tr><td>${esc(dayName.format(v.start))}</td><td>${esc(v.place || '')}</td><td>${esc(clock.format(v.start))}</td><td class="n">${esc(length(v.together))}</td></tr>`);
    out.push('</tbody></table>');
  }

  if (withMessages) {
    out.push('<h2>Messages</h2>');
    const rows = db.prepare(`SELECT author_id, kind, text, file_name, file_size, meta, created_at, edited_at FROM messages WHERE dm_id = ? AND kind IN ('text', 'file', 'gif', 'saving')${from != null ? ' AND created_at >= ?' : ''}${to != null ? ' AND created_at < ?' : ''} ORDER BY created_at, rowid`)
      .all(dmId, ...(from != null ? [from] : []), ...(to != null ? [to] : []));
    if (!rows.some((r) => r.kind !== 'saving')) out.push('<p class="note">No messages saved in this record.</p>');
    let day = '';
    for (const r of rows) {
      const k = dayKey(r.created_at);
      if (k !== day) {
        day = k;
        out.push(`<p class="day">${esc(dayName.format(r.created_at))}</p>`);
      }
      const who = esc(nameOf(r.author_id) || person(r.author_id).name);
      let body;
      if (r.kind === 'saving') {
        body = `<span class="aside">${who} turned saving ${json(r.meta).on ? 'on: messages from here are kept' : 'off: messages from here weren\'t kept'}</span>`;
      } else {
        const what = r.kind === 'file' ? `<span class="aside">[sent a file: ${esc(r.file_name || 'a file')}]</span>${r.text ? ` ${esc(r.text)}` : ''}`
          : r.kind === 'gif' ? `<span class="aside">[sent a GIF${json(r.meta).title ? `: ${esc(json(r.meta).title)}` : ''}]</span>`
            : esc(r.text);
        body = `<span class="who">${who}:</span> ${what}${r.edited_at ? ' <span class="aside">(edited)</span>' : ''}`;
      }
      out.push(`<p class="msg"><time>${esc(clock.format(r.created_at))}</time>${body}</p>`);
    }
  }

  out.push('<h2>About this record</h2><p class="note">');
  out.push(`Made by Rainlit (${esc(process.env.PUBLIC_URL || 'rainlit.app')}) from what it keeps. A conversation notes each call in it when the call starts and ends (by Rainlit's server's clock), and keeps the conversation's messages while saving is on (either person can turn it off: then nothing's kept until it's back on). Messages someone deleted, and everything from an account that's been deleted, aren't in it.`);
  const keptSince = callrecord.since(userId);
  if (keptSince) out.push(` ${esc(me.name)} keeps a record of their own calls (since ${esc(dayShort.format(keptSince))}): calls in it are here too, and time together in voice channels and group calls comes from it.`);
  if (saving.length) out.push(` Saving was turned ${saving.map((s) => `${s.on ? 'on' : 'off'} on ${esc(dayShort.format(s.at))}`).join(', ')}.`);
  out.push('</p></body></html>');

  const slug = (p) => String(p.username || 'someone').replace(/[^A-Za-z0-9_-]+/g, '');
  return { name: `rainlit-calls-${slug(me)}-and-${slug(them)}-${dayKey(now)}.html`, html: out.join('\n') };
}

module.exports = { build, callsBetween, length };
