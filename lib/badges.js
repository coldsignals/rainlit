'use strict';

// Badges: little marks on people's profiles, like Discord's. First Leaf, for everyone who
// joined during the alpha; the supporter badge, which grows the longer someone supports Rainlit
// (lib/supporters.js); and Bug Finder, which the admin gives someone for a bug they found and told
// them about (again for each one after: it says how many).

const { db } = require('./db');
const supporters = require('./supporters');

// Where Rainlit is. Everyone who signs up during the alpha gets its badge.
const STAGE = 'alpha';

// The ones the admin gives (Admin > People, and a bug report in Admin > Feedback).
const GIVEN = ['bugs'];

const listStmt = db.prepare('SELECT badge, given_at, count FROM user_badges WHERE user_id = ? ORDER BY given_at');
const giveStmt = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, given_at) VALUES (?, ?, ?)');
const countStmt = db.prepare('SELECT count FROM user_badges WHERE user_id = ? AND badge = ?');

const supportStmt = db.prepare('SELECT id, supporter_first, supporter_since, supporter_ms FROM users WHERE id = ?');

// A user's badges, as [{ id, at }] (`count`: given that many times; the supporter badge has its
// level, months, and whether it's lit: see badgeOf in lib/supporters.js).
function badgesOf(u) {
  const list = listStmt.all(u.id).map((r) => ({ id: r.badge, at: r.given_at, ...(r.count > 1 ? { count: r.count } : {}) }));
  const support = supporters.badgeOf('supporter_first' in u ? u : supportStmt.get(u.id));
  if (support) list.push(support);
  return list;
}

// What a new account starts with.
function welcome(userId, at) {
  if (STAGE === 'alpha') giveStmt.run(userId, 'alpha', at);
}

const countOf = (userId, badge) => (countStmt.get(userId, badge) || { count: 0 }).count;
// One of GIVEN, given (or once more, if they have it). How many times now.
function give(userId, badge) {
  db.prepare('INSERT INTO user_badges (user_id, badge, given_at) VALUES (?, ?, ?) ON CONFLICT(user_id, badge) DO UPDATE SET count = count + 1')
    .run(userId, badge, Date.now());
  return countOf(userId, badge);
}
// ...and once taken back (given by mistake): the badge goes when there's none left. How many times
// now (null: they didn't have it).
function takeBack(userId, badge) {
  const n = countOf(userId, badge);
  if (!n) return null;
  if (n > 1) db.prepare('UPDATE user_badges SET count = count - 1 WHERE user_id = ? AND badge = ?').run(userId, badge);
  else db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge = ?').run(userId, badge);
  return n - 1;
}

module.exports = { STAGE, GIVEN, badgesOf, welcome, give, takeBack };
