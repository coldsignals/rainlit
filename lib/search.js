'use strict';

// Searching what's been said: in a DM (or your notes), or across the channels of a space that you
// can see. A word finds the words it starts ("pizz" finds "pizza"), whatever their case or accents;
// "words in quotes" are found together, as they're written. Files are found by their names and
// GIFs by their titles. Emoji and other symbols are looked for as they are.
//
// Only what's been saved can be found: a DM with saving off keeps nothing to search. The words come
// from the message_words index (lib/db.js), kept up to date as messages are sent, edited, removed
// and deleted.

const { db } = require('./db');
const dms = require('./dms');

const PAGE = 25;
const MAX_TERMS = 12;
const MAX_OFFSET = 5000;
const SORTS = ['new', 'old', 'best'];

// What a message has: a link, a picture, a video, a sound, any file, or a GIF.
const HAS = {
  link: "(m.kind = 'text' AND (m.text LIKE '%http://%' OR m.text LIKE '%https://%'))",
  image: "(m.kind = 'file' AND m.file_type LIKE 'image/%')",
  video: "(m.kind = 'file' AND m.file_type LIKE 'video/%')",
  audio: "(m.kind = 'file' AND m.file_type LIKE 'audio/%')",
  file: "m.kind = 'file'",
  gif: "(m.kind = 'gif' OR (m.kind = 'file' AND m.file_type = 'image/gif'))",
};

// What was typed, as what to look for: words and "quoted words" for the index (each a string, its
// own quotes doubled; a single word also finds the longer ones it starts), and anything with no
// letters or numbers in it (an emoji, say), which the index leaves out, to look for as it is.
function parse(q) {
  const words = [];
  const exact = [];
  for (const m of String(q || '').slice(0, 200).matchAll(/"([^"]*)"?|(\S+)/g)) {
    const quoted = m[1] !== undefined;
    const part = (quoted ? m[1] : m[2]).trim();
    if (!part) continue;
    if (/[\p{L}\p{N}]/u.test(part)) words.push(`"${part.replace(/"/g, '""')}"${quoted || [...part].length < 2 ? '' : '*'}`);
    else exact.push(part);
    if (words.length + exact.length >= MAX_TERMS) break;
  }
  return { words, exact };
}

// Where a message was said, as the index knows it (a DM's "a:b" without its colon).
const placeOf = (dmId) => String(dmId).replace(':', '');

// convs: the conversations to look in (DM ids, or channel ids). opts: { q, from, mentions, has,
// after, before (ms), sort: new | old | best, offset, hide: [ids whose messages to leave out] }.
// Returns { total, messages (newest first, unless sorted otherwise), more }.
function run(convs, opts = {}) {
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(opts.offset) || 0)));
  if (!convs.length) return { total: 0, messages: [], more: false };
  const { words, exact } = parse(opts.q);
  const where = [`m.dm_id IN (${convs.map(() => '?').join(', ')})`, "m.kind IN ('text', 'file', 'gif')"];
  const args = [...convs];
  if (words.length) {
    where.push('message_words MATCH ?');
    args.push(`words : (${words.join(' ')}) AND place : (${convs.map((c) => `"${placeOf(c)}"`).join(' OR ')})`);
  }
  for (const x of exact) {
    where.push('instr(m.text, ?) > 0');
    args.push(x);
  }
  if (opts.from) {
    where.push('m.author_id = ?');
    args.push(String(opts.from));
  }
  if (opts.mentions) {
    where.push('EXISTS (SELECT 1 FROM message_mentions mm WHERE mm.message_id = m.id AND mm.user_id = ?)');
    args.push(String(opts.mentions));
  }
  if (HAS[opts.has]) where.push(HAS[opts.has]);
  if (Number(opts.after) > 0) {
    where.push('m.created_at >= ?');
    args.push(Number(opts.after));
  }
  if (Number(opts.before) > 0) {
    where.push('m.created_at < ?');
    args.push(Number(opts.before));
  }
  const hide = (opts.hide || []).filter((id) => id !== opts.from);
  if (hide.length) {
    where.push(`(m.author_id IS NULL OR m.author_id NOT IN (${hide.map(() => '?').join(', ')}))`);
    args.push(...hide);
  }
  const sort = SORTS.includes(opts.sort) ? opts.sort : 'new';
  const source = words.length ? 'message_words JOIN messages m ON m.rowid = message_words.rowid' : 'messages m';
  const order = sort === 'old' ? 'm.rowid ASC' : sort === 'best' && words.length ? 'bm25(message_words, 1.0, 0.0), m.rowid DESC' : 'm.rowid DESC';
  const sql = `FROM ${source} WHERE ${where.join(' AND ')}`;
  try {
    const total = db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...args).n;
    const rows = db.prepare(`SELECT m.rowid, m.* ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, PAGE, offset);
    return { total, messages: dms.decorate(rows.map(dms.messageJson)), more: offset + rows.length < total };
  } catch (err) {
    // (Something the index couldn't read after all: nothing found, rather than an error.)
    if (/fts5|syntax/i.test(err.message)) return { total: 0, messages: [], more: false };
    throw err;
  }
}

// The options from a request's query string.
function optionsOf(query, hide) {
  const id = (v) => (/^[a-f0-9]{24}$/.test(String(v || '')) ? String(v) : '');
  return {
    q: String(query.q || ''),
    from: id(query.from),
    mentions: id(query.mentions),
    has: HAS[query.has] ? query.has : '',
    after: Number(query.after) || 0,
    before: Number(query.before) || 0,
    sort: String(query.sort || ''),
    offset: Number(query.offset) || 0,
    hide,
  };
}

// Whether anything's being searched for at all (words, or at least one filter).
const anything = (o) => Boolean(String(o.q).trim() || o.from || o.mentions || o.has || o.after || o.before);

module.exports = { PAGE, HAS, parse, run, optionsOf, anything };
