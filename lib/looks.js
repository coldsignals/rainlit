'use strict';

// Looks a homepage (lib/homepages.js) and a profile card (lib/cards.js) can have, by name:
// public/homepage.js draws them, and has the same lists.

const FONTS = ['rainlit', 'times', 'comic', 'pixel', 'terminal', 'tiny', 'hand', 'script', 'typewriter', 'gothic', 'neon', 'bubble', 'spooky', 'marker'];
const PATTERNS = ['dots', 'stripes', 'checks', 'gingham', 'grid', 'hearts', 'stars', 'flowers', 'zigzag', 'clouds', 'plaid', 'camo', 'hexes', 'circuit'];
const SKIES = ['none', 'rain', 'snow', 'sparkles', 'hearts', 'leaves'];
// Glow's.
const PERK_PATTERNS = ['starfield', 'bokeh', 'holo', 'waves']; // (they move)
const PERK_SKIES = ['fireflies', 'aurora', 'storm', 'blossoms', 'embers'];
// Effects around someone's picture (public/homepage.js DECOS draws them): everyone's, and Glow's.
const DECOS = ['ring', 'orbit', 'halo', 'ears', 'headphones', 'moon', 'laurel', 'pixel'];
const PERK_DECOS = ['raincloud', 'moons', 'flames', 'aurora', 'holo', 'neon', 'globe', 'fireflies', 'horizon', 'petals', 'storm'];

module.exports = { FONTS, PATTERNS, SKIES, PERK_PATTERNS, PERK_SKIES, DECOS, PERK_DECOS };
