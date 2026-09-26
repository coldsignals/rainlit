// Rainlit for Windows: a window onto rainlit.app (or another Rainlit server you pick), plus
// what a browser can't do.
// - A push-to-talk key that works while you're in another app or a game.
// - Sharing your screen with its sound, without your friend hearing their own voice.
// - A tray icon, so calls and messages still reach you with the window closed.
// - Notifications and a taskbar flash when someone calls or messages.

const {
  app, BrowserWindow, Tray, Menu, Notification, desktopCapturer, ipcMain, nativeImage, screen, session, shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { autoUpdater } = require('electron-updater');
const servers = require('./servers');

// rainlit.app, or another Rainlit server you picked (see servers.js). `npm run dev` points the
// app at a local server instead.
const SERVER_FILE = path.join(app.getPath('userData'), 'server.json');
const ARG_SERVER = (process.argv.find((a) => a.startsWith('--server=')) || '').slice('--server='.length);
const SERVER = ARG_SERVER || servers.savedServer(SERVER_FILE) || servers.DEFAULT_SERVER;
const ORIGIN = new URL(SERVER).origin;
const START_HIDDEN = process.argv.includes('--hidden'); // started with Windows: wait in the tray
const ICON = path.join(__dirname, 'build', 'icon.png');

const firstCopy = app.requestSingleInstanceLock(); // a second copy just brings this one forward
if (!firstCopy) app.quit();
app.setAppUserModelId('app.rainlit.desktop'); // so Windows shows our name and icon on notifications
// Calls, ringing and push-to-talk keep going while the window is hidden in the tray.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let win = null;
let tray = null;
let quitting = false;
let updateReady = false;

// The site answers on both rainlit.app and www.rainlit.app (one forwards to the other).
const WWW_ORIGIN = ORIGIN.replace('://', '://www.');
const fromApp = (url) => {
  try {
    const { origin } = new URL(url);
    return origin === ORIGIN || origin === WWW_ORIGIN;
  } catch {
    return false;
  }
};

// ================= The window =================

const statePath = () => path.join(app.getPath('userData'), 'window.json');

function savedBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    // Only put it back where it was if that spot is still on a screen.
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80);
    return onScreen ? b : { width: b.width, height: b.height, maximized: b.maximized };
  } catch {
    return {};
  }
}

let saveTimer = null;
function saveBounds() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    try { fs.writeFileSync(statePath(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch {}
  }, 500);
}

function createWindow() {
  const b = savedBounds();
  win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width || 1200, height: b.height || 800,
    minWidth: 380, minHeight: 520,
    title: 'Rainlit',
    icon: ICON,
    backgroundColor: '#151b28',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      additionalArguments: [`--rainlit-desktop=${app.getVersion()}`],
    },
  });
  win.setMenuBarVisibility(false);
  if (b.maximized) win.maximize();
  win.once('ready-to-show', () => { if (!START_HIDDEN) win.show(); });

  // Closing the window hides it in the tray, so calls can still reach you.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    trayHint();
  });
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, saveBounds);
  win.on('focus', () => win.flashFrame(false));
  win.on('blur', restartKeyHook);

  // A page starting over isn't in a call (yet).
  win.webContents.on('did-start-loading', () => setTrayState('idle'));

  // The server answered with an error page (it's restarting for an update): same as offline.
  win.webContents.on('did-navigate', (_e, url, status) => {
    if (status >= 500 && fromApp(url)) {
      win.loadFile(path.join(__dirname, 'offline.html'));
      setTimeout(() => { if (!win.isDestroyed()) win.loadURL(SERVER); }, 5000);
    }
  });

  // No connection: a gentle "trying again" page, then back to Rainlit.
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !fromApp(url)) return; // -3: cancelled, not a failure
    win.loadFile(path.join(__dirname, 'offline.html'));
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(SERVER); }, 5000);
  });

  win.loadURL(SERVER);
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// The first time the window is closed, say where it went.
function trayHint() {
  const flag = path.join(app.getPath('userData'), 'tray-hint-shown');
  if (fs.existsSync(flag)) return;
  try { fs.writeFileSync(flag, ''); } catch {}
  new Notification({
    title: 'Rainlit is still running',
    body: "It's in the tray by the clock, so calls and messages still reach you. Right-click it to quit.",
    icon: ICON,
  }).show();
}

