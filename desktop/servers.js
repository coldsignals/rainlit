// Which Rainlit server the app opens: rainlit.app, or one you picked (anyone can run their
// own; see SELF-HOSTING.md in the Rainlit repo). Plain Node, so it can be tried out without
// Electron.

const fs = require('node:fs');

const DEFAULT_SERVER = 'https://rainlit.app';

// The one you picked, from `file` (in the app's data folder), or '' for rainlit.app.
function savedServer(file) {
  try {
    const { url } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof url === 'string' && /^https:\/\/[^/]+$/.test(url) ? url : '';
  } catch {
    return '';
  }
}

function saveServer(file, url) {
  fs.writeFileSync(file, JSON.stringify({ url: url || '' }));
}

// An address as typed ("chat.example.com", "https://chat.example.com/"), as an origin.
function cleanAddress(typed) {
  const text = String(typed || '').trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  if (url.protocol !== 'https:') throw new Error('Rainlit servers use https:// (calls only work over a secure connection).');
  return url.origin;
}

// Is there a Rainlit server at this address? { url, name } if so, { error } (said simply) if not.
async function checkServer(typed, fetchImpl = fetch) {
  let url;
  try {
    url = cleanAddress(typed);
  } catch (err) {
    return { error: err.message.startsWith('Rainlit') ? err.message : "That doesn't look like a web address." };
  }
  let res;
  try {
    res = await fetchImpl(`${url}/api/server-info`, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
  } catch {
    return { error: "Couldn't reach that address. Check it, and that the server's running." };
  }
  let info = null;
  try { info = await res.json(); } catch {}
  if (!res.ok || !info || info.rainlit !== true) return { error: "There's no Rainlit server at that address." };
  // (It may have sent us on to its real address, like www.)
  return { url: new URL(res.url || url).origin, name: String(info.name || 'Rainlit').slice(0, 60) };
}

module.exports = { DEFAULT_SERVER, savedServer, saveServer, cleanAddress, checkServer };
