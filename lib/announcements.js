'use strict';

// Announcements (Admin): whoever runs the server telling everyone something, like a change to
// the terms or the privacy policy (at least 3 days before it starts, as both promise), or some
// planned downtime. Each shows once to everyone, the next time they open Rainlit (straight away
// if they have it open), until they press "Got it". Someone who makes an account afterwards
// isn't shown older ones, and someone away for over a month isn't shown old news.

const { db } = require('./db');

const TITLE_MAX = 80;
const BODY_MAX = 1000;
const SHOWN_FOR = 30 * 86_400_000;
const NOTICE_DAYS = 3; // (what the terms and privacy policy promise for big changes)

class AnnouncementError extends Error {}

const text = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

// Where to read more: a page on this server (/terms, /privacy) or a web address, or ''.
function link(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\/(?!\/)[A-Za-z0-9/_.#?=&%-]{0,200}$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && s.length <= 500 ? u.href : '';
  } catch {
    return '';
  }
}

const json = (r) => ({ id: r.id, title: r.title, body: r.body, link: r.link || null, startsOn: r.starts_on || null, at: r.created_at });

// startsOn: the day the change it's about starts ("2026-10-02"), or nothing for plain news.
function create(byId, { title, body, link: href, startsOn }) {
  const t = text(title, TITLE_MAX);
  if (!t) throw new AnnouncementError('Give it a title.');
  const day = startsOn ? String(startsOn) : '';
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new AnnouncementError("That date doesn't look right.");
  const l = link(href);
  if (href && !l) throw new AnnouncementError('Links can be a page here (like /terms) or an https:// address.');
  const { lastInsertRowid } = db.prepare('INSERT INTO announcements (title, body, link, starts_on, by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(t, text(body, BODY_MAX), l, day || null, byId, Date.now());
  return json(db.prepare('SELECT * FROM announcements WHERE id = ?').get(Number(lastInsertRowid)));
}

// Every one sent, the newest first (for the Admin panel), with how many of the people here then
// have seen it (those who've joined since weren't shown it).
function list() {
  return db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 50').all().map((r) => ({
    ...json(r),
    seenBy: db.prepare('SELECT COUNT(*) n FROM users WHERE announcements_seen >= ? AND created_at <= ?').get(r.id, r.created_at).n,
    of: db.prepare('SELECT COUNT(*) n FROM users WHERE created_at <= ?').get(r.created_at).n,
  }));
}

// Taking one down: nobody who hasn't seen it yet will.
function remove(id) {
  return db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(id)).changes > 0;
}

// What someone hasn't pressed "Got it" on yet, the oldest first.
function unseenFor(user) {
  return db.prepare('SELECT * FROM announcements WHERE id > ? AND created_at > ? ORDER BY id')
    .all(user.announcements_seen || 0, Date.now() - SHOWN_FOR).map(json);
}

function markSeen(userId, upTo) {
  const newest = db.prepare('SELECT COALESCE(MAX(id), 0) n FROM announcements').get().n;
  const to = Math.min(Math.max(0, Math.floor(Number(upTo) || 0)), newest);
  db.prepare('UPDATE users SET announcements_seen = MAX(announcements_seen, ?) WHERE id = ?').run(to, String(userId));
}

// A new account: it's made under things as they are now, so earlier announcements aren't news.
function skipOld(userId) {
  db.prepare('UPDATE users SET announcements_seen = (SELECT COALESCE(MAX(id), 0) FROM announcements) WHERE id = ?').run(String(userId));
}

module.exports = { TITLE_MAX, BODY_MAX, NOTICE_DAYS, AnnouncementError, create, list, remove, unseenFor, markSeen, skipOld };
