'use strict';

// Rainlit's themes (Settings > Theme; their colours are in public/style.css): everyone's, and
// four for people supporting Rainlit (lib/supporters.js), with weather of their own. Someone's
// pick is kept with their account, so it's the same on all their devices.

const supporters = require('./supporters');

const EVERYONE = ['rainlit', 'dark', 'midnight', 'light', 'auto'];
const SUPPORTERS = ['sakura', 'monsoon', 'aurora', 'fireflies'];

const known = (theme) => EVERYONE.includes(theme) || SUPPORTERS.includes(theme);
// Whether someone can have a theme: everyone's, or a supporter's while they're supporting.
const allowed = (u, theme) => EVERYONE.includes(theme) || (SUPPORTERS.includes(theme) && supporters.active(u));

// Someone's theme, for them (null: they've never picked one). A supporter's is Rainlit's own
// while they're not supporting, and theirs again if they come back.
function themeOf(u) {
  if (!u || !u.theme) return null;
  return allowed(u, u.theme) ? u.theme : 'rainlit';
}

module.exports = { EVERYONE, SUPPORTERS, known, allowed, themeOf };
