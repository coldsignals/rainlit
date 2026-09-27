'use strict';

// Blocking and reporting.
//
// Blocking someone ends any friendship or friend request between you, and they can't send
// you another. Their messages in spaces you share fold away in your own app.
//
// A report is about a message or a person. One from a space goes to that space's moderators,
// and every report reaches the server's admin too, who answers for everything on the server.
// What a reported message said is kept with the report, so deleting it doesn't hide it.

const { db } = require('./db');
const { oneLine, userById, removeFriendship } = require('./people');

const REASONS = ['spam', 'harassment', 'inappropriate', 'danger', 'other'];
const NOTE_MAX = 1000;
const REPORTS_PER_HOUR = 20;

// ---------- Blocking ----------

function block(userId, blockedId) {
  db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)').run(userId, blockedId, Date.now());
  removeFriendship(userId, blockedId);
}

function unblock(userId, blockedId) {
  db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(userId, blockedId);
}

const hasBlocked = (userId, otherId) => Boolean(db.prepare('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?').get(userId, otherId));

function blockedBy(userId) {
  return db.prepare('SELECT blocked_id FROM blocks WHERE user_id = ? ORDER BY created_at').all(userId).map((r) => r.blocked_id);
}

// ---------- Reports ----------

// How many reports someone has made in the last hour (they can make 20).
const reportsLastHour = (userId) => db.prepare('SELECT COUNT(*) n FROM reports WHERE reporter_id = ? AND created_at > ?').get(userId, Date.now() - 3600_000).n;

function openReportFor(reporterId, messageId, targetId) {
  return db.prepare(`
    SELECT id FROM reports WHERE reporter_id = ? AND resolved_at IS NULL
      AND (message_id = ? OR (? IS NULL AND message_id IS NULL AND target_id = ?))
  `).get(reporterId, messageId, messageId, targetId) || null;
}

function addReport({ reporterId, targetId, spaceId = null, convId = null, messageId = null, reason, note = '', snapshot = {} }) {
  return Number(db.prepare(`
    INSERT INTO reports (reporter_id, target_id, space_id, conv_id, message_id, reason, note, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(reporterId, targetId, spaceId, convId, messageId, reason, oneLine(note, NOTE_MAX), JSON.stringify(snapshot), Date.now()).lastInsertRowid);
}

const reportById = (id) => db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(id)) || null;

function person(id) {
  const u = id && userById(id);
  return u ? { id: u.id, displayName: u.display_name, username: u.username, avatar: u.avatar ? `/avatars/${u.avatar}` : null } : null;
}

function reportJson(r) {
  let snapshot = {};
  try { snapshot = JSON.parse(r.snapshot); } catch {}
  return {
    id: r.id, reason: r.reason, note: r.note, at: r.created_at,
    reporter: person(r.reporter_id), target: person(r.target_id),
    spaceId: r.space_id, convId: r.conv_id, messageId: r.message_id, snapshot,
    resolved: r.resolved_at ? { by: person(r.resolved_by), at: r.resolved_at } : null,
  };
}

// Open ones first, then the most recently dealt with.
const ORDER = 'ORDER BY resolved_at IS NOT NULL, COALESCE(resolved_at, created_at) DESC LIMIT 100';

function reportsForSpace(spaceId) {
  return db.prepare(`SELECT * FROM reports WHERE space_id = ? ${ORDER}`).all(spaceId).map(reportJson);
}

function allReports() {
  return db.prepare(`SELECT * FROM reports ${ORDER}`).all().map(reportJson);
}

const openReportCount = (spaceId = null) => (spaceId
  ? db.prepare('SELECT COUNT(*) n FROM reports WHERE space_id = ? AND resolved_at IS NULL').get(spaceId).n
  : db.prepare('SELECT COUNT(*) n FROM reports WHERE resolved_at IS NULL').get().n);

function setResolved(id, byId, resolved) {
  db.prepare('UPDATE reports SET resolved_by = ?, resolved_at = ? WHERE id = ?').run(resolved ? byId : null, resolved ? Date.now() : null, id);
}

module.exports = {
  REASONS, NOTE_MAX, REPORTS_PER_HOUR,
  block, unblock, hasBlocked, blockedBy,
  reportsLastHour, openReportFor, addReport, reportById, reportJson, reportsForSpace, allReports, openReportCount, setResolved,
};
