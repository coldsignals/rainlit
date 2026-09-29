'use strict';

// Bringing a Discord server over. A Discord server template (a discord.new/… link, made in
// Discord under Server Settings > Server Template) lists a server's channels, roles and
// permissions, and anyone can read one. This turns one into a plan for a new space, as close
// as Rainlit gets:
//   - text channels (announcement, forum and media ones become text channels), and voice
//     channels (stage ones too) if this server has voice set up;
//   - roles, with their colours, whether they're shown separately, and the permissions
//     Rainlit has (the rest of Discord's are left behind);
//   - private and read-only channels, from the channels' (or their categories') permission
//     overrides for @everyone and the roles;
//   - age-restricted channels, as 18+ ones.
// Messages and members aren't in templates, so they don't come along. Neither do
// categories: Rainlit doesn't have them yet, so their channels just keep their order.

const { spaceName, roleName, channelName, MAX_CHANNELS, MAX_ROLES } = require('./spaces');

const DISCORD_API = String(process.env.DISCORD_API_URL || 'https://discord.com/api/v10').replace(/\/+$/, '');
const CACHE_MS = 10 * 60_000; // (a preview, then making the space, asks once)
const cache = new Map(); // code -> { at, template }

class TemplateError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// The code from a template link (discord.new/abc, discord.com/template/abc), or a code on its own.
function templateCode(input) {
  let s = String(input || '').trim();
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    const host = u.hostname.toLowerCase();
    if (/(^|\.)discord(app)?\.(com|new)$/.test(host)) {
      const parts = u.pathname.split('/').filter(Boolean);
      s = host.endsWith('discord.new') ? parts[0] : parts[0] === 'template' ? parts[1] : '';
    }
  } catch {}
  return /^[A-Za-z0-9]{2,32}$/.test(s || '') ? s : null;
}