// Keyboard shortcuts for reloading, zooming and editing, with no menu bar showing.
Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: 'View', submenu: [
    { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
  ] },
  { label: 'Edit', submenu: [
    { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
  ] },
]));

// ================= Tray =================

// The Rainlit tile as usual; its drop dim while you're in a call, and glowing while you're on
// the air (the page says which), so you can tell with the window tucked away. (Each icon
// comes in several sizes, tray@2x.png and so on, for Windows' display scaling.)
let trayIcons = null;
let trayState = 'idle';

function setTrayState(state) {
  if (!tray || !trayIcons[state] || state === trayState) return;
  trayState = state;
  tray.setImage(trayIcons[state]);
}

function createTray() {
  trayIcons = {
    idle: nativeImage.createFromPath(path.join(__dirname, 'tray.png')),
    call: nativeImage.createFromPath(path.join(__dirname, 'tray-call.png')),
    talk: nativeImage.createFromPath(path.join(__dirname, 'tray-talk.png')),
  };
  tray = new Tray(trayIcons.idle);
  tray.setToolTip('Rainlit');
  tray.on('click', showWindow);
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const login = { args: ['--hidden'] };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Rainlit', click: showWindow },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings(login).openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, ...login }),
    },
    ...(updateReady ? [{ label: 'Restart to update', click: () => { quitting = true; autoUpdater.quitAndInstall(); } }] : []),
    { type: 'separator' },
    { label: `Server: ${new URL(SERVER).host}`, enabled: false },
    ...(SERVER !== servers.DEFAULT_SERVER && !ARG_SERVER ? [{ label: 'Go back to rainlit.app', click: () => switchServer('') }] : []),
    { type: 'separator' },
    { label: 'Quit Rainlit', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ================= Safety =================
// Only rainlit.app gets the mic, camera and screen. Links anywhere else open in your browser.

const ALLOWED = new Set([
  'media', 'display-capture', 'notifications', 'clipboard-read', 'clipboard-sanitized-write',
  'fullscreen', 'speaker-selection',
]);

function lockDown() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(ALLOWED.has(permission) && fromApp(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED.has(permission) && fromApp(origin));

  ses.setDisplayMediaRequestHandler((request, callback) => {
    if (!fromApp(request.securityOrigin)) return callback({});
    pickSource(request.audioRequested)
      .then((choice) => {
        if (!choice) return callback({});
        // Everything your computer is playing except Rainlit itself, so your friend doesn't
        // hear their own voice come back. (Plain 'loopback' plus the page's restrictOwnAudio
        // should do the same, but in Electron 44 the app's own sound still came through;
        // asking for this device directly keeps it out.)
        callback(choice.audio ? { video: choice.source, audio: 'loopbackWithoutChrome' } : { video: choice.source });
      })
      .catch(() => callback({}));
  });
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (fromApp(url)) return;
    e.preventDefault();
    openOutside(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    // A file from a chat opens in its own window, still signed in; anything else in your browser.
    if (fromApp(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, backgroundColor: '#151b28', autoHideMenuBar: true } };
    }
    openOutside(url);
    return { action: 'deny' };
  });
  // Right-click: copy and paste, and spelling suggestions (the page's own menus win).
  contents.on('context-menu', (_e, p) => {
    const items = [];
    for (const word of p.dictionarySuggestions.slice(0, 4)) items.push({ label: word, click: () => contents.replaceMisspelling(word) });
    if (items.length) items.push({ type: 'separator' });
    if (p.isEditable) items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
    else if (p.selectionText.trim()) items.push({ role: 'copy' });
    if (p.linkURL && /^https?:/i.test(p.linkURL)) items.push({ label: 'Copy link', click: () => require('electron').clipboard.writeText(p.linkURL) });
    if (p.mediaType === 'image' && p.srcURL) items.push({ label: 'Copy image', click: () => contents.copyImageAt(p.x, p.y) });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
});

