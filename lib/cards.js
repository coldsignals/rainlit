'use strict';

// Someone's profile card: how their profile looks to everyone who opens it (public/app.js draws
// it). Two colours (the card goes from one at the top to the other), a pattern along its top in
// those colours, a font for their name (both homepages': lib/looks.js), and weather over it.
// Glow's moving patterns and weather are for someone with Glow, and stay theirs if their Glow
// ends, until they change them (like a homepage's). No card: it looks as it always has.

const { db } = require('./db');
const supporters = require('./supporters');
const { FONTS, PATTERNS, SKIES, PERK_PATTERNS, PERK_SKIES } = require('./looks');

const HEX = /^#[0-9a-f]{6}$/i;

class CardError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Someone's card, as it's kept (null: they haven't one).
function cardOf(u) {
  if (!u || !u.card) return null;
  try {
    const c = JSON.parse(u.card);
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

// A card as asked for (null: none), checked: what's kept, or a CardError.
function clean(user, b) {
  if (b === null) return null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new CardError("That isn't a card.");
  const had = cardOf(user) || {};
  const glow = supporters.active(user);
  const colour = (v) => {
    if (!HEX.test(String(v))) throw new CardError('Pick a colour for your card.');
    return String(v).toLowerCase();
  };
  // (One of everyone's, or one of Glow's for someone with Glow, or the one that's there now.)
  const pick = (field, list, extras, what) => {
    const key = String(b[field] ?? 'none');
    if (list.includes(key)) return key;
    if (!extras.includes(key)) throw new CardError(`That isn't one of the ${what.many}.`);
    if (glow || had[field] === key) return key;
    throw new CardError(`That ${what.one} comes with Glow.`, 403);
  };
  const font = String(b.font ?? 'rainlit');
  if (!FONTS.includes(font)) throw new CardError("That isn't one of the fonts.");
  return {
    c1: colour(b.c1),
    c2: colour(b.c2),
    pattern: pick('pattern', ['none', ...PATTERNS], PERK_PATTERNS, { one: 'pattern', many: 'patterns' }),
    font,
    sky: pick('sky', SKIES, PERK_SKIES, { one: 'weather', many: 'kinds of weather' }),
  };
}

function save(userId, card) {
  db.prepare('UPDATE users SET card = ? WHERE id = ?').run(card ? JSON.stringify(card) : null, userId);
}

module.exports = { CardError, cardOf, clean, save };
