'use strict';

// Badges: little marks on people's profiles, like Discord's. First Leaf, for everyone who
// joined during the alpha, and the supporter badge, which grows the longer someone supports
// Rainlit (lib/supporters.js).

const { db } = require('./db');
const supporters = require('./supporters');

// Where Rainlit is. Everyone who signs up during the alpha gets its badge.
const STAGE = 'alpha';

const listStmt = db.prepare('SELECT badge, given_at FROM user_badges WHERE user_id = ? ORDER BY given_at');
const giveStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, given_at) VALUES (?, ?, ?)');

const supportStmt = db.prepare('SELECT id, supporter_first, supporter_since, supporter_ms FROM users WHERE id = ?');

// A user's badges, as [{ id, at }] (the supporter badge has its level, months, and whether it's
// lit: see badgeOf in lib/supporters.js).
function badgesOf(u) {
  const list = listStmt.all(u.id).map((r) => ({ id: r.badge, at: r.given_at }));
  const support = supporters.badgeOf('supporter_first' in u ? u : supportStmt.get(u.id));
  if (support) list.push(support);
  return list;
}

// What a new account starts with.
function welcome(userId, at) {
  if (STAGE === 'alpha') giveStmt.run(userId, 'alpha', at);
}

module.exports = { STAGE, badgesOf, welcome };