function openOutside(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

// ================= Choosing what to share =================

let picking = false;

async function pickSource(audioRequested) {
  if (picking) return null;
  picking = true;
  try {
    const own = win.getMediaSourceId();
    const sources = (await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })).filter((s) => s.id !== own);

    const picker = new BrowserWindow({
      parent: win, modal: true,
      width: 780, height: 600, minWidth: 520, minHeight: 420,
      title: 'Share your screen',
      icon: ICON,
      backgroundColor: '#151b28',
      minimizable: false, maximizable: false,
      show: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, sandbox: true },
    });
    picker.setMenuBarVisibility(false);

    return await new Promise((resolve) => {
      let done = false;
      const finish = (choice) => {
        if (done) return;
        done = true;
        ipcMain.removeHandler('picker:sources');
        ipcMain.removeAllListeners('picker:choose');
        if (!picker.isDestroyed()) picker.destroy();
        resolve(choice);
      };
      ipcMain.handle('picker:sources', (e) => {
        if (e.sender !== picker.webContents) return null;
        return {
          audio: audioRequested,
          sources: sources.map((s) => ({
            id: s.id,
            name: s.name,
            screen: s.id.startsWith('screen:'),
            thumb: s.thumbnail.toDataURL(),
            icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
          })),
        };
      });
      ipcMain.on('picker:choose', (e, choice) => {
        if (e.sender !== picker.webContents) return;
        const source = choice && sources.find((s) => s.id === choice.id);
        finish(source ? { source, audio: Boolean(choice.audio && audioRequested) } : null);
      });
      picker.on('closed', () => finish(null));
      picker.once('ready-to-show', () => picker.show());
      picker.loadFile(path.join(__dirname, 'picker.html'));
    });
  } finally {
    picking = false;
  }
}

// ================= Push to talk, anywhere =================
// The page tells us the key (as KeyboardEvent.code). While the Rainlit window has focus
// the page hears the key itself; the rest of the time this hook does and passes it on.

let pttKeycode = null;
let pttHeld = false;
let hookRunning = false;

const MODIFIERS = {
  ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', AltLeft: 'Alt', AltRight: 'AltRight',
  ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', MetaLeft: 'Meta', MetaRight: 'MetaRight',
};

function hookKeycode(code) {
  const name = MODIFIERS[code] || code.replace(/^Key([A-Z])$/, '$1').replace(/^Digit(\d)$/, '$1');
  return Object.hasOwn(UiohookKey, name) ? UiohookKey[name] : null;
}

function setPushToTalk(on, code) {
  pttKeycode = on ? hookKeycode(code) : null;
  pttHeld = false;
  if (pttKeycode !== null && !hookRunning) {
    uIOhook.start();
    hookRunning = true;
  } else if (pttKeycode === null && hookRunning) {
    uIOhook.stop();
    hookRunning = false;
  }
  return pttKeycode !== null; // false: that key only works inside the window
}

// On Windows the hook can go quiet after the mic starts while the window has focus,
// so start it fresh each time you switch away (unless you're holding the key).
function restartKeyHook() {
  if (!hookRunning || pttHeld) return;
  uIOhook.stop();
  uIOhook.start();
}

