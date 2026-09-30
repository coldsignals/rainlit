'use strict';

// Rainlit's themes (Settings > Theme; their colours are in public/style.css): everyone's, and
// five that come with Glow (lib/supporters.js), with weather of their own. Someone's pick is kept
// with their account, so it's the same on all their devices. A Glow theme stays theirs if their
// Glow ends, until they switch to another; switching back to it then takes Glow again (like a
// homepage's Glow extras: lib/homepages.js).

const supporters = require('./supporters');

const EVERYONE = ['rainlit', 'dark', 'midnight', 'light', 'auto'];
const SUPPORTERS = ['sakura', 'monsoon', 'fireflies', 'maple', 'aurora'];

const known = (theme) => EVERYONE.includes(theme) || SUPPORTERS.includes(theme);
// Whether someone can have a theme: everyone's; a Glow one with Glow, or the one they have already.
const allowed = (u, theme) => EVERYONE.includes(theme) || (SUPPORTERS.includes(theme) && (supporters.active(u) || (u && u.theme === theme)));

// Someone's theme, for them (null: they've never picked one).
function themeOf(u) {
  return u && u.theme && known(u.theme) ? u.theme : null;
}

module.exports = { EVERYONE, SUPPORTERS, known, allowed, themeOf };
