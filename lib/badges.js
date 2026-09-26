'use strict';

// Badges: little marks on people's profiles, like Discord's. Some come by themselves
// (joining during the alpha, running the server); the admin gives the others.

const { db } = require('./db');

// Where Rainlit is. Everyone who signs up during the alpha gets First Drops.
const STAGE = 'alpha';

// The badges the admin can give and take back.
const GIVEN = new Set(['stormchaser']);

const listStmt = db.prepare('SELECT badge, given_at FROM user_badges WHERE user_id = ? ORDER BY given_at');
const giveStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, given_at) VALUES (?, ?, ?)');
const takeStmt = db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge = ?');

// A user's badges, as [{ id, at }].
function badgesOf(u) {
  const out = listStmt.all(u.id).map((r) => ({ id: r.badge, at: r.given_at }));
  if (u.is_admin) out.unshift({ id: 'lamplighter', at: u.created_at });
  return out;
}

function give(userId, badge, at = Date.now()) {
  giveStmt.run(userId, badge, at);
}

function take(userId, badge) {
  takeStmt.run(userId, badge);
}

// What a new account starts with.
function welcome(userId, at) {
  if (STAGE === 'alpha') give(userId, 'first-drops', at);
}

module.exports = { STAGE, GIVEN, badgesOf, give, take, welcome };
