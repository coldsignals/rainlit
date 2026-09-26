'use strict';

// Badges: little marks on people's profiles, like Discord's. There's one so far, First
// Leaf, for everyone who joined during the alpha.

const { db } = require('./db');

// Where Rainlit is. Everyone who signs up during the alpha gets its badge.
const STAGE = 'alpha';

const listStmt = db.prepare('SELECT badge, given_at FROM user_badges WHERE user_id = ? ORDER BY given_at');
const giveStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, given_at) VALUES (?, ?, ?)');

// A user's badges, as [{ id, at }].
function badgesOf(u) {
  return listStmt.all(u.id).map((r) => ({ id: r.badge, at: r.given_at }));
}

// What a new account starts with.
function welcome(userId, at) {
  if (STAGE === 'alpha') giveStmt.run(userId, 'alpha', at);
}

module.exports = { STAGE, badgesOf, welcome };