uIOhook.on('keydown', (e) => {
  if (e.keycode !== pttKeycode || pttHeld || !win || win.isFocused()) return;
  pttHeld = true;
  win.webContents.send('ptt', true);
});
uIOhook.on('keyup', (e) => {
  if (e.keycode !== pttKeycode || !win) return;
  const wasHeld = pttHeld;
  pttHeld = false;
  // Also if it went down inside the window and came up after you switched away.
  if (wasHeld || !win.isFocused()) win.webContents.send('ptt', false);
});

// ================= Talking to the page =================

const fromPage = (e) => fromApp(e.senderFrame ? e.senderFrame.url : '');

ipcMain.handle('desktop:ptt', (e, { on, code } = {}) => (fromPage(e) ? setPushToTalk(Boolean(on), String(code || '')) : false));
ipcMain.handle('desktop:ptt-check', (e, code) => fromPage(e) && hookKeycode(String(code || '')) !== null);

ipcMain.on('desktop:notify', (e, { title, body, call } = {}) => {
  if (!fromPage(e) || !Notification.isSupported()) return;
  if (win.isVisible() && win.isFocused()) return;
  const n = new Notification({ title: String(title).slice(0, 100), body: String(body).slice(0, 200), icon: ICON, silent: true });
  n.on('click', showWindow);
  n.show();
  if (call) win.flashFrame(true);
});

ipcMain.on('desktop:download', (e, url) => {
  if (fromPage(e) && /^https?:\/\//i.test(url)) win.webContents.downloadURL(url);
});
ipcMain.on('desktop:open', (e, url) => {
  if (fromPage(e)) openOutside(url);
});

let badge = null;
// Another Rainlit server: check it's there, remember it, and start again on it.
function switchServer(url) {
  servers.saveServer(SERVER_FILE, url);
  quitting = true;
  app.relaunch({ args: process.argv.slice(1).filter((a) => !a.startsWith('--server=')) });
  app.exit(0);
}

ipcMain.handle('desktop:server-get', (e) => (fromPage(e) ? { url: SERVER, custom: SERVER !== servers.DEFAULT_SERVER } : null));
ipcMain.handle('desktop:server-check', (e, url) => (fromPage(e) ? servers.checkServer(url) : { error: 'Not allowed.' }));
ipcMain.handle('desktop:server-set', async (e, url) => {
  if (!fromPage(e)) return { error: 'Not allowed.' };
  const found = await servers.checkServer(url);
  if (found.error) return found;
  setTimeout(() => switchServer(found.url === servers.DEFAULT_SERVER ? '' : found.url), 100);
  return found;
});
ipcMain.handle('desktop:server-reset', (e) => {
  if (!fromPage(e)) return { error: 'Not allowed.' };
  setTimeout(() => switchServer(''), 100);
  return { url: servers.DEFAULT_SERVER };
});

ipcMain.on('desktop:tray', (e, state) => {
  if (fromPage(e)) setTrayState(String(state));
});

ipcMain.on('desktop:unread', (e, count) => {
  if (!fromPage(e)) return;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  badge ||= nativeImage.createFromPath(path.join(__dirname, 'badge.png'));
  win.setOverlayIcon(n ? badge : null, n ? `${n} unread` : '');
  if (tray) tray.setToolTip(n ? `Rainlit (${n} unread)` : 'Rainlit');
});

// ================= Updates =================

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch(() => {}); // offline, or nothing published yet: try later
}
autoUpdater.on('update-downloaded', () => {
  updateReady = true;
  refreshTray();
  new Notification({
    title: 'A Rainlit update is ready',
    body: 'It installs next time Rainlit starts. Or right-click the tray icon and choose Restart to update.',
    icon: ICON,
  }).show();
});

// ================= Start =================

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { if (hookRunning) uIOhook.stop(); });
app.on('window-all-closed', () => {}); // stay in the tray

app.whenReady().then(() => {
  if (!firstCopy) return;
  lockDown();
  createWindow();
  createTray();
  checkForUpdates();
  setInterval(checkForUpdates, 6 * 3600_000);
});
