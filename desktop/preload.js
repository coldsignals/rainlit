// What the Rainlit page can ask of the desktop app. The page checks for
// window.rainlitDesktop and uses these when it's there.

const { contextBridge, ipcRenderer } = require('electron');

const version = (process.argv.find((a) => a.startsWith('--rainlit-desktop=')) || '').split('=')[1] || '';

// Answers come back as { error } when something's wrong; the page gets that as a failure.
async function answer(pending) {
  const result = await pending;
  if (result && result.error) throw new Error(result.error);
  return result;
}

contextBridge.exposeInMainWorld('rainlitDesktop', {
  version,
  // Push to talk while you're in another app. Resolves false if that key can only
  // work inside the window.
  setPushToTalk: (on, code) => ipcRenderer.invoke('desktop:ptt', { on: Boolean(on), code: String(code || '') }),
  canUseKeyAnywhere: (code) => ipcRenderer.invoke('desktop:ptt-check', String(code || '')),
  onPushToTalk: (fn) => {
    ipcRenderer.removeAllListeners('ptt');
    ipcRenderer.on('ptt', (_e, held) => fn(Boolean(held)));
  },
  // Only shows if the window isn't the one you're looking at.
  notify: ({ title = '', body = '', call = false } = {}) =>
    ipcRenderer.send('desktop:notify', { title: String(title), body: String(body), call: Boolean(call) }),
  setUnread: (count) => ipcRenderer.send('desktop:unread', Number(count) || 0),
  // Which Rainlit server this is, and moving to another (the app starts again on it).
  getServer: () => ipcRenderer.invoke('desktop:server-get'),
  checkServer: ({ url } = {}) => answer(ipcRenderer.invoke('desktop:server-check', String(url || ''))),
  setServer: ({ url } = {}) => answer(ipcRenderer.invoke('desktop:server-set', String(url || ''))),
  resetServer: () => answer(ipcRenderer.invoke('desktop:server-reset')),
  // The tray icon: 'idle', 'call' (dim: in a call) or 'talk' (glowing: on the air).
  setTrayState: (state) => ipcRenderer.send('desktop:tray', String(state)),
  // Sharing: Rainlit's own chooser first. A window picked there is captured by the app itself
  // (smooth, with only its app's sound) and comes through a port (see below); a screen is then
  // shared the usual way (getDisplayMedia), without asking again.
  pickShare: (opts = {}) => ipcRenderer.invoke('desktop:share-pick', {
    audio: Boolean(opts.audio), maxWidth: Number(opts.maxWidth) || 0, maxHeight: Number(opts.maxHeight) || 0, fps: Number(opts.fps) || 0,
  }),
  // Save a file or GIF (asks where), or open a web address in your browser.
  download: (url) => ipcRenderer.send('desktop:download', String(url || '')),
  openExternal: (url) => ipcRenderer.send('desktop:open', String(url || '')),
});

// A window being shared: its port, handed on to the page ({ rainlitShare: id }, with the port).
ipcRenderer.on('desktop:share-port', (e, { share } = {}) => {
  window.postMessage({ rainlitShare: Number(share) || 0 }, '*', e.ports);
});
