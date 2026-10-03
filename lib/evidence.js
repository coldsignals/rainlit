'use strict';

// Evidence for the authorities. Sexual content involving a child has to be reported (in the US,
// to the National Center for Missing & Exploited Children's CyberTipline) once whoever runs the
// server knows of it, and what was reported kept for a year (18 U.S.C. § 2258A, as the REPORT
// Act left it).
//
// So a report saying a child's involved has a copy made at once: the message and its file, the
// homepage and its pictures, or the profile picture, and the account that sent it. Nothing
// anyone does after that (deleting it, their account or the space) loses it. If the admin
// finds it's real, the copy's kept for a year from then (and from when they note the
// CyberTipline report's number); if not, it's deleted.
//
// It's kept in its own folder, which nothing serves and the app can't open:
// DATA_DIR/evidence/<case>/case.json, with the files beside it. Whoever runs the server reaches
// it on the server itself, if the authorities ask.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, DATA_DIR } = require('./db');
const blobs = require('./blobs');
const spaces = require('./spaces');
const homepages = require('./homepages');

const DIR = path.join(DATA_DIR, 'evidence');
const KEEP_MS = 365 * 86_400_000;
const CASE_RE = /^\d{8}-[0-9a-f]{6}$/;

const caseDir = (id) => path.join(DIR, id);

function read(id) {
  if (!CASE_RE.test(String(id))) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(caseDir(id), 'case.json'), 'utf8'));
  } catch {
    return null;
  }
}

function write(c) {
  const file = path.join(caseDir(c.id), 'case.json');
  fs.writeFileSync(`${file}.part`, JSON.stringify(c, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.part`, file);
}

const all = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((id) => CASE_RE.test(id)).map(read).filter(Boolean) : []);

// A file into the case, from wherever it's kept (this disk, or R2): its name there, or null.
async function copyIn(dir, kind, name, as) {
  try {
    const src = await blobs.localCopy(kind, name);
    if (!src) return null;
    fs.copyFileSync(src, path.join(dir, as));
    return as;
  } catch {
    return null;
  }
}
const safeName = (s) => String(s || 'file').replace(/[^\w.-]+/g, '_').slice(-80);

/**
 * Makes a copy of what a report is about: { reportId, reason, messageId, targetId, homepage }.
 * confirmedBy (the admin's id) when the admin's already sure; otherwise it waits for them.
 * Resolves the case.
 */
async function keep(report, { confirmedBy = null } = {}) {
  const at = Date.now();
  const id = `${new Date(at).toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const c = {
    id, at, reportId: report.reportId || null, reason: report.reason || null,
    confirmedAt: confirmedBy ? at : null, confirmedBy, keepUntil: confirmedBy ? at + KEEP_MS : null, tipline: '',
    report: null, account: null, message: null, homepage: null, files: [],
  };
  // (Everything from the database first, before any file's copied: nothing can change meanwhile.)
  const copies = [];
  const rep = c.reportId && db.prepare('SELECT * FROM reports WHERE id = ?').get(c.reportId);
  if (rep) c.report = { reporterId: rep.reporter_id, reason: rep.reason, note: rep.note, snapshot: json(rep.snapshot), at: rep.created_at };

  const u = report.targetId && db.prepare('SELECT id, username, display_name, email, created_at, avatar, suspended_at FROM users WHERE id = ?').get(report.targetId);
  c.account = u
    ? { id: u.id, username: u.username, displayName: u.display_name, email: u.email, createdAt: u.created_at, suspendedAt: u.suspended_at || null }
    : { id: report.targetId || null, gone: true };
  if (u && u.avatar) copies.push(['profile picture', 'avatars', u.avatar, `avatar-${safeName(u.avatar)}`]);

  const m = report.messageId && db.prepare('SELECT * FROM messages WHERE id = ?').get(report.messageId);
  if (m) {
    const channel = spaces.channel(m.dm_id);
    const space = channel && spaces.getSpace(channel.space_id);
    c.message = {
      id: m.id, kind: m.kind, text: m.text || '', at: m.created_at, authorId: m.author_id,
      file: m.file_name ? { name: m.file_name, type: m.file_type, size: m.file_size } : null,
      meta: m.meta ? json(m.meta) : null,
      where: channel
        ? { space: space ? { id: space.id, name: space.name } : { id: channel.space_id }, channel: { id: channel.id, name: channel.name } }
        : { conversation: m.dm_id, between: [...new Set(String(m.dm_id).split(':'))] },
    };
    if (m.file_path) copies.push(["the message's file", 'files', m.file_path, `message-${safeName(m.file_name)}`]);
  } else if (report.messageId) {
    c.message = { id: report.messageId, gone: true };
  }

  if (report.homepage && report.targetId) {
    const page = homepages.get(report.targetId);
    c.homepage = { doc: page.doc, visibility: page.visibility, updatedAt: page.updatedAt };
    for (const f of homepages.filesOf(report.targetId)) copies.push(['a homepage picture or song', 'homepages', f, `homepage-${safeName(f)}`]);
  }

  const dir = caseDir(id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const [what, kind, name, as] of copies) {
    const kept = await copyIn(dir, kind, name, as);
    if (kept) c.files.push({ what, name: kept });
  }
  write(c);
  return c;
}

// The case made for a report, if there is one; and each report's, for Admin's list of reports.
const forReport = (reportId) => all().find((c) => c.reportId === Number(reportId)) || null;
const byReport = () => new Map(all().filter((c) => c.reportId).map((c) => [c.reportId, summary(c)]));

// The admin's sure: kept a year from now.
function confirm(id, byId) {
  const c = read(id);
  if (!c) return null;
  c.confirmedAt = Date.now();
  c.confirmedBy = byId;
  c.keepUntil = Math.max(c.keepUntil || 0, c.confirmedAt + KEEP_MS);
  write(c);
  return c;
}

// The CyberTipline report's number, for the record. The year's counted from then too, at least.
function setTipline(id, number) {
  const c = read(id);
  if (!c) return null;
  c.tipline = String(number || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (c.confirmedAt) c.keepUntil = Math.max(c.keepUntil, Date.now() + KEEP_MS);
  write(c);
  return c;
}

// Not what the report said it was: the copy goes.
function discard(id) {
  if (!CASE_RE.test(String(id))) return;
  fs.rmSync(caseDir(id), { recursive: true, force: true });
}

// For Admin: each case, without what's in it.
function summary(c) {
  return {
    id: c.id, at: c.at, reportId: c.reportId, reason: c.reason, confirmedAt: c.confirmedAt, keepUntil: c.keepUntil, tipline: c.tipline,
    account: c.account ? { username: c.account.username || null, displayName: c.account.displayName || null } : null,
    what: c.message ? (c.message.file ? 'a file' : 'a message') : c.homepage ? 'a homepage' : 'an account',
    files: c.files.length,
  };
}
const list = () => all().filter((c) => c.confirmedAt).sort((a, b) => b.at - a.at).map(summary);

// A confirmed case goes when its year's up; one still waiting for the admin stays (its report's
// still open), but not past a year either.
function prune() {
  const now = Date.now();
  for (const c of all()) if (c.keepUntil ? now > c.keepUntil : now > c.at + KEEP_MS) discard(c.id);
}
prune();
setInterval(prune, 86_400_000).unref();

module.exports = { KEEP_MS, keep, forReport, byReport, confirm, setTipline, discard, summary, list, read };