async function fetchTemplate(code) {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.template;
  let res;
  try {
    res = await fetch(`${DISCORD_API}/guilds/templates/${encodeURIComponent(code)}`, {
      headers: { 'User-Agent': 'Rainlit (https://github.com/coldsignals/rainlit)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TemplateError("Couldn't reach Discord. Try again in a moment.", 502);
  }
  if (res.status === 404) throw new TemplateError("Discord doesn't know that template. Check the link, or make a new one in Discord (Server Settings > Server Template).", 404);
  if (res.status === 429) throw new TemplateError('Discord is busy right now. Try again in a minute.', 429);
  let template = null;
  try { template = await res.json(); } catch {}
  if (!res.ok || !template || !template.serialized_source_guild) throw new TemplateError("Discord didn't send the template. Try again in a moment.", 502);
  cache.set(code, { at: Date.now(), template });
  for (const [key, value] of cache) if (Date.now() - value.at > CACHE_MS) cache.delete(key);
  return template;
}

// Discord's permission bits (it has more; these are the ones Rainlit has something for).
const BIT = {
  invite: 0n, kick: 1n, ban: 2n, administrator: 3n, manageChannels: 4n, manageSpace: 5n, react: 6n, viewLog: 7n,
  view: 10n, send: 11n, manageMessages: 13n, files: 15n, mentionEveryone: 17n, connect: 20n, speak: 21n,
  manageRoles: 28n, timeout: 40n,
};
const CARRIED = ['administrator', 'manageSpace', 'manageChannels', 'manageRoles', 'invite', 'send', 'files', 'react',
  'manageMessages', 'kick', 'ban', 'timeout', 'viewLog', 'mentionEveryone', 'connect', 'speak'];
const big = (value) => {
  try { return BigInt(String(value ?? '0')); } catch { return 0n; }
};
const has = (bits, bit) => ((bits >> bit) & 1n) === 1n;
const permsOf = (bits) => CARRIED.filter((name) => has(bits, BIT[name]));

const TEXT_TYPES = { 0: 'text', 5: 'announcement', 15: 'forum', 16: 'media' };
const VOICE_TYPES = { 2: 'voice', 13: 'stage' };

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The plan for a space: { name, everyone: [perm names], roles: [{ key, name, color, hoist,
// perms }] (the highest first), channels: [{ name, kind, private, readonly, see: [role keys],
// send: [role keys] }], notes: [what didn't come over as it was] }.
function planFrom(template, { voice = false } = {}) {
  const g = template.serialized_source_guild || {};
  const notes = [];
  const allRoles = Array.isArray(g.roles) ? g.roles : [];
  const everyone = allRoles.find((r) => Number(r.id) === 0);
  // (A template lists its roles from the bottom up, @everyone first.)
  let roles = allRoles.filter((r) => Number(r.id) !== 0 && !r.managed).reverse();
  if (roles.length > MAX_ROLES) {
    notes.push(`Only the top ${MAX_ROLES} of its ${roles.length} roles came over.`);
    roles = roles.slice(0, MAX_ROLES);
  }
  const roleKeys = new Set(roles.map((r) => Number(r.id)));

  const channels = Array.isArray(g.channels) ? g.channels : [];
  const byId = new Map(channels.map((c) => [Number(c.id), c]));
  const categories = channels.filter((c) => c.type === 4).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const categoryOrder = new Map(categories.map((c, i) => [Number(c.id), i + 1]));
  const place = (c) => [c.parent_id == null ? 0 : categoryOrder.get(Number(c.parent_id)) ?? 0, c.position ?? 0];
  const listed = channels.filter((c) => c.type in TEXT_TYPES || c.type in VOICE_TYPES)
    .sort((a, b) => place(a)[0] - place(b)[0] || place(a)[1] - place(b)[1]);

  const became = { announcement: 0, forum: 0, media: 0, stage: 0 };
  let voiceLeftOut = 0;
  const planned = [];
  for (const c of listed) {
    const kind = c.type in VOICE_TYPES ? 'voice' : 'text';
    if (kind === 'voice' && !voice) {
      voiceLeftOut++;
      continue;
    }
    const type = TEXT_TYPES[c.type] || VOICE_TYPES[c.type];
    if (type in became) became[type]++;
    // A channel synced with its category has no overrides of its own: the category's apply.
    const parent = c.parent_id != null ? byId.get(Number(c.parent_id)) : null;
    const own = Array.isArray(c.permission_overwrites) ? c.permission_overwrites : [];
    const overrides = (own.length ? own : (parent && parent.permission_overwrites) || []).filter((o) => Number(o.type) === 0);
    const forEveryone = overrides.find((o) => Number(o.id) === 0);
    const denied = (bit) => Boolean(forEveryone && has(big(forEveryone.deny), bit));
    const allowedFor = (bit) => overrides.filter((o) => roleKeys.has(Number(o.id)) && has(big(o.allow), bit)).map((o) => Number(o.id));
    // Hidden from @everyone: private, open to the roles let in. (For a voice channel, not
    // being let in to connect is the same thing.)
    const hideBit = kind === 'voice' && denied(BIT.connect) && !denied(BIT.view) ? BIT.connect : BIT.view;
    const isPrivate = denied(BIT.view) || (kind === 'voice' && denied(BIT.connect));
    // @everyone can't post (or, in a voice channel, talk): only the roles allowed to.
    const talkBit = kind === 'voice' ? BIT.speak : BIT.send;
    const readonly = denied(talkBit);
    planned.push({
      name: channelName(c.name) || `${kind === 'voice' ? 'voice' : 'channel'}-${planned.length + 1}`,
      kind,
      private: isPrivate,
      readonly,
      adult: Boolean(c.nsfw), // (Discord's "age-restricted")
      see: isPrivate ? allowedFor(hideBit) : [],
      send: readonly ? allowedFor(talkBit) : [],
    });
  }
  let kept = planned;
  if (kept.length > MAX_CHANNELS) {
    notes.push(`Only the first ${MAX_CHANNELS} of its ${kept.length} channels came over.`);
    kept = kept.slice(0, MAX_CHANNELS);
  }
  const turned = [['announcement', 'text'], ['forum', 'text'], ['media', 'text'], ['stage', 'voice']]
    .filter(([type]) => became[type]).map(([type, into]) => `${plural(became[type], `${type} channel`)} became ${became[type] === 1 ? `a ${into} channel` : `${into} channels`}`);
  if (turned.length) notes.push(`${turned.join(', ')}.`);
  if (voiceLeftOut) notes.push(`${plural(voiceLeftOut, 'voice channel')} ${voiceLeftOut === 1 ? 'was' : 'were'} left out: this server doesn't have voice set up.`);
  if (categories.length) notes.push("Rainlit doesn't have categories yet, so their channels are listed in their order.");
  const adult = kept.filter((c) => c.adult).length;
  if (adult) notes.push(`${plural(adult, 'age-restricted channel')} ${adult === 1 ? 'is' : 'are'} 18+ here too.`);

  return {
    name: spaceName(g.name || template.name) || 'My space',
    everyone: permsOf(big(everyone && everyone.permissions)),
    roles: roles.map((r) => ({
      key: Number(r.id),
      name: roleName(r.name) || 'Role',
      color: Number(r.color) > 0 ? `#${Number(r.color).toString(16).padStart(6, '0').slice(-6)}` : null,
      hoist: Boolean(r.hoist),
      perms: permsOf(big(r.permissions)),
    })),
    channels: kept,
    notes,
  };
}

// What someone sees before bringing it over.
function summary(plan) {
  return {
    name: plan.name,
    textChannels: plan.channels.filter((c) => c.kind === 'text').length,
    voiceChannels: plan.channels.filter((c) => c.kind === 'voice').length,
    privateChannels: plan.channels.filter((c) => c.private).length,
    adultChannels: plan.channels.filter((c) => c.adult).length,
    roles: plan.roles.map((r) => ({ name: r.name, color: r.color })),
    notes: plan.notes,
  };
}

module.exports = { TemplateError, templateCode, fetchTemplate, planFrom, summary };
