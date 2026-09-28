'use strict';

// Where the Rainlit server lives. For the web version this is the page's own
// address. A packaged app (like the Android APK) can set window.RAINLIT_SERVER.
const SERVER = (window.RAINLIT_SERVER || location.origin).replace(/\/$/, '');
// Set when this page is running inside the Rainlit desktop app (see desktop/preload.js).
const DESKTOP = window.rainlitDesktop || null;
// Set inside the Rainlit Android app (see mobile/android/.../RainlitPlugin.java). The app
// adds Capacitor's bridge to the page, but not Capacitor's own library, so this talks to the
// bridge directly. Anything unexpected means "not in the app" rather than a broken page.
const ANDROID = (() => {
  try {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform() || !cap.nativePromise || !cap.addListener) return null;
    const method = (name) => (options = {}) => cap.nativePromise('Rainlit', name, options);
    return {
      callStarted: method('callStarted'),
      callStatus: method('callStatus'),
      getServer: method('getServer'),
      checkServer: method('checkServer'),
      setServer: method('setServer'),
      resetServer: method('resetServer'),
      appInfo: method('appInfo'),
      setDucking: method('setDucking'),
      duckStatus: method('duckStatus'),
      callEnded: method('callEnded'),
      notify: method('notify'),
      pushStatus: method('pushStatus'),
      pushEnable: method('pushEnable'),
      pushDisable: method('pushDisable'),
      clearRing: method('clearRing'),
      audioRoutes: method('audioRoutes'),
      setAudioRoute: method('setAudioRoute'),
      download: method('download'),
      saveData: method('saveData'),
      openExternal: method('openExternal'),
      addListener: (event, fn) => cap.addListener('Rainlit', event, fn),
    };
  } catch {
    return null;
  }
})();

// In the apps, a call or message shows as a notification while you're not looking at Rainlit.
// On Android in the background, the phone makes the sound (the page is kept quiet there), and
// with push set up the server's push note covers it instead.
function appNotify(n) {
  if (DESKTOP) DESKTOP.notify(n);
  else if (ANDROID && !(appAsleep() && S.pushSent)) ANDROID.notify({ ...n, sound: appAsleep() }).catch(() => {});
}

// The Android app in the background and not in a call: the phone's own notifications make
// the sounds then (with push, the server sends them). During a call the page keeps working
// with the screen off (the call's sound is playing anyway), so it makes its own.
function appAsleep() {
  return Boolean(ANDROID && S.androidPaused && !S.inCall);
}

// Whether you're looking at Rainlit right now. Browsers say so through document.hidden and
// window focus. The desktop app keeps its page "visible" even in the tray, so focus is what
// counts there. The Android app says when it goes to the background.
function lookingAway() {
  if (ANDROID) return Boolean(S.androidPaused) || document.hidden;
  return document.hidden || !document.hasFocus();
}

// With push set up, an Android phone in the background gets calls and messages as push
// notes: tell the server when that's the case.
function sendBackground() {
  if (ANDROID) wsSend({ type: 'background', on: Boolean(appAsleep() && S.pushSent) });
}
const SPEAKING_LEVEL = 0.02;

// ---------------- Elements ----------------

const $ = (id) => document.getElementById(id);
const el = {};
for (const id of [
  'auth', 'signin-tab', 'signup-tab', 'signin-form', 'signin-login', 'signin-password',
  'signup-form', 'setup-note', 'code-label', 'signup-code', 'signup-email', 'signup-username', 'signup-name', 'signup-password',
  'reset-form', 'reset-password', 'auth-error',
  'app', 'add-friend-form', 'add-friend-input', 'requests', 'request-list', 'friends-title', 'friend-list', 'friends-empty',
  'me-btn', 'me-face', 'me-name', 'me-status', 'admin-btn', 'app-settings-btn',
  'home', 'home-title', 'home-text', 'rejoin', 'rejoin-text', 'rejoin-btn', 'history', 'history-list', 'clear-history-btn',
  'dm', 'dm-back', 'dm-who', 'dm-face', 'dm-name', 'dm-sub', 'dm-save', 'dm-call-btn', 'dm-close', 'dm-notice', 'members-toggle', 'member-panel',
  'menu', 'menu-message', 'menu-call', 'menu-profile', 'menu-remove', 'menu-block',
  'brand', 'msg-menu', 'msg-reacts', 'emoji-dialog', 'msg-reply', 'msg-edit', 'msg-save', 'msg-open', 'msg-copy', 'msg-report', 'msg-delete', 'edit-bar', 'edit-hint', 'edit-cancel', 'reply-bar', 'reply-name', 'reply-snippet', 'reply-cancel', 'typing', 'starting',
  'call-elsewhere', 'call-elsewhere-text', 'call-elsewhere-btn',
  'ring', 'ring-face', 'ring-name', 'ring-sub', 'ring-decline', 'ring-join',
  'groups', 'group-list', 'groups-empty', 'new-group-btn', 'group-pick', 'group-pick-form', 'group-pick-title', 'group-pick-name-field', 'group-pick-name', 'group-pick-hint', 'group-pick-list', 'group-pick-error', 'group-pick-go',
  'group-info', 'group-info-title', 'group-rename-form', 'group-rename-input', 'group-notify', 'group-people-title', 'group-add-btn', 'group-people', 'group-leave-btn',
  'mini-profile', 'mp-face', 'mp-name', 'mp-username', 'mp-badges', 'mp-presence', 'mp-status', 'mp-message', 'mp-call', 'mp-add', 'mp-edit', 'mp-remove', 'mp-blocked', 'mp-safety', 'mp-report', 'mp-block',
  'profile', 'profile-form', 'profile-face', 'avatar-btn', 'avatar-remove-btn', 'avatar-input', 'profile-name',
  'status-count', 'profile-status', 'profile-presence', 'profile-badges', 'blocked-details', 'blocked-count', 'blocked-list', 'profile-account', 'profile-error', 'pw-current', 'pw-next', 'pw-btn', 'signout-btn',
  'admin', 'invite-btn', 'invite-list', 'user-list', 'trace-list', 'report-list', 'report-dialog', 'report-form', 'report-title', 'report-text', 'report-danger', 'report-note', 'report-block-field', 'report-block', 'report-block-text', 'report-error', 'report-send',
  'call', 'call-dot', 'room-label', 'call-timer', 'status-text', 'status-detail', 'settings-btn',
  'stage', 'remote-video', 'waiting', 'waiting-title', 'waiting-text', 'ring-again-btn',
  'peer-card', 'peer-avatar', 'peer-initial', 'peer-photo', 'peer-name', 'peer-muted', 'peer-away', 'peer-away-time', 'offline-banner',
  'video-label', 'video-muted', 'video-name', 'fullscreen-btn', 'self-view', 'local-video',
  'chat-log', 'chat-form', 'chat-input', 'gif-btn', 'gif-panel', 'gif-search', 'gif-grid', 'gif-cols', 'gif-status', 'attach-btn', 'attach-tray', 'file-input', 'file-tpl', 'drop-overlay', 'drop-text',
  'mic-btn', 'cam-btn', 'flip-btn', 'route-btn', 'screen-btn', 'leave-btn', 'toast', 'rain', 'rain-input',
  'settings', 'ui-scale', 'mic-select', 'cam-select', 'speaker-field', 'speaker-select', 'share-quality', 'volume-input', 'volume-value', 'volume-hint', 'duck-field', 'duck-input', 'duck-status', 'noise-input', 'echo-input', 'gain-input', 'ptt-input', 'ptt-details', 'ptt-key-btn', 'ptt-hint', 'sounds-input', 'clicks-input', 'stats-input', 'trace-input', 'stream-stats', 'stream-audio', 'stream-mute', 'stream-volume', 'stream-volume-value', 'app-note', 'push-note', 'get-apps', 'server-name', 'server-switch', 'server-switch-btn', 'server-note', 'server-host', 'server-change-btn', 'server-dialog', 'server-form', 'server-input', 'server-error', 'server-connect-btn', 'server-default-btn', 'rail', 'rail-home', 'rail-spaces', 'rail-add', 'space-head', 'space-title', 'home-side', 'space-side', 'add-channel-btn', 'channel-list', 'voice-section', 'add-voice-btn', 'voice-list', 'voice-panel', 'voice-panel-status', 'voice-panel-name', 'voice-panel-where', 'voice-hear', 'voice-view', 'voice-back', 'voice-title', 'voice-sub', 'voice-grid', 'voice-audio', 'space-menu', 'sm-invite', 'sm-members', 'sm-settings', 'sm-notify', 'sm-leave', 'mention-pick', 'space-new', 'space-create-form', 'space-create-name', 'space-join-form', 'space-join-code', 'space-import-form', 'space-import-link', 'space-import-preview', 'space-import-btn', 'space-new-error', 'space-invite', 'space-invite-name', 'space-invite-link', 'space-invite-copy', 'space-members', 'space-member-list', 'space-settings', 'space-tabs', 'space-general', 'space-roles', 'space-channels', 'space-moderation', 'mod-dialog', 'mod-form', 'mod-title', 'mod-text', 'mod-length-field', 'mod-length', 'mod-purge-field', 'mod-purge', 'mod-reason', 'mod-error', 'mod-confirm', 'space-rename-form', 'space-rename-input', 'space-channel-admin', 'space-danger', 'space-delete-btn', 'space-settings-error', 'space-join', 'space-join-icon', 'space-join-name', 'space-join-count', 'space-join-btn', 'space-join-error', 'call-sounds-input', 'conn-info', 'remote-audio',
  'summary', 'summary-title', 'summary-duration', 'summary-duration-label', 'summary-detail', 'summary-log',
  'lightbox', 'lightbox-img', 'lightbox-name', 'lightbox-save', 'lightbox-close',
]) {
  el[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = $(id);
}

// ---------------- State ----------------

const store = {
  get(k, fallback = '') { try { return localStorage.getItem('rainlit.' + k) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem('rainlit.' + k, v); } catch {} },
};

// Settings saved under the app's earlier names (your device, sounds, push-to-talk key and
// so on) move across once, so nothing resets.
try {
  for (const key of Object.keys(localStorage)) {
    const old = ['porchlight.', 'raynstorm.'].find((prefix) => key.startsWith(prefix));
    if (!old) continue;
    const moved = 'rainlit.' + key.slice(old.length);
    if (localStorage.getItem(moved) === null) localStorage.setItem(moved, localStorage.getItem(key));
    localStorage.removeItem(key);
  }
} catch {}

const S = {
  me: null, // your account, once signed in
  clientId: '', // your account id; the server knows you by it in calls
  name: '', // your display name
  friends: new Map(), // id -> { id, username, displayName, statusText, avatar, presence }
  incoming: [], // friend requests you've been sent
  outgoing: [], // friend requests you've sent
  blocked: new Set(), // people you've blocked (their ids)
  blockedUsers: [],
  dms: new Map(), // friend id -> your conversation with them (see dmFor)
  openDm: '', // the friend whose conversation is on screen
  uploads: new Map(), // message id -> a file being uploaded to a saved conversation
  maxFileMb: 100, // the biggest file a saved conversation takes (the server says)
  klipyKey: '', // for searching GIFs on KLIPY; no key means no GIF button
  setupNeeded: false, // no accounts yet: the first one is made with the setup code
  resetToken: '', // from a password reset link
  ringing: null, // the friend calling you right now
  ringTimer: null,
  ringbackTimer: null, // your own ringing, while you wait for them to pick up
  callJoined: false, // the server has confirmed you're in the call
  resumeStartedAt: null, // when the call you're rejoining started (to carry on its timer)
  peerMissing: false, // the server restarted and hasn't seen your friend come back yet
  holdTimer: null,
  idle: false, // told the server you've been idle (so friends see you as away)
  lastActive: Date.now(),
  soundCtx: null, // for chimes and ringing; browsers only allow it after you've clicked something

  callWith: '', // the friend you're calling or in a call with
  startingCall: false,
  callAnswer: null, // 'declined' or 'no-answer' if they didn't pick up
  iceServers: [],
  hasTurn: false,

  inCall: false,
  ws: null,
  wsRetry: 0,
  wsTimer: null,
  pingTimer: null,
  wsDownSince: null,
  lastServerMsg: 0,
  clockOffset: 0, // server clock minus this device's clock

  call: null, // { id, startedAt, log: [] } once both of you have been in the room together
  lastLogSeq: 0,
  lastPeerName: '',
  resumeCallId: null,
  connectedOnce: false,
  tickTimer: null,

  peer: null, // { id, name, state: { mic, cam, screen } }
  conn: null, // current peer connection + negotiation state
  signalChain: Promise.resolve(),
  failCount: 0,

  localStream: new MediaStream(),
  local: { mic: null, cam: null, screen: null, screenAudio: null },
  micOn: true, // false when you've muted yourself
  ptt: store.get('ptt', 'off') === 'on', // push to talk: silent unless the talk key or mic button is held
  pttKey: store.get('pttKey', 'Backquote'), // KeyboardEvent.code, so it's the same physical key on any layout
  pttKeyName: store.get('pttKeyName', '`'),
  pttHeld: false,

  remoteAudio: new Map(), // track id -> <audio>
  boosts: new Map(), // track id -> { source, gain } while your friend is turned up past 100%
  audioCtx: null,
  localMeter: null,
  remoteMeter: null,
  meterTimer: null,
  wakeLock: null,

  devices: { mic: store.get('mic'), cam: store.get('cam'), speaker: store.get('speaker') },
  // The browser's own mic clean-up. All on unless you turn them off in settings.
  micFx: {
    noiseSuppression: store.get('noiseSuppression', 'on') !== 'off',
    echoCancellation: store.get('echoCancellation', 'on') !== 'off',
    autoGainControl: store.get('autoGainControl', 'on') !== 'off',
  },
  volume: Number(store.get('volume', '100')) / 100,
  shareQuality: store.get('shareQuality', 'sharp'),
  quickReactions: ['👍', '❤️', '😄'], // your three most-used (from the server), shown first
  streamVolume: Number(store.get('streamVolume', '100')) / 100, // your friend's screen share's sound
  streamMuted: store.get('streamMuted', 'no') === 'yes',
  showStats: store.get('streamStats', 'off') === 'on',
  sounds: store.get('sounds', 'on') !== 'off',
  clickSounds: store.get('clickSounds', 'on') !== 'off',
  callSounds: store.get('callSounds', 'on') !== 'off',
  typing: new Map(), // conversation -> who's typing in it right now -> when to stop showing it
  spaces: new Map(), // your spaces, by id: { id, name, role, memberCount, channels, members }
  channels: new Map(), // every channel in them, by id: { id, name, spaceId, ... }
  people: new Map(), // everyone in your spaces (who may not be friends), by id, for names and pictures
  view: 'home', // what the sidebar shows: 'home' (friends) or a space's id
  typingSentAt: 0, // when you last told a friend you're typing
  typingTo: '',
  // Off to start with for anyone whose system asks for less motion.
  rain: store.get('rain', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'on') !== 'off',
  rainFrame: 0,
  lastChime: 0,

  transfers: new Map(), // file id -> transfer, both directions, for this call
  outbox: [], // files you're sending, in order. The first one is going now.
  inbox: null, // the file currently arriving
  fileUrls: [], // links to files in this call, released when you leave
  deletedIds: new Set(), // things you removed this call, re-announced if your friend reconnects
};

// ---------------- Helpers ----------------

// A click outside a dialog closes it: one that started outside it too. (Selecting text in it
// and letting go of the mouse outside doesn't.) `also` names other clicks that close it.
function closeOnBackdrop(d, also = () => false) {
  let startedOutside = false;
  d.addEventListener('pointerdown', (e) => { startedOutside = e.target === d; });
  d.addEventListener('click', (e) => {
    if ((e.target === d && startedOutside) || also(e)) d.close();
  });
}

function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Talks to the server's API. Resolves with the reply, or throws an Error whose message
// is fit to show (the server writes its errors for people, not programmers).
async function api(method, path, body, { timeout = 0 } = {}) {
  const opts = { method, headers: {} };
  if (timeout) opts.signal = AbortSignal.timeout(timeout); // (then it's "can't reach Rainlit")
  if (body instanceof Blob) {
    opts.body = body;
    opts.headers['Content-Type'] = body.type || 'application/octet-stream';
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(`${SERVER}/api${path}`, opts);
  } catch {
    throw new Error("Can't reach Rainlit. Check your internet connection and try again.");
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status });
  return data;
}

function initial(name) {
  return (Array.from(name.trim())[0] || '?').toUpperCase();
}

function setIcon(button, id) {
  button.querySelector('.ctl-icon use').setAttribute('href', '#' + id);
}

let toastTimer = null;
function toast(text, ms = 4000) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), ms);
}

function setStatus(text, detail = '') {
  el.statusText.textContent = text;
  el.statusDetail.textContent = detail;
}

function showAuthError(text) {
  el.authError.textContent = text;
  el.authError.hidden = !text;
}

function serverNow() {
  return Date.now() + S.clockOffset;
}

// 75000 -> "1:15", 4000000 -> "1:06:40"
function fmtClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// 75000 -> "1 min 15 sec", 4000000 -> "1 hr 6 min"
function fmtLong(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  if (h) return m ? `${h} hr ${m} min` : `${h} hr`;
  if (m) return sec ? `${m} min ${sec} sec` : `${m} min`;
  return `${sec} sec`;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtWhen(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const date = sameDay ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${date}, ${fmtTime(ts)}`;
}

function describeLogEntry(e) {
  const who = e.id === S.clientId ? 'You' : e.name || 'Your friend';
  switch (e.kind) {
    case 'start': return 'Call started';
    case 'join': return `${who} joined`;
    case 'away': return `${who} lost connection`;
    case 'back': return `${who} reconnected after ${fmtLong(e.awayMs)}`;
    case 'leave': return `${who} left`;
    case 'timeout': return `${who} didn't reconnect`;
    case 'end': return `Call ended after ${fmtLong(e.durationMs)}`;
    case 'note': return noteText(e);
    default: return '';
  }
}

// Something Rainlit fixed by itself during the call.
function noteText(e) {
  const whose = e.id === S.clientId ? 'your' : `${e.name || 'your friend'}'s`;
  const Whose = whose[0].toUpperCase() + whose.slice(1);
  switch (e.what) {
    case 'mic-ended': return `${Whose} mic stopped, so Rainlit restarted it`;
    case 'mic-silent': return `${Whose} phone went silent on the mic, so Rainlit restarted it`;
    case 'mic-failed': return `Rainlit couldn't restart ${whose} mic`;
    case 'sound-stalled': return `The call's sound stalled on ${whose} side, so Rainlit restarted it`;
    case 'app-restarted': return `Android closed Rainlit's page on ${whose} phone, so it started again and rejoined`;
    default: return '';
  }
}

function logItem(e) {
  const li = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = fmtTime(e.t);
  li.append(time, describeLogEntry(e));
  return li;
}

function otherNameFromLog(log) {
  for (const e of log) {
    if (e.name && e.id !== S.clientId) return e.name;
    if (e.names) {
      const other = e.names.find((n) => n !== S.name);
      if (other) return other;
    }
  }
  return S.lastPeerName || 'your friend';
}

async function copyText(text, doneMessage) {
  try {
    await navigator.clipboard.writeText(text);
    return toast(doneMessage);
  } catch {}
  // Older ways, for when the clipboard can't be written directly.
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(area);
  area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  area.remove();
  if (copied) toast(doneMessage);
  else window.prompt('Copy this:', text);
}

function mediaErrorText(err, what) {
  if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
    return `${what} access is blocked. Allow it from the icon at the left of the address bar, then try again.`;
  }
  if (err && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) {
    return `No ${what.toLowerCase()} found. Plug one in or pick another in Settings.`;
  }
  if (err && err.name === 'NotReadableError') {
    return `Your ${what.toLowerCase()} is being used by another app. Close that app, then try again.`;
  }
  return `Couldn't start your ${what.toLowerCase()}.`;
}

// ---------------- Media ----------------

async function getMicTrack(deviceId) {
  const audio = { ...S.micFx };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio });
    return s.getAudioTracks()[0];
  } catch (err) {
    if (deviceId && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) return getMicTrack('');
    throw err;
  }
}

async function getCamTrack(deviceId) {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { ...video, deviceId: { exact: deviceId } } : video });
    return s.getVideoTracks()[0];
  } catch (err) {
    if (deviceId && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')) return getCamTrack('');
    throw err;
  }
}

async function setMicTrack(track) {
  const old = S.local.mic;
  S.local.mic = track;
  applyMic();
  const conn = S.conn;
  if (conn && !conn.waitingForOffer) {
    if (conn.senders.audio) await conn.senders.audio.replaceTrack(track);
    else conn.senders.audio = conn.pc.addTrack(track, S.localStream);
  }
  if (old && old !== track) old.stop();
  if (S.localMeter) S.localMeter.disconnect();
  S.localMeter = makeMeter(track);
}

async function setOutgoingVideo(track) {
  const conn = S.conn;
  if (!conn || conn.waitingForOffer) return; // picked up when we answer
  if (conn.senders.video) await conn.senders.video.replaceTrack(track);
  else if (track) conn.senders.video = conn.pc.addTrack(track, S.localStream);
  tuneVideoSender();
}

// Screen sharing. A browser treats every video like a webcam: it lowers the quality to save
// bandwidth and blurs detail to keep the motion smooth, which makes text in a shared screen
// hard to read. These give it far more room, and say what matters more: sharpness or motion.
// Both keep the size steady when the connection struggles (dropping frames instead), since a
// picture that keeps flipping between sharp and blocky is worse to watch than a few lost frames.
const SHARE_QUALITY = {
  sharp: { width: 1920, height: 1080, fps: 30, bitrate: 6_000_000, hint: 'detail', prefer: 'maintain-resolution' },
  smooth: { width: 1920, height: 1080, fps: 60, bitrate: 6_000_000, hint: 'motion', prefer: 'maintain-resolution' },
  saver: { width: 1280, height: 720, fps: 30, bitrate: 1_500_000, hint: 'detail', prefer: 'balanced' },
};

const shareQuality = () => SHARE_QUALITY[S.shareQuality] || SHARE_QUALITY.sharp;

function shareConstraints(q = shareQuality()) {
  return { width: { ideal: q.width, max: 2560 }, height: { ideal: q.height, max: 1440 }, frameRate: { ideal: q.fps, max: q.fps } };
}

// How much the video being sent may use, and what to give up first when the connection is
// slow. A camera goes back to the browser's own choices.
async function tuneVideoSender() {
  const sender = S.conn && S.conn.senders.video;
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || !params.encodings.length) return; // not connected yet; done when it is
  const q = S.local.screen && sender.track && sender.track === S.local.screen ? shareQuality() : null;
  for (const enc of params.encodings) {
    if (q) {
      enc.maxBitrate = q.bitrate;
      enc.maxFramerate = q.fps;
    } else {
      delete enc.maxBitrate;
      delete enc.maxFramerate;
    }
  }
  params.degradationPreference = q ? q.prefer : 'balanced';
  try {
    await sender.setParameters(params);
  } catch (err) {
    console.warn("[video] Couldn't set the quality:", err.message);
  }
}

async function onShareQualityChange() {
  S.shareQuality = el.shareQuality.value;
  store.set('shareQuality', S.shareQuality);
  const vt = S.local.screen;
  if (!vt) return;
  vt.contentHint = shareQuality().hint;
  try { await vt.applyConstraints(shareConstraints()); } catch {}
  tuneVideoSender();
}

async function toggleMic() {
  if (!S.local.mic) {
    try {
      S.micOn = true;
      await setMicTrack(await getMicTrack(S.devices.mic));
      playControlSound('unmute');
    } catch (err) {
      S.micOn = false;
      toast(mediaErrorText(err, 'Microphone'), 6000);
    }
  } else {
    S.micOn = !S.micOn;
    applyMic();
    playControlSound(S.micOn ? 'unmute' : 'mute');
  }
  renderControls();
  sendState();
}

// Whether your friend can hear you right now.
function micLive() {
  return Boolean(S.local.mic && S.micOn && (!S.ptt || S.pttHeld) && !S.onPhone);
}

function applyMic() {
  // A disabled track sends silence, so switching is instant and needs no renegotiation.
  if (S.local.mic) S.local.mic.enabled = micLive();
}

function setPttHeld(held) {
  if (!S.ptt || S.pttHeld === held) return;
  if (S.voice && !S.inCall) {
    S.pttHeld = held;
    applyVoicePtt();
    renderTrayIcon(held);
    return;
  }
  if (held && !S.local.mic) {
    // Mic isn't running yet (or was blocked). Start it; the next press talks.
    toggleMic();
    return;
  }
  S.pttHeld = held;
  applyMic();
  renderControls();
}

// In the desktop app the talk key also works while you're in another app or a game.
function syncDesktopPtt() {
  if (DESKTOP) DESKTOP.setPushToTalk(S.ptt && (S.inCall || Boolean(S.voice)), S.pttKey).catch(() => {});
}

// In a voice channel with push to talk, your mic sends silence until you hold the key. (It
// isn't muted, so nobody sees you as muted.)
function applyVoicePtt() {
  const v = S.voice;
  const LK = window.LivekitClient;
  const mic = v && v.room && LK && v.room.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
  if (mic && mic.track) mic.track.mediaStreamTrack.enabled = !S.ptt || S.pttHeld;
}

async function renderPttHint() {
  const start = 'Your mic stays silent until you hold the key or hold the mic button.';
  if (!DESKTOP) {
    el.pttHint.textContent = `${start} The key only works while Rainlit is the window you're using.`;
    return;
  }
  const anywhere = await DESKTOP.canUseKeyAnywhere(S.pttKey).catch(() => false);
  el.pttHint.textContent = anywhere
    ? `${start} It works even while you're in another app or a game.`
    : `${start} This key only works inside Rainlit. Letters, numbers, F keys, Ctrl, Alt and Shift work everywhere.`;
}

function setPtt(on) {
  S.ptt = on;
  S.pttHeld = false;
  syncDesktopPtt();
  applyVoicePtt();
  store.set('ptt', on ? 'on' : 'off');
  // In push to talk the key does the muting, so you don't also show as muted to your friend.
  if (on) S.micOn = true;
  applyMic();
  renderControls();
  sendState();
}

// "KeyV" -> "V", "ControlRight" -> "Right Ctrl", " " -> "Space"
function keyName(e) {
  if (e.key === ' ') return 'Space';
  if (e.key.length === 1) return e.key.toUpperCase();
  const side = /Left$/.test(e.code) ? 'Left ' : /Right$/.test(e.code) ? 'Right ' : '';
  return side + ({ Control: 'Ctrl', Meta: 'Win' }[e.key] || e.key);
}

// Typing in the chat box shouldn't key your mic, even if the talk key is a letter.
function isTyping(target) {
  if (!target || !target.tagName) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(target.type);
}

async function toggleCam() {
  if (S.local.cam) {
    const t = S.local.cam;
    S.local.cam = null;
    playControlSound('camera-off');
    if (!S.local.screen) await setOutgoingVideo(null);
    t.stop();
  } else {
    el.camBtn.disabled = true;
    try {
      // (On a phone, the camera it faced last time in this call: front or back.)
      const t = S.facing && isPhone() ? await getFacingTrack(S.facing).catch(() => getCamTrack(S.devices.cam)) : await getCamTrack(S.devices.cam);
      if (!S.inCall) { t.stop(); return; }
      useCamTrack(t);
      playControlSound('camera-on');
      if (!S.local.screen) await setOutgoingVideo(t);
      countCameras();
    } catch (err) {
      toast(mediaErrorText(err, 'Camera'), 6000);
    } finally {
      el.camBtn.disabled = false;
    }
  }
  renderSelf();
  renderControls();
  sendState();
}

function useCamTrack(t) {
  S.local.cam = t;
  S.facing = t.getSettings().facingMode || S.facing || 'user';
  t.onended = () => { if (S.local.cam === t) toggleCam(); };
}

const isPhone = () => Boolean(ANDROID) || matchMedia('(pointer: coarse)').matches;

async function getFacingTrack(facing) {
  const s = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: { exact: facing } },
  });
  return s.getVideoTracks()[0];
}

// Phones with a front and a back camera can flip between them.
async function countCameras() {
  try {
    S.cameraCount = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length;
  } catch {}
  renderControls();
}

async function flipCam() {
  if (!S.local.cam || S.flipping) return;
  S.flipping = true;
  el.flipBtn.disabled = true;
  const from = S.facing === 'environment' ? 'environment' : 'user';
  const to = from === 'user' ? 'environment' : 'user';
  // A phone opens one camera at a time, so this one closes first.
  const old = S.local.cam;
  old.onended = null;
  old.stop();
  try {
    let t;
    try {
      t = await getFacingTrack(to);
    } catch (err) {
      toast("Couldn't switch cameras.");
      t = await getFacingTrack(from).catch(() => getCamTrack(S.devices.cam)); // back to the one it was
    }
    if (!S.inCall || S.local.cam !== old) { t.stop(); return; }
    useCamTrack(t);
    if (!S.local.screen) await setOutgoingVideo(t);
  } catch (err) {
    // Neither camera would open again: the camera's off.
    S.local.cam = null;
    if (!S.local.screen) await setOutgoingVideo(null);
    toast(mediaErrorText(err, 'Camera'), 6000);
  } finally {
    S.flipping = false;
    el.flipBtn.disabled = false;
    renderSelf();
    renderControls();
    sendState();
  }
}

async function toggleScreen() {
  if (S.local.screen) return stopScreen();
  // Game and video sound should come through as it is, not cleaned up like a voice.
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  // Sharing your whole screen with its sound would also capture your friend's voice coming out
  // of Rainlit, and they'd hear themselves. This leaves Rainlit's own sound out.
  if (navigator.mediaDevices.getSupportedConstraints().restrictOwnAudio) audio.restrictOwnAudio = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: shareConstraints(),
      audio,
      systemAudio: 'include',
      windowAudio: 'window', // sharing one app's window can include that app's sound (Chrome 141+)
      selfBrowserSurface: 'exclude',
    });
  } catch (err) {
    if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast("Couldn't start screen sharing.");
    return;
  }
  if (!S.inCall) { stream.getTracks().forEach((t) => t.stop()); return; }
  const vt = stream.getVideoTracks()[0];
  const at = stream.getAudioTracks()[0] || null;
  vt.contentHint = shareQuality().hint; // sharp text, or smooth motion
  S.local.screen = vt;
  S.local.screenAudio = at;
  vt.onended = () => { if (S.local.screen === vt) stopScreen(); };
  await setOutgoingVideo(vt);
  if (at && S.conn && !S.conn.waitingForOffer) {
    if (S.conn.senders.screenAudio) await S.conn.senders.screenAudio.replaceTrack(at);
    else S.conn.senders.screenAudio = S.conn.pc.addTrack(at, S.localStream);
  }
  renderSelf();
  renderControls();
  sendState();
  playShareSound(true);
  if (!at) {
    // Firefox never includes sound in a screen share (it's a long-standing Firefox gap), so no checkbox will help there.
    toast(/Firefox\//.test(navigator.userAgent)
      ? "Firefox can't include sound when sharing your screen. To share sound too, use Chrome or Edge."
      : 'Sharing without sound. To include it, tick "Share audio" in the sharing window next time.', 8000);
  }
}

async function stopScreen() {
  const vt = S.local.screen;
  const at = S.local.screenAudio;
  S.local.screen = null;
  S.local.screenAudio = null;
  await setOutgoingVideo(S.local.cam || null);
  if (S.conn && S.conn.senders.screenAudio) await S.conn.senders.screenAudio.replaceTrack(null);
  if (vt) vt.stop();
  if (at) at.stop();
  renderSelf();
  renderControls();
  sendState();
  if (vt && S.inCall) playShareSound(false);
}

function stopAllLocal() {
  for (const t of Object.values(S.local)) if (t) t.stop();
  S.local = { mic: null, cam: null, screen: null, screenAudio: null };
}

// ---------------- Speaking detection ----------------

function makeMeter(track, ctx = S.audioCtx) {
  if (!ctx) return null;
  const src = ctx.createMediaStreamSource(new MediaStream([track]));
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  return {
    level: 0,
    read() {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      // Rise instantly, fall slowly, so the glow doesn't flicker between words.
      this.level = Math.max(Math.sqrt(sum / buf.length), this.level * 0.8);
      return this.level;
    },
    // Pure digital silence: what Android hands over from a mic it has shut off. A working mic
    // always picks up a little something.
    silent() {
      an.getFloatTimeDomainData(buf);
      return buf.every((v) => v === 0);
    },
    disconnect() { try { src.disconnect(); } catch {} },
    track,
  };
}

function tickMeters() {
  const meSpeaking = micLive() && S.localMeter && S.localMeter.read() > SPEAKING_LEVEL;
  el.micBtn.classList.toggle('speaking', Boolean(meSpeaking));
  renderTrayIcon(Boolean(meSpeaking) || (S.ptt && micLive()));
  const peerSpeaking = S.peer && S.peer.state.mic && S.remoteMeter && S.remoteMeter.read() > SPEAKING_LEVEL;
  el.peerAvatar.classList.toggle('speaking', Boolean(peerSpeaking));
  el.videoLabel.classList.toggle('speaking', Boolean(peerSpeaking));
}

// The Windows app's tray icon: the drop as usual, dim while you're in a call, and glowing
// while you're on the air (talking, or holding push to talk). It lights at once and stays
// lit through short pauses, so it doesn't flicker.
function renderTrayIcon(talking) {
  if (!DESKTOP) return;
  if (talking) S.trayLitUntil = Date.now() + 600;
  const lit = talking || Date.now() < (S.trayLitUntil || 0);
  const state = !(S.inCall || S.voice) ? 'idle' : lit ? 'talk' : 'call';
  if (state === S.trayState) return;
  S.trayState = state;
  if (DESKTOP.setTrayState) DESKTOP.setTrayState(state);
  else if (DESKTOP.setTalking) DESKTOP.setTalking(state === 'talk'); // (the 1.0.2 app)
}

// ---------------- Signaling (WebSocket) ----------------

function wsSend(msg) {
  if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(msg));
}

function myState() {
  return { mic: Boolean(S.micOn && S.local.mic && !S.onPhone), cam: Boolean(S.local.cam), screen: Boolean(S.local.screen), phone: Boolean(S.onPhone) };
}

function sendState() {
  wsSend({ type: 'state', state: myState() });
}

function wsOpen() {
  return Boolean(S.ws && S.ws.readyState === WebSocket.OPEN);
}

// While you're signed in, each tab keeps one connection to the server open. It
// carries who's online, friend requests and calls ringing, and the call itself.
function connectSocket() {
  clearTimeout(S.wsTimer);
  if (!S.me) return;
  const ws = new WebSocket(SERVER.replace(/^http/, 'ws') + '/ws');
  S.ws = ws;
  if (S.inCall && !S.peer && !S.call) setStatus('Connecting to server');

  ws.onopen = () => {
    ws.opened = true;
    ws.openedAt = Date.now();
    S.wsRetry = 0;
    S.lastServerMsg = Date.now();
    const wasDown = Boolean(S.wsDownSince);
    trace('ws-open', { downS: wasDown ? Math.round((Date.now() - S.wsDownSince) / 1000) : undefined });
    S.wsDownSince = null;
    if (S.idle) wsSend({ type: 'activity', idle: true });
    if (S.androidPaused) sendBackground();
    if (S.inCall) sendCallJoin();
    if (wasDown) {
      refreshFriends(); // things may have changed while you were offline
      refreshSpaces().then(catchUp);
    }
    clearInterval(S.pingTimer);
    // Regular pings let us notice a dead connection quickly.
    S.pingTimer = setInterval(() => {
      wsSend({ type: 'ping' });
      checkSocketHealth();
    }, 10_000);
    sendTrace(); // (the call debug log's notes, maybe from before the app started again)
  };

  ws.onmessage = (ev) => {
    S.lastServerMsg = Date.now();
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (typeof msg.now === 'number') S.clockOffset = msg.now - Date.now();
    handleServerMessage(msg);
  };

  ws.onclose = (e) => {
    trace('ws-close', { code: e.code, reason: e.reason, openS: ws.openedAt ? Math.round((Date.now() - ws.openedAt) / 1000) : undefined });
    socketLost(ws);
  };
}

function sendCallJoin() {
  wsSend({
    type: 'call-join', with: S.callWith, state: myState(), trace: S.trace || undefined,
    // Lets the server tell us if the call ended while we were disconnected, or, if the
    // server restarted and forgot the call, carry it on with the same start time.
    callId: S.call ? S.call.id : S.resumeCallId,
    callStartedAt: S.call ? S.call.startedAt : S.resumeStartedAt,
  });
}

function socketLost(ws) {
  if (S.ws !== ws) return;
  ws.onclose = ws.onmessage = ws.onopen = null;
  try { ws.close(); } catch {}
  S.ws = null;
  clearInterval(S.pingTimer);
  if (!S.me) return;
  if (!S.wsDownSince) S.wsDownSince = Date.now();
  if (S.inCall && (!S.conn || S.conn.pc.connectionState !== 'connected')) setStatus('Reconnecting');
  // Refused outright rather than dropped: maybe you've been signed out.
  if (!ws.opened) checkSignedIn();
  const delay = Math.min(5000, 500 * 2 ** S.wsRetry++);
  S.wsTimer = setTimeout(connectSocket, delay);
}

// If the server has gone quiet (pings unanswered), assume the connection is dead.
function checkSocketHealth() {
  if (wsOpen() && Date.now() - S.lastServerMsg > 25_000) {
    trace('ws-quiet', { quietS: Math.round((Date.now() - S.lastServerMsg) / 1000) });
    socketLost(S.ws);
  }
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'hello':
      return onHello(msg);
    case 'presence':
      return onPresence(msg.id, msg.presence);
    case 'profile':
      return onProfile(msg.user);
    case 'friends-changed':
      return refreshFriends();
    case 'space-changed':
      return onSpaceChanged(msg.space);
    case 'space-removed':
      return onSpaceRemoved(msg.space, msg.why);
    case 'me':
      return setMe(msg.user);
    case 'ring':
      return startRinging(msg.from);
    case 'ring-stop':
      return stopRinging(msg.from);
    case 'declined':
    case 'no-answer':
      return callNotAnswered(msg.id, msg.type);
    case 'signed-out':
      return signedOut('You were signed out because your password was changed.');
    case 'dm-message':
      return onDmMessage(msg.message);
    case 'dm-removed':
      return onDmRemoved(msg);
    case 'dm-gone':
      return onDmGone(msg);
    case 'report-new':
      return onReportNew(msg);
    case 'voice-state':
      return onVoiceState(msg);
    case 'group-ring':
      return onGroupRing(msg);
    case 'group-ring-stop':
      return stopGroupRinging(msg.channel);
    case 'voice-ended':
      if (S.voice && S.voice.channelId === msg.channel) {
        toast("You can't be in that voice channel any more.");
        leaveVoice({ quiet: true });
      }
      return;
    case 'dm-edited':
      return onDmEdited(msg);
    case 'dm-reactions':
      return onDmReactions(msg);
    case 'typing':
      return onTyping(msg);
    case 'dm-saving':
      return onDmSaving(msg);
    case 'dm-read':
      return onDmRead(msg);
  }
  if (!S.inCall) return; // everything below is about the call you're in
  if (TRACED_MSGS.has(msg.type)) {
    trace(`got-${msg.type}`, {
      reason: msg.reason, code: msg.code, call: msg.call && msg.call.id ? String(msg.call.id).slice(0, 8) : undefined,
      peer: msg.peer ? (msg.peer.away ? 'away' : 'here') : msg.type === 'joined' ? 'none' : undefined,
    });
  }

  switch (msg.type) {
    case 'joined': {
      S.callJoined = true; // the server has us in the call (and is ringing them, if they're not here)
      if (S.restartNote) {
        toast(S.restartNote, 8000);
        S.restartNote = null;
        noteCall('app-restarted');
      }
      S.wsDownSince = null;
      const alive = Boolean(S.conn && S.conn.pc.connectionState === 'connected');
      // The server restarted (an update) and doesn't know our call yet, but we're still talking
      // directly. Carry on as we are: the call picks up again, same timer, when our friend's app is back too.
      const serverForgot = !msg.call && Boolean(S.call) && alive;
      // If it doesn't know our call and our friend isn't back yet either, keep our claim to it
      // (for the next time we connect, too), so we both end up back in the same call, not a new one.
      const claim = msg.call ? null
        : S.call ? { id: S.call.id, startedAt: S.call.startedAt }
        : S.resumeCallId ? { id: S.resumeCallId, startedAt: S.resumeStartedAt } : null;
      S.resumeCallId = claim && claim.id;
      S.resumeStartedAt = claim && claim.startedAt;
      if (!serverForgot) applyCall(msg.call);
      if (msg.peer) {
        const same = S.peer && S.peer.id === msg.peer.id;
        S.peer = msg.peer;
        S.peerMissing = false;
        clearTimeout(S.holdTimer);
        if (!same) S.connectedOnce = false;
        if (S.peer.away) {
          if (!alive) closePeer();
        } else if (!same || !alive) {
          S.failCount = 0;
          createPeer();
          playCallSound(true); // you've joined them
        }
        if (!S.peer.away) resendDeletes(); // anything you removed while you were offline
      } else if (S.peer && serverForgot) {
        // Give their app time to reconnect to the restarted server before deciding they've gone.
        S.peerMissing = true;
        clearTimeout(S.holdTimer);
        S.holdTimer = setTimeout(() => {
          if (!S.inCall || !S.peer || !S.peerMissing) return;
          S.lastPeerName = S.peer.name;
          stopTransfers(S.peer.name);
          peerGone();
          playCallSound(false);
        }, 30_000);
      } else if (S.peer) {
        S.lastPeerName = S.peer.name;
        stopTransfers(S.peer.name);
        peerGone();
      }
      if (!S.peer) setStatus(S.call ? 'In call' : 'Ready');
      else if (S.peer.away) setStatus(`${S.peer.name} is away`);
      renderPeer();
      renderTick();
      break;
    }
    case 'call-started':
      applyCall(msg.call);
      break;
    case 'log':
      if (S.call) addLogEntry(msg.entry);
      break;
    case 'peer-joined': {
      const returning = S.peer && S.peer.id === msg.peer.id;
      const alive = Boolean(S.conn && S.conn.pc.connectionState === 'connected');
      S.peer = msg.peer;
      S.peerMissing = false;
      clearTimeout(S.holdTimer);
      if (!returning) S.connectedOnce = false;
      S.failCount = 0;
      // Back after a server restart, and you never stopped talking: keep the connection you have.
      if (!(returning && alive)) {
        createPeer();
        playCallSound(true);
      }
      renderPeer();
      resendDeletes();
      break;
    }
    case 'peer-away':
      if (S.peer && S.peer.id === msg.id) {
        S.peer.away = true;
        S.peer.awaySince = msg.awaySince;
        playCallSound(false);
        // If audio is somehow still flowing directly between you, keep it going.
        if (!S.conn || S.conn.pc.connectionState !== 'connected') {
          closePeer();
          setStatus(`${S.peer.name} is away`);
        }
        renderPeer();
        renderTick();
      }
      break;
    case 'peer-back':
      if (S.peer && S.peer.id === msg.peer.id) {
        S.peer = msg.peer;
        S.failCount = 0;
        playCallSound(true);
        if (!S.conn || S.conn.pc.connectionState !== 'connected') createPeer();
        renderPeer();
        resendDeletes();
      }
      break;
    case 'peer-moved':
      // They moved the call to another device (their phone, say): connect to that one afresh,
      // rather than hoping the connection to the old one can be carried over.
      if (S.peer && S.peer.id === msg.peer.id) {
        closePeer();
        S.peer = msg.peer;
        S.failCount = 0;
        createPeer();
        renderPeer();
      }
      break;
    case 'peer-left':
      if (S.peer && S.peer.id === msg.id) {
        // 'replaced' means they moved to another device, so files carry on once it connects.
        S.peerTimedOut = msg.reason === 'timeout';
        if (msg.reason !== 'replaced') {
          S.lastPeerName = S.peer.name;
          stopTransfers(S.peer.name);
          playCallSound(false);
        }
        peerGone();
      }
      break;
    case 'signal':
      if (S.peer && msg.from === S.peer.id && msg.data) {
        S.signalChain = S.signalChain.then(() => handleSignal(msg.data)).catch((err) => console.warn('[signal]', err));
      }
      break;
    case 'state':
      if (S.peer && msg.from === S.peer.id) {
        const wasSharing = Boolean(S.peer.state && S.peer.state.screen);
        const wasOnPhone = Boolean(S.peer.state && S.peer.state.phone);
        S.peer.state = msg.state;
        renderPeer();
        const onPhone = Boolean(msg.state && msg.state.phone);
        const who = S.peer.name || 'Your friend';
        if (onPhone && !wasOnPhone) toast(`${who} is on a phone call. You're on hold until they're back.`, 20_000);
        if (!onPhone && wasOnPhone) toast(`${who} is back from their phone call.`);
        const sharing = Boolean(msg.state && msg.state.screen);
        if (sharing !== wasSharing) playShareSound(sharing); // your friend started or stopped sharing
      }
      break;
    case 'delete':
      if (S.peer && msg.from === S.peer.id && typeof msg.id === 'string') deleteTheirs(msg.id, msg.name);
      break;
    case 'call-ended': {
      // The call finished while we were disconnected.
      const call = msg.call;
      teardown({ sendLeave: false });
      const summary = {
        id: call.id, with: S.callWith, startedAt: call.startedAt, endedAt: call.endedAt,
        ended: true, whileAway: true, withName: otherNameFromLog(call.log), log: call.log,
      };
      teardown({ sendLeave: false });
      recordHistory(summary);
      showSummary(summary);
      break;
    }
    case 'replaced':
      teardown({ sendLeave: false, keepActive: true });
      toast('You opened this call in another tab or on another device, so it moved there.', 6000);
      break;
    case 'error':
      teardown({ sendLeave: false });
      toast(msg.code === 'not-friends' ? 'You can only call people on your friends list.' : "Couldn't start the call. Try again.");
      break;
  }
}

function applyCall(call) {
  if (!call) {
    S.call = null;
    S.lastLogSeq = 0;
    renderTick();
    return;
  }
  if (!S.call || S.call.id !== call.id) {
    S.call = { id: call.id, startedAt: call.startedAt, log: [] };
    S.lastLogSeq = 0;
    store.set('activeCall', JSON.stringify({ with: S.callWith, callId: call.id, startedAt: call.startedAt, at: Date.now() }));
  }
  for (const e of call.log) addLogEntry(e);
  renderTick();
}

// Joins, drops and reconnects, kept for the summary at the end of the call.
function addLogEntry(e) {
  if (!S.call || e.seq <= S.lastLogSeq) return;
  S.lastLogSeq = e.seq;
  S.call.log.push(e);
}

// ---------------- Peer connection ----------------

function createPeer() {
  closePeer();
  trace('pc-new', { fails: S.failCount || undefined });
  const pc = new RTCPeerConnection({ iceServers: S.iceServers });
  const conn = {
    pc,
    pcId: randomId(),
    remotePcId: null,
    // Two sides can start negotiating at the same moment. The "polite" side yields.
    polite: S.clientId > S.peer.id,
    makingOffer: false,
    ignoreOffer: false,
    settingAnswer: false,
    senders: { audio: null, video: null, screenAudio: null },
    files: null, // data channel for sending files
    sendingFile: false,
    failTimer: null,
    statsTimer: null,
  };
  S.conn = conn;

  // Only one side starts the call; the other waits for its offer and answers.
  // (If both start at once, Chrome can end up stuck on "Connecting".)
  if (conn.polite) {
    conn.waitingForOffer = true;
  } else {
    addLocalTracks(conn);
    openFileChannel(conn);
    if (!pc.getTransceivers().length) pc.addTransceiver('audio', { direction: 'recvonly' });
  }

  // Safety net: if nothing connects within 15 seconds, try again, and keep trying for as long
  // as you're both in the call (a phone that was asleep answers as soon as it wakes).
  const watchdog = () => {
    conn.connectTimer = setTimeout(() => {
      if (S.conn !== conn || conn.pc.connectionState === 'connected') return;
      if (!S.peer || S.peer.away || !wsOpen()) return; // picked up again when they (or we) are back
      S.failCount++;
      maybeShowConnectHint();
      if (conn.waitingForOffer) {
        // Their offer never came. Try offering from this side instead.
        conn.waitingForOffer = false;
        addLocalTracks(conn);
        openFileChannel(conn);
        watchdog();
      } else {
        createPeer();
      }
    }, 15_000);
  };
  watchdog();

  pc.onnegotiationneeded = async () => {
    if (S.conn !== conn) return;
    try {
      conn.makingOffer = true;
      await pc.setLocalDescription();
      if (S.conn === conn) sendSignal(conn, { description: pc.localDescription });
    } catch (err) {
      console.warn('[negotiation]', err);
    } finally {
      conn.makingOffer = false;
    }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (S.conn === conn && candidate) sendSignal(conn, { candidate });
  };
  pc.ontrack = ({ track }) => {
    if (S.conn === conn) onRemoteTrack(track);
  };
  pc.onconnectionstatechange = () => {
    if (S.conn !== conn) return;
    trace('pc-state', { state: pc.connectionState, ice: pc.iceConnectionState });
    onConnectionState(conn);
  };
  pc.oniceconnectionstatechange = () => {
    if (S.conn === conn) trace('ice-state', { state: pc.iceConnectionState });
  };

  setStatus(`Connecting to ${S.peer.name}`);
}

function addLocalTracks(conn) {
  const pc = conn.pc;
  if (S.local.mic && !conn.senders.audio) conn.senders.audio = pc.addTrack(S.local.mic, S.localStream);
  const video = S.local.screen || S.local.cam;
  if (video && !conn.senders.video) conn.senders.video = pc.addTrack(video, S.localStream);
  if (S.local.screenAudio && !conn.senders.screenAudio) conn.senders.screenAudio = pc.addTrack(S.local.screenAudio, S.localStream);
}

function maybeShowConnectHint() {
  if (S.connectedOnce || S.failCount !== 2) return;
  toast(
    S.hasTurn
      ? "Can't reach your friend yet. Still trying. If it doesn't connect, both of you leave and rejoin."
      : "Your networks may be blocking a direct connection. Setting up a relay (TURN) server fixes this. See the README.",
    12_000
  );
}

function sendSignal(conn, data) {
  wsSend({ type: 'signal', data: { pcId: conn.pcId, ...JSON.parse(JSON.stringify(data)) } });
}

async function handleSignal({ pcId, description, candidate }) {
  if (!S.peer) return;
  if (!S.conn) createPeer();
  let conn = S.conn;

  if (conn.remotePcId && conn.remotePcId !== pcId) {
    // Friend rebuilt their side of the call. Rebuild ours to match; ignore leftovers from the old one.
    if (description && description.type === 'offer') {
      createPeer();
      conn = S.conn;
    } else {
      return;
    }
  }
  conn.remotePcId = pcId;
  const pc = conn.pc;

  if (description) {
    const readyForOffer = !conn.makingOffer && (pc.signalingState === 'stable' || conn.settingAnswer);
    const collision = description.type === 'offer' && !readyForOffer;
    conn.ignoreOffer = !conn.polite && collision;
    if (conn.ignoreOffer) return;

    conn.settingAnswer = description.type === 'answer';
    await pc.setRemoteDescription(description);
    conn.settingAnswer = false;
    if (S.conn !== conn) return;
    if (description.type === 'offer' && conn.waitingForOffer) {
      conn.waitingForOffer = false;
      addLocalTracks(conn); // slots into the offer's audio/video lines, no extra round trip
      openFileChannel(conn);
    }

    if (description.type === 'offer') {
      await pc.setLocalDescription();
      if (S.conn === conn) sendSignal(conn, { description: pc.localDescription });
    }
  } else if (candidate) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      if (!conn.ignoreOffer) console.warn('[ice candidate]', err);
    }
  }
}

function onRemoteTrack(track) {
  if (track.kind === 'video') {
    el.remoteVideo.srcObject = new MediaStream([track]);
    el.remoteVideo.play().catch(() => {});
    return;
  }
  if (S.remoteAudio.has(track.id)) return;
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.srcObject = new MediaStream([track]);
  // The first is your friend's microphone; another is the sound of a screen they share.
  audio.dataset.kind = S.remoteAudio.size ? 'stream' : 'voice';
  audio.volume = Math.min(1, S.volume);
  track.onmute = track.onunmute = renderStreamAudio; // the share's sound starting and stopping
  // (For the call debug log: their sound stopping, on its way or here, and starting again.)
  track.addEventListener('mute', () => trace('incoming-stopped', { which: audio.dataset.kind }));
  track.addEventListener('unmute', () => trace('incoming-back', { which: audio.dataset.kind }));
  audio.addEventListener('pause', () => trace('sound-paused', { which: audio.dataset.kind }));
  audio.addEventListener('playing', () => {
    audio.blockedNoted = false;
    trace('sound-playing', { which: audio.dataset.kind });
  });
  if (S.devices.speaker && audio.setSinkId) audio.setSinkId(S.devices.speaker).catch(() => {});
  el.remoteAudio.append(audio);
  S.remoteAudio.set(track.id, audio);
  applyVolume();
  audio.play().catch((err) => {
    noteBlocked(audio, err);
    askForSoundTap();
  });
  // The first audio track is always your friend's microphone.
  if (!S.remoteMeter) S.remoteMeter = makeMeter(track);
}

// (For the call debug log: a player the device won't let play, noted once until it plays again.)
function noteBlocked(audio, err) {
  if (audio.blockedNoted) return;
  audio.blockedNoted = true;
  trace('sound-blocked', { which: audio.dataset.kind, why: (err && err.name) || undefined });
}

let soundTapPending = false;
function askForSoundTap() {
  if (soundTapPending) return;
  soundTapPending = true;
  toast('Tap anywhere to turn on sound.', 15_000);
  document.addEventListener('pointerdown', () => {
    soundTapPending = false;
    el.toast.hidden = true;
    if (S.audioCtx) S.audioCtx.resume();
    if (S.soundCtx) S.soundCtx.resume();
    if (S.boostCtx) S.boostCtx.resume();
    for (const a of S.remoteAudio.values()) a.play().catch(() => {});
  }, { once: true });
}

function onConnectionState(conn) {
  const state = conn.pc.connectionState;
  clearTimeout(conn.failTimer);

  if (state === 'connected') {
    S.failCount = 0;
    S.connectedOnce = true;
    clearTimeout(S.dropSoundTimer);
    S.dropSoundTimer = null;
    if (S.mediaDropped) {
      S.mediaDropped = false;
      playCallSound(true); // back after dropping
    }
    setStatus('Connected');
    tuneVideoSender(); // a screen share that started before the connection was ready
    startStats(conn);
    requestWakeLock();
    renderPeer();
  } else if (state === 'new' || state === 'connecting') {
    setStatus(`Connecting to ${S.peer ? S.peer.name : 'friend'}`);
  } else if ((state === 'disconnected' || state === 'failed') && S.peer && S.peer.away) {
    // We already know they dropped; show that instead of retrying.
    recover(conn);
  } else if (state === 'disconnected') {
    setStatus('Reconnecting');
    dropSoundSoon();
    conn.failTimer = setTimeout(() => {
      if (S.conn === conn && conn.pc.connectionState !== 'connected') recover(conn);
    }, 6000);
  } else if (state === 'failed') {
    dropSoundSoon();
    recover(conn);
  }
}

// If the call's connection is still down after a few seconds (not just a blip), play the
// "left" sound so you notice, even with the screen off; the "joined" sound plays when it's back.
function dropSoundSoon() {
  if (S.mediaDropped || S.dropSoundTimer) return;
  S.dropSoundTimer = setTimeout(() => {
    S.dropSoundTimer = null;
    const up = S.conn && S.conn.pc.connectionState === 'connected';
    if (!S.inCall || up || S.mediaDropped || (S.peer && S.peer.away)) return;
    S.mediaDropped = true;
    playCallSound(false);
  }, 5000);
}

// The relay's passwords last a day; a long call gets fresh ones every few hours, for the
// connection it has and any it builds after a drop.
// ---------------- Keeping the call's sound going ----------------
// Phones sometimes stop part of a call by themselves, mostly with the screen off, and it
// would stay stopped until you rejoined. Every couple of seconds this looks, and restarts:
// - your mic, if it ended or has gone completely silent (see silent() in makeMeter);
// - your friend's sound, if its player got paused or the volume boost stalled.
// Each fix goes in the call's summary for both of you.
const MIC_DEAD_MS = 8000;

function checkCallSound() {
  if (!S.inCall) return;
  const t = S.local.mic;
  if (S.audioCtx && S.audioCtx.state === 'suspended') S.audioCtx.resume().catch(() => {});
  // (Silence only counts outside the Android app: a phone's own noise suppression can hand over
  // pure silence while you're quiet, and restarting the mic over and over with the phone locked
  // does no good.)
  if (t && t.readyState === 'ended') {
    reviveMic('mic-ended');
  } else if (!ANDROID && !S.micQuietIsNormal && t && micLive() && S.localMeter && S.audioCtx && S.audioCtx.state === 'running') {
    if (t.muted || S.localMeter.silent()) {
      S.micDeadSince = S.micDeadSince || Date.now();
      if (Date.now() - S.micDeadSince > MIC_DEAD_MS) {
        // Restarting it once already brought nothing back: this mic (or its noise removal)
        // just gives pure silence while you're quiet. Leave it be for the rest of the call.
        if (S.micSilentRevived) S.micQuietIsNormal = true;
        else reviveMic('mic-silent');
      }
    } else {
      S.micDeadSince = 0;
      S.micRevives = 0;
    }
  }

  for (const audio of S.remoteAudio.values()) {
    if (audio.paused && audio.srcObject) audio.play().catch((err) => noteBlocked(audio, err));
  }
  if (S.boostCtx && S.boosts.size && !boostRunning()) {
    S.boostCtx.resume().catch(() => {});
    // (Just after it's made it's still starting up, which isn't a stall.)
    if (!S.boostNoted && Date.now() - S.boostCtxAt > 5000) {
      S.boostNoted = true;
      noteCall('sound-stalled');
    }
  } else {
    S.boostNoted = false;
    // Running, but its clock has stopped: its sound output died. Only a new one will do.
    if (S.boostCtx && S.boosts.size) {
      const t = S.boostCtx.currentTime;
      if (t === S.boostClock) restartFriendSound(true);
      S.boostClock = t;
    }
  }
  checkFriendSound();
}

// Their sound can also stop where it can't be seen: the phone stops playing it, or it stops
// reaching the volume boost. The connection's own numbers show both: sound arriving but
// none being played, or them talking (each packet says how loud it is) while the boost
// hears nothing at all.
async function checkFriendSound() {
  const conn = S.conn;
  if (S.checkingSound || !conn || conn.pc.connectionState !== 'connected') return;
  S.checkingSound = true;
  try {
    const stats = await conn.pc.getStats();
    if (S.conn !== conn || !S.inCall) return;
    // (Not the stats' own loudness: that's measured after the player's volume, and a boosted
    // player is muted.)
    const loudness = new Map();
    for (const rc of conn.pc.getReceivers()) {
      const src = rc.track && rc.track.kind === 'audio' && rc.getSynchronizationSources && rc.getSynchronizationSources()[0];
      if (src) loudness.set(rc.track.id, src.audioLevel || 0);
    }
    let stuck = false;
    stats.forEach((r) => {
      if (r.type !== 'inbound-rtp' || r.kind !== 'audio' || !S.remoteAudio.has(r.trackIdentifier)) return;
      const last = S.soundStats.get(r.trackIdentifier);
      const now = { packets: r.packetsReceived || 0, samples: r.totalSamplesReceived || 0 };
      S.soundStats.set(r.trackIdentifier, now);
      if (!last) return;
      const arriving = now.packets - last.packets > 20; // (about 100 in 2 seconds, normally)
      const played = now.samples > last.samples;
      const talking = (loudness.get(r.trackIdentifier) || 0) > 0.02; // not just room noise
      const b = S.boosts.get(r.trackIdentifier);
      if (arriving && !played) stuck = true;
      else if (b) {
        if (!b.silent()) b.misses = 0; // it hears them
        else if (talking && ++b.misses >= 3) stuck = true;
      }
    });
    if (stuck) restartFriendSound(false);
  } catch {
    // (no numbers this time)
  } finally {
    S.checkingSound = false;
  }
}

// What rejoining would do for their sound: new players, and the boost made again.
function restartFriendSound(newBooster) {
  if (Date.now() - (S.soundRestartedAt || 0) < 20_000) return;
  S.soundRestartedAt = Date.now();
  noteCall('sound-stalled');
  for (const audio of S.remoteAudio.values()) {
    const stream = audio.srcObject;
    audio.srcObject = null;
    audio.srcObject = stream;
    audio.play().catch(() => {});
  }
  for (const b of S.boosts.values()) {
    try { b.source.disconnect(); b.gain.disconnect(); } catch {}
  }
  S.boosts.clear();
  if (newBooster && S.boostCtx) {
    S.boostCtx.onstatechange = null;
    S.boostCtx.close().catch(() => {});
    S.boostCtx = null;
  }
  S.boostClock = null;
  applyVolume();
}

async function reviveMic(why) {
  // At most every 30 seconds, and not over and over if it keeps not helping.
  if (S.revivingMic || Date.now() - S.micRevivedAt < 30_000 || S.micRevives >= 3) return;
  S.revivingMic = true;
  S.micRevivedAt = Date.now();
  S.micRevives++;
  S.micDeadSince = 0;
  noteCall(why);
  if (why === 'mic-silent') S.micSilentRevived = true;
  // Close the old one first: while it's open, Chrome would hand back the same stuck mic.
  if (S.local.mic) S.local.mic.stop();
  try {
    const track = await getMicTrack(S.devices.mic);
    if (!S.inCall) return track.stop();
    await setMicTrack(track);
    // Closing the mic can put Android back on its default speaker; go back to the one picked.
    if (ANDROID && S.audioRoute && S.audioRoute.available.length > 1) {
      ANDROID.setAudioRoute({ route: S.audioRoute.current }).then(renderRoute).catch(() => {});
    }
  } catch {
    noteCall('mic-failed');
  } finally {
    S.revivingMic = false;
  }
}

// On an ordinary phone call (the Android app says when), the Rainlit call waits: your mic is
// off and your friend goes quiet, so neither call hears the other, and your friend is told.
function setOnPhone(on) {
  if (!S.inCall || Boolean(S.onPhone) === on) return;
  S.onPhone = on;
  applyMic();
  applyVolume();
  sendState();
  if (!on) toast('Back in your Rainlit call.');
}

function noteCall(what) {
  trace('fix', { what });
  if (S.inCall) wsSend({ type: 'note', what });
}

async function refreshIce() {
  try {
    const data = await api('GET', '/ice');
    S.iceServers = data.iceServers || [];
    S.hasTurn = Boolean(data.hasTurn);
    if (S.conn) S.conn.pc.setConfiguration({ ...S.conn.pc.getConfiguration(), iceServers: S.iceServers });
  } catch {}
}

function recover(conn) {
  if (S.conn !== conn) return;
  if (!S.peer || S.peer.away) {
    // They dropped. Wait for them to come back instead of retrying.
    trace('recover', { then: 'wait for them' });
    closePeer();
    setStatus(S.peer ? `${S.peer.name} is away` : S.call ? 'In call' : 'Ready');
    renderPeer();
    return;
  }
  if (!wsOpen()) {
    // We're the one who's offline. The call is rebuilt once we're back on the server.
    trace('recover', { then: 'wait for the server' });
    setStatus('Reconnecting');
    return;
  }
  S.failCount++;
  setStatus('Reconnecting');
  maybeShowConnectHint();
  trace('recover', { then: S.failCount % 3 === 0 ? 'rebuild' : conn.polite ? 'wait for their restart' : 'restart ICE', fails: S.failCount });
  if (S.failCount % 3 === 0) createPeer();
  else if (!conn.polite) conn.pc.restartIce(); // one side restarts, so the two don't collide
}

function startStats(conn) {
  clearInterval(conn.statsTimer);
  const update = async () => {
    if (S.conn !== conn) return clearInterval(conn.statsTimer);
    try {
      const stats = await conn.pc.getStats();
      let pair = null;
      stats.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
      });
      if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
      if (!pair) return;
      const local = stats.get(pair.localCandidateId);
      traceRoute(conn, stats, pair, local);
      const relayed = local && local.candidateType === 'relay';
      const ping = pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null;
      const route = relayed ? 'Via relay' : 'Direct';
      if (conn.pc.connectionState === 'connected') setStatus('Connected', ping != null ? `${route}, ${ping} ms` : route);
      el.connInfo.textContent = `${relayed ? 'Connected through a relay server' : 'Connected directly'}${ping != null ? `, ${ping} ms round trip` : ''}.`;
      renderStreamStats(conn, stats, pair, route, ping);
    } catch {}
  };
  update();
  conn.statsTimer = setInterval(update, 2000);
}

// For Settings > Show stream stats: the video you're sending and receiving, measured over
// the last couple of seconds. "Lost" is the share of the video's pieces that never arrived;
// "held back by" is what the sender's browser says is stopping it going sharper.
const LIMITED_BY = { bandwidth: 'the connection', cpu: 'the computer (CPU)', other: 'something else' };

function renderStreamStats(conn, stats, pair, route, ping) {
  el.streamStats.hidden = !S.showStats;
  if (!S.showStats) return;
  const prev = conn.lastStats || {};
  const now = {};
  let out = null;
  let inb = null;
  let remoteIn = null;
  stats.forEach((r) => {
    if (r.kind !== 'video') return;
    if (r.type === 'outbound-rtp' && r.frameWidth) out = r;
    if (r.type === 'inbound-rtp' && r.frameWidth) inb = r;
    if (r.type === 'remote-inbound-rtp') remoteIn = r;
  });
  const codec = (r) => {
    const c = r && r.codecId && stats.get(r.codecId);
    return c ? c.mimeType.replace('video/', '') : '?';
  };
  const mbps = (bytes, before, at, beforeAt) => (before != null && at > beforeAt ? ((bytes - before) * 8 / ((at - beforeAt) / 1000) / 1e6).toFixed(1) : '…');
  const lines = [`${route}${ping != null ? `, ${ping} ms round trip` : ''}`];
  if (pair.availableOutgoingBitrate) lines.push(`Your upload can carry about ${(pair.availableOutgoingBitrate / 1e6).toFixed(1)} Mb/s`);
  if (out) {
    now.outBytes = out.bytesSent;
    now.outAt = out.timestamp;
    const lost = remoteIn && remoteIn.fractionLost != null ? `, ${(remoteIn.fractionLost * 100).toFixed(1)}% lost` : '';
    lines.push(`Sending   ${out.frameWidth}×${out.frameHeight}, ${Math.round(out.framesPerSecond || 0)} fps, ${mbps(out.bytesSent, prev.outBytes, out.timestamp, prev.outAt)} Mb/s${lost}`);
    lines.push(`          ${codec(out)}${out.encoderImplementation ? ` (${out.encoderImplementation})` : ''}${out.qualityLimitationReason && out.qualityLimitationReason !== 'none' ? `, held back by ${LIMITED_BY[out.qualityLimitationReason] || out.qualityLimitationReason}` : ''}`);
  }
  if (inb) {
    now.inBytes = inb.bytesReceived;
    now.inAt = inb.timestamp;
    now.inLost = inb.packetsLost;
    now.inGot = inb.packetsReceived;
    const lostNow = prev.inLost != null ? inb.packetsLost - prev.inLost : 0;
    const gotNow = prev.inGot != null ? inb.packetsReceived - prev.inGot : 0;
    const lossPct = lostNow + gotNow > 0 ? ((lostNow / (lostNow + gotNow)) * 100).toFixed(1) : '0.0';
    lines.push(`Receiving ${inb.frameWidth}×${inb.frameHeight}, ${Math.round(inb.framesPerSecond || 0)} fps, ${mbps(inb.bytesReceived, prev.inBytes, inb.timestamp, prev.inAt)} Mb/s, ${lossPct}% lost`);
    lines.push(`          ${codec(inb)}${inb.decoderImplementation ? ` (${inb.decoderImplementation})` : ''}${inb.freezeCount ? `, froze ${inb.freezeCount}×` : ''}`);
  }
  if (!out && !inb) lines.push('No video right now');
  conn.lastStats = now;
  el.streamStats.textContent = lines.join('\n');
}

function closePeer() {
  const conn = S.conn;
  if (!conn) return;
  trace('pc-close', { state: conn.pc.connectionState });
  S.conn = null;
  clearTimeout(conn.failTimer);
  clearTimeout(conn.connectTimer);
  clearInterval(conn.statsTimer);
  const pc = conn.pc;
  pc.onnegotiationneeded = pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null;
  if (conn.files) conn.files.onopen = conn.files.onmessage = conn.files.onclose = null;
  pc.close();
  fileChannelLost();
  el.remoteVideo.srcObject = null;
  for (const a of S.remoteAudio.values()) { a.srcObject = null; a.remove(); }
  S.remoteAudio.clear();
  for (const b of S.boosts.values()) { b.source.disconnect(); b.gain.disconnect(); }
  S.boosts.clear();
  if (S.remoteMeter) S.remoteMeter.disconnect();
  S.remoteMeter = null;
  el.connInfo.textContent = '';
  el.streamStats.hidden = true;
  S.signalChain = Promise.resolve();
}

function peerGone() {
  closePeer();
  S.peer = null;
  S.failCount = 0;
  setStatus(S.call ? 'In call' : 'Ready');
  renderPeer();
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || S.wakeLock || document.visibilityState !== 'visible') return;
  try {
    S.wakeLock = await navigator.wakeLock.request('screen');
    S.wakeLock.addEventListener('release', () => (S.wakeLock = null));
  } catch {}
}

// ---------------- Rendering ----------------

function renderPeer() {
  updateRingback();
  const p = S.peer;
  const mediaUp = Boolean(S.conn && S.conn.pc.connectionState === 'connected');
  const awayView = Boolean(p && p.away && !mediaUp);

  el.callDot.classList.toggle('on', Boolean(p && !awayView));
  el.waiting.hidden = Boolean(p);

  if (!p) {
    const friend = S.friends.get(S.callWith);
    const who = friend ? friend.displayName : 'your friend';
    const left = S.call && S.lastPeerName;
    const [title, text] =
      left && S.peerTimedOut ? [`${S.lastPeerName}'s connection dropped`, "The call is still going. They'll be back in it when their app reconnects, or they can rejoin from their friends list."]
      : left ? [`${S.lastPeerName} left the call`, 'The call is still going. They can rejoin anytime from their friends list.']
      : S.resumeCallId ? [`Waiting for ${who}`, `Your call is still on. ${who} will be back in it when their app reconnects. If their app is closed, ring them.`]
      : S.callAnswer === 'declined' ? [`${who} can't answer right now`, 'Try again in a bit.']
      : S.callAnswer === 'no-answer' ? [`${who} didn't answer`, 'You can ring them again, or try later.']
      : friend && friend.presence === 'offline' ? [`Calling ${who}`, `${who} is offline right now. It'll ring if they open Rainlit in the next minute.`]
      : [`Calling ${who}`, 'Ringing on every device they have Rainlit open on.'];
    el.waitingTitle.textContent = title;
    el.waitingText.textContent = text;
    el.ringAgainBtn.hidden = Boolean(left) || !(S.callAnswer || S.resumeCallId);
    el.peerCard.hidden = true;
    el.remoteVideo.hidden = true;
    el.videoLabel.hidden = true;
    el.fullscreenBtn.hidden = true;
    updateTitle();
    return;
  }

  const showVideo = !awayView && Boolean(p.state.cam || p.state.screen);
  el.remoteVideo.hidden = !showVideo;
  el.peerCard.hidden = showVideo;
  el.peerCard.classList.toggle('away', awayView);
  el.peerAway.hidden = !awayView;
  el.fullscreenBtn.hidden = !showVideo && !el.stage.classList.contains('self-big');
  if (el.fullscreenBtn.hidden && stageFull()) setStageFull(false);
  el.videoLabel.hidden = !showVideo;
  el.videoName.textContent = p.state.screen ? `${p.name}'s screen` : p.name;
  el.videoMuted.hidden = Boolean(p.state.mic);
  el.peerInitial.textContent = initial(p.name);
  const photo = (S.friends.get(p.id) || {}).avatar;
  el.peerPhoto.hidden = !photo;
  if (photo && el.peerPhoto.getAttribute('src') !== photo) el.peerPhoto.src = photo;
  el.peerName.textContent = p.name;
  el.peerMuted.hidden = Boolean(p.state.mic) || awayView;
  renderStreamAudio();
  updateTitle();
}

// The stream-volume control shows while your friend's screen share has sound.
function renderStreamAudio() {
  const sharing = Boolean(S.peer && S.peer.state && S.peer.state.screen && !el.remoteVideo.hidden);
  const hasSound = [...S.remoteAudio.values()].some((a) => {
    const t = a.dataset.kind === 'stream' && a.srcObject && a.srcObject.getAudioTracks()[0];
    return t && t.readyState === 'live' && !t.muted;
  });
  el.streamAudio.hidden = !(sharing && hasSound);
  const pct = Math.round(Math.min(S.streamVolume, volumeCap()) * 100);
  el.streamVolume.value = String(pct);
  el.streamVolumeValue.textContent = S.streamMuted ? 'Muted' : `${pct}%`;
  el.streamAudio.classList.toggle('muted', S.streamMuted);
  el.streamMute.querySelector('use').setAttribute('href', S.streamMuted ? '#i-speaker-off' : '#i-speaker');
  const label = S.streamMuted ? 'Unmute the stream' : 'Mute the stream';
  el.streamMute.title = label;
  el.streamMute.setAttribute('aria-label', label);
}

// Runs every second: call timer, how long your friend has been away, offline banner.
function renderTick() {
  if (!S.inCall) return;
  const now = serverNow();
  el.callTimer.hidden = !S.call;
  if (S.call) el.callTimer.textContent = fmtClock(now - S.call.startedAt);
  if (S.peer && S.peer.away && S.peer.awaySince) el.peerAwayTime.textContent = fmtClock(now - S.peer.awaySince);
  el.offlineBanner.hidden = !(S.wsDownSince && Date.now() - S.wsDownSince > 3000);
  checkSocketHealth();
}

// Full screen for the call. On computers it's the browser's own. The Android app's WebView
// doesn't do that properly (it could leave an invisible layer over the app that ate every
// tap), and the app fills the screen anyway, so there the stage just covers everything.
function stageFull() {
  return Boolean(document.fullscreenElement) || el.stage.classList.contains('full');
}

function setStageFull(on) {
  if (ANDROID) el.stage.classList.toggle('full', on);
  else if (on) el.stage.requestFullscreen().catch(() => {});
  if (!on) {
    el.stage.classList.remove('full');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

function renderSelf() {
  const v = S.local.screen || S.local.cam;
  el.selfView.hidden = !v;
  if (!v) el.stage.classList.remove('self-big');
  el.selfView.title = el.stage.classList.contains('self-big') ? 'Click to make it small again' : 'Click to see it big';
  el.selfView.classList.toggle('mirror', Boolean(S.local.cam && !S.local.screen && S.facing !== 'environment'));
  if (v) {
    const current = el.localVideo.srcObject && el.localVideo.srcObject.getVideoTracks()[0];
    if (current !== v) el.localVideo.srcObject = new MediaStream([v]);
  } else {
    el.localVideo.srcObject = null;
  }
}

// Swaps what's big on the stage: your friend (usually), or your own camera or screen.
function toggleSelfBig(big = !el.stage.classList.contains('self-big')) {
  el.stage.classList.toggle('self-big', big && !el.selfView.hidden);
  renderSelf();
  renderPeer();
}

function renderControls() {
  const micLabel = el.micBtn.querySelector('.ctl-label');
  const micReady = Boolean(S.micOn && S.local.mic);
  el.micBtn.classList.toggle('ptt', S.ptt);
  el.micBtn.classList.toggle('off', !micReady);
  setIcon(el.micBtn, micReady ? 'i-mic' : 'i-mic-off');
  if (S.ptt) {
    // Push to talk: the button lights up while you're holding it (or the key) and talking.
    el.micBtn.classList.toggle('lit', micLive());
    el.micBtn.setAttribute('aria-pressed', String(micLive()));
    el.micBtn.title = `Hold ${S.pttKeyName} or hold this button to talk`;
    micLabel.textContent = micLive() ? 'Talking' : 'Push to talk';
  } else {
    el.micBtn.classList.remove('lit');
    el.micBtn.setAttribute('aria-pressed', String(micReady));
    el.micBtn.title = 'Ctrl+Shift+M';
    micLabel.textContent = micReady ? 'Mute' : 'Unmute';
  }

  const camOn = Boolean(S.local.cam);
  el.camBtn.classList.toggle('lit', camOn);
  el.camBtn.setAttribute('aria-pressed', String(camOn));
  setIcon(el.camBtn, camOn ? 'i-cam' : 'i-cam-off');
  el.flipBtn.hidden = !(camOn && isPhone() && S.cameraCount > 1);

  const sharing = Boolean(S.local.screen);
  el.screenBtn.hidden = !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  el.screenBtn.classList.toggle('lit', sharing);
  el.screenBtn.setAttribute('aria-pressed', String(sharing));
  el.screenBtn.querySelector('.ctl-label').textContent = sharing ? 'Stop sharing' : 'Share screen';

}

// The tab's title shows who you're in a call with and how many messages you haven't read.
function updateTitle() {
  if (S.ringing) return; // "Bea is calling" stays until the ringing stops
  const base = S.peer ? `Rainlit with ${S.peer.name}` : 'Rainlit';
  let unread = 0; // DMs, and mentions of you in spaces (other channel messages show on the rail)
  for (const dm of S.dms.values()) unread += dm.channelId && !groupOfChannel(dm.channelId) ? dm.mentions || 0 : dm.unread; // (a group's messages count like a DM's)
  document.title = unread ? `(${unread}) ${base}` : base;
  if (DESKTOP) DESKTOP.setUnread(unread);
  // The drop in the corner glows brighter while something's waiting for you, or you're in a call.
  if (el.brand) el.brand.classList.toggle('lit', unread > 0 || S.inCall);
}

// ---------------- Chat ----------------

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// A message's words, with its links (and, in a space, its mentions).
function appendLinked(node, text, space = null, everyone = false) {
  const re = /\bhttps?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    appendMentions(node, text.slice(last, m.index), space, everyone);
    const a = document.createElement('a');
    a.href = m[0];
    a.textContent = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    node.append(a);
    last = m.index + m[0].length;
  }
  appendMentions(node, text.slice(last), space, everyone);
}

// "@bea" in a space shows as "@Bea", and opens her profile. "@everyone" stands out when it
// really reached everyone. (Each keeps what was typed, for editing and copying.)
const MENTION_RE = /(^|[^\w@.])@([a-z0-9_.]{2,32})/gi;

function appendMentions(node, text, space, everyone) {
  if (!space || !text.includes('@')) return node.append(text);
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const at = m.index + m[1].length;
    let name = m[2].toLowerCase();
    let person = null;
    if (name === 'everyone') {
      if (!everyone) continue;
    } else {
      for (;;) {
        person = space.byName ? space.byName.get(name) : null;
        if (person || !name.endsWith('.') || name.length <= 2) break;
        name = name.slice(0, -1); // "hi @bea."
      }
      if (!person) continue;
    }
    const end = at + 1 + name.length;
    node.append(text.slice(last, at));
    const tag = document.createElement('span');
    tag.className = `mention${person ? '' : ' everyone'}${person && person.id === S.clientId ? ' me' : ''}`;
    tag.dataset.raw = text.slice(at, end);
    tag.textContent = person ? `@${person.displayName}` : '@everyone';
    if (person) {
      tag.title = `@${person.username}`;
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        openMiniProfile(person.id);
      });
    }
    node.append(tag);
    last = end;
  }
  node.append(text.slice(last));
}

// Whether a message mentions you (by name, or @everyone).
const mentionsMe = (m) => Boolean(m.everyone || (m.mentions && m.mentions.includes(S.clientId)));

// ---------------- Removing things you sent ----------------
//
// You can remove your own messages and files. They're replaced by "You removed a
// message" for you and "Alice removed a message" for your friend.

// ----- The message menu: Edit, Copy, Delete -----
// A "..." button on hover, right-click, or a long press on a phone.

function addMessageMenu(li) {
  const reacts = canReact(li);
  if (!messageActions(li).length && !reacts) return;
  const tools = document.createElement('div');
  tools.className = 'msg-tools';
  if (reacts) {
    for (const emoji of S.quickReactions) tools.append(quickReactButton(li, emoji));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'msg-react-more';
    more.title = 'React with any emoji';
    more.setAttribute('aria-label', 'React with any emoji');
    more.innerHTML = '<svg class="icon"><use href="#i-react"/></svg>';
    more.addEventListener('click', () => openEmojiPicker(li));
    tools.append(more);
  }
  if (canReply(li)) {
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'msg-reply';
    reply.title = 'Reply';
    reply.setAttribute('aria-label', 'Reply');
    reply.innerHTML = '<svg class="icon"><use href="#i-reply"/></svg>';
    reply.addEventListener('click', () => startReply(li));
    tools.append(reply);
  }
  if (messageActions(li).length) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'msg-more';
    btn.title = 'More';
    btn.setAttribute('aria-label', 'Message options');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.innerHTML = '<svg class="icon"><use href="#i-more"/></svg>';
    btn.addEventListener('click', () => {
      const r = btn.getBoundingClientRect();
      openMessageMenu(li, r.right - 180 * uiZoom(), r.bottom + 4);
    });
    tools.append(btn);
  }
  li.append(tools);
}

function quickReactButton(li, emoji) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'msg-react';
  b.textContent = emoji;
  b.title = `React with ${emoji}`;
  b.setAttribute('aria-label', `React with ${emoji}`);
  b.addEventListener('click', () => toggleReaction(li, b.textContent));
  return b;
}

// ----- Reactions -----
// On any saved message, by either of you. The three quick ones are your most used.

function canReact(li) {
  const c = li.dataset.channel && S.channels.get(li.dataset.channel);
  if (c && c.can && !c.can.react) return false;
  return li.dataset.saved === '1' && ['text', 'file', 'gif'].includes(li.dataset.kind) && !li.classList.contains('removed');
}

function setQuickReactions(list) {
  S.quickReactions = list.slice(0, 3);
  // Update the hover toolbars already on screen.
  for (const tools of document.querySelectorAll('.msg-tools')) {
    tools.querySelectorAll('.msg-react').forEach((b, i) => {
      if (!S.quickReactions[i]) return;
      b.textContent = S.quickReactions[i];
      b.title = `React with ${S.quickReactions[i]}`;
      b.setAttribute('aria-label', b.title);
    });
  }
}

async function toggleReaction(li, emoji) {
  if (!li || !emoji || !S.openDm || !canReact(li)) return;
  closeMessageMenu();
  const mine = (li.reactions || []).some((r) => r.emoji === emoji && r.users.includes(S.clientId));
  try {
    const res = await api(mine ? 'DELETE' : 'POST', `${convPath(S.openDm)}/messages/${li.dataset.id}/reactions`, { emoji });
    renderReactions(li, res.reactions);
    if (res.quick) setQuickReactions(res.quick);
  } catch (err) {
    toast(err.message);
  }
}

// The little chips under a message: the emoji, and how many reacted with it.
function renderReactions(li, reactions) {
  li.reactions = reactions || [];
  // New chips on the last message shouldn't push it out of view.
  const log = li.isConnected && li.closest('.chat-log');
  const stick = log && nearBottom(log);
  const old = li.querySelector(':scope > .reactions');
  if (old) old.remove();
  if (!li.reactions.length) return;
  const row = document.createElement('div');
  row.className = 'reactions';
  for (const r of li.reactions) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `reaction${r.users.includes(S.clientId) ? ' mine' : ''}`;
    const who = r.users.map((id) => (id === S.clientId ? 'You' : friendName(id))).join(' and ');
    chip.title = `${who} reacted with ${r.emoji}`;
    const e = document.createElement('span');
    e.className = 'emoji';
    e.textContent = r.emoji;
    chip.append(e, String(r.users.length));
    chip.addEventListener('click', () => toggleReaction(li, r.emoji));
    row.append(chip);
  }
  const tools = li.querySelector(':scope > .msg-tools');
  li.insertBefore(row, tools || null);
  if (stick) scrollChat(log);
}

function onDmReactions({ dm: dmId, id, reactions }) {
  const dm = S.dms.get(convOf(dmId));
  const li = dm && dm.log.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  if (li) renderReactions(li, reactions);
}

// Any emoji, from the full picker (loaded the first time it's opened).
let emojiTarget = null;
async function openEmojiPicker(li) {
  closeMessageMenu();
  emojiTarget = li;
  if (!el.emojiDialog.firstElementChild) {
    try {
      await import('/vendor/emoji-picker/index.js');
    } catch {
      return toast("Couldn't open the emoji picker. Try again.");
    }
    const picker = document.createElement('emoji-picker');
    picker.className = 'dark';
    picker.dataSource = '/vendor/emoji-picker/data.json';
    picker.addEventListener('emoji-click', (e) => {
      const unicode = e.detail && e.detail.unicode;
      el.emojiDialog.close();
      if (unicode) toggleReaction(emojiTarget, unicode);
    });
    el.emojiDialog.append(picker);
    closeOnBackdrop(el.emojiDialog);
  }
  el.emojiDialog.showModal();
}

// What you can do with a message: edit and delete your own, copy text and GIF links.
function messageActions(li) {
  if (li.classList.contains('removed') || !li.dataset.author) return [];
  const mine = li.dataset.from === 'me';
  const kind = li.dataset.kind;
  const actions = [];
  if (canReply(li)) actions.push('reply');
  if (mine && kind === 'text') actions.push('edit');
  const media = mediaOf(li);
  if (media) actions.push('save');
  if (media && !media.url.startsWith('blob:')) actions.push('open');
  if (kind === 'text' || (kind === 'gif' && li.dataset.copy)) actions.push('copy');
  if (!mine && li.dataset.saved === '1') actions.push('report');
  if (mine || canModerateMessages(li)) actions.push('delete');
  return actions;
}

// In a channel, people allowed to delete messages can remove anyone's.
function canModerateMessages(li) {
  const c = li.dataset.channel && S.channels.get(li.dataset.channel);
  return Boolean(c) && canIn(S.spaces.get(c.spaceId), 'manageMessages');
}

let msgMenuLi = null;

function openMessageMenu(li, x, y) {
  closeMessageMenu();
  const actions = messageActions(li);
  if (!actions.length && !canReact(li)) return;
  msgMenuLi = li;
  li.classList.add('menu-open');
  const more = li.querySelector('.msg-tools');
  if (more) more.classList.add('open');
  el.msgReacts.hidden = !canReact(li);
  if (canReact(li)) {
    el.msgReacts.replaceChildren(...S.quickReactions.map((emoji) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji;
      b.setAttribute('aria-label', `React with ${emoji}`);
      b.addEventListener('click', () => toggleReaction(li, emoji));
      return b;
    }));
    const more = document.createElement('button');
    more.type = 'button';
    more.setAttribute('aria-label', 'React with any emoji');
    more.innerHTML = '<svg class="icon"><use href="#i-react"/></svg>';
    more.addEventListener('click', () => openEmojiPicker(li));
    el.msgReacts.append(more);
  }
  el.msgReply.hidden = !actions.includes('reply');
  el.msgEdit.hidden = !actions.includes('edit');
  el.msgCopy.hidden = !actions.includes('copy');
  el.msgSave.hidden = !actions.includes('save');
  el.msgSave.textContent = li.dataset.kind === 'gif' ? 'Save GIF' : 'Save';
  el.msgOpen.hidden = !actions.includes('open');
  el.msgCopy.textContent = li.dataset.kind === 'gif' ? 'Copy GIF link' : 'Copy text';
  el.msgReport.hidden = !actions.includes('report');
  el.msgDelete.hidden = !actions.includes('delete');
  el.msgDelete.textContent = li.dataset.kind === 'file' ? 'Delete file' : 'Delete';
  delete el.msgDelete.dataset.confirm;
  el.msgMenu.hidden = false;
  const r = el.msgMenu.getBoundingClientRect();
  const z = uiZoom();
  el.msgMenu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8)) / z}px`;
  el.msgMenu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8)) / z}px`;
  const first = el.msgMenu.querySelector('button:not([hidden])');
  if (first) first.focus({ preventScroll: true });
}

function closeMessageMenu() {
  if (el.msgMenu.hidden) return;
  el.msgMenu.hidden = true;
  if (msgMenuLi) {
    msgMenuLi.classList.remove('menu-open');
    const more = msgMenuLi.querySelector('.msg-tools');
    if (more) more.classList.remove('open');
  }
  msgMenuLi = null;
}

// ----- Saving and opening pictures, videos, files and GIFs -----

// A file or GIF message's address, name and type (null if there's nothing to save yet).
function mediaOf(li) {
  if (li.dataset.kind === 'gif' && li.dataset.copy) {
    const last = new URL(li.dataset.copy).pathname.split('/').pop() || 'gif';
    return { url: li.dataset.copy, name: /\.[a-z0-9]{2,5}$/i.test(last) ? last : `${last}.gif`, type: '' };
  }
  const link = li.dataset.kind === 'file' && li.querySelector('.file-save');
  if (!link || link.hidden || !link.getAttribute('href')) return null;
  return { url: link.getAttribute('href'), name: link.download || 'file', type: li.dataset.type || '' };
}

const absolute = (url) => new URL(url, location.href).href;

// Saves to the device: Downloads in the Android app, a "save as" in the desktop app, the
// browser's downloads otherwise (another site's file, like a GIF, opens in a tab to save).
async function saveUrl(url, name, type) {
  try {
    if (ANDROID) {
      if (url.startsWith('blob:')) {
        const blob = await (await fetch(url)).blob();
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return await ANDROID.saveData({ name, type: type || blob.type, data });
      }
      return await ANDROID.download({ url: absolute(url), name, type });
    }
    const sameSite = url.startsWith('blob:') || new URL(url, location.href).origin === location.origin;
    if (DESKTOP && DESKTOP.download && !url.startsWith('blob:')) return DESKTOP.download(absolute(url));
    if (!sameSite) return openUrl(url);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
  } catch {
    toast("Couldn't save that. Try again.");
  }
}

// Opens a web address in your browser (from the apps) or a new tab.
function openUrl(url) {
  const full = absolute(url);
  if (ANDROID) return ANDROID.openExternal({ url: full }).catch(() => toast("Couldn't open a browser."));
  if (DESKTOP && DESKTOP.openExternal) return DESKTOP.openExternal(full);
  window.open(full, '_blank', 'noopener');
}

function onMessageMenuSave() {
  const li = msgMenuLi;
  closeMessageMenu();
  const media = li && mediaOf(li);
  if (media) saveUrl(media.url, media.name, media.type);
}

// Chat files need you to be signed in, which your browser may not be: open a short-lived
// link to that one file instead.
async function onMessageMenuOpen() {
  const li = msgMenuLi;
  closeMessageMenu();
  const media = li && mediaOf(li);
  if (!media) return;
  if (!media.url.startsWith('/files/')) return openUrl(media.url);
  try {
    const { url } = await api('POST', `/files/${li.dataset.id}/link`);
    openUrl(url);
  } catch (err) {
    toast(err.message);
  }
}

function onMessageMenuCopy() {
  const li = msgMenuLi;
  closeMessageMenu();
  if (!li) return;
  const text = li.dataset.kind === 'gif' ? li.dataset.copy : messageText(li);
  if (text) copyText(text, li.dataset.kind === 'gif' ? 'GIF link copied.' : 'Copied.');
}

function onMessageMenuDelete() {
  const li = msgMenuLi;
  if (!li) return;
  // The first press asks, the second deletes.
  const mine = li.dataset.from === 'me';
  if (!el.msgDelete.dataset.confirm) {
    el.msgDelete.dataset.confirm = '1';
    el.msgDelete.textContent = !mine ? `Delete ${friendName(li.dataset.author)}'s message?`
      : li.dataset.channel ? 'Delete for everyone?' : 'Delete for both of you?';
    return;
  }
  closeMessageMenu();
  if (mine) deleteMine(li);
  else deleteAsModerator(li);
}

async function deleteAsModerator(li) {
  try {
    await api('DELETE', `/channels/${li.dataset.channel}/messages/${li.dataset.id}`);
  } catch (err) {
    toast(err.message);
  }
}

// "Alice removed a message", or a moderator's "Alice removed Bea's message".
function removedText(by, byName, was, author, authorName) {
  const thing = was === 'file' ? 'file' : 'message';
  const who = by === S.clientId ? 'You' : byName;
  if (!author || author === by) return `${who} removed a ${thing}`;
  return `${who} removed ${author === S.clientId ? 'your' : `${authorName}'s`} ${thing}`;
}

// Messages that arrived while you were disconnected (they weren't pushed to you then).
async function catchUp() {
  for (const dm of S.dms.values()) {
    if (!dm.loaded || !dm.save || !dm.newestSeq) continue;
    try {
      const { messages } = await api('GET', `${convPath(dm.friendId)}/messages?after=${dm.newestSeq}`);
      for (const m of messages) onDmMessage(m);
    } catch {}
  }
}

// ----- Updates: reload into a new version of Rainlit -----
// The page is stamped with its version; after an update, the server says hello with the
// new one. Reload then, at a quiet moment: not during a call, and not while you're writing
// or sending something.

const MY_BUILD = (document.querySelector('meta[name="rainlit-build"]') || {}).content || '';

function onHello(msg) {
  trace('hello', { build: String(msg.build || '').slice(0, 12) });
  if (S.voice && S.voice.state === 'connected') {
    wsSend({ type: 'voice-join', channel: S.voice.channelId, muted: S.voice.muted || !S.voice.speak, deafened: S.voice.deafened, again: true, since: S.voice.joinedAt });
  }
  if (!msg.build || !MY_BUILD || msg.build === MY_BUILD) return;
  let tried = '';
  try { tried = sessionStorage.getItem('rainlit.reloadedFor') || ''; } catch {}
  if (tried === msg.build) return; // already reloaded once for this one; don't go round in circles
  if (S.updateTimer) return;
  const reloadIfQuiet = () => {
    const busy = S.inCall || S.startingCall || S.ringing || S.voice || S.editing || el.chatInput.value.trim() || S.uploads.size
      || (S.openDm && dmFor(S.openDm).pending.length) || document.querySelector('dialog[open]');
    if (busy) return;
    clearInterval(S.updateTimer);
    try {
      sessionStorage.setItem('rainlit.reloadedFor', msg.build);
      sessionStorage.setItem('rainlit.updated', '1');
    } catch {}
    location.reload();
  };
  S.updateTimer = setInterval(reloadIfQuiet, 5000);
  reloadIfQuiet();
}

// ----- Where the call's sound comes out (Android app) -----
// The speaker, the earpiece (held to your ear like a phone call), or a headset. The button
// in the call controls switches between whichever ones the phone has right now.

const ROUTES = ['speaker', 'earpiece', 'wired', 'bluetooth'];
const ROUTE_LABEL = { speaker: 'Speaker', earpiece: 'Phone', wired: 'Headset', bluetooth: 'Bluetooth' };
const ROUTE_ICON = { speaker: 'i-speaker', earpiece: 'i-phone', wired: 'i-headphones', bluetooth: 'i-headphones' };

function renderRoute(routes) {
  S.audioRoute = routes && routes.current ? routes : null;
  if (routes && typeof routes.phoneCancelsEcho === 'boolean') {
    const breaks = routes.phoneCancelsEcho ? 'no' : 'yes';
    if (store.get('boostBreaksEcho', 'no') !== breaks) {
      store.set('boostBreaksEcho', breaks);
      renderVolumeCap();
    }
  }
  // Only when there's somewhere to switch to (on some phones call sound goes wherever music does).
  el.routeBtn.hidden = !(ANDROID && S.inCall && S.audioRoute && S.audioRoute.available.length > 1);
  if (!S.audioRoute) return;
  const now = S.audioRoute.current;
  el.routeBtn.querySelector('use').setAttribute('href', `#${ROUTE_ICON[now] || 'i-speaker'}`);
  el.routeBtn.querySelector('.ctl-label').textContent = ROUTE_LABEL[now] || 'Sound';
  el.routeBtn.classList.toggle('lit', now === 'speaker');
  el.routeBtn.title = `Sound is coming out of: ${ROUTE_LABEL[now] || now}. Tap to switch.`;
}

async function nextRoute() {
  const r = S.audioRoute;
  if (!ANDROID || !r) return;
  const options = ROUTES.filter((x) => r.available.includes(x));
  const next = options[(options.indexOf(r.current) + 1) % options.length];
  if (!next || next === r.current) return;
  try {
    renderRoute(await ANDROID.setAudioRoute({ route: next }));
    playControlSound('route');
  } catch {}
}

// Signed out, there's no connection to the server to hear about updates, so coming back to
// the sign-in page asks the server which version is current, and reloads into a newer one.
async function checkForUpdateSignedOut() {
  if (!MY_BUILD || S.checkingUpdate) return;
  S.checkingUpdate = true;
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const live = (html.match(/name="rainlit-build" content="([^"]+)"/) || [])[1];
    if (live && live !== MY_BUILD && !S.me && !el.auth.contains(document.activeElement)) location.reload();
  } catch {}
  S.checkingUpdate = false;
}

// ----- "Alice is typing…" -----

const TYPING_EVERY_MS = 3000; // while you type, your friend is told this often
const TYPING_FOR_MS = 6000; // and it shows on their screen this long after the last time

function onTypingInput() {
  const key = S.openDm;
  if (!key || S.editing) return;
  if (!el.chatInput.value.trim()) return stopTyping();
  if (Date.now() - S.typingSentAt < TYPING_EVERY_MS && S.typingTo === key) return;
  S.typingSentAt = Date.now();
  S.typingTo = key;
  wsSend(typingNote(key, true));
}

const typingNote = (key, on) => (isChannelKey(key) ? { type: 'typing', channel: channelIdOf(key), on } : { type: 'typing', to: key, on });

// You sent it, cleared the box, or went elsewhere.
function stopTyping() {
  if (S.typingTo) wsSend(typingNote(S.typingTo, false));
  S.typingSentAt = 0;
  S.typingTo = '';
}

// Someone typing to you, or in one of your channels.
function onTyping({ from, channel, on }) {
  if (S.blocked && S.blocked.has(from)) return;
  const key = channel ? `ch:${channel}` : from;
  if (!convExists(key)) return;
  let who = S.typing.get(key);
  if (!who) S.typing.set(key, (who = new Map()));
  clearTimeout(who.get(from));
  if (on) {
    who.set(from, setTimeout(() => {
      who.delete(from);
      renderTyping();
    }, TYPING_FOR_MS));
  } else {
    who.delete(from);
  }
  renderTyping();
}

const typersIn = (key) => [...(S.typing.get(key) || new Map()).keys()];

function renderTyping() {
  const names = S.openDm ? typersIn(S.openDm).map(friendName) : [];
  if (names.length) {
    const dots = document.createElement('span');
    dots.className = 'typing-dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    const strong = (text) => {
      const b = document.createElement('strong');
      b.textContent = text;
      return b;
    };
    const words = names.length === 1 ? [strong(names[0]), ' is typing…']
      : names.length === 2 ? [strong(names[0]), ' and ', strong(names[1]), ' are typing…']
      : ['Several people are typing…'];
    el.typing.replaceChildren(dots, ...words);
  } else {
    el.typing.replaceChildren();
  }
  renderFriends();
}

// ----- Editing -----

// ----- Replying -----
// Reply to a message: a "Replying to…" bar sits above the message box, and what you send next
// carries a little quote of it. Click the quote to go to the message it's answering.

function canReply(li) {
  const c = li.dataset.channel && S.channels.get(li.dataset.channel);
  if (c && c.can && !c.can.send) return false;
  return ['text', 'file', 'gif'].includes(li.dataset.kind) && Boolean(li.dataset.author)
    && !['removed', 'pending', 'failed'].some((c) => li.classList.contains(c)) && !S.uploads.has(li.dataset.id);
}

function startReply(li) {
  closeMessageMenu();
  if (!li || !S.openDm || !canReply(li)) return;
  if (S.editing) stopEdit();
  const { name, text } = quoteOf(li);
  S.replying = { friendId: S.openDm, id: li.dataset.id };
  el.replyName.textContent = name;
  el.replySnippet.textContent = text;
  el.replyBar.hidden = false;
  el.chatInput.focus();
}

function stopReply() {
  if (!S.replying) return;
  S.replying = null;
  el.replyBar.hidden = true;
}

// The message you're replying to in this conversation, if you are.
function replyingTo(friendId) {
  return S.replying && S.replying.friendId === friendId ? S.replying.id : null;
}

// Who said a message, and a line of what it said.
function quoteOf(li) {
  const name = li.dataset.from === 'me' ? 'You' : friendName(li.dataset.author);
  const kind = li.dataset.kind;
  const fileName = kind === 'file' && li.querySelector('.file-name');
  const text = kind === 'gif' ? 'GIF' : fileName ? `📎 ${fileName.textContent}` : messageText(li);
  return { name, text: text.replace(/\s+/g, ' ').trim() };
}

// In a reply, the quote of what it's answering.
function replyQuote(r) {
  const q = document.createElement('button');
  q.type = 'button';
  q.className = 'reply-quote';
  q.dataset.for = r.id;
  q.title = 'Go to the message this is answering';
  q.snapshot = r;
  q.addEventListener('click', (e) => {
    e.stopPropagation();
    jumpToMessage(r.id);
  });
  fillQuote(q);
  return q;
}

// What a quote says: the original as it is on screen, or else as the server described it.
function fillQuote(q) {
  const target = document.querySelector(`.chat-log li[data-id="${CSS.escape(q.dataset.for)}"]`);
  const s = q.snapshot || {};
  let name = '';
  let text = '';
  if (target && !target.classList.contains('removed')) {
    ({ name, text } = quoteOf(target));
  } else if (target || s.kind === 'removed') {
    text = 'Original message was deleted';
  } else if (s.author) {
    name = s.author === S.clientId ? 'You' : friendName(s.author);
    text = s.kind === 'gif' ? 'GIF' : s.kind === 'file' ? `📎 ${s.fileName || 'a file'}` : String(s.text || '').replace(/\s+/g, ' ');
  } else {
    text = "Original message isn't available";
  }
  q.classList.toggle('gone', !name);
  const who = document.createElement('span');
  who.className = 'rq-name';
  who.textContent = name;
  const what = document.createElement('span');
  what.className = 'rq-text';
  what.textContent = text;
  q.replaceChildren(...(name ? [who] : []), what);
}

// An original was edited or removed: its quotes follow.
function refreshQuotes(id) {
  for (const q of document.querySelectorAll(`.reply-quote[data-for="${CSS.escape(id)}"]`)) fillQuote(q);
  if (S.replying && S.replying.id === id) {
    const li = document.querySelector(`.chat-log li[data-id="${CSS.escape(id)}"]`);
    if (!li || li.classList.contains('removed')) stopReply();
    else el.replySnippet.textContent = quoteOf(li).text;
  }
}

// Scrolls to a message (loading older ones if it's further up) and makes it glow for a moment.
async function jumpToMessage(id) {
  if (!S.openDm) return;
  const dm = dmFor(S.openDm);
  const find = () => dm.log.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  let li = find();
  for (let i = 0; !li && dm.more && i < 30; i++) {
    if (dm.loading) await new Promise((r) => setTimeout(r, 250));
    else await loadOlder(dm);
    li = find();
  }
  if (!li) return toast("That message isn't here any more.");
  li.scrollIntoView({ block: 'center', behavior: 'smooth' });
  li.classList.remove('flash');
  void li.offsetWidth; // (so it glows again if it just did)
  li.classList.add('flash');
  setTimeout(() => li.classList.remove('flash'), 1600);
}

function startEdit(li) {
  closeMessageMenu();
  if (!li || !li.querySelector('.msg-text') || !S.openDm) return;
  stopReply();
  S.editing = { id: li.dataset.id, friendId: S.openDm, draft: el.chatInput.value };
  el.editBar.hidden = false;
  setChatText(messageText(li));
  el.chatInput.focus();
  el.chatInput.setSelectionRange(el.chatInput.value.length, el.chatInput.value.length);
}

function stopEdit() {
  if (!S.editing) return;
  setChatText(S.editing.draft || '');
  S.editing = null;
  el.editBar.hidden = true;
}

async function saveEdit() {
  const editing = S.editing;
  const text = el.chatInput.value.trim();
  if (!text) return toast('A message needs something in it. To remove it, use Delete instead.');
  const li = dmFor(editing.friendId).log.querySelector(`li[data-id="${CSS.escape(editing.id)}"]`);
  if (li && messageText(li) === text) return stopEdit(); // nothing changed
  stopEdit();
  try {
    await api('PATCH', `${convPath(editing.friendId)}/messages/${editing.id}`, { text });
  } catch (err) {
    toast(err.message || "Couldn't save your edit.");
  }
}

// Your last message in this conversation that you could edit (the Up arrow edits it).
function lastEditable() {
  if (!S.openDm) return null;
  const mine = dmFor(S.openDm).log.querySelectorAll('li[data-from="me"][data-kind="text"]:not(.removed)');
  return mine.length ? mine[mine.length - 1] : null;
}

// "(edited)" goes at the end of the text, like a footnote.
function showEdited(li, text, editedAt, mentions = null) {
  const body = li.querySelector('.msg-text');
  if (!body) return;
  const c = li.dataset.channel && S.channels.get(li.dataset.channel);
  if (mentions) {
    body._everyone = Boolean(mentions.everyone);
    li.classList.toggle('mentioned', li.dataset.from === 'friend' && mentionsMe(mentions));
  }
  body.replaceChildren();
  body._text = text;
  appendLinked(body, text, c ? S.spaces.get(c.spaceId) : null, body._everyone);
  const tag = document.createElement('span');
  tag.className = 'msg-edited';
  tag.textContent = '(edited)';
  tag.title = `Edited ${new Date(editedAt).toLocaleString()}`;
  body.append(tag);
}

// A text message's words, without the "(edited)" note.
function messageText(li) {
  const body = li && li.querySelector('.msg-text');
  if (!body) return '';
  return [...body.childNodes].filter((n) => !(n.classList && n.classList.contains('msg-edited')))
    .map((n) => (n.dataset && n.dataset.raw !== undefined ? n.dataset.raw : n.textContent)).join('');
}

function onDmEdited({ dm: dmId, id, text, editedAt, mentions, everyone }) {
  const dm = S.dms.get(convOf(dmId));
  const li = dm && dm.log.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  if (li) showEdited(li, text, editedAt, dm.channelId ? { mentions, everyone } : null);
  refreshQuotes(id);
}

async function deleteMine(li) {
  const id = li.dataset.id;
  if (li.dataset.from !== 'me' || li.classList.contains('removed')) return;
  // Still uploading: just stop, and it's as if it was never sent.
  const upload = S.uploads.get(id);
  if (upload) {
    upload.abort();
    return li.remove();
  }
  // Sent straight to your friend during a call (saving off): tell them through the call.
  const t = S.transfers.get(id);
  if (t) {
    dropTransfer(t);
    S.deletedIds.add(id);
    wsSend({ type: 'delete', id });
    return showRemoved(li, 'You removed a file');
  }
  const dm = [...S.dms.values()].find((d) => d.log.contains(li));
  if (!dm) return;
  const what = li.classList.contains('file-msg') ? 'a file' : 'a message'; // before the server's own notice replaces it
  try {
    await api('DELETE', `${convPath(dm.friendId)}/messages/${id}`);
    showRemoved(li, `You removed ${what}`);
  } catch (err) {
    toast(err.message);
  }
}

// Your friend removed a file they'd sent you straight through the call.
function deleteTheirs(id, name) {
  const li = dmFor(S.callWith).log.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  if (!li || li.dataset.from !== 'friend' || li.classList.contains('removed')) return;
  const t = S.transfers.get(id);
  if (t) dropTransfer(t);
  showRemoved(li, `${name} removed a file`);
}

// Stop it if it's still on its way, and let go of the file on this device.
function dropTransfer(t) {
  if (ACTIVE.has(t.state)) cancelTransfer(t);
  t.state = 'cancelled'; // if the sender tries it again after a reconnect, it's refused
  for (const url of t.urls || []) URL.revokeObjectURL(url);
  t.urls = [];
  t.file = t.url = t.ui = null;
  if (el.lightbox.open && el.lightbox.dataset.id === t.id) el.lightbox.close();
}

function showRemoved(li, text) {
  li.className = 'sys removed';
  li.replaceChildren(text);
  delete li.dataset.from; // can't be removed twice
  // The next message was grouped under this one; it needs its own name and time now.
  if (li.nextElementSibling) li.nextElementSibling.classList.remove('cont');
}

// Your friend was away when you removed something. Tell them again now they're back.
function resendDeletes() {
  for (const id of S.deletedIds) wsSend({ type: 'delete', id });
}

// ---------------- Conversations ----------------
//
// Each friend has one conversation. Its messages live in their own list on the
// page, kept while you look at other conversations, and swapped in when you open it.

function dmFor(friendId) {
  let dm = S.dms.get(friendId);
  if (!dm) {
    const log = document.createElement('ol');
    log.className = 'chat-log';
    log.setAttribute('aria-label', 'Messages');
    dm = {
      friendId, log,
      channelId: isChannelKey(friendId) ? channelIdOf(friendId) : null,
      save: true, unread: 0, readAt: 0, lastAt: 0,
      loaded: false, loading: false, more: false, oldestSeq: 0,
      early: [], // unsaved messages that arrived before the history was loaded
      pending: [], // files picked but not sent yet: { id, file, name, type, size, url }
      firstDay: '', lastDay: '', // for the "Today" / "Yesterday" headings
      divider: null, // the "new messages" line: { el, count, seen }
    };
    log.addEventListener('scroll', () => { if (log.scrollTop < 120) loadOlder(dm); });
    // A name above messages opens that person's profile.
    log.addEventListener('click', (e) => {
      const li = e.target.closest('.msg-name') && !e.target.closest('time') && e.target.closest('li[data-author]');
      if (li) openMiniProfile(li.dataset.author);
    });
    S.dms.set(friendId, dm);
  }
  return dm;
}

// Conversations are DMs and spaces' channels, and they share everything: history, sending,
// replies, reactions, typing, unread. Each has a key: a DM's is your friend's id, a
// channel's is "ch:" and its id. The server knows a DM by the two people's ids ("a:b").
const isChannelKey = (key) => String(key).startsWith('ch:');
const channelIdOf = (key) => String(key).slice(3);
const convPath = (key) => (isChannelKey(key) ? `/channels/${channelIdOf(key)}` : `/dms/${key}`);

// The conversation a server id belongs to: a channel of yours, or your friend's DM.
function convOf(dmId) {
  if (S.channels.has(dmId)) return `ch:${dmId}`;
  return String(dmId).split(':').find((id) => id !== S.clientId) || '';
}

// Anyone's name: a friend's, or someone's from one of your spaces.
function friendName(id) {
  const f = S.friends.get(id) || S.people.get(id);
  return f ? f.displayName : 'Someone';
}

// Whether a conversation (still) exists for you.
const convExists = (key) => (isChannelKey(key) ? S.channels.has(channelIdOf(key)) : S.friends.has(key));

// ----- The message box -----
// It grows with what you write (up to a point, then scrolls). On a computer, Enter sends and
// Shift+Enter starts a new line; on a phone, Enter starts a new line and Send sends, like Discord.

const newLineOnEnter = () => Boolean(ANDROID) || matchMedia('(hover: none) and (pointer: coarse)').matches;

function fitChatInput() {
  const box = el.chatInput;
  const log = S.openDm && dmFor(S.openDm).log;
  const stick = log && nearBottom(log); // (at the bottom of the conversation: stay there as it grows)
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
  if (stick) scrollChat(log);
}

function setChatText(text) {
  el.chatInput.value = text;
  fitChatInput();
}

function nearBottom(log) {
  return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
}

function scrollChat(log = el.chatLog) {
  log.scrollTop = log.scrollHeight;
}

async function openDm(friendId) {
  if (!convExists(friendId)) return;
  const dm = dmFor(friendId);
  // The sidebar follows: Home for a DM, the space for one of its channels.
  S.view = dm.channelId && !groupOfChannel(dm.channelId) ? S.channels.get(dm.channelId).spaceId : 'home';
  if (dm.channelId && S.view !== 'home') rememberChannel(dm.channelId);
  closeGifPanel();
  if (S.editing && S.editing.friendId !== friendId) stopEdit();
  if (S.replying && S.replying.friendId !== friendId) stopReply();
  if (S.typingTo && S.typingTo !== friendId) stopTyping();
  S.openDm = friendId;
  el.home.hidden = true;
  el.voiceView.hidden = true;
  el.dm.hidden = false;
  el.app.classList.add('in-dm');
  if (el.chatLog !== dm.log) {
    el.chatLog.replaceWith(dm.log);
    el.chatLog = dm.log;
  }
  renderCallPlacement();
  renderFriends();
  renderTray();
  renderTyping();
  if (!dm.loaded) await loadDmHistory(dm);
  if (S.openDm !== friendId) return;
  markDmSeen(dm);
  if (matchMedia('(pointer: fine)').matches) el.chatInput.focus();
}

// Phones: back to the friends list. (A call carries on.)
function closeDm() {
  setStageFull(false);
  closeGifPanel();
  closeMessageMenu();
  stopEdit();
  stopReply();
  stopTyping();
  S.openDm = '';
  el.dm.hidden = true;
  el.home.hidden = false;
  el.app.classList.remove('in-dm');
  renderMemberPanel();
  renderFriends();
}

function renderDmHead() {
  renderMemberPanel();
  if (isChannelKey(S.openDm)) {
    renderChannelHead();
    return renderComposer();
  }
  renderComposer();
  const f = S.friends.get(S.openDm);
  if (!f) return;
  const dm = dmFor(f.id);
  el.dmFace.classList.remove('channel-face', 'group-face');
  el.dmFace.style.removeProperty('--face-bg');
  el.dmCallBtn.classList.remove('live');
  el.dmSave.hidden = false;
  el.dmWho.title = 'See their profile';
  el.dmBack.setAttribute('aria-label', 'Back to friends');
  el.dmBack.title = 'Back to friends';
  renderFace(el.dmFace, f, f.presence);
  el.dmName.textContent = f.displayName;
  el.dmSub.textContent = f.statusText || PRESENCE_LABEL[f.presence];
  if (!el.dmSave.classList.contains('confirm')) {
    el.dmSave.classList.toggle('on', dm.save);
    el.dmSave.textContent = dm.save ? 'Saving on' : 'Saving off';
    el.dmSave.title = dm.save
      ? 'Messages and files here are kept. Click to stop saving.'
      : "Nothing new here is kept. Click to start saving.";
  }
  el.dmNotice.hidden = dm.save;
  el.dmNotice.textContent = `Saving is off. New messages aren't kept, and only reach ${f.displayName} while they have Rainlit open. Files can only be sent during a call.`;
  const here = S.inCall && S.callWith === f.id;
  el.dmCallBtn.hidden = here;
  el.dmCallBtn.disabled = S.inCall && !here;
  el.dmCallBtn.title = el.dmCallBtn.disabled ? 'Leave your current call first' : `Call ${f.displayName}`;
  el.chatInput.placeholder = `Message ${f.displayName}`;
}

// The call shows at the top of the conversation it's with. Anywhere else, a bar leads back to it.
function renderCallPlacement() {
  const here = S.inCall && S.callWith === S.openDm;
  el.call.hidden = !here;
  el.callElsewhere.hidden = !S.inCall || here;
  if (S.inCall && !here) el.callElsewhereText.textContent = `You're in a call with ${friendName(S.callWith)}.`;
  renderDmHead();
}

let saveConfirmTimer = null;

async function onSaveToggle() {
  const dm = dmFor(S.openDm);
  // Turning saving off asks first; turning it on doesn't.
  if (dm.save && !el.dmSave.classList.contains('confirm')) {
    el.dmSave.classList.add('confirm');
    el.dmSave.textContent = 'Stop saving?';
    clearTimeout(saveConfirmTimer);
    saveConfirmTimer = setTimeout(() => { el.dmSave.classList.remove('confirm'); renderDmHead(); }, 3000);
    return;
  }
  clearTimeout(saveConfirmTimer);
  el.dmSave.classList.remove('confirm');
  try {
    const { save } = await api('PATCH', `/dms/${dm.friendId}`, { save: !dm.save });
    dm.save = save;
  } catch (err) {
    toast(err.message);
  }
  renderDmHead();
}

// ----- History -----

function dayKey(ts) {
  return new Date(ts).toDateString();
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function dayLine(ts) {
  const li = document.createElement('li');
  li.className = 'day';
  li.setAttribute('role', 'separator');
  li.textContent = dayLabel(ts);
  return li;
}

function startLine(dm) {
  const li = document.createElement('li');
  li.className = 'sys dm-start';
  const channel = dm.channelId && S.channels.get(dm.channelId);
  const group = channel && groupOfChannel(channel.id);
  li.textContent = group ? `This is the beginning of your group${group.name ? `, ${group.name}` : ` with ${groupTitle(group)}`}.`
    : channel ? `This is the beginning of #${channel.name}.` : `This is the beginning of your conversation with ${friendName(dm.friendId)}.`;
  return li;
}

async function loadDmHistory(dm) {
  if (dm.loading) return;
  dm.loading = true;
  try {
    const page = await api('GET', `${convPath(dm.friendId)}/messages`);
    dm.save = page.save;
    dm.readAt = page.readAt;
    // Anything already showing (a file being sent, messages that just arrived) goes back after the history.
    const live = [...dm.log.children].filter((li) => li.dataset.id);
    dm.log.replaceChildren();
    dm.firstDay = dm.lastDay = '';
    dm.divider = null;
    dm.more = page.more;
    dm.oldestSeq = page.messages.length ? page.messages[0].seq : 0;
    if (!dm.more) dm.log.append(startLine(dm));
    for (const m of [...page.messages, ...dm.early]) appendMessage(dm, m);
    for (const li of live) if (!dm.log.querySelector(`li[data-id="${CSS.escape(li.dataset.id)}"]`)) appendItem(dm, li, Number(li.dataset.at) || Date.now());
    dm.early = [];
    dm.loaded = true;
    placeUnreadLine(dm);
    regroup(dm.log);
    renderDmHead();
  } catch (err) {
    toast(err.message);
  } finally {
    dm.loading = false;
  }
}

// Scrolled near the top: fetch the next page of older messages, keeping your place.
async function loadOlder(dm) {
  if (!dm.loaded || !dm.more || dm.loading) return;
  dm.loading = true;
  const log = dm.log;
  const heightBefore = log.scrollHeight;
  try {
    const page = await api('GET', `${convPath(dm.friendId)}/messages?before=${dm.oldestSeq}`);
    const frag = document.createDocumentFragment();
    let day = '';
    for (const m of page.messages) {
      if (dayKey(m.at) !== day) {
        day = dayKey(m.at);
        frag.append(dayLine(m.at));
      }
      const li = renderMessage(m);
      li.dataset.at = String(m.at);
      frag.append(li);
    }
    // The page ends on the same day the list started on: that day only needs one heading.
    if (day && day === dm.firstDay) log.querySelector('.day')?.remove();
    if (page.messages.length) {
      dm.firstDay = dayKey(page.messages[0].at);
      dm.oldestSeq = page.messages[0].seq;
    }
    dm.more = page.more;
    if (!dm.more) frag.prepend(startLine(dm));
    log.prepend(frag);
    regroup(log);
    log.scrollTop += log.scrollHeight - heightBefore;
  } catch {} finally {
    dm.loading = false;
  }
}

// Adds something to the end of a conversation, with a day heading if it's a new day.
function appendItem(dm, li, at) {
  if (dayKey(at) !== dm.lastDay) {
    dm.lastDay = dayKey(at);
    if (!dm.firstDay) dm.firstDay = dm.lastDay;
    dm.log.append(dayLine(at));
  }
  li.dataset.at = String(at);
  if (continues(dm.log.lastElementChild, li)) li.classList.add('cont');
  dm.log.append(li);
}

// Adds a message, or updates it if it's already there (like one you just sent,
// confirmed by the server). Returns the new item, or null if it was an update.
function appendMessage(dm, m) {
  if (m.seq && m.seq > (dm.newestSeq || 0)) dm.newestSeq = m.seq;
  const old = m.id && dm.log.querySelector(`li[data-id="${CSS.escape(m.id)}"]`);
  const li = renderMessage(m);
  if (old) {
    li.dataset.at = old.dataset.at;
    li.classList.toggle('cont', old.classList.contains('cont'));
    old.replaceWith(li);
    return null;
  }
  appendItem(dm, li, m.at);
  return li;
}

function messageHead(who, at) {
  const head = document.createElement('span');
  head.className = 'msg-name';
  head.textContent = who;
  const time = document.createElement('time');
  time.textContent = formatTime(at);
  time.title = new Date(at).toLocaleString();
  head.append(time);
  return head;
}

function sysLine(text, at, extraClass = '') {
  const li = document.createElement('li');
  li.className = `sys ${extraClass}`.trim();
  const time = document.createElement('time');
  time.textContent = formatTime(at);
  li.append(time, text);
  return li;
}

// "Bea started a call", "Call ended after 12 min" or "Bea missed your call", with a phone icon.
function callLine(m) {
  const meta = m.meta || {};
  const missed = Boolean(meta.missed);
  const text = meta.started ? (m.author === S.clientId ? 'You started a call' : m.author ? `${friendName(m.author)} started a call` : 'Call started')
    : !missed ? `Call ended after ${fmtLong(meta.durationMs || 0)}`
    : m.author === S.clientId ? `${friendName(convOf(m.dm))} missed your call`
    : `You missed a call from ${friendName(m.author)}`;
  const li = sysLine('', m.at, `call-note${missed ? ' missed' : ''}`);
  li.replaceChildren(li.firstChild); // just the time
  li.insertAdjacentHTML('beforeend', '<svg class="icon"><use href="#i-phone"/></svg>');
  li.append(text);
  return li;
}

// One message, as it appears in the conversation.
function renderMessage(m) {
  const mine = m.author === S.clientId;
  const who = mine ? 'You' : friendName(m.author);
  let li;
  const inChannel = S.channels.get(m.dm);
  if (m.kind === 'text') {
    li = document.createElement('li');
    const body = document.createElement('div');
    body.className = 'msg-text';
    body._text = m.text;
    body._everyone = Boolean(m.everyone);
    appendLinked(body, m.text, inChannel ? S.spaces.get(inChannel.spaceId) : null, body._everyone);
    li.append(messageHead(who, m.at), body);
  } else if (m.kind === 'file') {
    li = savedFileItem(m, who);
  } else if (m.kind === 'removed') {
    const by = (m.meta && m.meta.by) || m.author;
    li = sysLine(removedText(by, friendName(by), m.meta && m.meta.was, m.author, friendName(m.author)), m.at, 'removed');
  } else if (m.kind === 'saving') {
    li = sysLine(m.meta && m.meta.on
      ? `${who} turned saving on. New messages and files will be kept.`
      : `${who} turned saving off. New messages won't be kept.`, m.at);
  } else if (m.kind === 'gif') {
    li = document.createElement('li');
    li.append(messageHead(who, m.at), gifElement(m.meta || {}));
  } else if (m.kind === 'call') {
    li = callLine(m);
  } else if (m.kind === 'group') {
    li = sysLine(groupNoteText(m), m.at);
  } else {
    li = sysLine('', m.at);
  }
  li.dataset.id = m.id;
  if (inChannel) li.dataset.channel = inChannel.id;
  li.dataset.from = mine ? 'me' : m.author ? 'friend' : 'system';
  li.dataset.kind = m.kind;
  li.dataset.saved = m.seq ? '1' : '';
  if (m.kind === 'gif' && m.meta && m.meta.url) li.dataset.copy = m.meta.url;
  if (m.reactions && m.reactions.length) renderReactions(li, m.reactions);
  if (m.kind === 'text' && m.editedAt) showEdited(li, m.text, m.editedAt);
  if (m.replyTo && ['text', 'file', 'gif'].includes(m.kind)) {
    li.dataset.replyTo = m.replyTo.id;
    li.prepend(replyQuote(m.replyTo));
  }
  const channel = inChannel;
  if (channel) {
    if (!mine && mentionsMe(m)) li.classList.add('mentioned');
    const head = li.querySelector(':scope > .msg-name');
    if (head) head.style.color = memberColor(S.spaces.get(channel.spaceId), m.author);
  }
  if (['text', 'file', 'gif'].includes(m.kind)) {
    li.dataset.author = m.author;
    addMessageMenu(li);
    if (channel) markBlocked(li);
  }
  return li;
}

// Someone you've blocked, in a space you share: their messages fold away, and open with a tap.
function markBlocked(li) {
  // (Notes like "Alice removed Cleo's message" stay as they are.)
  const blocked = Boolean(li.dataset.channel && li.dataset.author && !li.classList.contains('sys') && S.blocked && S.blocked.has(li.dataset.author));
  li.classList.toggle('blocked-msg', blocked);
  let note = li.querySelector(':scope > .blocked-note');
  if (blocked && !note) {
    note = document.createElement('button');
    note.type = 'button';
    note.className = 'blocked-note';
    note.textContent = 'Blocked message';
    note.addEventListener('click', () => li.classList.toggle('shown'));
    li.prepend(note);
  } else if (!blocked && note) {
    note.remove();
    li.classList.remove('shown');
  }
}

function applyBlocks() {
  for (const dm of S.dms.values()) {
    if (dm.channelId) for (const li of dm.log.querySelectorAll('li[data-author]')) markBlocked(li);
  }
}

// Messages from the same person within a few minutes of each other are grouped
// under one name and time, like Discord. Anything in between (a day heading, the
// "new messages" line, a note) starts a new group.
const GROUP_MS = 7 * 60_000;

function continues(prev, li) {
  return Boolean(prev && li.dataset.author && prev.dataset.author === li.dataset.author
    && !prev.classList.contains('sys') && !li.dataset.replyTo
    && Number(li.dataset.at) - Number(prev.dataset.at) < GROUP_MS);
}

function regroup(log) {
  let prev = null;
  for (const li of log.children) {
    li.classList.toggle('cont', continues(prev, li));
    prev = li;
  }
}

// ----- Sending -----

// Sends a message. If the server's briefly away (restarting for an update, or a blip in the
// connection), it keeps quietly trying for a minute and a half. Sending the same one twice is
// fine: the server knows it by its id.
async function postMessage(friendId, body) {
  const giveUpAt = Date.now() + 90_000;
  for (let wait = 1500; ; wait = Math.min(wait * 1.5, 8000)) {
    try {
      return await api('POST', `${convPath(friendId)}/messages`, body);
    } catch (err) {
      const temporary = !err.status || err.status >= 500;
      if (!temporary || Date.now() + wait > giveUpAt) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function markSendFailed(li, err, retrySend) {
  li.classList.remove('pending');
  li.classList.add('failed');
  const note = document.createElement('span');
  note.className = 'send-failed';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => {
    li.remove();
    retrySend();
  });
  note.append(`Not sent. ${err.message} `, retry);
  li.append(note);
}

async function sendText(friendId, text, replyTo = null) {
  const dm = dmFor(friendId);
  const id = randomId();
  const li = appendMessage(dm, { id, dm: '', author: S.clientId, kind: 'text', text, replyTo: replyTo && { id: replyTo }, at: Date.now() });
  li.classList.add('pending');
  clearNewDivider(dm);
  scrollChat(dm.log);
  try {
    const { message } = await postMessage(friendId, { id, text, replyTo });
    appendMessage(dm, message);
  } catch (err) {
    markSendFailed(li, err, () => sendText(friendId, text, replyTo));
  }
}

// ----- GIFs (from KLIPY) -----
//
// KLIPY's rules: searches go straight from your browser to KLIPY (not through our
// server), GIFs load from KLIPY's own links, and results keep KLIPY's order.

const gifs = { q: '', page: 0, more: false, loading: false, token: 0, trending: null, timer: null };
const KLIPY_LINK = /^https:\/\/static\d*\.klipy\.com\//;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function klipyUrl(path, params = {}) {
  const u = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(S.klipyKey)}/gifs/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) u.searchParams.set(k, v);
  return u;
}

// "en-US" -> "us", so KLIPY can suggest GIFs for where you are.
function klipyLocale() {
  return ((navigator.language || 'en-US').split('-')[1] || 'us').toLowerCase();
}

// The sizes and formats we use from one of KLIPY's results.
function gifSizes(item) {
  const f = item.file || {};
  const small = f.sm || f.xs || f.md || {};
  const main = f.md || f.hd || f.sm || {};
  const shape = main.mp4 || main.webp || main.gif || {};
  return {
    thumb: small.webp || small.gif || {},
    send: {
      slug: item.slug,
      title: item.title || '',
      mp4: main.mp4 && main.mp4.url,
      img: (main.webp || main.gif || {}).url,
      poster: main.jpg && main.jpg.url,
      width: shape.width,
      height: shape.height,
    },
  };
}

function openGifPanel() {
  el.gifPanel.hidden = false;
  el.gifBtn.setAttribute('aria-expanded', 'true');
  el.gifSearch.value = '';
  loadGifs('', true);
  el.gifSearch.focus();
}

function closeGifPanel() {
  if (el.gifPanel.hidden) return;
  el.gifPanel.hidden = true;
  el.gifBtn.setAttribute('aria-expanded', 'false');
  clearTimeout(gifs.timer);
}

// Shows trending GIFs (no search) or search results, one page at a time as you scroll.
async function loadGifs(q, fresh) {
  if (fresh) {
    gifs.q = q;
    gifs.page = 0;
    gifs.more = true;
    gifs.loading = false; // anything still loading belongs to the old search
    gifs.token++;
    el.gifCols.replaceChildren();
    el.gifGrid.scrollTop = 0;
  }
  if (gifs.loading || !gifs.more) return;
  const token = gifs.token;
  const page = gifs.page + 1;
  gifs.loading = true;
  el.gifStatus.textContent = 'Loading';
  try {
    let data;
    // The first page of trending is kept for a few minutes, since every open of the picker shows it.
    if (!q && page === 1 && gifs.trending && Date.now() - gifs.trending.at < 5 * 60_000) {
      data = gifs.trending.data;
    } else {
      const res = await fetch(klipyUrl(q ? 'search' : 'trending', {
        page, per_page: 24, q, customer_id: S.clientId, locale: klipyLocale(), content_filter: 'medium',
      }));
      data = await res.json();
      if (!res.ok || !data.result) throw new Error('klipy');
      if (!q && page === 1) gifs.trending = { at: Date.now(), data };
    }
    if (token !== gifs.token) return;
    gifs.page = page;
    gifs.more = Boolean(data.data.has_next);
    for (const item of data.data.data) el.gifCols.append(gifTile(item));
    el.gifStatus.textContent = el.gifCols.children.length ? '' : q ? `No GIFs found for "${q}".` : 'No GIFs right now.';
  } catch {
    if (token === gifs.token) el.gifStatus.textContent = "Couldn't reach KLIPY. Try again in a bit.";
  } finally {
    if (token === gifs.token) gifs.loading = false;
  }
}

function gifTile(item) {
  const { thumb } = gifSizes(item);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gif-item';
  btn.title = item.title || 'GIF';
  const img = document.createElement('img');
  img.alt = item.title || 'GIF';
  img.loading = 'lazy';
  if (thumb.width && thumb.height) img.style.aspectRatio = `${thumb.width} / ${thumb.height}`;
  if (KLIPY_LINK.test(thumb.url || '')) img.src = thumb.url;
  btn.append(img);
  btn.addEventListener('click', () => {
    const q = gifs.q;
    closeGifPanel();
    sendGif(S.openDm, item, q, replyingTo(S.openDm));
    stopReply();
  });
  return btn;
}

async function sendGif(friendId, item, q, replyTo = null) {
  const gif = gifSizes(item).send;
  const dm = dmFor(friendId);
  const id = randomId();
  const li = appendMessage(dm, { id, dm: '', author: S.clientId, kind: 'gif', meta: gif, replyTo: replyTo && { id: replyTo }, at: Date.now() });
  li.classList.add('pending');
  clearNewDivider(dm);
  scrollChat(dm.log);
  // Tell KLIPY it was shared: it tunes suggestions, and KLIPY asks for it. No personal details go with it.
  fetch(klipyUrl(`share/${encodeURIComponent(item.slug)}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: S.clientId, q: q || '' }),
  }).catch(() => {});
  try {
    const { message } = await postMessage(friendId, { id, gif, replyTo });
    appendMessage(dm, message);
  } catch (err) {
    markSendFailed(li, err, () => sendGif(friendId, item, q, replyTo));
  }
}

// GIFs play (muted, looping) only while they're on screen, and not at all if your
// device asks for less motion; then a click plays or pauses one.
const gifWatcher = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (reducedMotion.matches) continue;
    if (e.isIntersecting) e.target.play().catch(() => {});
    else e.target.pause();
  }
});

function gifElement(g) {
  const box = document.createElement('div');
  box.className = 'gif-msg';
  let media;
  if (KLIPY_LINK.test(g.mp4 || '')) {
    media = document.createElement('video');
    media.muted = true;
    media.loop = true;
    media.playsInline = true;
    media.preload = 'none';
    if (KLIPY_LINK.test(g.poster || '')) media.poster = g.poster;
    media.src = g.mp4;
    media.addEventListener('click', () => (media.paused ? media.play().catch(() => {}) : media.pause()));
    gifWatcher.observe(media);
  } else if (KLIPY_LINK.test(g.img || '')) {
    media = document.createElement('img');
    media.alt = g.title || 'GIF';
    media.src = g.img;
  } else {
    box.textContent = 'GIF unavailable';
    return box;
  }
  media.title = g.title || 'GIF';
  if (g.width && g.height) media.style.aspectRatio = `${g.width} / ${g.height}`;
  box.append(media);
  return box;
}

// ----- Arriving -----

function onDmMessage(m) {
  const friendId = convOf(m.dm);
  if (!convExists(friendId)) return;
  const dm = dmFor(friendId);
  dm.lastAt = Math.max(dm.lastAt, m.at);
  const fromThem = Boolean(m.author) && m.author !== S.clientId && ['text', 'file', 'gif'].includes(m.kind);
  if (fromThem && typersIn(friendId).includes(m.author)) onTyping({ from: m.author, channel: dm.channelId, on: false });
  // Someone new in a space: get their name (and fix it on anything already showing).
  if (fromThem && dm.channelId && !S.friends.has(m.author) && !S.people.has(m.author)) {
    loadMembers(S.channels.get(dm.channelId).spaceId).then(() => refreshNames(dm, m.author));
  }
  if (fromThem && dm.channelId) notifyChannel(dm, m);
  if (fromThem && !dm.channelId && (DESKTOP || ANDROID)) {
    const body = m.kind === 'text' ? m.text : m.kind === 'gif' ? 'Sent a GIF' : `Sent a file${m.file && m.file.name ? `: ${m.file.name}` : ''}`;
    appNotify({ title: friendName(friendId), body }); // only shows if you're not looking at Rainlit
  }
  if (!dm.loaded) {
    // Saved ones come with the history when it's opened; unsaved ones would be lost, so hold on to them.
    // So would a saved one that arrives while the history's on its way: it may have been asked for
    // just before this was saved. (If it's in the history after all, it's only shown once.)
    if (!m.saved || dm.loading) dm.early.push(m);
    if (fromThem) {
      dm.unread++;
      if (dm.channelId && mentionsMe(m)) dm.mentions = (dm.mentions || 0) + 1;
      renderFriends();
      updateTitle();
      if (S.sounds && !dm.channelId) playChime();
    }
    return;
  }
  const stick = nearBottom(dm.log) || m.author === S.clientId;
  const li = appendMessage(dm, m);
  if (stick && S.openDm === friendId) scrollChat(dm.log);
  if (li && fromThem) notifyIncoming(dm, li);
}

function onDmRemoved({ dm: dmId, id, by, name, was, author, authorName }) {
  const dm = S.dms.get(convOf(dmId));
  if (!dm) return;
  if (el.lightbox.open && el.lightbox.dataset.id === id) el.lightbox.close();
  const upload = S.uploads.get(id);
  if (upload) upload.abort();
  const li = dm.log.querySelector(`li[data-id="${CSS.escape(id)}"]`);
  if (li) showRemoved(li, removedText(by, name, was, author, authorName));
  refreshQuotes(id);
}

// Messages taken out altogether (a banned spammer's, say).
function onDmGone({ dm: dmId, ids }) {
  const dm = S.dms.get(convOf(dmId));
  if (!dm) return;
  for (const id of ids) {
    const li = dm.log.querySelector(`li[data-id="${CSS.escape(id)}"]`);
    if (li) li.remove();
  }
  regroup(dm.log);
  for (const id of ids) refreshQuotes(id);
}

function onDmSaving({ dm: dmId, save }) {
  const dm = S.dms.get(convOf(dmId)) || dmFor(convOf(dmId));
  dm.save = save;
  if (S.openDm === dm.friendId) renderDmHead();
}

// You read it on another device.
function onDmRead({ dm: dmId }) {
  const dm = S.dms.get(convOf(dmId));
  if (!dm || !(dm.unread || dm.mentions)) return;
  dm.unread = 0;
  dm.mentions = 0;
  renderFriends();
  updateTitle();
}

// A message in a channel: a sound and a notification if it mentions you, or if you asked to
// hear about everything in that space (then at most one every 10 seconds per channel).
const channelNotified = new Map();
function notifyChannel(dm, m) {
  const c = S.channels.get(dm.channelId);
  const space = c && S.spaces.get(c.spaceId);
  if (!space || (S.blocked && S.blocked.has(m.author))) return;
  const mentioned = mentionsMe(m);
  if (space.notify === 'none' || (space.notify !== 'all' && !mentioned)) return;
  if (S.openDm === dm.friendId && !lookingAway()) return;
  if (!mentioned && Date.now() - (channelNotified.get(c.id) || 0) < 10_000) return;
  channelNotified.set(c.id, Date.now());
  if (S.sounds && !appAsleep()) playChime();
  if (DESKTOP || ANDROID) {
    const body = m.kind === 'text' ? m.text : m.kind === 'gif' ? 'Sent a GIF' : `Sent a file${m.file && m.file.name ? `: ${m.file.name}` : ''}`;
    const who = friendName(m.author);
    const where = isGroupSpace(space) ? groupTitle(space) : `#${c.name}`;
    appNotify({ title: mentioned ? `${who} mentioned you in ${where}` : `${who} in ${where}`, body });
  }
}

// Something new from your friend. If you're not looking at their conversation (it's
// not open, or you're in another tab or app), count it as unread and mark where the
// new messages start. The chime only plays when their conversation isn't open.
function notifyIncoming(dm, li) {
  const open = S.openDm === dm.friendId;
  if (open && !lookingAway()) return markRead(dm);
  markNew(dm, li);
  dm.unread++;
  if (li.classList.contains('mentioned')) dm.mentions = (dm.mentions || 0) + 1;
  renderFriends();
  updateTitle();
  if (S.sounds && !dm.channelId && (!open || lookingAway())) playChime();
}

let readTimers = new Map();

// Tells the server (and your other devices) you've read this conversation, at most once a second.
function markRead(dm) {
  if (dm.unread || dm.mentions) {
    dm.unread = 0;
    dm.mentions = 0;
    renderFriends();
    updateTitle();
  }
  if (readTimers.has(dm.friendId)) return;
  readTimers.set(dm.friendId, setTimeout(() => {
    readTimers.delete(dm.friendId);
    api('POST', `${convPath(dm.friendId)}/read`, {}).catch(() => {});
  }, 1000));
}

// ----- The "new messages" line -----

// The yellow "3 new messages" line above the first one you haven't seen. It stays
// put after you look, until you reply, or until more arrive after you've looked.
function markNew(dm, li) {
  if (dm.divider && dm.divider.seen) clearNewDivider(dm);
  if (!dm.divider) {
    const line = document.createElement('li');
    line.className = 'new-divider';
    line.setAttribute('role', 'separator');
    li.before(line);
    li.classList.remove('cont');
    dm.divider = { el: line, count: 0, seen: false };
  }
  const n = ++dm.divider.count;
  dm.divider.el.textContent = `${n} new message${n === 1 ? '' : 's'}`;
}

function clearNewDivider(dm) {
  if (dm.divider) dm.divider.el.remove();
  dm.divider = null;
}

// After loading the history: the line goes above the first message that arrived since you last read.
function placeUnreadLine(dm) {
  if (!dm.unread) return;
  const first = [...dm.log.querySelectorAll('li[data-from="friend"]')]
    .find((li) => Number(li.dataset.at) > dm.readAt && !li.classList.contains('sys'));
  if (!first) return;
  markNew(dm, first);
  dm.divider.count = dm.unread;
  dm.divider.el.textContent = `${dm.unread} new message${dm.unread === 1 ? '' : 's'}`;
}

// You're looking at the conversation now.
function markDmSeen(dm) {
  markRead(dm);
  scrollChat(dm.log);
  if (!dm.divider || dm.divider.seen) return;
  dm.divider.seen = true;
  // Show the newest messages, but not so far down that the "new" line is out of sight.
  const top = dm.divider.el.offsetTop - dm.log.offsetTop - 8;
  if (top < dm.log.scrollTop) dm.log.scrollTop = top;
}

// Browsers only let a page make sound after you've clicked or typed in it, so the
// sound player is made on your first click.
function unlockSounds() {
  if (S.soundCtx) return;
  try {
    S.soundCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (S.devices.speaker) routeChimes();
  } catch {}
}

// One soft bell note. A quiet overtone on top makes it ring like a bell instead of beep.
function bellNote(ctx, freq, t, loudness = 1) {
  for (const [mult, level, length] of [[1, 0.16, 0.9], [2.76, 0.035, 0.35]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq * mult;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level * loudness, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
}

// Sounds are made on the spot, so there's no sound file to load. They're skipped
// if sound isn't allowed yet (it would play late, all at once).
function soundReady() {
  // (In the Android app's background, the phone's own notifications make the sounds.)
  return Boolean(S.soundCtx && S.soundCtx.state === 'running') && !appAsleep();
}

// A soft two-note doorbell for new messages.
function playChime() {
  if (!soundReady() || performance.now() - S.lastChime < 1500) return; // not twice in a row
  S.lastChime = performance.now();
  const start = S.soundCtx.currentTime + 0.02;
  bellNote(S.soundCtx, 659.25, start); // E5
  bellNote(S.soundCtx, 523.25, start + 0.17); // C5
}

// The ringing tune: C, E, G, E, rising and settling. Your friend hears it when you
// call; you hear it (a little quieter) while you wait for them to pick up.
const RING_TUNE = [[523.25, 0], [659.25, 0.2], [783.99, 0.4], [659.25, 0.72]];
const RING_EVERY_MS = 3000;

function playRingtone(loudness = 1) {
  if (!soundReady()) return;
  const start = S.soundCtx.currentTime + 0.02;
  for (const [freq, at] of RING_TUNE) bellNote(S.soundCtx, freq, start + at, loudness);
}

// In Settings: which Rainlit app you're using, or (in a browser) where to get one.
function renderAppNote() {
  const offer = (href, name, why) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = `Get Rainlit for ${name}`;
    el.appNote.replaceChildren(link, `: ${why}`);
  };
  if (DESKTOP) el.appNote.textContent = `Rainlit for Windows ${DESKTOP.version}`;
  else if (ANDROID) {
    const a = S.androidApp || {};
    el.appNote.textContent = `Rainlit for Android ${a.mine || ''}`.trim();
    if (a.outdated) {
      const link = document.createElement('a');
      link.href = '/android';
      link.textContent = `get ${a.latest}`;
      el.appNote.append(' · A newer version is out: ', link);
    }
  }
  else if (/Android/.test(navigator.userAgent)) offer('/android', 'Android', 'calls keep going when you switch apps or turn the screen off.');
  else if (/Windows/.test(navigator.userAgent)) offer('/download', 'Windows', 'push to talk that works in games, and screen sharing with sound.');
  else return;
  el.appNote.hidden = false;
}

// During a call: what Android made of "turn other apps down".
const DUCK_STATES = {
  on: 'Right now: other apps are turned down.',
  denied: "Right now: Android didn't allow it.",
  taken: 'Right now: another app took over the sound. Turning it down again…',
  'gave-up': 'Right now: an app keeps taking full volume back, so it’s left as it is.',
};

async function renderDuckStatus() {
  el.duckStatus.hidden = true;
  if (!ANDROID || !S.inCall || !el.duckInput.checked) return;
  try {
    const { state } = await ANDROID.duckStatus();
    el.duckStatus.textContent = DUCK_STATES[state] || '';
    el.duckStatus.hidden = !DUCK_STATES[state];
  } catch {} // (an older app)
}

// The Android app's version, and whether a newer one is out (older apps can't say theirs,
// which means they're older than 1.3.6). Says so once for each new version.
async function checkAndroidApp() {
  if (!ANDROID) return;
  let mine = '';
  let latest = '';
  try { mine = (await ANDROID.appInfo()).version || ''; } catch {}
  try { latest = (await api('GET', '/android-latest')).version || ''; } catch {}
  S.androidApp = { mine, latest, outdated: Boolean(latest && (!mine || newerVersion(latest, mine))) };
  renderAppNote();
  if (S.androidApp.outdated && store.get('updateToldFor', '') !== latest) {
    store.set('updateToldFor', latest);
    toast(`Rainlit ${latest} for Android is out. Get it from Settings (it installs over this one).`, 10_000);
  }
}

function newerVersion(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

// ---------------- Other Rainlit servers ----------------
// Anyone can run their own Rainlit (see SELF-HOSTING.md). The Windows and Android apps can be
// pointed at one; in a browser you'd just open that server's address.

async function initServerSwitch() {
  const source = document.querySelector('meta[name="rainlit-source"]');
  if (source && source.content) document.getElementById('source-link').href = source.content;
  const name = document.querySelector('meta[name="rainlit-server-name"]');
  if (name && name.content) {
    el.serverName.textContent = name.content;
    el.serverName.hidden = false;
  }
  const bridge = DESKTOP && DESKTOP.getServer ? DESKTOP : ANDROID;
  if (!bridge) return;
  let current;
  try {
    current = await bridge.getServer();
  } catch {
    return; // (an older app, which only knows rainlit.app)
  }
  S.server = { bridge, url: current.url, custom: Boolean(current.custom) };
  el.serverSwitch.hidden = false;
  el.serverHost.textContent = new URL(current.url).host;
  el.serverNote.hidden = false;
}

function openServerDialog() {
  if (!S.server) return;
  if (S.inCall) return toast('Leave the call first.');
  showServerMessage('');
  el.serverInput.value = S.server.custom ? new URL(S.server.url).host : '';
  el.serverDefaultBtn.hidden = !S.server.custom;
  el.serverDialog.showModal();
  el.serverInput.focus();
}

function showServerMessage(text, checking = false) {
  el.serverError.textContent = text;
  el.serverError.hidden = !text;
  el.serverError.classList.toggle('checking', checking);
}

async function onServerConnect(e) {
  e.preventDefault();
  const typed = el.serverInput.value.trim();
  if (!typed) return;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`);
  } catch {
    return showServerMessage("That doesn't look like a web address.");
  }
  if (url.protocol !== 'https:') return showServerMessage('Rainlit servers use https:// (calls only work over a secure connection).');
  el.serverConnectBtn.disabled = true;
  showServerMessage('Checking…', true);
  try {
    const info = await S.server.bridge.checkServer({ url: url.origin });
    if (info.url === S.server.url) return el.serverDialog.close(); // already here
    showServerMessage(`Found ${info.name || 'a Rainlit server'}. Switching…`, true);
    await leaveThisServer();
    await S.server.bridge.setServer({ url: info.url }); // (the app starts again, on that server)
  } catch (err) {
    showServerMessage((err && err.message) || "Couldn't reach that server.");
  } finally {
    el.serverConnectBtn.disabled = false;
  }
}

async function onServerDefault() {
  el.serverDefaultBtn.disabled = true;
  try {
    await leaveThisServer();
    await S.server.bridge.resetServer();
  } catch (err) {
    showServerMessage((err && err.message) || "Couldn't switch back.");
  } finally {
    el.serverDefaultBtn.disabled = false;
  }
}

// This phone's notifications were set up with this server: stop them before moving on (the
// next server sets up its own).
async function leaveThisServer() {
  if (!ANDROID) return;
  const pushUrl = S.androidPush && S.androidPush.endpoint && S.androidPush.endpoint.url;
  if (pushUrl && S.me) {
    try { await api('DELETE', '/push', { endpoint: pushUrl }); } catch {}
  }
  try { await ANDROID.pushDisable(); } catch {}
}

// The Android back button: close whatever's open, one thing at a time. Returns false when
// there's nothing left to close, and the app tucks itself away (a call keeps going).
window.rainlitBack = () => {
  const dialog = document.querySelector('dialog[open]');
  if (dialog) {
    dialog.close();
    return true;
  }
  if (stageFull()) {
    setStageFull(false);
    return true;
  }
  if (!el.menu.hidden) {
    closeFriendMenu();
    return true;
  }
  if (!el.msgMenu.hidden) {
    closeMessageMenu();
    return true;
  }
  if (S.editing) {
    stopEdit();
    return true;
  }
  if (S.replying) {
    stopReply();
    return true;
  }
  if (!el.gifPanel.hidden) {
    closeGifPanel();
    return true;
  }
  if (S.openDm && el.app.classList.contains('in-dm') && matchMedia('(max-width: 760px)').matches) {
    closeDm();
    return true;
  }
  return false;
};

// ================= Rain =================
// Light rain falling over the app, drawn on one canvas. Near drops are longer, faster
// and brighter than far ones. It stops while you're in a call (and whenever the tab
// is hidden, since the browser stops drawing it).

const RAIN_SLANT = 0.16; // how far sideways a drop moves for each step down
const RAIN_LAYERS = [ // far to near
  { alpha: 0.06, width: 1, length: [9, 14], speed: [360, 460] },
  { alpha: 0.1, width: 1, length: [13, 19], speed: [480, 600] },
  { alpha: 0.15, width: 1.3, length: [18, 26], speed: [640, 780] },
];
let rainDrops = [];
let rainLast = 0;
let rainStopAt = 0;

function updateRain() {
  const want = S.rain && !S.inCall;
  el.rain.classList.toggle('on', want);
  if (want && !S.rainFrame) {
    sizeRain();
    rainLast = performance.now();
    S.rainFrame = requestAnimationFrame(rainStep);
  }
  // When it's turned off it fades out first (see .rain in the CSS), then stops drawing.
  if (!want) rainStopAt = performance.now() + 900;
}

function sizeRain() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const w = innerWidth;
  const h = innerHeight;
  el.rain.width = Math.round(w * dpr);
  el.rain.height = Math.round(h * dpr);
  el.rain.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.max(30, Math.min(110, Math.round((w * h) / 20000)));
  rainDrops = Array.from({ length: count }, () => newDrop(w, h, true));
}

function newDrop(w, h, anywhere) {
  const layer = Math.random() < 0.45 ? 0 : Math.random() < 0.65 ? 1 : 2;
  const L = RAIN_LAYERS[layer];
  const between = ([a, b]) => a + Math.random() * (b - a);
  return {
    layer,
    // Drops drift left as they fall, so some start past the right edge.
    x: Math.random() * (w + h * RAIN_SLANT),
    y: anywhere ? Math.random() * h : -between(L.length) - Math.random() * 80,
    length: between(L.length),
    speed: between(L.speed),
  };
}

function rainStep(now) {
  if (!el.rain.classList.contains('on') && now > rainStopAt) {
    S.rainFrame = 0;
    el.rain.getContext('2d').clearRect(0, 0, el.rain.width, el.rain.height);
    return;
  }
  S.rainFrame = requestAnimationFrame(rainStep);
  const dt = Math.min(0.05, (now - rainLast) / 1000); // after a pause, don't jump
  rainLast = now;
  const w = innerWidth;
  const h = innerHeight;
  const ctx = el.rain.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  RAIN_LAYERS.forEach((L, i) => {
    ctx.beginPath();
    for (const d of rainDrops) {
      if (d.layer !== i) continue;
      d.y += d.speed * dt;
      d.x -= d.speed * dt * RAIN_SLANT;
      if (d.y - d.length > h || d.x < -40) Object.assign(d, newDrop(w, h, false));
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.length * RAIN_SLANT, d.y - d.length);
    }
    ctx.strokeStyle = `rgba(183, 196, 217, ${L.alpha})`;
    ctx.lineWidth = L.width;
    ctx.stroke();
  });
}

// A quick two-note "boop": rising when someone joins (or comes back to) the call,
// falling when someone drops or leaves.
// Screen sharing starting (two bell notes going up) or stopping (coming back down), for
// whoever's sharing and whoever's watching.
function playShareSound(starting) {
  if (!S.callSounds || !soundReady()) return;
  const start = S.soundCtx.currentTime + 0.02;
  const notes = starting ? [783.99, 1046.5] : [1046.5, 783.99]; // G5 and C6
  notes.forEach((freq, i) => bellNote(S.soundCtx, freq, start + i * 0.11, 0.75));
}

function playCallSound(joining) {
  if (!S.callSounds || !soundReady()) return;
  const ctx = S.soundCtx;
  const start = ctx.currentTime + 0.02;
  const notes = joining ? [523.25, 783.99] : [783.99, 523.25]; // C5 up to G5, or back down
  notes.forEach((freq, i) => {
    const t = start + i * 0.09;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.13, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  });
}

// While you're calling and they haven't picked up, declined or missed it.
function updateRingback() {
  const waiting = S.inCall && S.callJoined && !S.peer && !S.call && !S.callAnswer && !S.resumeCallId;
  if (waiting && !S.ringbackTimer) {
    playRingtone(0.6);
    S.ringbackTimer = setInterval(() => playRingtone(0.6), RING_EVERY_MS);
  } else if (!waiting && S.ringbackTimer) {
    clearInterval(S.ringbackTimer);
    S.ringbackTimer = null;
  }
}

// Your own call buttons each have their own sound (with "Soft click when you press things"
// on), so you can tell by ear what you just did: mute falls and unmute rises, deafen does the
// same, lower and rounder; the camera is a shutter tick with a note going up (on) or down
// (off); switching between speaker, earpiece and headset is a quick double tick. (Sharing
// your screen has the bell pair everyone in the call hears, and leaving the call's "left".)
function playControlSound(kind) {
  const ctx = S.soundCtx;
  if (!S.clickSounds || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  const note = (freq, at, { type = 'sine', level = 0.11, length = 0.12, to = null } = {}) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.8);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
  };
  switch (kind) {
    case 'mute': note(740, t); note(494, t + 0.07); break; // F#5, then B4
    case 'unmute': note(494, t); note(740, t + 0.07); break;
    case 'deafen': note(440, t, { type: 'triangle', level: 0.14 }); note(294, t + 0.08, { type: 'triangle', level: 0.14, length: 0.16 }); break; // A4, then D4
    case 'undeafen': note(294, t, { type: 'triangle', level: 0.14 }); note(440, t + 0.08, { type: 'triangle', level: 0.14, length: 0.16 }); break;
    case 'camera-on': playClick(); note(1320, t + 0.02, { level: 0.06, length: 0.09, to: 1760 }); break;
    case 'camera-off': playClick(); note(1320, t + 0.02, { level: 0.06, length: 0.09, to: 990 }); break;
    case 'route': note(880, t, { level: 0.07, length: 0.05 }); note(880, t + 0.085, { level: 0.07, length: 0.05 }); break;
    default: playClick();
  }
}

// Chimes play through the same speaker you picked for your friend's voice.
// A soft, short "tick" for pressing buttons, like a quiet switch: a few milliseconds
// of filtered noise with a tiny low thump under it. Made once, then reused.
let clickNoise = null;

function playClick() {
  const ctx = S.soundCtx;
  if (!S.clickSounds || !ctx || ctx.state !== 'running') return;
  if (!clickNoise) {
    const len = Math.floor(ctx.sampleRate * 0.025);
    clickNoise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = clickNoise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 6)); // fades out fast
  }
  const t = ctx.currentTime + 0.005;
  // Every click is pitched a little differently (up to about 10% either way), so
  // pressing things doesn't sound machine-identical.
  const pitch = 0.9 + Math.random() * 0.2;
  const noise = ctx.createBufferSource();
  noise.buffer = clickNoise;
  noise.playbackRate.value = pitch;
  const tone = ctx.createBiquadFilter();
  tone.type = 'bandpass';
  tone.frequency.value = 2600 * pitch;
  tone.Q.value = 0.9;
  const tickGain = ctx.createGain();
  tickGain.gain.value = 0.09;
  noise.connect(tone).connect(tickGain).connect(ctx.destination);
  noise.start(t);

  const thump = ctx.createOscillator();
  thump.frequency.setValueAtTime(190 * pitch, t);
  thump.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.03);
  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.06, t + 0.003);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  thump.connect(thumpGain).connect(ctx.destination);
  thump.start(t);
  thump.stop(t + 0.05);
}

// Things that click when pressed. Typing boxes and sliders don't.
const CLICKABLE = 'button, a[href], summary, select, input[type="checkbox"], input[type="radio"], [role="menuitem"]';

function routeChimes() {
  if (S.soundCtx && S.soundCtx.setSinkId) S.soundCtx.setSinkId(S.devices.speaker || '').catch(() => {});
}

// ---------------- Files ----------------
//
// Files go straight to your friend over the call's own connection (a WebRTC data
// channel), one at a time, in small pieces. The server never sees them.
//
// On the channel, text messages are control ('start', 'end', 'got', 'cancel') and
// binary messages are pieces of whichever file was last started. The channel keeps
// everything in order, so pieces don't need labels.

const FILE_CHUNK = 64 * 1024;
const FILE_BUFFER_HIGH = 4 * 1024 * 1024; // pause when this much is waiting to go out
const FILE_BUFFER_LOW = 1024 * 1024; // ...and carry on once it's down to this
const FILE_BLOB_STEP = 16 * 1024 * 1024; // hand received pieces to the browser in blocks this big
// Kinds of file the chat can show or play in place. Anything else is just a file to save.
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;
const VIDEO_TYPES = /^video\/(mp4|webm|ogg|quicktime)$/;
const AUDIO_TYPES = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|webm|mp4|x-m4a|aac|flac|x-flac)$/;
const previewKind = (type) =>
  IMAGE_TYPES.test(type) ? 'image' : VIDEO_TYPES.test(type) ? 'video' : AUDIO_TYPES.test(type) ? 'audio' : null;
const ACTIVE = new Set(['queued', 'sending', 'finishing', 'receiving', 'paused']);

// 1536 -> "1.5 KB", like File Explorer shows it
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function openFileChannel(conn) {
  if (conn.files) return;
  // Both sides open the same channel (id 0) themselves, so neither has to wait to be offered one.
  const dc = conn.pc.createDataChannel('files', { negotiated: true, id: 0 });
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = FILE_BUFFER_LOW;
  dc.onopen = () => { if (S.conn === conn) pumpOutbox(); };
  dc.onmessage = (ev) => { if (S.conn === conn) onFileMessage(ev.data); };
  dc.onclose = () => { if (S.conn === conn) fileChannelLost(); };
  conn.files = dc;
}

function fileSend(msg) {
  const dc = S.conn && S.conn.files;
  if (dc && dc.readyState === 'open') dc.send(JSON.stringify(msg));
}

// The connection dropped or is being rebuilt. Whatever was part-way through
// starts over from the beginning once you're reconnected.
function fileChannelLost() {
  const out = S.outbox[0];
  if (out && out.state !== 'queued') {
    out.state = 'queued';
    out.sent = 0;
    renderTransfer(out);
  }
  const t = S.inbox;
  if (t && t.state === 'receiving') {
    Object.assign(t, { state: 'paused', got: 0, parts: [], pending: [], pendingBytes: 0 });
    renderTransfer(t);
  }
}

// Files you pick, paste or drop wait above the message box with a preview, until you
// press Send (or Enter). The x on each one takes it back out.
const MAX_PENDING = 10;

function canSendFiles(dm) {
  return dm.save || Boolean(S.inCall && S.callWith === dm.friendId && S.peer && !S.peer.away);
}

function addPending(list) {
  const files = Array.from(list || []);
  const friendId = S.openDm;
  if (!files.length || !friendId) return;
  const dm = dmFor(friendId);
  const c = dm.channelId && S.channels.get(dm.channelId);
  if (c && c.can && !c.can.files) {
    toast(`You can't send files in #${c.name}.`);
    return;
  }
  if (!canSendFiles(dm)) {
    toast(`Saving is off here, so files can only go straight to ${friendName(friendId)} during a call.`, 6000);
    return;
  }
  for (const file of files) {
    if (dm.pending.length >= MAX_PENDING) {
      toast(`You can send up to ${MAX_PENDING} files at a time.`);
      break;
    }
    if (dm.save && file.size > S.maxFileMb * 1024 * 1024) {
      toast(`"${file.name}" is too big. Files can be up to ${S.maxFileMb} MB.`, 6000);
      continue;
    }
    dm.pending.push({ id: randomId(), file, name: file.name || 'file', type: file.type, size: file.size, url: null });
  }
  renderTray();
  el.chatInput.focus();
}

function removePending(id) {
  const dm = dmFor(S.openDm);
  const i = dm.pending.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = dm.pending.splice(i, 1);
  if (p.url) URL.revokeObjectURL(p.url);
  renderTray();
  el.chatInput.focus();
}

// Sends everything waiting in the tray for this conversation.
function sendPending(dm, replyTo = null) {
  const items = dm.pending.splice(0);
  renderTray();
  sendFiles(items.map((p) => p.file), replyTo);
  for (const p of items) if (p.url) URL.revokeObjectURL(p.url);
}

function renderTray() {
  const pending = S.openDm ? dmFor(S.openDm).pending : [];
  el.attachTray.hidden = !pending.length;
  el.attachTray.replaceChildren(...pending.map(trayTile));
}

// One file waiting to go: a picture or video shows itself, anything else shows its type.
function trayTile(p) {
  const tile = document.createElement('div');
  tile.className = 'tray-tile';
  const thumb = document.createElement('div');
  thumb.className = 'tray-thumb';
  const kind = previewKind(p.type);
  if (kind === 'image' || kind === 'video') {
    p.url ||= URL.createObjectURL(p.file);
    const media = document.createElement(kind === 'image' ? 'img' : 'video');
    if (kind === 'image') {
      media.alt = p.name;
      media.title = 'Click to see full size';
      media.addEventListener('click', () => openLightbox(p, p.url));
      media.src = p.url;
    } else {
      media.muted = true;
      media.preload = 'metadata';
      media.playsInline = true;
      media.src = `${p.url}#t=0.1`; // shows a frame from the start instead of black
    }
    media.onerror = () => media.replaceWith(fileGlyph(p));
    thumb.append(media);
  } else {
    thumb.append(fileGlyph(p));
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'tray-remove';
  remove.title = 'Remove';
  remove.setAttribute('aria-label', `Remove ${p.name}`);
  remove.innerHTML = '<svg class="icon"><use href="#i-close"/></svg>';
  remove.addEventListener('click', () => removePending(p.id));
  thumb.append(remove);
  const name = document.createElement('span');
  name.className = 'tray-name';
  name.textContent = p.name;
  name.title = p.name;
  const size = document.createElement('span');
  size.className = 'tray-size';
  size.textContent = fmtBytes(p.size);
  tile.append(thumb, name, size);
  return tile;
}

function fileGlyph(p) {
  const box = document.createElement('div');
  box.className = 'tray-glyph';
  box.innerHTML = '<svg class="icon"><use href="#i-file"/></svg>';
  const ext = (p.name.match(/\.([a-z0-9]{1,5})$/i) || [])[1];
  if (ext) {
    const label = document.createElement('span');
    label.textContent = ext.toUpperCase();
    box.append(label);
  }
  return box;
}

// Files for the conversation that's open. With saving on they're uploaded and kept;
// with it off they go straight to your friend, which only works during a call.
function sendFiles(list, replyTo = null) {
  const files = Array.from(list || []);
  const friendId = S.openDm;
  if (!files.length || !friendId) return;
  const dm = dmFor(friendId);
  if (dm.save) {
    files.forEach((file, i) => uploadFile(dm, file, i === 0 ? replyTo : null)); // (the first one answers it)
    return;
  }
  if (!(S.inCall && S.callWith === friendId && S.peer && !S.peer.away)) {
    toast(`Saving is off here, so files can only go straight to ${friendName(friendId)} during a call.`, 6000);
    return;
  }
  for (const file of files) {
    const t = { id: randomId(), dir: 'out', file, name: file.name || 'file', size: file.size, type: file.type, state: 'queued', sent: 0 };
    S.transfers.set(t.id, t);
    S.outbox.push(t);
    addFileCard(t);
  }
  pumpOutbox();
}

// Uploads a file to a saved conversation, showing its progress. When it's done, the
// server sends it back as a message, which takes this card's place. Files sent together
// go up one at a time, so they arrive in the order you picked them.
function uploadFile(dm, file, replyTo = null) {
  if (file.size > S.maxFileMb * 1024 * 1024) {
    return toast(`"${file.name}" is too big. Files can be up to ${S.maxFileMb} MB.`, 6000);
  }
  const t = { id: randomId(), dir: 'up', name: file.name || 'file', size: file.size, type: file.type, state: 'queued', sent: 0, replyTo };
  const li = fileCard(t, 'You', Date.now());
  li.dataset.author = S.clientId;
  li.dataset.kind = 'file';
  if (replyTo) {
    li.dataset.replyTo = replyTo;
    li.prepend(replyQuote({ id: replyTo }));
  }
  addMessageMenu(li);
  if (previewKind(t.type)) showPreview(t.ui.card, t, fileUrl(file, t));
  appendItem(dm, li, Date.now());
  renderTransfer(t);
  clearNewDivider(dm);
  if (S.openDm === dm.friendId) scrollChat(dm.log);

  S.uploads.set(t.id, t);
  const done = () => {
    S.uploads.delete(t.id);
    for (const url of t.urls || []) URL.revokeObjectURL(url);
  };
  let xhr = null;
  // Stops it, whether it's on its way up or still waiting its turn.
  t.abort = () => {
    if (xhr) return xhr.abort();
    if (t.state !== 'queued') return;
    done();
    endTransfer(t, 'cancelled', 'Cancelled.');
  };
  dm.uploading = (dm.uploading || Promise.resolve()).then(() => new Promise((resolve) => {
    if (t.state !== 'queued') return resolve(); // cancelled while it waited
    xhr = new XMLHttpRequest();
    xhr.onloadend = resolve;
    startUpload(dm, t, file, xhr, done);
  })).catch(() => {}); // one going wrong mustn't hold up the rest
}

function startUpload(dm, t, file, xhr, done) {
  t.state = 'sending';
  renderTransfer(t);
  xhr.open('POST', `${SERVER}/api${convPath(dm.friendId)}/files`);
  xhr.setRequestHeader('Content-Type', 'application/octet-stream');
  xhr.setRequestHeader('X-Message-Id', t.id);
  xhr.setRequestHeader('X-File-Name', encodeURIComponent(t.name));
  xhr.setRequestHeader('X-File-Type', t.type || '');
  if (t.replyTo) xhr.setRequestHeader('X-Reply-To', t.replyTo);
  xhr.upload.onprogress = (e) => {
    t.sent = e.loaded;
    renderProgress(t);
  };
  xhr.onload = () => {
    done();
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status === 200 && data.message) appendMessage(dm, data.message);
    else endTransfer(t, 'failed', data.error || 'Upload failed. Try again.');
  };
  xhr.onerror = () => {
    done();
    endTransfer(t, 'failed', 'Upload failed. Check your connection and try again.');
  };
  xhr.onabort = () => {
    done();
    endTransfer(t, 'cancelled', 'Cancelled.');
  };
  xhr.send(file);
}

// Resolves once there's room in the channel's outgoing buffer, or after a moment
// regardless, so a channel that closed can't leave us waiting forever.
function roomToSend(dc) {
  return new Promise((resolve) => {
    dc.onbufferedamountlow = resolve;
    setTimeout(resolve, 250);
  });
}

async function pumpOutbox() {
  const conn = S.conn;
  const dc = conn && conn.files;
  const t = S.outbox[0];
  if (!t || t.state !== 'queued' || !dc || dc.readyState !== 'open' || conn.sendingFile) return;
  conn.sendingFile = true;
  // Stop if it's cancelled or the connection changes underneath us.
  const current = () => S.conn === conn && S.outbox[0] === t && dc.readyState === 'open';
  try {
    t.state = 'sending';
    t.sent = 0;
    dc.send(JSON.stringify({ t: 'start', id: t.id, name: t.name, size: t.size, type: t.type }));
    renderTransfer(t);
    const chunk = Math.min(FILE_CHUNK, (conn.pc.sctp && conn.pc.sctp.maxMessageSize) || 16 * 1024);
    while (t.sent < t.size) {
      while (dc.bufferedAmount > FILE_BUFFER_HIGH && current()) await roomToSend(dc);
      if (!current()) return;
      let buf;
      try {
        buf = await t.file.slice(t.sent, t.sent + chunk).arrayBuffer();
      } catch {
        // Moved, deleted, or a folder rather than a file.
        fileSend({ t: 'cancel', id: t.id, failed: true });
        return endTransfer(t, 'failed', "Couldn't read this file.");
      }
      if (!current()) return;
      dc.send(buf);
      t.sent += buf.byteLength;
      renderProgress(t);
    }
    dc.send(JSON.stringify({ t: 'end', id: t.id }));
    t.state = 'finishing'; // until they confirm they got all of it
    renderTransfer(t);
  } catch (err) {
    console.warn('[files]', err); // the channel closed mid-send; the file restarts when you reconnect
  } finally {
    conn.sendingFile = false;
    pumpOutbox(); // next in line, if this one's done with
  }
}

function onFileMessage(data) {
  if (typeof data !== 'string') {
    const t = S.inbox;
    if (!t || t.state !== 'receiving') return; // the rest of a file that was cancelled
    t.got += data.byteLength;
    if (t.got > t.size) {
      fileSend({ t: 'cancel', id: t.id, failed: true });
      return endTransfer(t, 'failed', brokenNote(t));
    }
    t.pending.push(data);
    t.pendingBytes += data.byteLength;
    if (t.pendingBytes >= FILE_BLOB_STEP) {
      // Blobs can live on disk, so a big file doesn't have to fit in memory.
      t.parts.push(new Blob(t.pending));
      t.pending = [];
      t.pendingBytes = 0;
    }
    renderProgress(t);
    return;
  }

  let msg;
  try { msg = JSON.parse(data); } catch { return; }
  if (!msg || typeof msg.id !== 'string') return;
  const t = S.transfers.get(msg.id);

  switch (msg.t) {
    case 'start': {
      if (!/^[0-9a-f]{32}$/.test(msg.id) || !Number.isSafeInteger(msg.size) || msg.size < 0) return;
      if (t && t.dir !== 'in') return;
      // They restarted something you already have (the "got it" was lost in a reconnect), or something you cancelled.
      if (t && t.state === 'done') return fileSend({ t: 'got', id: t.id });
      if (t && t.state === 'cancelled') return fileSend({ t: 'cancel', id: t.id });
      // A file that was paused by a reconnect, and isn't coming back.
      if (S.inbox && S.inbox !== t) endTransfer(S.inbox, 'failed', 'Stopped before it finished.');
      let r = t;
      if (!r) {
        r = { id: msg.id, dir: 'in', name: String(msg.name || 'file').slice(0, 255), size: msg.size, type: String(msg.type || '').slice(0, 100) };
        S.transfers.set(r.id, r);
        addFileCard(r);
      }
      Object.assign(r, { state: 'receiving', got: 0, parts: [], pending: [], pendingBytes: 0 });
      S.inbox = r;
      renderTransfer(r);
      break;
    }
    case 'end': {
      if (!t || t !== S.inbox || t.state !== 'receiving') return;
      if (t.got !== t.size) {
        fileSend({ t: 'cancel', id: t.id, failed: true });
        return endTransfer(t, 'failed', brokenNote(t));
      }
      // Only pictures, videos and audio we can show keep their type. Everything else is plain data, just for saving.
      const blob = new Blob([...t.parts, ...t.pending], { type: previewKind(t.type) ? t.type : 'application/octet-stream' });
      t.url = fileUrl(blob, t);
      t.ui.save.href = t.url;
      showPreview(t.ui.card, t, t.url);
      fileSend({ t: 'got', id: t.id });
      endTransfer(t, 'done');
      break;
    }
    case 'got':
      if (t && t.dir === 'out' && S.outbox.includes(t)) {
        endTransfer(t, 'sent');
        pumpOutbox();
      }
      break;
    case 'cancel':
      if (!t || !ACTIVE.has(t.state)) return;
      endTransfer(t, msg.failed ? 'failed' : 'cancelled', msg.failed ? brokenNote(t) : `${S.peer ? S.peer.name : 'Your friend'} cancelled.`);
      pumpOutbox();
      break;
  }
}

function brokenNote(t) {
  return t.dir === 'out' ? 'Something went wrong. Try sending it again.' : 'Something went wrong. Ask them to send it again.';
}

function cancelTransfer(t) {
  if (t.abort) return t.abort(); // an upload
  if (!ACTIVE.has(t.state)) return;
  fileSend({ t: 'cancel', id: t.id });
  endTransfer(t, 'cancelled', 'Cancelled.');
  pumpOutbox();
}

function endTransfer(t, state, note = '') {
  t.state = state;
  t.note = note;
  t.parts = t.pending = null;
  const i = S.outbox.indexOf(t);
  if (i !== -1) S.outbox.splice(i, 1);
  if (S.inbox === t) S.inbox = null;
  renderTransfer(t);
}

// Your friend left, so nothing more can get through.
function stopTransfers(name) {
  for (const t of S.transfers.values()) {
    if (ACTIVE.has(t.state)) endTransfer(t, 'failed', t.dir === 'out' ? `Not sent. ${name} left.` : `Stopped. ${name} left.`);
  }
}

function fileUrl(blob, t) {
  const url = URL.createObjectURL(blob);
  S.fileUrls.push(url);
  (t.urls ||= []).push(url);
  return url;
}

// A file card: name and size, progress while it moves, and a save button once it's here.
function fileCard(t, who, at) {
  const li = el.fileTpl.content.firstElementChild.cloneNode(true);
  li.dataset.id = t.id;
  if (t.type) li.dataset.type = t.type;
  li.dataset.from = who === 'You' ? 'me' : 'friend';
  const q = (sel) => li.querySelector(sel);
  q('.file-from').textContent = who;
  q('time').textContent = formatTime(at);
  q('.file-name').textContent = t.name;
  q('.file-name').title = t.name;
  q('.file-save').download = t.name;
  q('.file-cancel').addEventListener('click', () => cancelTransfer(t));
  t.ui = {
    li, card: q('.file-card'), meta: q('.file-meta'), bar: q('.file-bar'), fill: q('.file-bar span'),
    cancel: q('.file-cancel'), save: q('.file-save'),
  };
  return li;
}

// A file sent straight through the call (saving off), either way.
function addFileCard(t) {
  const mine = t.dir === 'out';
  const dm = dmFor(S.callWith);
  const li = fileCard(t, mine ? 'You' : friendName(S.callWith), Date.now());
  li.dataset.author = mine ? S.clientId : S.callWith;
  if (mine) {
    li.dataset.kind = 'file';
    addMessageMenu(li);
    if (previewKind(t.type)) showPreview(t.ui.card, t, fileUrl(t.file, t));
  }
  const stick = mine || nearBottom(dm.log);
  appendItem(dm, li, Date.now());
  renderTransfer(t);
  if (stick && S.openDm === dm.friendId) scrollChat(dm.log);
  if (mine) clearNewDivider(dm);
  else notifyIncoming(dm, li);
}

// A file kept in a saved conversation.
function savedFileItem(m, who) {
  const t = { id: m.id, name: m.file.name, size: m.file.size, type: m.file.type, dir: 'saved', state: 'done' };
  const li = fileCard(t, who, m.at);
  t.ui.save.href = m.file.url;
  showPreview(t.ui.card, t, m.file.url);
  renderTransfer(t);
  return li;
}

// Pictures show in the chat (click for full size), videos and audio play right there.
function showPreview(card, f, url) {
  const kind = previewKind(f.type);
  if (!kind) return;
  let media;
  if (kind === 'image') {
    media = document.createElement('img');
    media.className = 'file-preview';
    media.alt = f.name;
    media.title = 'Click to see full size';
    media.addEventListener('click', () => openLightbox(f, url));
  } else {
    media = document.createElement(kind);
    media.className = `file-${kind}`;
    media.controls = kind === 'audio'; // (a video gets them once it's started)
    media.preload = 'metadata';
    media.playsInline = true;
    if (S.devices.speaker && media.setSinkId) media.setSinkId(S.devices.speaker).catch(() => {});
  }
  const shown = kind === 'audio' ? media : mediaFrame(card, media, kind, f, url);
  // If you were at the bottom of the conversation, stay there as the picture or video takes up
  // room. (This runs after the frame has taken its shape.)
  media.addEventListener(kind === 'image' ? 'load' : 'loadedmetadata', () => {
    const log = card.closest('.chat-log');
    if (log && log.scrollHeight - log.scrollTop - log.clientHeight - shown.clientHeight < 120) scrollChat(log);
  });
  // Not something this browser can show after all: it can still be saved, from the card.
  media.onerror = () => {
    shown.remove();
    card.classList.remove('has-media');
  };
  media.src = url;
  card.prepend(shown);
}

// A picture or video in the chat: its own shape (a phone screenshot or video stays tall), with
// a save button in the corner. Once it's all here, it's all the card shows; the name and size
// only show while it's on its way. A video has a big play button and how long it is until
// it's started, then the usual controls.
function mediaFrame(card, media, kind, f, url) {
  const box = document.createElement('div');
  box.className = `file-media ${kind === 'video' ? 'file-player' : 'file-pic'}`;
  box.append(media);
  const fit = (w, h) => {
    if (!w || !h) return;
    box.style.setProperty('--ratio', `${w} / ${h}`);
    if (kind === 'image') box.style.setProperty('--w', `${w}px`); // (a small picture isn't blown up)
    box.classList.add('ready');
  };
  if (kind === 'image') {
    media.addEventListener('load', () => fit(media.naturalWidth, media.naturalHeight));
  } else {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'file-play';
    play.setAttribute('aria-label', `Play ${f.name}`);
    play.innerHTML = '<span><svg class="icon"><use href="#i-play"/></svg></span>';
    play.addEventListener('click', () => {
      box.classList.add('started');
      media.controls = true;
      media.play().catch(() => {});
      media.focus({ preventScroll: true });
    });
    const length = document.createElement('span');
    length.className = 'file-length';
    length.hidden = true;
    media.addEventListener('loadedmetadata', () => {
      fit(media.videoWidth, media.videoHeight);
      if (Number.isFinite(media.duration)) {
        length.textContent = fmtClock(media.duration * 1000);
        length.hidden = false;
      }
    });
    box.append(play, length);
  }
  const save = document.createElement('a');
  save.className = 'file-dl';
  save.href = url;
  save.download = f.name;
  save.title = 'Save';
  save.setAttribute('aria-label', `Save ${f.name}`);
  save.innerHTML = '<svg class="icon"><use href="#i-download"/></svg>';
  box.append(save);
  card.classList.add('has-media');
  return box;
}

function openLightbox(f, url) {
  resetLbZoom();
  el.lightbox.dataset.id = f.id;
  el.lightboxImg.src = url;
  el.lightboxImg.alt = f.name;
  el.lightboxName.textContent = f.name;
  el.lightboxSave.href = url;
  el.lightboxSave.download = f.name;
  el.lightbox.showModal();
}

// ----- Zooming the full-size picture -----
// Pinch to zoom (or the mouse wheel), drag to look around, and double-tap (or double-click)
// to zoom in on a spot, or back out. It opens fitted to the screen. A tap on the dark around
// the picture closes it.

const lbZoom = { scale: 1, x: 0, y: 0, pointers: new Map(), pinch: null, travel: 0, lastTap: null };
const LB_MAX = 6;

// The picture as it's painted, fitted and centered, before any zoom: its size, and the space
// it has (all in the page's px, around the middle of the picture's box).
function lbPicture() {
  const img = el.lightboxImg;
  const cs = getComputedStyle(img);
  const cw = img.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ch = img.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const fit = Math.min(1, cw / (img.naturalWidth || 1), ch / (img.naturalHeight || 1));
  return { w: (img.naturalWidth || 0) * fit, h: (img.naturalHeight || 0) * fit, cw, ch };
}

// Where a pointer is, from the middle of the picture's box (which a zoom doesn't move).
function lbPoint(e) {
  const box = el.lightbox.getBoundingClientRect();
  const z = uiZoom();
  const img = el.lightboxImg;
  return { x: (e.clientX - box.left) / z - img.offsetLeft - img.clientWidth / 2, y: (e.clientY - box.top) / z - img.offsetTop - img.clientHeight / 2 };
}

function applyLbZoom() {
  const p = lbPicture();
  // (Never dragged further than the zoomed picture reaches.)
  const maxX = Math.max(0, (p.w * lbZoom.scale - p.cw) / 2);
  const maxY = Math.max(0, (p.h * lbZoom.scale - p.ch) / 2);
  lbZoom.x = Math.max(-maxX, Math.min(maxX, lbZoom.x));
  lbZoom.y = Math.max(-maxY, Math.min(maxY, lbZoom.y));
  el.lightboxImg.style.transform = lbZoom.scale > 1 ? `translate(${lbZoom.x}px, ${lbZoom.y}px) scale(${lbZoom.scale})` : '';
  el.lightbox.classList.toggle('zoomed', lbZoom.scale > 1);
}

function resetLbZoom() {
  Object.assign(lbZoom, { scale: 1, x: 0, y: 0, pinch: null, travel: 0, lastTap: null });
  lbZoom.pointers.clear();
  applyLbZoom();
}

// Zooms to a new scale, keeping the spot at q (from the middle) where it is.
function lbZoomAt(q, scale) {
  const s0 = lbZoom.scale;
  const s1 = Math.max(1, Math.min(LB_MAX, scale));
  lbZoom.x = q.x - (s1 * (q.x - lbZoom.x)) / s0;
  lbZoom.y = q.y - (s1 * (q.y - lbZoom.y)) / s0;
  lbZoom.scale = s1;
  if (s1 === 1) lbZoom.x = lbZoom.y = 0;
  applyLbZoom();
}

function onLbDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  el.lightboxImg.setPointerCapture(e.pointerId);
  lbZoom.pointers.set(e.pointerId, lbPoint(e));
  if (lbZoom.pointers.size === 1) {
    lbZoom.travel = 0;
    lbZoom.downAt = e.timeStamp;
  }
  if (lbZoom.pointers.size === 2) {
    const [a, b] = [...lbZoom.pointers.values()];
    lbZoom.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale: lbZoom.scale, x: lbZoom.x, y: lbZoom.y };
    lbZoom.travel = Infinity; // (a pinch is never a tap)
  }
}

function onLbMove(e) {
  const before = lbZoom.pointers.get(e.pointerId);
  if (!before) return;
  const p = lbPoint(e);
  lbZoom.pointers.set(e.pointerId, p);
  lbZoom.travel += Math.hypot(p.x - before.x, p.y - before.y);
  if (lbZoom.pinch && lbZoom.pointers.size === 2) {
    const [a, b] = [...lbZoom.pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const pin = lbZoom.pinch;
    const s1 = Math.max(1, Math.min(LB_MAX, (pin.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pin.dist));
    // The spot where the fingers started stays under them, as they spread and move.
    lbZoom.x = mid.x - (s1 * (pin.mid.x - pin.x)) / pin.scale;
    lbZoom.y = mid.y - (s1 * (pin.mid.y - pin.y)) / pin.scale;
    lbZoom.scale = s1;
    applyLbZoom();
  } else if (lbZoom.pointers.size === 1 && lbZoom.scale > 1) {
    lbZoom.x += p.x - before.x;
    lbZoom.y += p.y - before.y;
    applyLbZoom();
  }
}

function onLbUp(e) {
  if (!lbZoom.pointers.delete(e.pointerId)) return;
  if (lbZoom.pointers.size < 2) lbZoom.pinch = null;
  if (lbZoom.scale < 1.05 && lbZoom.scale !== 1) lbZoomAt({ x: 0, y: 0 }, 1); // (let go nearly fitted: fitted)
  // (A quick press that didn't move is a tap. Taps are told apart here rather than from
  // clicks, which a phone can hold back or merge when they come quickly.)
  if (e.type === 'pointerup' && !lbZoom.pointers.size && lbZoom.travel <= 10 && e.timeStamp - lbZoom.downAt < 500) onLbTap(e);
}

// A tap: outside the picture (not zoomed) closes it; two quick taps on it zoom in there,
// or back out.
function onLbTap(e) {
  const q = lbPoint(e);
  const p = lbPicture();
  if (lbZoom.scale === 1 && (Math.abs(q.x) > p.w / 2 || Math.abs(q.y) > p.h / 2)) return el.lightbox.close();
  const now = performance.now();
  const last = lbZoom.lastTap;
  if (last && now - last.at < 350 && Math.hypot(q.x - last.x, q.y - last.y) < 40) {
    lbZoom.lastTap = null;
    lbZoomAt(q, lbZoom.scale > 1 ? 1 : 2.5);
  } else {
    lbZoom.lastTap = { at: now, x: q.x, y: q.y };
  }
}

function onLbWheel(e) {
  e.preventDefault();
  lbZoomAt(lbPoint(e), lbZoom.scale * Math.exp(-e.deltaY * 0.0015));
}

// Progress moves many times a second; redraw a few times a second at most.
function renderProgress(t) {
  if (performance.now() - (t.drawnAt || 0) > 150) renderTransfer(t);
}

function renderTransfer(t) {
  const u = t.ui;
  if (!u) return;
  const moved = t.dir === 'in' ? t.got : t.sent;
  const pct = t.size ? Math.floor((moved / t.size) * 100) : 100;
  const status = {
    queued: 'Waiting to send',
    sending: `Sending ${pct}%`,
    finishing: 'Sending 100%',
    receiving: `Receiving ${pct}%`,
    paused: 'Paused while reconnecting',
    sent: 'Sent',
    done: '',
  }[t.state] ?? t.note;
  u.meta.textContent = status ? `${fmtBytes(t.size)} · ${status}` : fmtBytes(t.size);
  u.bar.hidden = !['sending', 'finishing', 'receiving'].includes(t.state);
  u.fill.style.width = `${pct}%`;
  u.cancel.hidden = !ACTIVE.has(t.state) || t.state === 'finishing';
  u.save.hidden = t.state !== 'done';
  const dl = u.card.querySelector('.file-dl');
  if (dl) dl.hidden = u.save.hidden;
  // (A picture's or video's name and size only show while it's on its way, or if it didn't make it.)
  u.li.classList.toggle('finished', t.state === 'done' || t.state === 'sent');
  u.li.classList.toggle('ended', t.state === 'cancelled' || t.state === 'failed');
  t.drawnAt = performance.now();
}

// ---------------- Settings ----------------

// ----- Size -----
// Settings > Size zooms all of Rainlit, on this device (boot.js puts it on before anything's
// drawn). A spot on the screen is then fewer of the page's own px from the corner, so menus
// opened at a spot divide by it.

function uiZoom() {
  const root = document.documentElement;
  return root.currentCSSZoom ?? (Number(root.style.zoom) || 1);
}

function setUiScale(size) {
  const root = document.documentElement;
  if (!('zoom' in root.style)) return;
  root.style.zoom = size === 1 ? '' : String(size);
  // (For the CSS that goes by the window's size, which the zoom would stretch past the edge.)
  if (size === 1) root.style.removeProperty('--zoom');
  else root.style.setProperty('--zoom', String(size));
  store.set('uiScale', String(size));
  renderMemberPanel();
}

async function fillDeviceLists() {
  let devices = [];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch {}
  const fill = (select, kind, current, fallbackLabel) => {
    select.innerHTML = '';
    const list = devices.filter((d) => d.kind === kind);
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'System default';
    select.append(def);
    list.forEach((d, i) => {
      if (d.deviceId === 'default' || d.deviceId === 'communications' || !d.deviceId) return;
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `${fallbackLabel} ${i + 1}`;
      select.append(o);
    });
    select.value = [...select.options].some((o) => o.value === current) ? current : '';
  };
  fill(el.micSelect, 'audioinput', S.devices.mic, 'Microphone');
  fill(el.camSelect, 'videoinput', S.devices.cam, 'Camera');
  const canPickSpeaker = 'setSinkId' in HTMLMediaElement.prototype;
  el.speakerField.hidden = !canPickSpeaker;
  if (canPickSpeaker) fill(el.speakerSelect, 'audiooutput', S.devices.speaker, 'Speaker');
  el.shareQuality.value = S.shareQuality;
  renderVolumeCap();
  el.soundsInput.checked = S.sounds;
  el.clicksInput.checked = S.clickSounds;
  el.callSoundsInput.checked = S.callSounds;
  el.duckField.hidden = !ANDROID;
  el.duckInput.checked = store.get('duck', 'on') !== 'off';
  renderDuckStatus();
  el.statsInput.checked = S.showStats;
  el.traceInput.checked = S.trace;
  el.rainInput.checked = S.rain;
  const size = store.get('uiScale', '1');
  el.uiScale.value = [...el.uiScale.options].some((o) => o.value === size) ? size : '1';
  el.pttInput.checked = S.ptt;
  el.pttDetails.hidden = !S.ptt;
  el.pttKeyBtn.textContent = S.pttKeyName;
  renderPttHint();
  el.noiseInput.checked = S.micFx.noiseSuppression;
  el.echoInput.checked = S.micFx.echoCancellation;
  el.gainInput.checked = S.micFx.autoGainControl;
}

// Picks up a new microphone or new clean-up settings. Chrome only applies those
// when the mic is opened, so open it again.
async function restartMic() {
  if (!S.local.mic) return;
  try {
    await setMicTrack(await getMicTrack(S.devices.mic));
  } catch (err) {
    toast(mediaErrorText(err, 'Microphone'));
  }
}

function onMicChange() {
  S.devices.mic = el.micSelect.value;
  store.set('mic', S.devices.mic);
  restartMic();
  voiceDevicesChanged();
}

function onMicFxChange() {
  S.micFx = {
    noiseSuppression: el.noiseInput.checked,
    echoCancellation: el.echoInput.checked,
    autoGainControl: el.gainInput.checked,
  };
  for (const [k, on] of Object.entries(S.micFx)) store.set(k, on ? 'on' : 'off');
  restartMic();
  voiceDevicesChanged();
  renderVolumeCap();
}

async function onCamChange() {
  S.devices.cam = el.camSelect.value;
  store.set('cam', S.devices.cam);
  if (!S.local.cam) return;
  try {
    const t = await getCamTrack(S.devices.cam);
    const old = S.local.cam;
    S.local.cam = t;
    t.onended = () => { if (S.local.cam === t) toggleCam(); };
    if (!S.local.screen) await setOutgoingVideo(t);
    old.stop();
    renderSelf();
  } catch (err) {
    toast(mediaErrorText(err, 'Camera'));
  }
}

function onSpeakerChange() {
  S.devices.speaker = el.speakerSelect.value;
  store.set('speaker', S.devices.speaker);
  voiceDevicesChanged();
  for (const a of S.remoteAudio.values()) if (a.setSinkId) a.setSinkId(S.devices.speaker).catch(() => {});
  if (S.boostCtx && S.boostCtx.setSinkId) S.boostCtx.setSinkId(S.devices.speaker || '').catch(() => {});
  routeChimes();
}

function onVolumeChange() {
  S.volume = Number(el.volumeInput.value) / 100;
  store.set('volume', el.volumeInput.value);
  applyVolume();
}

// Your friend's volume. Up to 100% it's the audio player's own volume. Past that, a player
// can't go louder, so their sound goes through a volume boost instead (with a limiter, so
// the loud bits don't crackle) and the player itself goes quiet.
function applyVolume() {
  const max = volumeCap();
  el.volumeValue.textContent = `${Math.round(Math.min(S.volume, max) * 100)}%`;
  for (const [id, audio] of S.remoteAudio) {
    // Their voice, or the sound of their screen share (which has its own volume and mute).
    let level = audio.dataset.kind === 'stream' ? (S.streamMuted ? 0 : S.streamVolume) : S.volume;
    level = S.onPhone ? 0 : Math.min(level, max); // (silent while you're on a phone call)
    const boost = level > 1;
    audio.volume = Math.min(1, level);
    let b = S.boosts.get(id);
    if (boost && !b) b = startBoost(id, audio);
    if (b) b.gain.gain.value = boost ? level : 1;
    // (The player keeps playing, muted: browsers only hand a call's sound to the booster
    // while something is playing it.)
    audio.muted = Boolean(boost && b && boostRunning());
    if (!boost && b) {
      b.source.disconnect();
      b.gain.disconnect();
      S.boosts.delete(id);
    }
  }
}

// Above 100%, your friend's sound goes through the volume boost, which Chrome's own echo
// cancelling can't hear, so your mic would send it back to them. Computers, and phones that
// cancel echo themselves, hear everything and cover it; on other phones it stops at 100%
// (their volume buttons go louder). The Android app says which kind of phone it is.
function volumeCap() {
  return ANDROID && store.get('boostBreaksEcho', 'no') === 'yes' && S.micFx.echoCancellation ? 1 : 3;
}

function renderVolumeCap() {
  const capped = volumeCap() === 1;
  el.volumeInput.max = capped ? '100' : '300';
  el.volumeInput.value = String(Math.round(S.volume * 100));
  el.streamVolume.max = capped ? '100' : '200';
  el.volumeHint.textContent = capped
    ? "On this phone, echo cancelling can't cover sound above 100%, so use your volume buttons to go louder."
    : 'Above 100% makes a quiet friend louder. It works best with headphones.';
  applyVolume();
  renderStreamAudio();
}

// If the booster stops (a phone can suspend it), the plain player takes over, at up to 100%,
// so there's never silence while it's restarted.
const boostRunning = () => Boolean(S.boostCtx && S.boostCtx.state === 'running');

function startBoost(id, audio) {
  try {
    if (!S.boostCtx) {
      S.boostCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const ctx = S.boostCtx;
      ctx.onstatechange = () => {
        trace('boost-state', { state: ctx.state });
        applyVolume();
      };
      S.boostCtxAt = Date.now();
      const limiter = S.boostCtx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      limiter.connect(S.boostCtx.destination);
      S.boostLimiter = limiter;
      // Never quite silent. After half a minute of pure silence (your friend quiet, with their
      // phone's noise removal sending nothing but zeros), Chrome swaps the boost's speaker for a
      // stand-in to save power. With the phone locked, it may not swap back when they talk
      // again until it's unlocked, and you'd hear nothing. A level far too quiet to hear keeps
      // the real speaker.
      try {
        S.boostKeeper = S.boostCtx.createConstantSource();
        S.boostKeeper.offset.value = 1e-5;
        S.boostKeeper.connect(S.boostCtx.destination);
        S.boostKeeper.start();
      } catch {}
      if (S.devices.speaker && S.boostCtx.setSinkId) S.boostCtx.setSinkId(S.devices.speaker).catch(() => {});
    }
    S.boostCtx.resume().catch(() => {});
    const source = S.boostCtx.createMediaStreamSource(audio.srcObject);
    const gain = S.boostCtx.createGain();
    source.connect(gain).connect(S.boostLimiter);
    // Listens to what reaches the boost (see checkFriendSound).
    const ear = S.boostCtx.createAnalyser();
    ear.fftSize = 32768; // (the last ~0.7 seconds)
    source.connect(ear);
    const buf = new Float32Array(ear.fftSize);
    const silent = () => { ear.getFloatTimeDomainData(buf); return buf.every((v) => v === 0); };
    const b = { source, gain, silent, misses: 0 };
    S.boosts.set(id, b);
    return b;
  } catch {
    return null; // no boost here: it stays at 100%
  }
}

// ---------------- Call history & summary ----------------

function loadHistory() {
  try {
    const list = JSON.parse(store.get('history', '[]'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function recordHistory(entry) {
  const list = loadHistory().filter((h) => h.id !== entry.id);
  list.unshift({ ...entry, log: entry.log.slice(-200) });
  store.set('history', JSON.stringify(list.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const list = loadHistory();
  el.history.hidden = list.length === 0;
  el.historyList.innerHTML = '';
  for (const h of list.slice(0, 8)) {
    const li = document.createElement('li');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const withEl = document.createElement('span');
    withEl.className = 'h-with';
    withEl.textContent = `With ${h.withName}`;
    const when = document.createElement('span');
    when.className = 'h-when';
    when.textContent = fmtWhen(h.startedAt);
    const len = document.createElement('span');
    len.className = 'h-len';
    len.textContent = fmtClock((h.endedAt || h.leftAt) - h.startedAt);
    summary.append(withEl, when, len);
    details.append(summary);
    if (!h.ended) {
      const note = document.createElement('p');
      note.className = 'h-note';
      note.textContent = `Still going when you left, after ${fmtLong(h.leftAt - h.startedAt)}.`;
      details.append(note);
    }
    const log = document.createElement('ol');
    log.className = 'log-list';
    for (const e of h.log) log.append(logItem(e));
    details.append(log);
    li.append(details);
    el.historyList.append(li);
  }
}

function showSummary(sm) {
  const length = (sm.endedAt || sm.leftAt) - sm.startedAt;
  el.summaryTitle.textContent = sm.ended ? 'Call ended' : 'You left the call';
  el.summaryDuration.textContent = fmtClock(length);
  el.summaryDurationLabel.textContent = sm.ended ? 'Total call length' : 'Call length so far';
  el.summaryDetail.textContent = sm.ended
    ? `With ${sm.withName}, started ${fmtWhen(sm.startedAt).replace('Today, ', 'today at ')}.` +
      (sm.whileAway ? ' It ended while you were disconnected.' : '')
    : `${sm.stillWith} is still in it. You can rejoin anytime from your friends list.`;
  el.summaryLog.innerHTML = '';
  for (const e of sm.log) el.summaryLog.append(logItem(e));
  el.summary.showModal();
}

// ---------------- Signing in ----------------

function showAuth(mode) {
  el.auth.hidden = false;
  el.app.hidden = true;
  el.signinForm.hidden = mode !== 'signin';
  el.signupForm.hidden = mode !== 'signup';
  el.resetForm.hidden = mode !== 'reset';
  el.signinTab.parentElement.hidden = mode === 'reset' || S.setupNeeded;
  el.signinTab.setAttribute('aria-selected', String(mode === 'signin'));
  el.signupTab.setAttribute('aria-selected', String(mode === 'signup'));
  // The very first account is made with the setup code from the server's logs, not an invite.
  el.setupNote.hidden = !S.setupNeeded;
  el.codeLabel.textContent = S.setupNeeded ? 'Setup code' : 'Invite code';
  showAuthError('');
  const first = { signin: el.signinLogin, signup: el.signupCode, reset: el.resetPassword }[mode];
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
}

// Runs a sign-in/sign-up form: disables its button while waiting and shows any problem.
async function submitAuth(form, request) {
  const btn = form.querySelector('button[type="submit"]');
  showAuthError('');
  btn.disabled = true;
  try {
    const { user } = await request();
    await signedIn(user);
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function signedIn(user) {
  S.setupNeeded = false;
  setMe(user);
  el.auth.hidden = true;
  el.app.hidden = false;
  if (location.hash) history.replaceState(null, '', location.pathname); // drop a used #reset link
  el.signinPassword.value = el.signupPassword.value = el.resetPassword.value = '';
  renderHistory();
  await refreshFriends();
  await refreshSpaces();
  connectSocket();
  syncAndroidPush();
  followJoinLink();
}

// ---------------- Push, for when the Android app is closed ----------------
// A push app on the phone (ntfy, for example) gives Rainlit an address; the server sends
// encrypted notes to it when someone calls or messages and the app isn't open.

async function syncAndroidPush() {
  if (!ANDROID || !S.me) return;
  const status = await ANDROID.pushStatus().catch(() => null);
  if (!status) return;
  S.androidPush = status;
  renderPushNote();
  if (status.endpoint) {
    const { url, p256dh, auth } = status.endpoint;
    if (S.pushSent === url) return; // sent once each time the app opens, in case the server lost it
    try {
      await api('POST', '/push', { endpoint: url, keys: { p256dh, auth } });
      S.pushSent = url;
      sendBackground();
    } catch {}
    return;
  }
  // A push app is installed but Rainlit isn't using it yet: start. (The address arrives a
  // moment later, and this runs again.)
  if (status.apps.length && !S.pushAsked) {
    S.pushAsked = true;
    try {
      const { key } = await api('GET', '/push');
      await ANDROID.pushEnable({ vapid: key });
    } catch {}
  }
}

function renderPushNote() {
  const s = S.androidPush;
  if (!ANDROID || !s) return;
  const using = s.apps.find((a) => a.id === s.using);
  if (s.endpoint && using) {
    el.pushNote.textContent = `When Rainlit is closed, calls and messages come through ${using.name}.`;
  } else if (s.apps.length) {
    el.pushNote.textContent = `Connecting to ${s.apps[0].name} for calls and messages while Rainlit is closed…`;
  } else {
    const link = document.createElement('a');
    link.href = 'https://ntfy.sh/docs/subscribe/phone/';
    link.target = '_blank';
    link.textContent = 'install ntfy';
    el.pushNote.replaceChildren('While Rainlit is closed, calls and messages can\'t reach you. To fix that, ', link,
      ' (free, no account needed). Rainlit connects to it by itself.');
  }
  el.pushNote.hidden = false;
}

function signedOut(message = '') {
  if (S.inCall) teardown({ sendLeave: false });
  stopRinging();
  S.me = null;
  S.friends.clear();
  S.incoming = [];
  S.outgoing = [];
  for (const up of S.uploads.values()) up.abort();
  closeDm();
  S.dms.clear();
  S.spaces.clear();
  S.channels.clear();
  S.people.clear();
  S.view = 'home';
  for (const url of S.fileUrls) URL.revokeObjectURL(url);
  S.fileUrls = [];
  clearTimeout(S.wsTimer);
  clearInterval(S.pingTimer);
  const ws = S.ws;
  S.ws = null;
  if (ws) {
    ws.onclose = ws.onmessage = ws.onopen = null;
    try { ws.close(); } catch {}
  }
  for (const d of [el.profile, el.admin, el.miniProfile, el.settings]) if (d.open) d.close();
  showAuth('signin');
  if (message) showAuthError(message);
}

async function checkSignedIn() {
  try {
    await api('GET', '/me');
  } catch (err) {
    if (err.status === 401) signedOut('You were signed out. Sign in again.');
  }
}

// ---------------- You ----------------

const PRESENCE_LABEL = { online: 'Online', away: 'Away', offline: 'Offline' };

function setMe(user) {
  S.me = user;
  S.clientId = user.id;
  S.name = user.displayName;
  renderMe();
  if (el.miniProfile.open && miniProfileId === user.id) renderMiniProfile();
  if (el.profile.open) renderProfileBadges();
}

// What your friends see you as.
function myPresence() {
  if (!S.me || S.me.presence === 'invisible') return 'offline';
  return S.me.presence === 'away' || S.idle ? 'away' : 'online';
}

function renderMe() {
  if (!S.me) return;
  renderFace(el.meFace, S.me, myPresence());
  el.meName.textContent = S.me.displayName;
  el.meStatus.textContent = S.me.statusText || (S.me.presence === 'invisible' ? 'Appearing offline' : `@${S.me.username}`);
  el.adminBtn.hidden = !S.me.isAdmin;
  el.homeTitle.textContent = `Hi, ${S.me.displayName}`;
}

// You count as away after 10 minutes without touching Rainlit (unless you're in a call).
const IDLE_MS = 10 * 60_000;

function noteActivity() {
  S.lastActive = Date.now();
  if (S.idle) setIdle(false);
}

function setIdle(idle) {
  S.idle = idle;
  wsSend({ type: 'activity', idle });
  renderMe();
}

// ---------------- Faces ----------------

// Each person gets their own soft color behind their initial, the same everywhere.
function faceColor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 38% 38%)`;
}

// A round profile picture (or initial), with an online/away/offline dot if presence is given.
function renderFace(node, user, presence) {
  node.replaceChildren();
  node.style.setProperty('--face-bg', faceColor(user.id || ''));
  const letter = initial(user.displayName || user.username || '?');
  if (user.avatar) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = user.avatar;
    img.onerror = () => { node.textContent = letter; };
    node.append(img);
  } else {
    node.textContent = letter;
  }
  if (presence) node.dataset.presence = presence;
  else delete node.dataset.presence;
}

function makeFace(user, presence, size = '') {
  const face = document.createElement('span');
  face.className = `face ${size}`.trim();
  renderFace(face, user, presence);
  return face;
}

// ---------------- Spaces ----------------
// Places for more than two people, like a Discord server: members, and text channels that
// work just like DMs (see "Conversations"). The rail on the left switches the sidebar between
// Home (friends and DMs) and each space's channels.

async function refreshSpaces() {
  let data;
  try {
    data = await api('GET', '/spaces');
  } catch {
    return;
  }
  const kept = new Set();
  const before = S.spaces;
  S.spaces = new Map();
  S.channels = new Map();
  for (const space of data.spaces) {
    const old = before.get(space.id);
    // (A group's people, for its name and theirs, friends of yours or not.)
    for (const p of space.people || []) if (p.id !== S.clientId && !S.friends.has(p.id)) S.people.set(p.id, { ...(S.people.get(p.id) || {}), ...p });
    S.spaces.set(space.id, { ...space, members: old ? old.members : null, byId: old ? old.byId : null, byName: old ? old.byName : null });
    for (const c of space.channels) {
      S.channels.set(c.id, { ...c, spaceId: space.id });
      if (c.kind === 'voice') {
        S.voiceStates.set(c.id, c.voice || []);
        continue; // (voice channels have no messages)
      }
      const key = `ch:${c.id}`;
      const dm = dmFor(key);
      dm.lastAt = c.lastAt;
      // Unless you're reading it right now, the server knows best how much is unread.
      if (!(S.openDm === key && !lookingAway())) {
        dm.unread = c.unread;
        dm.mentions = c.mentions || 0;
      }
      kept.add(key);
    }
  }
  // Channels that are gone: deleted, or their space is gone for you.
  for (const key of [...S.dms.keys()]) {
    if (!isChannelKey(key) || kept.has(key)) continue;
    if (S.openDm === key) closeDm();
    S.dms.delete(key);
  }
  if (S.view !== 'home' && !S.spaces.has(S.view)) S.view = 'home';
  // Someone put you in a group: say so.
  if (S.spacesLoaded) {
    for (const s of data.spaces) {
      if (s.kind === 'group' && !before.has(s.id) && s.ownerId !== S.clientId) toast(`You're in a new group: ${groupTitle(S.spaces.get(s.id))}.`, 6000);
    }
  }
  S.spacesLoaded = true;
  // A timeout you're in ends by itself: look again then.
  clearTimeout(S.timeoutTimer);
  const ends = Math.min(...[...S.spaces.values()].map((s) => s.timeoutUntil || Infinity));
  if (ends < Infinity) S.timeoutTimer = setTimeout(refreshSpaces, Math.max(1000, ends - Date.now() + 500));
  renderSpaces();
  if (S.openDm) renderDmHead();
}

// Everyone in a space, for their names and pictures (they may not be your friends).
async function loadMembers(spaceId) {
  try {
    const { members } = await api('GET', `/spaces/${spaceId}`);
    for (const m of members) S.people.set(m.id, m);
    const space = S.spaces.get(spaceId);
    if (space) {
      space.members = members;
      space.byId = new Map(members.map((m) => [m.id, m]));
      space.byName = new Map(members.map((m) => [m.username.toLowerCase(), m]));
      paintNames(spaceId);
      if (el.memberPanel.dataset.space === spaceId || (!el.memberPanel.hidden && !el.memberPanel.dataset.space)) renderMemberPanel();
    }
    return members;
  } catch {
    return [];
  }
}

// Messages drawn before their author's name was known.
function refreshNames(dm, userId) {
  for (const head of dm.log.querySelectorAll(`li[data-author="${CSS.escape(userId)}"] > .msg-name`)) {
    const from = head.querySelector('.file-from');
    if (from) from.textContent = friendName(userId);
    else if (head.firstChild && head.firstChild.nodeType === Node.TEXT_NODE) head.firstChild.nodeValue = friendName(userId);
  }
}

async function onSpaceChanged(spaceId) {
  if (modState.spaceId === spaceId) modState.stale = true;
  await refreshSpaces();
  if (S.spaces.has(spaceId) && (S.view === spaceId || S.spaces.get(spaceId).members)) await loadMembers(spaceId);
  else paintNames(spaceId);
  if (el.spaceMembers.open) renderMembers();
  if (el.spaceSettings.open) renderSpaceSettings();
  if (el.groupInfo.open) renderGroupInfo();
}

function onSpaceRemoved(spaceId, why) {
  const space = S.spaces.get(spaceId);
  if (S.voice && S.voice.spaceId === spaceId) leaveVoice({ quiet: true });
  refreshSpaces();
  for (const d of [el.spaceMembers, el.spaceSettings, el.spaceInvite, el.modDialog]) if (d.open && S.view === spaceId) d.close();
  if (!space) return;
  if (isGroupSpace(space)) {
    if (el.groupInfo.open && el.groupInfo.dataset.space === spaceId) el.groupInfo.close();
    if (S.groupRing && S.groupRing.spaceId === spaceId) stopGroupRinging();
    if (why === 'kicked') toast(`You were taken out of ${groupTitle(space)}.`);
    return;
  }
  toast(why === 'banned' ? `You've been banned from ${space.name}.` : why === 'kicked' ? `You were removed from ${space.name}.` : `You're not in ${space.name} any more.`);
}

const spaceInitials = (name) => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [Array.from(words[0])[0], Array.from(words[1])[0]] : Array.from(words[0] || '?').slice(0, 2);
  return letters.join('').toUpperCase();
};

// What you can do in a space: the permissions your roles give you there (lib/spaces.js).
const canIn = (space, perm) => Boolean(space && space.perms && space.perms.includes(perm));
// Your highest role's place in the order; the owner is above all of them.
const myTop = (space) => (space.top === null || space.top === undefined ? Infinity : space.top);
const topOf = (space, m) => (m.owner ? Infinity : space.roles.reduce((top, r) => (m.roles.includes(r.id) ? Math.max(top, r.position) : top), 0));
// Roles below your own highest; and people below you (or you), never the owner.
const canManageRoleIn = (space, role) => canIn(space, 'manageRoles') && role.position < myTop(space);
const canManageMemberIn = (space, m) => canIn(space, 'manageRoles') && !m.owner
  && (space.role === 'owner' || m.id === S.clientId || topOf(space, m) < myTop(space));
// A timeout, kick or ban: only on people below you, never the owner or yourself, and never
// a timeout on an administrator.
const isAdministrator = (space, m) => space.everyonePerms.includes('administrator')
  || space.roles.some((r) => m.roles.includes(r.id) && r.perms.includes('administrator'));
const canModerateIn = (space, m, perm) => canIn(space, perm) && !m.owner && m.id !== S.clientId
  && (space.role === 'owner' || topOf(space, m) < myTop(space)) && !(perm === 'timeout' && isAdministrator(space, m));
const SETTINGS_TABS = [['general', ['manageSpace']], ['roles', ['manageRoles']], ['channels', ['manageChannels']], ['moderation', ['timeout', 'ban', 'viewLog', 'manageMessages', 'kick']]];
const settingsTabsFor = (space) => SETTINGS_TABS.filter(([, perms]) => perms.some((p) => canIn(space, p))).map(([tab]) => tab);
const canOpenSettings = (space) => Boolean(space) && settingsTabsFor(space).length > 0;

// "3:45 PM" today, or "Sep 28, 3:45 PM".
const untilText = (ts) => (new Date(ts).toDateString() === new Date().toDateString() ? fmtTime(ts) : fmtWhen(ts));

// Someone's color in a space: their highest role that has one.
function memberColor(space, userId) {
  const m = space && space.byId && space.byId.get(userId);
  const role = m && space.roles.find((r) => r.color && m.roles.includes(r.id));
  return role ? role.color : '';
}

// Names above messages in a space's channels, in their colors.
function paintNames(spaceId) {
  const space = S.spaces.get(spaceId);
  if (!space) return;
  for (const c of space.channels) {
    const dm = S.dms.get(`ch:${c.id}`);
    if (!dm) continue;
    for (const head of dm.log.querySelectorAll('li[data-author] > .msg-name')) head.style.color = memberColor(space, head.parentElement.dataset.author);
    for (const body of dm.log.querySelectorAll('.msg-text')) {
      if (!body._text || !body._text.includes('@')) continue;
      const edited = body.querySelector(':scope > .msg-edited');
      body.replaceChildren();
      appendLinked(body, body._text, space, body._everyone);
      if (edited) body.append(edited);
    }
  }
}

function spaceMentions(spaceId) {
  let n = 0;
  for (const [id, c] of S.channels) if (c.spaceId === spaceId && c.kind !== 'voice') n += dmFor(`ch:${id}`).mentions || 0;
  return n;
}

function spaceUnread(spaceId) {
  for (const [id, c] of S.channels) if (c.spaceId === spaceId && c.kind !== 'voice' && dmFor(`ch:${id}`).unread) return true;
  return false;
}

function renderSpaces() {
  renderRail();
  renderSide();
  renderGroups();
}

function renderRail() {
  let dmUnread = 0;
  for (const dm of S.dms.values()) if (!dm.channelId || groupOfChannel(dm.channelId)) dmUnread += dm.unread;
  el.railHome.classList.toggle('open', S.view === 'home');
  el.railHome.classList.toggle('unread', S.view !== 'home' && dmUnread > 0);
  el.railSpaces.replaceChildren(...[...S.spaces.values()].filter((space) => !isGroupSpace(space)).map((space) => {
    const b = document.createElement('button');
    b.type = 'button';
    const unread = spaceUnread(space.id);
    const mentions = spaceMentions(space.id);
    b.className = `rail-btn rail-space${S.view === space.id ? ' open' : ''}${unread ? ' unread' : ''}`;
    b.title = space.name;
    b.setAttribute('aria-label', `${space.name}${mentions ? ` (${mentions} mention${mentions === 1 ? '' : 's'})` : unread ? ' (unread)' : ''}`);
    b.style.setProperty('--face-bg', faceColor(space.id));
    b.textContent = spaceInitials(space.name);
    if (mentions) {
      const pill = document.createElement('span');
      pill.className = 'rail-mentions';
      pill.textContent = mentions > 99 ? '99+' : String(mentions);
      b.append(pill);
    }
    b.addEventListener('click', () => showSpace(space.id));
    return b;
  }));
}

function renderSide() {
  const space = S.view !== 'home' && S.spaces.get(S.view);
  el.homeSide.hidden = Boolean(space);
  el.spaceSide.hidden = !space;
  el.brand.hidden = Boolean(space);
  el.spaceHead.hidden = !space;
  if (!space) return;
  el.spaceTitle.textContent = space.name;
  el.addChannelBtn.hidden = !canIn(space, 'manageChannels');
  const adding = el.channelList.querySelector('.channel-new');
  el.channelList.replaceChildren(...space.channels.filter((c) => c.kind !== 'voice').map(channelItem), ...(adding ? [adding] : []));
  // Voice channels, and who's in them.
  const voice = space.channels.filter((c) => c.kind === 'voice');
  el.addVoiceBtn.hidden = !(canIn(space, 'manageChannels') && S.voiceEnabled);
  el.voiceSection.hidden = !voice.length && el.addVoiceBtn.hidden;
  const addingVoice = el.voiceList.querySelector('.channel-new');
  el.voiceList.replaceChildren(...voice.map(voiceChannelItem), ...(addingVoice ? [addingVoice] : []));
}

function channelItem(c) {
  const key = `ch:${c.id}`;
  const dm = dmFor(key);
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `channel${S.openDm === key ? ' open' : ''}${dm.unread ? ' unread' : ''}`;
  b.innerHTML = `<svg class="icon"><use href="#${c.private ? 'i-lock' : 'i-hash'}"/></svg>`;
  if (c.private) b.title = 'Private: only some roles can see it';
  const name = document.createElement('span');
  name.className = 'channel-name';
  name.textContent = c.name;
  b.append(name);
  // New messages light a little orb; mentions of you get a count instead, like Discord.
  if (dm.mentions && S.openDm !== key) {
    const badge = document.createElement('span');
    badge.className = 'badge mention';
    badge.textContent = dm.mentions > 99 ? '99+' : String(dm.mentions);
    badge.title = `${dm.mentions} mention${dm.mentions === 1 ? '' : 's'} of you`;
    b.append(badge);
  } else if (dm.unread && S.openDm !== key) {
    const orb = document.createElement('span');
    orb.className = 'unread-orb';
    orb.title = `${dm.unread > 99 ? '99+' : dm.unread} new message${dm.unread === 1 ? '' : 's'}`;
    b.append(orb);
  }
  b.addEventListener('click', () => openDm(key));
  li.append(b);
  return li;
}

// The channel you were in last, in each space.
function rememberChannel(channelId) {
  const c = S.channels.get(channelId);
  if (!c) return;
  const last = lastChannels();
  last[c.spaceId] = channelId;
  store.set('lastChannels', JSON.stringify(last));
}

function lastChannels() {
  try {
    return JSON.parse(store.get('lastChannels', '{}')) || {};
  } catch {
    return {};
  }
}

const phoneLayout = () => matchMedia('(max-width: 760px)').matches;

// The rail: a space. Its channels show in the sidebar, and (on a computer) the one you were
// in last opens. On a phone, you pick one from the list.
async function showSpace(spaceId) {
  const space = S.spaces.get(spaceId);
  if (!space) return;
  S.view = spaceId;
  renderSpaces();
  if (!space.members) await loadMembers(spaceId);
  if (S.view !== spaceId || phoneLayout()) return;
  const last = lastChannels()[spaceId];
  const texts = space.channels.filter((c) => c.kind !== 'voice');
  const channel = texts.find((c) => c.id === last) || texts[0];
  if (channel && S.openDm !== `ch:${channel.id}`) openDm(`ch:${channel.id}`);
}

// The rail: Home. Your friends, and the conversation you had open there (if it was a DM).
function showHome() {
  S.view = 'home';
  if (S.openDm && isChannelKey(S.openDm)) {
    if (phoneLayout()) closeDm();
    else {
      closeGifPanel();
      stopEdit();
      stopReply();
      stopTyping();
      S.openDm = '';
      el.dm.hidden = true;
      el.home.hidden = false;
      el.app.classList.remove('in-dm');
    }
  }
  renderMemberPanel();
  renderFriends();
}

function renderChannelHead() {
  const c = S.channels.get(channelIdOf(S.openDm));
  if (!c) return;
  const space = S.spaces.get(c.spaceId);
  el.dmFace.replaceChildren();
  el.dmFace.style.removeProperty('--face-bg');
  delete el.dmFace.dataset.presence;
  if (isGroupSpace(space)) return renderGroupHead(space);
  el.dmFace.classList.remove('group-face');
  el.dmFace.classList.add('channel-face');
  el.dmFace.innerHTML = `<svg class="icon"><use href="#${c.private ? 'i-lock' : 'i-hash'}"/></svg>`;
  el.dmName.textContent = c.name;
  el.dmSub.textContent = space ? `${space.name} · ${space.memberCount} member${space.memberCount === 1 ? '' : 's'}` : '';
  el.dmWho.title = 'See who is here';
  el.dmBack.setAttribute('aria-label', 'Back to channels');
  el.dmBack.title = 'Back to channels';
  el.dmSave.hidden = true;
  el.dmCallBtn.hidden = true;
  el.dmNotice.hidden = true;
}

// A group's head: its picture and name (click for its details), how many are in it, and its
// call button (green while a call's going).
function renderGroupHead(space) {
  el.dmFace.classList.remove('channel-face');
  el.dmFace.classList.add('group-face');
  el.dmFace.style.setProperty('--face-bg', faceColor(space.id));
  el.dmFace.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-users"/></svg>';
  el.dmName.textContent = groupTitle(space);
  const calling = groupInCall(space);
  el.dmSub.textContent = `${(space.people || []).length} people${calling ? ` · in a call (${calling} here)` : ''}`;
  el.dmWho.title = "The group's name, people and settings";
  el.dmBack.setAttribute('aria-label', 'Back to friends');
  el.dmBack.title = 'Back to friends';
  el.dmSave.hidden = true;
  el.dmNotice.hidden = true;
  const call = groupCallOf(space);
  const inIt = Boolean(call && S.voice && S.voice.channelId === call.id);
  el.dmCallBtn.hidden = !S.voiceEnabled || !call;
  el.dmCallBtn.disabled = false;
  el.dmCallBtn.classList.toggle('live', calling > 0);
  el.dmCallBtn.title = inIt ? 'Back to the call' : calling ? 'Join the call' : 'Start a call (rings everyone)';
}

// The message box, for what you can do where you are: in a channel, that's up to your roles.
function renderComposer() {
  const c = isChannelKey(S.openDm) && S.channels.get(channelIdOf(S.openDm));
  const can = (c && c.can) || { send: true, files: true };
  el.chatForm.classList.toggle('locked', !can.send);
  el.chatInput.disabled = !can.send;
  el.chatForm.querySelector('.send-btn').disabled = !can.send;
  el.attachBtn.hidden = !can.files;
  el.gifBtn.hidden = !S.klipyKey || !can.send;
  if (!can.send) closeGifPanel();
  const space = c && S.spaces.get(c.spaceId);
  if (c && isGroupSpace(space)) {
    el.chatInput.placeholder = `Message ${groupTitle(space)}`;
  } else if (c) {
    el.chatInput.placeholder = can.send ? `Message #${c.name}`
      : can.timedOut && space ? `You're in a timeout until ${untilText(space.timeoutUntil)}`
      : c.readonly ? `Only some roles can post in #${c.name}` : `You can't send messages in #${c.name}`;
  }
}

// ----- The space's menu -----

function openSpaceMenu() {
  const space = S.spaces.get(S.view);
  if (!space) return;
  if (!el.spaceMenu.hidden) return closeSpaceMenu();
  el.smInvite.hidden = !canIn(space, 'invite');
  for (const b of el.smNotify.querySelectorAll('[data-level]')) b.setAttribute('aria-checked', String(b.dataset.level === (space.notify || 'mentions')));
  el.smSettings.hidden = !canOpenSettings(space);
  el.smLeave.hidden = space.role === 'owner';
  el.spaceMenu.hidden = false;
  const r = el.spaceHead.getBoundingClientRect();
  const z = uiZoom();
  el.spaceMenu.style.left = `${Math.max(8, r.left) / z}px`;
  el.spaceMenu.style.top = `${(r.bottom + 4) / z}px`;
  el.spaceMenu.style.minWidth = `${Math.round(r.width / z)}px`;
  el.spaceHead.setAttribute('aria-expanded', 'true');
  el.spaceMenu.querySelector('button:not([hidden])').focus({ preventScroll: true });
}

function closeSpaceMenu() {
  if (el.spaceMenu.hidden) return;
  el.spaceMenu.hidden = true;
  el.spaceHead.setAttribute('aria-expanded', 'false');
}

async function onSpaceNotify(e) {
  const b = e.target.closest('[data-level]');
  const space = S.spaces.get(S.view);
  if (!b || !space) return;
  closeSpaceMenu();
  try {
    await api('PUT', `/spaces/${space.id}/notify`, { level: b.dataset.level });
    space.notify = b.dataset.level;
    toast({ all: `You'll hear about every message in ${space.name}.`, mentions: `You'll hear from ${space.name} when someone mentions you.`, none: `You won't hear from ${space.name}. Unread messages still show.` }[b.dataset.level]);
  } catch (err) {
    toast(err.message);
  }
}

// ----- @mentions in the message box -----
// Typing "@" in a channel offers the people who can see it (and @everyone, if you may).

let mentionPick = { open: false, items: [], index: 0, start: 0 };

function canSeeChannel(space, c, m) {
  return !c.private || m.owner || isAdministrator(space, m) || m.roles.some((r) => c.seeRoles.includes(r));
}

function onMentionInput() {
  const c = isChannelKey(S.openDm) && S.channels.get(channelIdOf(S.openDm));
  const space = c && S.spaces.get(c.spaceId);
  if (!space || !space.members) return closeMentionPick();
  const caret = el.chatInput.selectionStart;
  const typed = el.chatInput.value.slice(0, caret).match(/(^|[^\w@.])@([\w.]{0,32})$/);
  if (!typed) return closeMentionPick();
  const q = typed[2].toLowerCase();
  const items = space.members
    .filter((p) => p.id !== S.clientId && !(S.blocked && S.blocked.has(p.id)) && canSeeChannel(space, c, p))
    .filter((p) => p.username.startsWith(q) || p.displayName.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
    .slice(0, 8)
    .map((p) => ({ person: p, insert: p.username }));
  if (canIn(space, 'mentionEveryone') && 'everyone'.startsWith(q)) items.push({ person: null, insert: 'everyone' });
  if (!items.length) return closeMentionPick();
  mentionPick = { open: true, items, index: 0, start: caret - q.length - 1 };
  renderMentionPick();
}

function renderMentionPick() {
  el.mentionPick.replaceChildren(...mentionPick.items.map((item, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === mentionPick.index ? 'active' : '';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(i === mentionPick.index));
    const name = document.createElement('span');
    const sub = document.createElement('small');
    if (item.person) {
      name.textContent = item.person.displayName;
      sub.textContent = `@${item.person.username}`;
      b.append(makeFace(item.person, null), name, sub);
    } else {
      name.textContent = '@everyone';
      sub.textContent = 'everyone who can see this channel';
      b.append(name, sub);
    }
    // (Keep the message box focused.)
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => pickMention(item));
    return b;
  }));
  const form = el.chatForm.getBoundingClientRect();
  const box = el.chatForm.closest('.dm-body').getBoundingClientRect();
  el.mentionPick.style.bottom = `${Math.round((box.bottom - form.top) / uiZoom() + 6)}px`;
  el.mentionPick.hidden = false;
}

function pickMention(item) {
  const v = el.chatInput.value;
  const caret = el.chatInput.selectionStart;
  const text = `@${item.insert} `;
  setChatText(v.slice(0, mentionPick.start) + text + v.slice(caret));
  const pos = mentionPick.start + text.length;
  el.chatInput.setSelectionRange(pos, pos);
  closeMentionPick();
  el.chatInput.focus();
}

function closeMentionPick() {
  if (!mentionPick.open) return;
  mentionPick = { open: false, items: [], index: 0, start: 0 };
  el.mentionPick.hidden = true;
}

function onMentionKey(e) {
  if (!mentionPick.open) return;
  const n = mentionPick.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') mentionPick.index = (mentionPick.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
  else if (e.key === 'Enter' || e.key === 'Tab') pickMention(mentionPick.items[mentionPick.index]);
  else if (e.key === 'Escape') closeMentionPick();
  else return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (mentionPick.open) renderMentionPick();
}

// ----- Making and joining spaces -----

function openSpaceNew() {
  showSpaceNewError('');
  el.spaceCreateName.value = '';
  el.spaceJoinCode.value = '';
  el.spaceImportLink.value = '';
  resetDiscordImport();
  el.spaceNew.showModal();
  el.spaceCreateName.focus();
}

function showSpaceNewError(text) {
  el.spaceNewError.textContent = text;
  el.spaceNewError.hidden = !text;
}

async function onSpaceCreate(e) {
  e.preventDefault();
  const name = el.spaceCreateName.value.trim();
  if (!name) return showSpaceNewError('Give your space a name.');
  try {
    const { space } = await api('POST', '/spaces', { name });
    el.spaceNew.close();
    await refreshSpaces();
    showSpace(space.id);
  } catch (err) {
    showSpaceNewError(err.message);
  }
}

// ----- Bringing a Discord server over -----
// Paste a server template link: look it up (what it would make), then make it.

let discordImport = { code: '', plan: null };

// "https://discord.new/AbC123", "discord.com/template/AbC123", or just the code.
function discordTemplateCode(text) {
  const s = String(text || '').trim();
  const m = s.match(/discord(?:app)?\.(?:new|com\/template)\/([A-Za-z0-9]+)/i);
  if (m) return m[1];
  return /^[A-Za-z0-9]{2,32}$/.test(s) ? s : '';
}

function resetDiscordImport() {
  discordImport = { code: '', plan: null };
  el.spaceImportPreview.hidden = true;
  el.spaceImportPreview.replaceChildren();
  el.spaceImportBtn.textContent = 'Look it up';
}

async function onSpaceImport(e) {
  e.preventDefault();
  showSpaceNewError('');
  const code = discordTemplateCode(el.spaceImportLink.value);
  if (!code) return showSpaceNewError("That doesn't look like a Discord template link (they look like https://discord.new/…).");
  el.spaceImportBtn.disabled = true;
  try {
    if (discordImport.code !== code || !discordImport.plan) {
      // First: what it would make.
      const { template } = await api('GET', `/discord-templates/${encodeURIComponent(code)}`);
      discordImport = { code, plan: template };
      renderDiscordPreview(template);
      return;
    }
    const { space, notes } = await api('POST', '/spaces/from-discord', { link: code });
    el.spaceNew.close();
    await refreshSpaces();
    showSpace(space.id);
    toast(`${space.name} is ready${notes && notes.length ? `. ${notes[0]}` : '.'} Invite people from the space's menu.`, 8000);
  } catch (err) {
    showSpaceNewError(err.message);
  } finally {
    el.spaceImportBtn.disabled = false;
  }
}

function renderDiscordPreview(t) {
  const name = document.createElement('strong');
  name.textContent = t.name;
  const counts = document.createElement('span');
  counts.className = 'import-counts';
  const parts = [`${t.textChannels} text channel${t.textChannels === 1 ? '' : 's'}`];
  if (t.voiceChannels) parts.push(`${t.voiceChannels} voice`);
  if (t.privateChannels) parts.push(`${t.privateChannels} private`);
  parts.push(t.roles.length ? `${t.roles.length} role${t.roles.length === 1 ? '' : 's'}: ${t.roles.slice(0, 6).map((r) => r.name).join(', ')}${t.roles.length > 6 ? '…' : ''}` : 'no roles besides @everyone');
  counts.textContent = parts.join(' · ');
  const bits = [name, counts];
  if (t.notes.length) {
    const ul = document.createElement('ul');
    ul.replaceChildren(...t.notes.map((n) => {
      const li = document.createElement('li');
      li.textContent = n;
      return li;
    }));
    bits.push(ul);
  }
  el.spaceImportPreview.replaceChildren(...bits);
  el.spaceImportPreview.hidden = false;
  el.spaceImportBtn.textContent = `Make ${t.name}`;
}

// "https://rainlit.app/join/AbCd1234", or just the code.
function inviteCodeFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(/(?:^|\/join\/)([A-Za-z0-9_-]{8})\/?$/);
  if (!m) return { error: "That doesn't look like an invite link." };
  if (/^https?:\/\//i.test(t)) {
    const host = new URL(t).host;
    if (host !== location.host) return { error: `That's an invite to another Rainlit server (${host}). Open it there.` };
  }
  return { code: m[1] };
}

function onSpaceJoinCode(e) {
  e.preventDefault();
  const { code, error } = inviteCodeFrom(el.spaceJoinCode.value);
  if (error) return showSpaceNewError(error);
  el.spaceNew.close();
  openJoin(code);
}

// An invite link: rainlit.app/join/<code>. It opens Rainlit, which asks if you'd like to join.
function followJoinLink() {
  const m = location.pathname.match(/^\/join\/([A-Za-z0-9_-]{8})\/?$/);
  let code = m && m[1];
  if (m) history.replaceState(null, '', '/');
  try {
    if (code) sessionStorage.removeItem('rainlit.joinCode');
    else code = sessionStorage.getItem('rainlit.joinCode');
    sessionStorage.removeItem('rainlit.joinCode');
  } catch {}
  if (code) openJoin(code);
}

async function openJoin(code) {
  let info;
  try {
    info = await api('GET', `/space-invites/${code}`);
  } catch (err) {
    return toast(err.message || "That invite link doesn't work any more.");
  }
  if (info.member) {
    await refreshSpaces();
    return showSpace(info.space.id);
  }
  if (info.banned) return toast(`You've been banned from ${info.space.name}.`);
  S.joinCode = code;
  el.spaceJoinName.textContent = info.space.name;
  el.spaceJoinCount.textContent = `${info.space.memberCount} member${info.space.memberCount === 1 ? '' : 's'}`;
  el.spaceJoinIcon.textContent = spaceInitials(info.space.name);
  el.spaceJoinIcon.style.setProperty('--face-bg', faceColor(info.space.id));
  el.spaceJoinError.hidden = true;
  el.spaceJoin.showModal();
}

async function onJoinSpace() {
  el.spaceJoinBtn.disabled = true;
  try {
    const { space } = await api('POST', `/space-invites/${S.joinCode}`);
    el.spaceJoin.close();
    await refreshSpaces();
    showSpace(space.id);
  } catch (err) {
    el.spaceJoinError.textContent = err.message;
    el.spaceJoinError.hidden = false;
  } finally {
    el.spaceJoinBtn.disabled = false;
  }
}

// ----- Inviting, members, settings -----

async function openInvite() {
  closeSpaceMenu();
  const space = S.spaces.get(S.view);
  if (!space) return;
  el.spaceInviteName.textContent = space.name;
  el.spaceInviteLink.value = 'Making a link…';
  el.spaceInviteCopy.textContent = 'Copy';
  el.spaceInvite.showModal();
  try {
    const { code } = await api('POST', `/spaces/${space.id}/invites`);
    el.spaceInviteLink.value = `${location.origin}/join/${code}`;
    el.spaceInviteLink.select();
  } catch (err) {
    el.spaceInviteLink.value = '';
    toast(err.message);
  }
}

async function copySpaceInvite() {
  const link = el.spaceInviteLink.value;
  if (!/^https?:\/\//.test(link)) return;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    el.spaceInviteLink.select();
    document.execCommand('copy');
  }
  el.spaceInviteCopy.textContent = 'Copied!';
}

async function openMembers() {
  closeSpaceMenu();
  S.rolesPanelFor = '';
  const spaceId = isChannelKey(S.openDm) && S.view === 'home' ? S.channels.get(channelIdOf(S.openDm)).spaceId : S.view;
  const space = S.spaces.get(spaceId);
  if (!space) return;
  el.spaceMembers.dataset.space = spaceId;
  renderMembers();
  el.spaceMembers.showModal();
  await loadMembers(spaceId);
  renderMembers();
}

// Members in groups, like Discord's list: each role shown separately (highest first), then
// everyone else.
function memberGroups(space) {
  const hoisted = space.roles.filter((r) => r.hoist);
  const groups = new Map(hoisted.map((r) => [r.id, []]));
  const rest = [];
  for (const m of space.members || []) {
    const role = hoisted.find((r) => m.roles.includes(r.id));
    (role ? groups.get(role.id) : rest).push(m);
  }
  return [...hoisted.map((r) => ({ title: r.name, members: groups.get(r.id) })), { title: 'Members', members: rest }]
    .filter((g) => g.members.length);
}

function renderMembers() {
  const space = S.spaces.get(el.spaceMembers.dataset.space);
  if (!space) return;
  el.spaceMembersTitle ||= document.getElementById('space-members-title');
  el.spaceMembersTitle.textContent = `Members of ${space.name}`;
  const items = [];
  for (const group of memberGroups(space)) {
    const head = document.createElement('li');
    head.className = 'member-group';
    head.textContent = `${group.title} — ${group.members.length}`;
    items.push(head);
    for (const m of group.members) items.push(...memberRow(space, m));
  }
  el.spaceMemberList.replaceChildren(...items);
}

function memberRow(space, m) {
  const li = document.createElement('li');
  li.className = 'member-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'member';
  btn.addEventListener('click', () => openMiniProfile(m.id));
  const text = document.createElement('span');
  text.className = 'member-text';
  const name = document.createElement('span');
  name.className = 'member-name';
  name.textContent = m.id === S.clientId ? `${m.displayName} (you)` : m.displayName;
  name.style.color = memberColor(space, m.id);
  if (m.owner) name.insertAdjacentHTML('beforeend', '<svg class="icon crown" aria-label="Owner"><title>Owner</title><use href="#i-crown"/></svg>');
  const user = document.createElement('span');
  user.className = 'member-user';
  user.textContent = `@${m.username}`;
  text.append(name, user);
  if (m.timeoutUntil > Date.now()) {
    const quiet = document.createElement('span');
    quiet.className = 'timeout-chip';
    quiet.textContent = `In a timeout until ${untilText(m.timeoutUntil)}`;
    text.append(quiet);
  }
  const theirs = space.roles.filter((r) => m.roles.includes(r.id));
  if (theirs.length) {
    const chips = document.createElement('span');
    chips.className = 'role-chips';
    chips.append(...theirs.map(roleChip));
    text.append(chips);
  }
  btn.append(makeFace(m, null), text);
  li.append(btn);
  const giveable = canManageMemberIn(space, m) ? space.roles.filter((r) => canManageRoleIn(space, r)) : [];
  const mods = ['timeout', 'kick', 'ban'].filter((perm) => canModerateIn(space, m, perm));
  const open = S.rolesPanelFor === m.id;
  if (giveable.length || mods.length) {
    const roles = document.createElement('button');
    roles.type = 'button';
    roles.className = 'text-btn member-roles-btn';
    roles.textContent = 'Manage';
    roles.setAttribute('aria-expanded', String(open));
    roles.addEventListener('click', () => {
      S.rolesPanelFor = open ? '' : m.id;
      renderMembers();
    });
    li.append(roles);
  } else if (open) {
    S.rolesPanelFor = '';
  }
  if (!open || S.rolesPanelFor !== m.id) return [li];
  // Their roles, as switches: the ones you can give.
  const panel = document.createElement('li');
  panel.className = 'member-roles-panel';
  panel.append(...giveable.map((r) => {
    const label = document.createElement('label');
    label.className = 'toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = m.roles.includes(r.id);
    box.addEventListener('change', async () => {
      box.disabled = true;
      try {
        await api(box.checked ? 'PUT' : 'DELETE', `/spaces/${space.id}/members/${m.id}/roles/${r.id}`);
      } catch (err) {
        box.checked = !box.checked;
        toast(err.message);
      }
      box.disabled = false;
    });
    label.append(box, roleChip(r));
    return label;
  }));
  if (mods.length) {
    const row = document.createElement('div');
    row.className = 'mod-actions';
    const act = (text, onClick, danger = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `small-btn${danger ? ' danger' : ''}`;
      b.textContent = text;
      b.addEventListener('click', onClick);
      row.append(b);
    };
    if (mods.includes('timeout')) {
      if (m.timeoutUntil > Date.now()) act('End timeout', () => endTimeout(space, m));
      else act('Time out', () => openModDialog('timeout', space, m));
    }
    if (mods.includes('kick')) act('Kick', () => openModDialog('kick', space, m));
    if (mods.includes('ban')) act('Ban', () => openModDialog('ban', space, m), true);
    panel.append(row);
  }
  return [li, panel];
}

// ----- Reports -----
// About a message or a person. Space reports go to its moderators; all go to the server's admin.

const REPORT_REASONS = {
  spam: 'Spam',
  harassment: 'Harassment or hate',
  inappropriate: 'Something inappropriate or disturbing',
  danger: 'Someone may be in danger',
  other: 'Something else',
};

let reportTarget = null;

// { messageId } or { userId }, with who it's about and (for a person) the space it's from.
function openReportDialog(target) {
  reportTarget = target;
  const c = target.messageId && S.channels.get(target.channelId);
  const space = S.spaces.get(c ? c.spaceId : target.spaceId);
  el.reportTitle.textContent = target.messageId ? `Report ${target.name}'s message` : `Report ${target.name}`;
  el.reportText.textContent = `${space ? `${space.name}'s moderators and ` : ''}${space ? 'this' : 'This'} server's admin will see your report${target.messageId ? ', with a copy of the message' : ''}. ${target.name} won't be told who sent it.`;
  for (const r of el.reportForm.querySelectorAll('input[name="report-reason"]')) r.checked = false;
  el.reportDanger.hidden = true;
  el.reportNote.value = '';
  el.reportBlock.checked = false;
  el.reportBlockField.hidden = !target.userId || S.blocked.has(target.userId) || target.userId === S.clientId;
  el.reportBlockText.textContent = `Block ${target.name} too`;
  el.reportError.hidden = true;
  el.reportDialog.showModal();
}

async function onReportSend(e) {
  e.preventDefault();
  const t = reportTarget;
  const reason = el.reportForm.querySelector('input[name="report-reason"]:checked');
  if (!t) return;
  if (!reason) {
    el.reportError.textContent = 'Pick what the problem is.';
    el.reportError.hidden = false;
    return;
  }
  el.reportSend.disabled = true;
  try {
    await api('POST', '/reports', {
      ...(t.messageId ? { messageId: t.messageId } : { userId: t.userId, spaceId: t.spaceId || null }),
      reason: reason.value, note: el.reportNote.value.trim(), block: !el.reportBlockField.hidden && el.reportBlock.checked,
    });
    el.reportDialog.close();
    toast(el.reportBlock.checked && !el.reportBlockField.hidden ? `Thanks. Your report was sent, and ${t.name} is blocked.` : 'Thanks. Your report was sent.');
    if (el.reportBlock.checked) refreshFriends();
  } catch (err) {
    el.reportError.textContent = err.message;
    el.reportError.hidden = false;
  } finally {
    el.reportSend.disabled = false;
  }
}

function onReportNew({ space, quiet }) {
  if (space) {
    if (modState.spaceId === space) modState.stale = true;
    refreshSpaces().then(() => { if (el.spaceSettings.open) renderSpaceSettings(); });
  }
  if (S.me && S.me.isAdmin) {
    refreshFriends();
    if (el.admin.open) renderAdmin();
  }
  if (quiet) return;
  const s = space && S.spaces.get(space);
  toast(s ? `There's a new report in ${s.name}.` : "There's a new report for this server.");
}

// One report, for a space's moderators or the server's admin.
function reportItem(r, { spaceId = null, onResolve }) {
  const li = document.createElement('li');
  li.className = `report${r.resolved ? ' resolved' : ''}`;
  const head = document.createElement('div');
  head.className = 'report-head';
  const who = document.createElement('span');
  const whom = r.target ? r.target.displayName : 'someone';
  who.textContent = `${r.reporter ? r.reporter.displayName : 'Someone'} reported ${r.messageId ? `a message from ${whom}` : whom}`;
  const time = document.createElement('time');
  time.textContent = fmtWhen(r.at);
  head.append(who, time);
  const why = document.createElement('strong');
  why.className = `report-reason${r.reason === 'danger' ? ' urgent' : ''}`;
  why.textContent = REPORT_REASONS[r.reason] || r.reason;
  li.append(head, why);
  if (r.note) {
    const note = document.createElement('p');
    note.className = 'report-note';
    note.textContent = `“${r.note}”`;
    li.append(note);
  }
  const s = r.snapshot || {};
  if (r.messageId) {
    const quote = document.createElement('blockquote');
    quote.className = 'report-quote';
    quote.textContent = s.text || (s.file ? `A file: ${s.file.name}` : s.gif ? `A GIF: ${s.gif.title || 'untitled'}` : '(not saved, so there is no copy)');
    const where = document.createElement('small');
    where.textContent = s.channel ? `in #${s.channel}${s.space && !spaceId ? ` (${s.space})` : ''}` : 'in a DM';
    li.append(quote, where);
  }
  const acts = document.createElement('div');
  acts.className = 'mod-actions';
  const space = spaceId && S.spaces.get(spaceId);
  if (!r.resolved && r.messageId && space && canIn(space, 'manageMessages') && S.channels.has(r.convId)) {
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'small-btn danger';
    rm.textContent = 'Remove the message';
    rm.addEventListener('click', async () => {
      try {
        await api('DELETE', `/channels/${r.convId}/messages/${r.messageId}`);
        rm.textContent = 'Removed';
        rm.disabled = true;
      } catch (err) {
        toast(err.message);
      }
    });
    acts.append(rm);
  }
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'small-btn';
  done.textContent = r.resolved ? 'Reopen' : 'Mark as dealt with';
  done.addEventListener('click', () => onResolve(r, !r.resolved));
  acts.append(done);
  if (r.resolved) {
    const by = document.createElement('small');
    by.className = 'report-by';
    by.textContent = `Dealt with by ${r.resolved.by ? r.resolved.by.displayName : 'someone'}, ${fmtWhen(r.resolved.at)}`;
    acts.append(by);
  }
  li.append(acts);
  return li;
}

// ----- Moderation -----
// A timeout, kick or ban, with a reason for the log.

let modTarget = null;

function openModDialog(kind, space, m) {
  modTarget = { kind, spaceId: space.id, userId: m.id, name: m.displayName };
  el.modTitle.textContent = { timeout: 'Time out', kick: 'Kick', ban: 'Ban' }[kind] + ` ${m.displayName}`;
  el.modText.textContent = {
    timeout: `They can still read ${space.name}, but can't post or react until the timeout ends.`,
    kick: `They'll be taken out of ${space.name}. They can come back with an invite link.`,
    ban: `They'll be taken out of ${space.name}, and can't come back, even with an invite link, unless the ban is lifted.`,
  }[kind];
  el.modLengthField.hidden = kind !== 'timeout';
  el.modPurgeField.hidden = kind !== 'ban';
  el.modLength.value = '600';
  el.modPurge.value = '0';
  el.modReason.value = '';
  el.modConfirm.textContent = { timeout: 'Time out', kick: 'Kick', ban: 'Ban' }[kind];
  el.modError.hidden = true;
  el.modDialog.showModal();
  el.modReason.focus();
}

async function onModConfirm(e) {
  e.preventDefault();
  const t = modTarget;
  if (!t) return;
  const body = { reason: el.modReason.value.trim() };
  if (t.kind === 'timeout') body.seconds = Number(el.modLength.value);
  if (t.kind === 'ban') body.purge = Number(el.modPurge.value);
  el.modConfirm.disabled = true;
  try {
    const res = await api('POST', `/spaces/${t.spaceId}/members/${t.userId}/${t.kind}`, body);
    el.modDialog.close();
    toast(t.kind === 'timeout' ? `${t.name} is in a timeout until ${untilText(res.until)}.`
      : t.kind === 'kick' ? `${t.name} was kicked.`
      : `${t.name} was banned${res.removed ? `, and ${res.removed} of their messages removed` : ''}.`);
  } catch (err) {
    el.modError.textContent = err.message;
    el.modError.hidden = false;
  } finally {
    el.modConfirm.disabled = false;
  }
}

async function endTimeout(space, m) {
  try {
    await api('POST', `/spaces/${space.id}/members/${m.id}/timeout`, { seconds: 0 });
    toast(`${m.displayName}'s timeout is over.`);
  } catch (err) {
    toast(err.message);
  }
}

// Space settings, Moderation: who's in a timeout, who's banned, and the log.
const modState = { spaceId: '', bans: null, log: null, reports: null, more: false, stale: true, loading: false };

function renderModerationPanel(space) {
  if (modState.spaceId !== space.id) Object.assign(modState, { spaceId: space.id, bans: null, log: null, reports: null, more: false, stale: true });
  if (modState.stale && !modState.loading) loadModeration(space);
  const parts = [];
  const title = (text) => {
    const h = document.createElement('h3');
    h.className = 'side-title';
    h.textContent = text;
    return h;
  };
  const note = (text) => {
    const p = document.createElement('small');
    p.className = 'hint';
    p.textContent = text;
    return p;
  };
  const row = (who, detail, buttonText, onClick) => {
    const li = document.createElement('li');
    li.className = 'mod-row';
    const words = document.createElement('span');
    words.className = 'mod-row-text';
    const name = document.createElement('strong');
    name.textContent = who.displayName;
    const more = document.createElement('small');
    more.textContent = detail;
    words.append(name, more);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'small-btn';
    b.textContent = buttonText;
    b.addEventListener('click', onClick);
    li.append(makeFace(who, null), words, b);
    return li;
  };
  if (space.reports !== undefined) {
    parts.push(title('Reports'));
    if (!modState.reports) parts.push(note('Loading…'));
    else if (!modState.reports.length) parts.push(note('No reports. Members can report messages and people, and they show up here.'));
    else {
      const list = document.createElement('ol');
      list.className = 'report-list';
      list.append(...modState.reports.map((r) => reportItem(r, {
        spaceId: space.id,
        onResolve: async (report, resolved) => {
          try {
            await api('POST', `/spaces/${space.id}/reports/${report.id}/resolve`, { resolved });
          } catch (err) {
            showSettingsError(err.message);
          }
        },
      })));
      parts.push(list);
    }
  }
  if (canIn(space, 'timeout')) {
    const quiet = (space.members || []).filter((m) => m.timeoutUntil > Date.now());
    parts.push(title('In a timeout'));
    if (!quiet.length) parts.push(note('Nobody right now.'));
    else {
      const list = document.createElement('ol');
      list.className = 'mod-list';
      list.append(...quiet.map((m) => row(m, `until ${untilText(m.timeoutUntil)}`, 'End it', () => endTimeout(space, m))));
      parts.push(list);
    }
  }
  if (canIn(space, 'ban')) {
    parts.push(title('Banned'));
    if (!modState.bans) parts.push(note('Loading…'));
    else if (!modState.bans.length) parts.push(note('Nobody is banned.'));
    else {
      const list = document.createElement('ol');
      list.className = 'mod-list';
      list.append(...modState.bans.map((b) => row(b.user, [b.by ? `by ${b.by.name}` : '', fmtWhen(b.at), b.reason].filter(Boolean).join(' · '), 'Lift ban', async () => {
        try {
          await api('DELETE', `/spaces/${space.id}/bans/${b.user.id}`);
          toast(`${b.user.displayName} can come back now.`);
        } catch (err) {
          showSettingsError(err.message);
        }
      })));
      parts.push(list);
    }
  }
  if (canIn(space, 'viewLog')) {
    parts.push(title('Log'));
    if (!modState.log) parts.push(note('Loading…'));
    else if (!modState.log.length) parts.push(note('Nothing yet.'));
    else {
      const list = document.createElement('ol');
      list.className = 'space-log';
      list.append(...modState.log.map((e) => {
        const li = document.createElement('li');
        const time = document.createElement('time');
        time.textContent = fmtWhen(e.at);
        const words = document.createElement('span');
        words.textContent = spaceLogText(e);
        li.append(words, time);
        return li;
      }));
      parts.push(list);
      if (modState.more) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'text-btn';
        more.textContent = 'Show older';
        more.addEventListener('click', () => loadModeration(space, true));
        parts.push(more);
      }
    }
  }
  el.spaceModeration.replaceChildren(...parts);
}

async function loadModeration(space, older = false) {
  modState.loading = true;
  modState.stale = false;
  try {
    const [reports, bans, log] = await Promise.all([
      space.reports !== undefined && !older ? api('GET', `/spaces/${space.id}/reports`) : null,
      canIn(space, 'ban') && !older ? api('GET', `/spaces/${space.id}/bans`) : null,
      canIn(space, 'viewLog') ? api('GET', `/spaces/${space.id}/log${older && modState.log ? `?before=${modState.log.at(-1).id}` : ''}`) : null,
    ]);
    if (modState.spaceId !== space.id) return;
    if (reports) modState.reports = reports.reports;
    if (bans) modState.bans = bans.bans;
    if (log) {
      modState.log = older ? [...(modState.log || []), ...log.entries] : log.entries;
      modState.more = log.entries.length === 50;
    }
  } catch (err) {
    showSettingsError(err.message);
  } finally {
    modState.loading = false;
  }
  if (el.spaceSettings.open && el.spaceSettings.dataset.tab === 'moderation') renderSpaceSettings();
}

const DURATION_TEXT = { 60: '1 minute', 300: '5 minutes', 600: '10 minutes', 3600: '1 hour', 86400: '1 day', 604800: '1 week' };

// One line of a space's log, like "Alice banned Bea. Reason: spam".
function spaceLogText(e) {
  const d = e.details || {};
  const who = e.actor ? e.actor.name : 'Someone';
  const why = d.reason ? `. Reason: ${d.reason}` : '';
  switch (e.action) {
    case 'space-rename': return `${who} renamed the space from ${d.from} to ${d.to}`;
    case 'space-import': return `${who} brought the space over from ${d.from || 'Discord'} (${d.channels} channels, ${d.roles} roles)`;
    case 'everyone-perms': return `${who} changed what everyone can do`;
    case 'channel-create': return `${who} made #${d.name}`;
    case 'channel-rename': return `${who} renamed #${d.from} to #${d.to}`;
    case 'channel-access': return `${who} changed who can see or post in #${d.name}`;
    case 'channel-delete': return `${who} deleted #${d.name}`;
    case 'role-create': return `${who} made the role ${d.name}`;
    case 'role-update': return d.from ? `${who} renamed the role ${d.from} to ${d.name}` : `${who} changed the role ${d.name}`;
    case 'role-delete': return `${who} deleted the role ${d.name}`;
    case 'role-move': return `${who} moved the role ${d.name} ${d.up ? 'up' : 'down'}`;
    case 'role-give': return `${who} gave ${d.user} the role ${d.role}`;
    case 'role-take': return `${who} took the role ${d.role} from ${d.user}`;
    case 'message-remove': return `${who} removed ${d.user}'s ${d.was === 'file' ? 'file' : 'message'} in #${d.channel}`;
    case 'timeout': return `${who} put ${d.user} in a timeout for ${DURATION_TEXT[d.seconds] || 'a while'}${why}`;
    case 'timeout-end': return `${who} ended ${d.user}'s timeout`;
    case 'kick': return `${who} kicked ${d.user}${why}`;
    case 'ban': return `${who} banned ${d.user}${d.removed ? ` and removed ${d.removed} of their messages` : ''}${why}`;
    case 'unban': return `${who} lifted ${d.user}'s ban`;
    case 'report-resolve': return `${who} dealt with a report about ${d.user}`;
    case 'report-reopen': return `${who} reopened a report about ${d.user}`;
    default: return `${who}: ${e.action}`;
  }
}

function roleChip(r) {
  const chip = document.createElement('span');
  chip.className = 'role-chip';
  if (r.color) chip.style.setProperty('--role-color', r.color);
  chip.textContent = r.name;
  return chip;
}


// ----- The members panel -----
// On the right of a space's channel (on a wide enough screen): who's online, grouped by the
// roles shown separately, then everyone offline, dimmed. The button in the header hides it.

S.showMembers = store.get('showMembers', 'on') !== 'off';
// (Wide enough counting the Size: at 150%, a window 1500px across has room for 1000.)
const widePanel = { get matches() { return innerWidth / uiZoom() >= 1000; } };
let panelWide = null;

function presenceIn(m) {
  if (m.id === S.clientId) return myPresence();
  const f = S.friends.get(m.id);
  return (f && f.presence) || m.presence || 'offline';
}

function renderMemberPanel() {
  const c = isChannelKey(S.openDm) && S.channels.get(channelIdOf(S.openDm));
  const space = c && S.spaces.get(c.spaceId);
  const wide = widePanel.matches;
  panelWide = wide;
  const show = Boolean(space) && wide && S.showMembers;
  el.membersToggle.hidden = !space || !wide;
  el.membersToggle.classList.toggle('on', show);
  el.membersToggle.setAttribute('aria-pressed', String(show));
  el.membersToggle.title = show ? 'Hide members' : 'Show members';
  el.memberPanel.hidden = !show;
  el.memberPanel.dataset.space = show ? space.id : '';
  if (!show) return;
  if (!space.members) {
    loadMembers(space.id);
    return; // (drawn once they're here)
  }
  const byName = (a, b) => a.displayName.localeCompare(b.displayName);
  const hoisted = space.roles.filter((r) => r.hoist);
  const groups = hoisted.map((r) => ({ title: r.name, members: [] }));
  const online = [];
  const offline = [];
  for (const m of [...space.members].sort(byName)) {
    if (presenceIn(m) === 'offline') {
      offline.push(m);
      continue;
    }
    const i = hoisted.findIndex((r) => m.roles.includes(r.id));
    (i >= 0 ? groups[i].members : online).push(m);
  }
  const all = [...groups, { title: 'Online', members: online }, { title: 'Offline', members: offline, dim: true }].filter((g) => g.members.length);
  el.memberPanel.replaceChildren(...all.flatMap((g) => {
    const head = document.createElement('h3');
    head.className = 'panel-group';
    head.textContent = `${g.title} — ${g.members.length}`;
    return [head, ...g.members.map((m) => memberPanelRow(space, m, g.dim))];
  }));
}

function memberPanelRow(space, m, dim) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `panel-member${dim ? ' offline' : ''}`;
  const text = document.createElement('span');
  text.className = 'panel-member-text';
  const name = document.createElement('span');
  name.className = 'panel-member-name';
  name.textContent = m.displayName;
  name.style.color = memberColor(space, m.id);
  if (m.owner) name.insertAdjacentHTML('beforeend', '<svg class="icon crown" aria-label="Owner"><title>Owner</title><use href="#i-crown"/></svg>');
  text.append(name);
  if (m.statusText && !dim) {
    const status = document.createElement('span');
    status.className = 'panel-member-status';
    status.textContent = m.statusText;
    text.append(status);
  }
  b.append(makeFace(m, dim ? null : presenceIn(m)), text);
  b.addEventListener('click', () => openMiniProfile(m.id));
  return b;
}

function openSpaceSettings() {
  closeSpaceMenu();
  const space = S.spaces.get(S.view);
  if (!canOpenSettings(space)) return;
  el.spaceSettings.dataset.space = space.id;
  el.spaceSettings.dataset.tab = '';
  el.spaceSettings.dataset.role = '';
  el.spaceSettings.dataset.channel = '';
  el.spaceRenameInput.value = space.name;
  showSettingsError('');
  renderSpaceSettings();
  el.spaceSettings.showModal();
  // Members, for how many have each role.
  if (!space.members) loadMembers(space.id).then(() => { if (el.spaceSettings.open) renderSpaceSettings(); });
}

function showSettingsError(text) {
  el.spaceSettingsError.textContent = text;
  el.spaceSettingsError.hidden = !text;
}

function renderSpaceSettings() {
  const space = S.spaces.get(el.spaceSettings.dataset.space);
  if (!space || !canOpenSettings(space)) return el.spaceSettings.close();
  const tabs = settingsTabsFor(space);
  if (!tabs.includes(el.spaceSettings.dataset.tab)) el.spaceSettings.dataset.tab = tabs[0];
  const tab = el.spaceSettings.dataset.tab;
  el.spaceTabs.hidden = tabs.length < 2;
  for (const b of el.spaceTabs.querySelectorAll('[data-tab]')) {
    b.hidden = !tabs.includes(b.dataset.tab);
    b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  }
  el.spaceTabs.querySelector('[data-tab="moderation"]').textContent = space.reports ? `Moderation (${space.reports})` : 'Moderation';
  for (const panel of el.spaceSettings.querySelectorAll('.tab-panel')) panel.hidden = panel.dataset.tab !== tab;
  el.spaceDanger.hidden = space.role !== 'owner';
  keepFocus(el.spaceSettings, () => {
    if (tab === 'roles') renderRolesPanel(space);
    if (tab === 'channels') renderChannelsPanel(space);
    if (tab === 'moderation') renderModerationPanel(space);
  });
}

// Re-drawing a dialog while someone's typing in it: their box keeps its text and the cursor.
function keepFocus(root, render) {
  const a = document.activeElement;
  const key = a && root.contains(a) && a.dataset.keep;
  const state = key && { value: a.value, start: a.selectionStart, end: a.selectionEnd };
  render();
  const b = key && root.querySelector(`[data-keep="${CSS.escape(key)}"]`);
  if (!b || b === a) return;
  b.value = state.value;
  b.focus({ preventScroll: true });
  try { b.setSelectionRange(state.start, state.end); } catch {}
}

function renderChannelsPanel(space) {
  const open = el.spaceSettings.dataset.channel;
  el.spaceChannelAdmin.replaceChildren(...space.channels.flatMap((c) => {
    const li = document.createElement('li');
    li.innerHTML = `<svg class="icon"><use href="#${c.private ? 'i-lock' : 'i-hash'}"/></svg>`;
    const input = document.createElement('input');
    input.value = c.name;
    input.maxLength = 32;
    input.dataset.keep = `channel-${c.id}`;
    input.setAttribute('aria-label', `Rename #${c.name}`);
    const rename = async () => {
      const name = input.value.trim();
      if (!name || name === c.name) return;
      try {
        await api('PATCH', `/channels/${c.id}`, { name });
        showSettingsError('');
      } catch (err) {
        showSettingsError(err.message);
        input.value = c.name;
      }
    };
    input.addEventListener('change', rename);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    const access = document.createElement('button');
    access.type = 'button';
    access.className = 'text-btn';
    access.textContent = 'Who';
    access.title = 'Who can see it, and who can post in it';
    access.setAttribute('aria-expanded', String(open === c.id));
    access.addEventListener('click', () => {
      el.spaceSettings.dataset.channel = open === c.id ? '' : c.id;
      renderSpaceSettings();
    });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'text-btn danger';
    del.textContent = 'Delete';
    del.hidden = space.channels.length <= 1;
    del.addEventListener('click', async () => {
      if (del.dataset.confirm !== '1') {
        del.dataset.confirm = '1';
        del.textContent = 'Sure?';
        setTimeout(() => { del.dataset.confirm = ''; del.textContent = 'Delete'; }, 3000);
        return;
      }
      try {
        await api('DELETE', `/channels/${c.id}`);
      } catch (err) {
        showSettingsError(err.message);
      }
    });
    li.append(input, access, del);
    return open === c.id ? [li, channelAccessEditor(space, c)] : [li];
  }));
}

// Who a channel is for: private (only some roles see it), and read-only (only some post).
function channelAccessEditor(space, c) {
  const li = document.createElement('li');
  li.className = 'channel-access';
  const save = async (fields) => {
    try {
      await api('PATCH', `/channels/${c.id}`, fields);
      showSettingsError('');
    } catch (err) {
      showSettingsError(err.message);
    }
  };
  const section = (label, hint, on, key, listKey) => {
    const wrap = document.createElement('div');
    wrap.className = 'access-part';
    const toggle = document.createElement('label');
    toggle.className = 'toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.addEventListener('change', () => save({ [key]: box.checked }));
    const words = document.createElement('span');
    words.textContent = label;
    toggle.append(box, words);
    const small = document.createElement('small');
    small.className = 'hint';
    small.textContent = hint;
    wrap.append(toggle, small);
    if (on) {
      const picks = document.createElement('div');
      picks.className = 'role-picks';
      const chosen = c[listKey];
      if (!space.roles.length) {
        const none = document.createElement('small');
        none.className = 'hint';
        none.textContent = 'Make some roles in the Roles tab to pick from.';
        picks.append(none);
      }
      picks.append(...space.roles.map((r) => {
        const pick = document.createElement('label');
        pick.className = 'toggle';
        const pbox = document.createElement('input');
        pbox.type = 'checkbox';
        pbox.checked = chosen.includes(r.id);
        pbox.addEventListener('change', () => {
          const ids = [...picks.querySelectorAll('input')].map((b, i) => (b.checked ? space.roles[i].id : null)).filter(Boolean);
          save({ [listKey]: ids });
        });
        pick.append(pbox, roleChip(r));
        return pick;
      }));
      wrap.append(picks);
    }
    return wrap;
  };
  li.append(
    section('Private channel', 'Only the roles you pick (and administrators) can see it.', c.private, 'private', 'seeRoles'),
    section('Only some roles can post', 'Everyone who can see it can still read it and react.', c.readonly, 'readonly', 'sendRoles'),
  );
  return li;
}

// ----- Roles -----

const PERM_INFO = [
  ['administrator', 'Administrator', 'Can do everything, and see every channel, even private ones. Give this carefully.'],
  ['manageSpace', 'Manage space', "Rename the space."],
  ['manageChannels', 'Manage channels', 'Make, rename and delete channels, and choose who can see and post in them.'],
  ['manageRoles', 'Manage roles', 'Make and change roles below their own highest role, and give them to people.'],
  ['viewLog', 'See the log', 'See who changed what in the space, and every timeout, kick and ban.'],
  ['manageMessages', 'Delete messages', "Remove anyone's messages in the channels they can see."],
  ['timeout', 'Time people out', "Stop people below them posting or reacting for a while."],
  ['kick', 'Kick people', 'Take people below them out of the space. They can come back with an invite.'],
  ['ban', 'Ban people', "Take people below them out for good, and lift bans."],
  ['mentionEveryone', 'Mention @everyone', 'Notify everyone who can see a channel at once.'],
  ['connect', 'Join voice channels', ''],
  ['speak', 'Talk in voice channels', 'And share their camera or screen there.'],
  ['invite', 'Invite people', 'Make invite links.'],
  ['send', 'Send messages', ''],
  ['files', 'Send files', ''],
  ['react', 'Add reactions', ''],
];
const ROLE_COLORS = ['#e4574e', '#f08a4b', '#f5b94a', '#e8d44d', '#5bd18b', '#3fbfad', '#4fa3e8', '#7b8cf0', '#a879e8', '#e26fb7', '#a9b4c8'];

function renderRolesPanel(space) {
  const editing = el.spaceSettings.dataset.role;
  if (editing === 'everyone') return renderRoleEditor(space, null);
  const role = editing && space.roles.find((r) => r.id === editing);
  if (role) return renderRoleEditor(space, role);
  el.spaceSettings.dataset.role = '';
  const head = document.createElement('div');
  head.className = 'side-title-row';
  const title = document.createElement('h3');
  title.className = 'side-title';
  title.textContent = 'Roles';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'primary-btn small';
  add.textContent = 'Create role';
  add.addEventListener('click', async () => {
    try {
      const { role: made } = await api('POST', `/spaces/${space.id}/roles`, { name: 'new role' });
      await refreshSpaces();
      el.spaceSettings.dataset.role = made.id;
      renderSpaceSettings();
      el.spaceRoles.querySelector('.role-name-input')?.select();
    } catch (err) {
      showSettingsError(err.message);
    }
  });
  head.append(title, add);
  const hint = document.createElement('small');
  hint.className = 'hint';
  hint.textContent = 'People get what each of their roles allows, on top of what everyone can do. Roles higher up come first, and people can only manage roles below their own highest one.';
  const list = document.createElement('ol');
  list.className = 'role-list';
  list.append(...space.roles.map((r, i) => {
    const li = document.createElement('li');
    li.className = 'role-row';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'role-open';
    const dot = document.createElement('span');
    dot.className = `role-dot${r.color ? '' : ' none'}`;
    if (r.color) dot.style.setProperty('--role-color', r.color);
    const name = document.createElement('span');
    name.className = 'role-name';
    name.textContent = r.name;
    const count = document.createElement('span');
    count.className = 'role-count';
    const n = (space.members || []).filter((m) => m.roles.includes(r.id)).length;
    count.textContent = space.members ? `${n} ${n === 1 ? 'person' : 'people'}` : '';
    open.append(dot, name, count);
    open.addEventListener('click', () => {
      el.spaceSettings.dataset.role = r.id;
      renderSpaceSettings();
    });
    li.append(open);
    // Up and down, one step at a time, below your own highest role.
    const above = space.roles[i - 1], below = space.roles[i + 1];
    for (const [up, next] of [[true, above], [false, below]]) {
      const move = document.createElement('button');
      move.type = 'button';
      move.className = `icon-btn ghost role-move${up ? ' up' : ''}`;
      move.setAttribute('aria-label', `Move ${r.name} ${up ? 'up' : 'down'}`);
      move.title = up ? 'Move up' : 'Move down';
      move.innerHTML = '<svg class="icon"><use href="#i-chevron-down"/></svg>';
      move.disabled = !next || !canManageRoleIn(space, r) || !canManageRoleIn(space, next);
      move.addEventListener('click', async () => {
        try {
          await api('POST', `/spaces/${space.id}/roles/${r.id}/move`, { up });
        } catch (err) {
          showSettingsError(err.message);
        }
      });
      li.append(move);
    }
    return li;
  }));
  const everyone = document.createElement('li');
  everyone.className = 'role-row';
  const eo = document.createElement('button');
  eo.type = 'button';
  eo.className = 'role-open';
  eo.innerHTML = '<span class="role-dot none"></span><span class="role-name">@everyone</span><span class="role-count">what everyone can do</span>';
  eo.addEventListener('click', () => {
    el.spaceSettings.dataset.role = 'everyone';
    renderSpaceSettings();
  });
  everyone.append(eo);
  list.append(everyone);
  el.spaceRoles.replaceChildren(head, hint, list);
}

// One role (or @everyone, when role is null): its name, color and what it allows.
function renderRoleEditor(space, role) {
  const everyone = !role;
  const editable = everyone ? canIn(space, 'manageRoles') : canManageRoleIn(space, role);
  const perms = everyone ? space.everyonePerms : role.perms;
  const save = async (fields) => {
    try {
      if (everyone) await api('PATCH', `/spaces/${space.id}`, { everyonePerms: fields.perms });
      else await api('PATCH', `/spaces/${space.id}/roles/${role.id}`, fields);
      showSettingsError('');
    } catch (err) {
      showSettingsError(err.message);
    }
  };
  const parts = [];
  const top = document.createElement('div');
  top.className = 'role-edit-head';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'text-btn';
  back.textContent = '← Roles';
  back.addEventListener('click', () => {
    el.spaceSettings.dataset.role = '';
    renderSpaceSettings();
  });
  const title = document.createElement('h3');
  title.className = 'side-title';
  title.textContent = everyone ? '@everyone' : role.name;
  if (role && role.color) title.style.color = role.color;
  top.append(back, title);
  parts.push(top);
  const note = document.createElement('small');
  note.className = 'hint';
  note.textContent = everyone ? 'What everyone in the space can do, whatever roles they have.'
    : editable ? '' : "This role isn't below your own highest role, so you can't change it.";
  if (note.textContent) parts.push(note);
  if (!everyone) {
    const field = document.createElement('label');
    field.className = 'field';
    const span = document.createElement('span');
    span.textContent = 'Name';
    const input = document.createElement('input');
    input.className = 'role-name-input';
    input.value = role.name;
    input.maxLength = 32;
    input.disabled = !editable;
    input.dataset.keep = `role-${role.id}`;
    input.addEventListener('change', () => { if (input.value.trim() && input.value.trim() !== role.name) save({ name: input.value.trim() }); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    field.append(span, input);
    const colors = document.createElement('div');
    colors.className = 'field';
    const cspan = document.createElement('span');
    cspan.textContent = 'Color';
    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    swatches.append(...[null, ...ROLE_COLORS].map((color) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `swatch${color ? '' : ' none'}`;
      if (color) b.style.setProperty('--swatch', color);
      b.setAttribute('aria-label', color ? `Color ${color}` : 'No color');
      b.title = color ? '' : 'No color';
      b.setAttribute('aria-pressed', String((role.color || null) === color));
      b.disabled = !editable;
      b.addEventListener('click', () => save({ color: color || '' }));
      return b;
    }));
    colors.append(cspan, swatches);
    const hoist = document.createElement('label');
    hoist.className = 'toggle';
    const hbox = document.createElement('input');
    hbox.type = 'checkbox';
    hbox.checked = role.hoist;
    hbox.disabled = !editable;
    hbox.addEventListener('change', () => save({ hoist: hbox.checked }));
    const hwords = document.createElement('span');
    hwords.textContent = 'Show people with this role separately in the members list';
    hoist.append(hbox, hwords);
    parts.push(field, colors, hoist);
  }
  const list = document.createElement('div');
  list.className = 'perm-list';
  list.append(...PERM_INFO.map(([key, name, about]) => {
    const row = document.createElement('label');
    const allowed = editable && canIn(space, key);
    row.className = `perm-row${allowed ? '' : ' off'}`;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.perm = key;
    box.checked = perms.includes(key);
    box.disabled = !allowed;
    box.addEventListener('change', () => save({ perms: [...list.querySelectorAll('input:checked')].map((b) => b.dataset.perm) }));
    const words = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = name;
    words.append(strong);
    if (about) {
      const small = document.createElement('small');
      small.textContent = about;
      words.append(small);
    }
    row.append(box, words);
    return row;
  }));
  parts.push(list);
  if (!everyone && editable) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'text-btn danger';
    del.textContent = 'Delete this role';
    del.addEventListener('click', async () => {
      if (del.dataset.confirm !== '1') {
        del.dataset.confirm = '1';
        del.textContent = `Yes, delete ${role.name}`;
        setTimeout(() => { del.dataset.confirm = ''; del.textContent = 'Delete this role'; }, 4000);
        return;
      }
      try {
        await api('DELETE', `/spaces/${space.id}/roles/${role.id}`);
        el.spaceSettings.dataset.role = '';
      } catch (err) {
        showSettingsError(err.message);
      }
    });
    parts.push(del);
  }
  el.spaceRoles.replaceChildren(...parts);
}

async function onSpaceRename(e) {
  e.preventDefault();
  const space = S.spaces.get(el.spaceSettings.dataset.space);
  const name = el.spaceRenameInput.value.trim();
  if (!space || !name || name === space.name) return;
  try {
    await api('PATCH', `/spaces/${space.id}`, { name });
    showSettingsError('');
  } catch (err) {
    showSettingsError(err.message);
  }
}

async function onSpaceDelete() {
  const space = S.spaces.get(el.spaceSettings.dataset.space);
  if (!space) return;
  const btn = el.spaceDeleteBtn;
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1';
    btn.textContent = `Yes, delete ${space.name} for everyone`;
    setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Delete this space'; }, 4000);
    return;
  }
  try {
    await api('DELETE', `/spaces/${space.id}`);
    el.spaceSettings.close();
  } catch (err) {
    showSettingsError(err.message);
  }
}

async function onSpaceLeave() {
  closeSpaceMenu();
  const space = S.spaces.get(S.view);
  if (!space) return;
  if (!confirm(`Leave ${space.name}? You can come back with an invite link.`)) return;
  try {
    await api('POST', `/spaces/${space.id}/leave`);
  } catch (err) {
    toast(err.message);
  }
}

// + next to "Text channels" (or "Voice channels"): a box for the new one's name, at the end of the list.
function startNewChannel(kind = 'text') {
  const space = S.spaces.get(S.view);
  if (!canIn(space, 'manageChannels')) return;
  const list = kind === 'voice' ? el.voiceList : el.channelList;
  let li = list.querySelector('.channel-new');
  if (!li) {
    li = document.createElement('li');
    li.className = 'channel-new';
    const input = document.createElement('input');
    input.placeholder = 'new-channel';
    input.maxLength = 32;
    input.setAttribute('aria-label', 'New channel name');
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') li.remove();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return li.remove();
      try {
        const { channel } = await api('POST', `/spaces/${space.id}/channels`, { name, kind });
        li.remove();
        await refreshSpaces();
        if (kind === 'voice') renderSide();
        else openDm(`ch:${channel.id}`);
      } catch (err) {
        toast(err.message);
      }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!input.value.trim()) li.remove(); }, 150));
    li.append(input);
    list.append(li);
  }
  li.querySelector('input').focus();
}

// ---------------- Voice channels ----------------
// Drop-in rooms in a space, for any number of people. The sound (and video) goes through a
// LiveKit server (see lib/voice.js), end-to-end encrypted with the channel's key, so the
// server in the middle can't listen in. LiveKit's library only loads when you first join one.

let livekitLoading = null;
function loadLivekit() {
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  livekitLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/livekit/livekit-client.umd.js';
    s.onload = () => resolve(window.LivekitClient);
    s.onerror = () => {
      livekitLoading = null;
      reject(new Error("Voice couldn't load. Check your connection and try again."));
    };
    document.head.append(s);
  });
  return livekitLoading;
}

// Who's in each voice channel (from the server): channel id -> [{ id, muted, deafened, video, screen }].
S.voiceStates = new Map();

function onVoiceState({ channel, members }) {
  S.voiceStates.set(channel, members);
  const c = S.channels.get(channel);
  if (c && S.view === c.spaceId) renderSide();
  if (S.voice && S.voice.channelId === channel) renderVoiceView();
  if (groupOfChannel(channel)) {
    renderGroups();
    if (isChannelKey(S.openDm) && groupOfChannel(channelIdOf(S.openDm)) === groupOfChannel(channel)) renderDmHead();
  }
}

// Joining: a pass from the server, then the room. Joining another channel (or a call) leaves this one.
async function joinVoice(channelId) {
  const c = S.channels.get(channelId);
  if (!c || c.kind !== 'voice') return;
  if (S.voice && S.voice.channelId === channelId) return showVoiceView();
  if (!S.voiceEnabled) return toast("Voice channels aren't set up on this server yet.");
  if (S.inCall || S.startingCall) {
    const group = groupOfChannel(channelId);
    if (!confirm(`Leave your call with ${friendName(S.callWith)} and join ${group ? `the call with ${groupTitle(group)}` : `#${c.name}`}?`)) return;
    onLeaveClick();
  }
  if (S.voice) await leaveVoice({ quiet: true });
  const v = S.voice = {
    channelId, spaceId: c.spaceId, room: null, state: 'connecting', speak: false,
    muted: store.get('voiceMuted', 'off') === 'on', deafened: false, speaking: new Set(), tiles: new Map(),
    meters: new Map(), meterCtx: null, meterTimer: 0,
  };
  showVoiceView();
  renderVoice();
  try {
    const LK = await loadLivekit();
    if (!LK.isE2EESupported()) throw new Error("This browser can't join encrypted voice channels. Try the Rainlit app, or Chrome, Edge or a recent Firefox.");
    const pass = await api('POST', `/channels/${channelId}/voice`, {});
    if (S.voice !== v) return;
    const keys = new LK.ExternalE2EEKeyProvider();
    const room = new LK.Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { ...S.micFx, ...(S.devices.mic ? { deviceId: S.devices.mic } : {}) },
      ...(S.devices.speaker ? { audioOutput: { deviceId: S.devices.speaker } } : {}),
      e2ee: { keyProvider: keys, worker: new Worker('/vendor/livekit/livekit-client.e2ee.worker.js') },
    });
    v.room = room;
    v.speak = pass.speak;
    wireVoiceRoom(room, v);
    await keys.setKey(pass.key);
    await room.setE2EEEnabled(true);
    await room.connect(pass.url, pass.token);
    if (S.voice !== v) return room.disconnect();
    v.state = 'connected';
    v.joinedAt = Date.now(); // (if the server restarts, the call carries on from here)
    if (v.speak && !v.muted) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        applyVoicePtt();
      } catch (err) {
        v.muted = true;
        toast(mediaErrorText(err, 'Microphone'));
      }
    }
    room.startAudio().catch(() => {});
    wsSend({ type: 'voice-join', channel: channelId, muted: v.muted || !v.speak, deafened: v.deafened });
    v.meterTimer = setInterval(() => tickVoice(v), 50);
    syncDesktopPtt();
    playCallSound(true);
    if (ANDROID) ANDROID.callStarted({ name: `#${c.name}`, echo: S.micFx.echoCancellation, duck: store.get('duck', 'on') !== 'off' }).catch(() => {});
    renderVoice();
  } catch (err) {
    if (S.voice !== v) return;
    toast(err.message || "Couldn't join the voice channel.");
    leaveVoice({ quiet: true });
  }
}

async function leaveVoice({ quiet = false } = {}) {
  const v = S.voice;
  if (!v) return;
  S.voice = null;
  clearInterval(v.meterTimer);
  for (const m of v.meters.values()) m.disconnect();
  if (v.meterCtx) v.meterCtx.close().catch(() => {});
  if (!quiet) playCallSound(false);
  try {
    if (v.room) await v.room.disconnect();
  } catch {}
  wsSend({ type: 'voice-leave' });
  el.voiceAudio.replaceChildren();
  el.voiceGrid.replaceChildren(); // (or coming back finds the old tiles, you among them, still there)
  if (ANDROID) ANDROID.callEnded().catch(() => {});
  S.pttHeld = false;
  syncDesktopPtt();
  renderTrayIcon(false);
  if (!el.voiceView.hidden) hideVoiceView();
  renderVoice();
}

function wireVoiceRoom(room, v) {
  const LK = window.LivekitClient;
  const E = LK.RoomEvent;
  const again = () => { if (S.voice === v) renderVoice(); };
  room.on(E.TrackSubscribed, (track, pub, participant) => {
    if (track.kind === 'audio') {
      const a = track.attach();
      a.dataset.who = participant.identity;
      a.dataset.sid = track.sid;
      a.muted = v.deafened;
      el.voiceAudio.append(a);
      if (pub.source !== LK.Track.Source.ScreenShareAudio) meterVoice(v, participant.identity, track.mediaStreamTrack);
    }
    again();
  });
  // (LiveKit may have let go of the element already, so it goes by the track's id too.)
  const dropAudio = (selector) => { for (const a of el.voiceAudio.querySelectorAll(selector)) a.remove(); };
  room.on(E.TrackUnsubscribed, (track, _pub, participant) => {
    for (const media of track.detach()) media.remove();
    if (track.sid) dropAudio(`[data-sid="${CSS.escape(track.sid)}"]`);
    const m = v.meters.get(participant.identity);
    if (m && m.track === track.mediaStreamTrack) unmeterVoice(v, participant.identity);
    again();
  });
  for (const e of [E.TrackMuted, E.TrackUnmuted, E.LocalTrackPublished, E.LocalTrackUnpublished]) room.on(e, again);
  room.on(E.ParticipantConnected, () => { playCallSound(true); again(); });
  room.on(E.ParticipantDisconnected, (participant) => {
    dropAudio(`[data-who="${CSS.escape(participant.identity)}"]`);
    unmeterVoice(v, participant.identity);
    playCallSound(false);
    again();
  });
  room.on(E.Reconnecting, () => { v.state = 'reconnecting'; again(); });
  room.on(E.Reconnected, () => {
    v.state = 'connected';
    wsSend({ type: 'voice-join', channel: v.channelId, muted: v.muted || !v.speak, deafened: v.deafened });
    again();
  });
  room.on(E.Disconnected, (reason) => {
    if (S.voice !== v) return; // (you left)
    const R = LK.DisconnectReason;
    toast(reason === R.DUPLICATE_IDENTITY ? 'You joined the voice channel from another device.'
      : reason === R.PARTICIPANT_REMOVED ? 'You were taken out of the voice channel.'
      : reason === R.ROOM_DELETED ? 'The voice channel was deleted.'
      : 'You were disconnected from the voice channel.');
    leaveVoice({ quiet: true });
  });
  room.on(E.AudioPlaybackStatusChanged, again);
  room.on(E.ParticipantPermissionsChanged, (_before, participant) => {
    if (participant !== room.localParticipant) return;
    v.speak = Boolean(participant.permissions && participant.permissions.canPublish);
    if (!v.speak) toast("You can listen, but can't talk here right now.");
    again();
  });
}

// ----- Who's talking -----
// Measured here, from each person's sound as it arrives (and yours as it leaves), so a ring
// lights up the moment someone speaks. (LiveKit's own "who's talking" comes a beat later.)

function meterVoice(v, identity, track) {
  if (!track) return;
  if (!v.meterCtx) {
    try {
      v.meterCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
  }
  unmeterVoice(v, identity);
  const m = makeMeter(track, v.meterCtx);
  if (m) v.meters.set(identity, m);
}

function unmeterVoice(v, identity) {
  const m = v.meters.get(identity);
  if (!m) return;
  m.disconnect();
  v.meters.delete(identity);
}

function tickVoice(v) {
  if (S.voice !== v || !v.room) return;
  if (v.meterCtx && v.meterCtx.state === 'suspended') v.meterCtx.resume().catch(() => {});
  // Your mic: a new one after a device change, none while muted.
  const LK = window.LivekitClient;
  const mine = v.room.localParticipant.getTrackPublication(LK.Track.Source.Microphone);
  const myTrack = mine && mine.track && !mine.isMuted ? mine.track.mediaStreamTrack : null;
  const metered = v.meters.get(S.clientId);
  if (myTrack && (!metered || metered.track !== myTrack)) meterVoice(v, S.clientId, myTrack);
  else if (!myTrack && metered) unmeterVoice(v, S.clientId);
  let changed = false;
  for (const [id, m] of v.meters) {
    const on = m.read() > SPEAKING_LEVEL && (id !== S.clientId || !S.ptt || S.pttHeld);
    if (on === v.speaking.has(id)) continue;
    if (on) v.speaking.add(id);
    else v.speaking.delete(id);
    changed = true;
  }
  for (const id of v.speaking) {
    if (!v.meters.has(id)) {
      v.speaking.delete(id);
      changed = true;
    }
  }
  if (changed) renderVoiceSpeaking();
  renderTrayIcon(v.speaking.has(S.clientId));
}

// ----- Your buttons: mute, deafen, camera, screen, leave -----

async function onVoiceControl(act) {
  const v = S.voice;
  if (!v) return;
  const me = v.room && v.room.localParticipant;
  try {
    if (act === 'leave') {
      if (!S.callSounds) playClick();
      return leaveVoice();
    }
    if (act === 'hear') return v.room.startAudio();
    if (!me || v.state !== 'connected') return;
    if (act === 'mute') {
      if (!v.speak) return toast("You can't talk in this channel.");
      v.muted = !v.muted;
      if (!v.muted && v.deafened) v.deafened = false;
      store.set('voiceMuted', v.muted ? 'on' : 'off');
      playControlSound(v.muted ? 'mute' : 'unmute');
      await me.setMicrophoneEnabled(!v.muted);
      applyVoicePtt();
    } else if (act === 'deafen') {
      v.deafened = !v.deafened;
      playControlSound(v.deafened ? 'deafen' : 'undeafen');
      if (v.deafened && !v.muted) {
        v.muted = true;
        await me.setMicrophoneEnabled(false);
      } else if (!v.deafened && store.get('voiceMuted', 'off') !== 'on' && v.speak) {
        v.muted = false;
        await me.setMicrophoneEnabled(true);
      }
      for (const a of el.voiceAudio.children) a.muted = v.deafened;
    } else if (act === 'camera') {
      if (!v.speak) return toast("You can't share video in this channel.");
      await me.setCameraEnabled(!me.isCameraEnabled, S.devices.cam ? { deviceId: S.devices.cam } : undefined);
      playControlSound(me.isCameraEnabled ? 'camera-on' : 'camera-off');
    } else if (act === 'screen') {
      if (!S.callSounds) playClick(); // (its own sound is a call sound; without those, the plain click)
      if (!v.speak) return toast("You can't share your screen in this channel.");
      if (ANDROID) return toast("Screen sharing from Android isn't here yet.");
      const smooth = el.shareQuality.value !== 'sharp';
      await me.setScreenShareEnabled(!me.isScreenShareEnabled, {
        audio: true, contentHint: smooth ? 'motion' : 'detail',
        resolution: { width: 1920, height: 1080, frameRate: smooth ? 60 : 30 },
      });
      playShareSound(me.isScreenShareEnabled);
    }
  } catch (err) {
    if (err && err.name === 'NotAllowedError' && act === 'screen') return; // (they cancelled the picker)
    toast(mediaErrorText(err, act === 'camera' ? 'Camera' : act === 'screen' ? 'Screen share' : 'Microphone'));
  }
  wsSend({ type: 'voice-update', muted: v.muted || !v.speak, deafened: v.deafened, video: Boolean(me && me.isCameraEnabled), screen: Boolean(me && me.isScreenShareEnabled) });
  renderVoice();
}

// Your settings, while you're in a voice channel: another mic or speaker, or new mic effects.
function voiceDevicesChanged() {
  const v = S.voice;
  if (!v || !v.room || v.state !== 'connected') return;
  if (S.devices.speaker) v.room.switchActiveDevice('audiooutput', S.devices.speaker).catch(() => {});
  if (v.room.localParticipant.isMicrophoneEnabled) {
    v.room.localParticipant.setMicrophoneEnabled(false)
      .then(() => v.room.localParticipant.setMicrophoneEnabled(true, { ...S.micFx, ...(S.devices.mic ? { deviceId: S.devices.mic } : {}) }))
      .catch((err) => toast(mediaErrorText(err, 'Microphone')));
  }
}

// ----- Drawing it: the panel above your name, the room, and who's in each channel -----

function renderVoice() {
  const v = S.voice;
  el.voicePanel.hidden = !v;
  el.app.classList.toggle('in-voice', Boolean(v));
  if (v) {
    const c = S.channels.get(v.channelId);
    const space = S.spaces.get(v.spaceId);
    el.voicePanelStatus.textContent = { connecting: 'Joining…', reconnecting: 'Reconnecting…', connected: 'Voice connected' }[v.state];
    el.voicePanelStatus.dataset.state = v.state;
    el.voicePanelName.textContent = isGroupSpace(space) ? groupTitle(space) : c ? `#${c.name}${space ? ` · ${space.name}` : ''}` : '';
    const me = v.room && v.room.localParticipant;
    for (const b of document.querySelectorAll('[data-voice]')) {
      const act = b.dataset.voice;
      const on = act === 'mute' ? v.muted || !v.speak : act === 'deafen' ? v.deafened
        : act === 'camera' ? Boolean(me && me.isCameraEnabled) : act === 'screen' ? Boolean(me && me.isScreenShareEnabled) : false;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      const icon = b.querySelector('use');
      if (icon && act === 'mute') icon.setAttribute('href', on ? '#i-mic-off' : '#i-mic');
      if (icon && act === 'deafen') icon.setAttribute('href', on ? '#i-headphones-off' : '#i-headphones');
      if (icon && act === 'camera') icon.setAttribute('href', on ? '#i-cam' : '#i-cam-off');
      const label = { mute: on ? 'Unmute' : 'Mute', deafen: on ? 'Undeafen' : 'Deafen', camera: on ? 'Turn camera off' : 'Turn camera on', screen: on ? 'Stop sharing' : 'Share your screen', leave: 'Leave voice' }[act];
      if (label) {
        b.title = label;
        b.setAttribute('aria-label', label);
      }
      if (act === 'screen') b.hidden = Boolean(ANDROID) || !(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    }
    el.voiceHear.hidden = !(v.room && !v.room.canPlaybackAudio);
  }
  const space = S.view !== 'home' && S.spaces.get(S.view);
  if (space) renderSide();
  if (!el.voiceView.hidden) renderVoiceView();
}

function showVoiceView() {
  const v = S.voice;
  if (!v) return;
  if (S.openDm) {
    closeGifPanel();
    stopEdit();
    stopReply();
    stopTyping();
    S.openDm = '';
    el.dm.hidden = true;
  }
  S.view = isGroupSpace(S.spaces.get(v.spaceId)) ? 'home' : v.spaceId;
  el.home.hidden = true;
  el.voiceView.hidden = false;
  renderMemberPanel();
  el.app.classList.add('in-dm');
  renderSpaces();
  renderVoiceView();
}

function hideVoiceView() {
  // (From a group's call, back to its chat.)
  const group = S.voice && S.spaces.get(S.voice.spaceId);
  if (isGroupSpace(group) && !S.openDm) return openGroup(group.id);
  el.voiceView.hidden = true;
  if (!S.openDm) {
    el.home.hidden = false;
    el.app.classList.remove('in-dm');
  }
}

// The room: a tile for each person (their camera, or their picture), and one for each screen
// being shared. The one talking lights up.
function renderVoiceView() {
  const v = S.voice;
  if (!v || el.voiceView.hidden) return;
  const c = S.channels.get(v.channelId);
  const space = S.spaces.get(v.spaceId);
  el.voiceTitle.textContent = isGroupSpace(space) ? groupTitle(space) : c ? c.name : '';
  const people = v.room ? [v.room.localParticipant, ...v.room.remoteParticipants.values()] : [];
  el.voiceSub.textContent = v.state === 'connected'
    ? `${space && !isGroupSpace(space) ? `${space.name} · ` : ''}${people.length} here · end-to-end encrypted`
    : v.state === 'reconnecting' ? 'Reconnecting…' : 'Joining…';
  const wanted = new Map();
  for (const p of people) {
    wanted.set(`${p.identity}:cam`, { p, source: 'camera' });
    const screen = p.getTrackPublication(window.LivekitClient.Track.Source.ScreenShare);
    if (screen && screen.track && !screen.isMuted) wanted.set(`${p.identity}:screen`, { p, source: 'screen' });
  }
  for (const [key, tile] of v.tiles) {
    if (!wanted.has(key)) {
      tile.remove();
      v.tiles.delete(key);
    }
  }
  const current = new Set(v.tiles.values());
  for (const tile of [...el.voiceGrid.children]) if (!current.has(tile)) tile.remove(); // (from an earlier time here)
  for (const [key, { p, source }] of wanted) {
    let tile = v.tiles.get(key);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = `voice-tile${source === 'screen' ? ' screen' : ''}`;
      tile.dataset.who = p.identity;
      v.tiles.set(key, tile);
    }
    const person = profileOf(p.identity) || { id: p.identity, displayName: p.name || 'Someone', username: '' };
    const pub = p.getTrackPublication(source === 'screen' ? window.LivekitClient.Track.Source.ScreenShare : window.LivekitClient.Track.Source.Camera);
    const track = pub && !pub.isMuted ? pub.track : null;
    let video = tile.querySelector('video');
    if (track) {
      if (!video || video.dataset.sid !== track.sid) {
        if (video) video.remove();
        video = track.attach();
        video.dataset.sid = track.sid;
        video.muted = true;
        video.playsInline = true;
        tile.prepend(video);
      }
    } else if (video) {
      video.remove();
    }
    let face = tile.querySelector('.face');
    if (!track) {
      if (!face) {
        face = makeFace(person, null);
        tile.prepend(face);
      }
    } else if (face) {
      face.remove();
    }
    let label = tile.querySelector('.voice-tile-name');
    if (!label) {
      label = document.createElement('span');
      label.className = 'voice-tile-name';
      tile.append(label);
    }
    const mic = p.getTrackPublication(window.LivekitClient.Track.Source.Microphone);
    const muted = !mic || mic.isMuted;
    label.replaceChildren(`${source === 'screen' ? `${person.displayName}'s screen` : person.id === S.clientId ? `${person.displayName} (you)` : person.displayName}`);
    if (source !== 'screen' && muted) label.insertAdjacentHTML('beforeend', '<svg class="icon" aria-label="Muted"><use href="#i-mic-off"/></svg>');
    el.voiceGrid.append(tile);
  }
  el.voiceGrid.dataset.count = String(Math.min(v.tiles.size, 9));
  renderVoiceSpeaking();
}

function renderVoiceSpeaking() {
  const v = S.voice;
  if (!v) return;
  for (const [key, tile] of v.tiles) tile.classList.toggle('speaking', key.endsWith(':cam') && v.speaking.has(tile.dataset.who));
  for (const row of el.voiceList.querySelectorAll('.voice-person')) row.classList.toggle('speaking', v.speaking.has(row.dataset.who));
}

// A voice channel in the sidebar, and who's in it.
function voiceChannelItem(c) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  const here = S.voice && S.voice.channelId === c.id;
  b.className = `channel voice-channel${here ? ' open' : ''}`;
  b.innerHTML = `<svg class="icon"><use href="#${c.private ? 'i-lock' : 'i-speaker'}"/></svg>`;
  const name = document.createElement('span');
  name.className = 'channel-name';
  name.textContent = c.name;
  b.append(name);
  b.title = here ? 'Open the voice channel' : `Join #${c.name}`;
  b.addEventListener('click', () => joinVoice(c.id));
  li.append(b);
  const members = S.voiceStates.get(c.id) || c.voice || [];
  if (members.length) {
    const list = document.createElement('ol');
    list.className = 'voice-people';
    list.append(...members.map((m) => {
      const row = document.createElement('li');
      row.className = `voice-person${S.voice && S.voice.speaking.has(m.id) ? ' speaking' : ''}`;
      row.dataset.who = m.id;
      const person = profileOf(m.id) || { id: m.id, displayName: 'Someone', username: '' };
      const nm = document.createElement('span');
      nm.className = 'voice-person-name';
      nm.textContent = person.displayName;
      row.append(makeFace(person, null), nm);
      if (m.screen) row.insertAdjacentHTML('beforeend', '<span class="live-tag">LIVE</span>');
      if (m.video) row.insertAdjacentHTML('beforeend', '<svg class="icon" aria-label="Camera on"><use href="#i-cam"/></svg>');
      if (m.deafened) row.insertAdjacentHTML('beforeend', '<svg class="icon off" aria-label="Deafened"><use href="#i-headphones-off"/></svg>');
      else if (m.muted) row.insertAdjacentHTML('beforeend', '<svg class="icon off" aria-label="Muted"><use href="#i-mic-off"/></svg>');
      row.addEventListener('click', () => openMiniProfile(m.id));
      return row;
    }));
    li.append(list);
  }
  return li;
}


// ---------------- Friends ----------------

async function refreshFriends() {
  try {
    const data = await api('GET', '/friends');
    S.friends = new Map(data.friends.map((f) => [f.id, f]));
    S.incoming = data.incoming;
    S.outgoing = data.outgoing;
    S.maxFileMb = data.maxFileMb || S.maxFileMb;
    S.klipyKey = data.klipyKey || '';
    if (Array.isArray(data.quickReactions) && data.quickReactions.length) setQuickReactions(data.quickReactions);
    renderComposer();
    S.voiceEnabled = Boolean(data.voice);
    S.blockedUsers = data.blocked || [];
    S.blocked = new Set(S.blockedUsers.map((u) => u.id));
    S.openReports = data.openReports || 0;
    applyBlocks();
    el.adminBtn.classList.toggle('has-reports', S.openReports > 0);
    if (el.profile.open) renderBlockedList();
    if (el.miniProfile.open) renderMiniProfile();
    for (const f of data.friends) {
      const dm = dmFor(f.id);
      dm.save = f.dm.save;
      dm.lastAt = f.dm.lastAt;
      // Unless you're reading it right now, the server knows best how much is unread.
      if (!(S.openDm === f.id && !lookingAway())) {
        dm.unread = f.dm.unread;
        dm.readAt = f.dm.readAt;
      }
    }
  } catch (err) {
    if (err.status === 401) signedOut('You were signed out. Sign in again.');
    return;
  }
  renderFriends();
  renderRejoin();
  updateTitle();
  if (el.miniProfile.open) renderMiniProfile();
  resumeAfterRestart();
}

// The Android app's page starting over during a call (Android closed it while the phone was
// locked, or it crashed): the call's still going, so join it again by itself. And if Android
// closed the whole app during a call, say so (and why).
const EXIT_WHY = { 2: 'Android stopped it', 3: 'Android closed it to free up memory', 4: 'it crashed', 5: 'it crashed',
  6: 'it stopped responding', 9: 'Android stopped it for using too much battery', 13: 'Android stopped it', 14: 'Android paused it' };

async function resumeAfterRestart() {
  if (S.checkedRestart) return;
  S.checkedRestart = true;
  if (!ANDROID) {
    // (For the call debug log: a page that started again in the middle of a call.)
    const a = readActiveCall();
    if (a) trace('page-start', { discarded: document.wasDiscarded || undefined }, a.with);
    return;
  }
  let status;
  try {
    status = await ANDROID.callStatus();
  } catch {
    return; // (an older app)
  }
  const a = readActiveCall();
  if (a) {
    const e = status.lastExit;
    trace('app-start', {
      stillInCall: status.inCall, restarted: status.restarted, restarts: status.restarts || undefined,
      exit: e ? `${EXIT_WHY[e.reason] || `reason ${e.reason}`} at ${new Date(e.at).toISOString().slice(11, 19)} UTC${e.text ? `: ${String(e.text).slice(0, 120)}` : ''}` : undefined,
    }, a.with);
  }
  // (Android's note about the page being closed, when the app just started it again itself,
  // is about that same thing: the app didn't close, so the rejoin message says it instead.)
  if (status.lastExit && a && !status.restarted) {
    const e = status.lastExit;
    const detail = e.text ? ` (${String(e.text).slice(0, 90)})` : '';
    toast(`Rainlit closed during your call at ${fmtTime(e.at)}: ${EXIT_WHY[e.reason] || 'Android stopped it'}${detail}.`, 15_000);
  }
  const why = status.restarted === 'crashed' ? "Rainlit's page crashed" : "Android closed Rainlit's page to free up memory";
  if (!status.inCall || !a || S.inCall || S.startingCall || !S.friends.has(a.with)) {
    if (status.restarted) toast(`${why}, so it started again.`, 8000);
    return;
  }
  // (If it keeps happening, leave it to you: the Rejoin button's still there.)
  if (status.restarts > 3) {
    toast(`${why} again, so it's left for you to rejoin.`, 10_000);
    return;
  }
  S.restartNote = status.restarted ? `${why}, so it started again and rejoined your call.` : 'Rainlit started again and rejoined your call.';
  startCall(a.with);
}

function onPresence(id, presence) {
  const p = S.people.get(id);
  if (p) p.presence = presence;
  if (!el.memberPanel.hidden) renderMemberPanel();
  const f = S.friends.get(id);
  if (!f) return;
  f.presence = presence;
  renderFriends();
  if (el.miniProfile.open) renderMiniProfile();
}

function onProfile(user) {
  const known = S.people.get(user.id);
  if (known) Object.assign(known, user);
  const f = S.friends.get(user.id);
  if (f) Object.assign(f, user);
  for (const dm of S.dms.values()) refreshNames(dm, user.id);
  if (el.spaceMembers.open) renderMembers();
  if (!el.memberPanel.hidden) renderMemberPanel();
  if (el.miniProfile.open) renderMiniProfile();
  if (!f) return;
  renderFriends();
  if (S.inCall && S.callWith === f.id) {
    el.roomLabel.textContent = f.displayName;
    renderPeer();
  }
}

const PRESENCE_ORDER = { online: 0, away: 1, offline: 2 };

// ---------------- Group chats ----------------
// A few friends with a chat and a call of their own (on the server, a small space of kind
// 'group': lib/spaces.js). They're listed on Home, above your friends, not on the rail, and
// their chat and call work like a space's channels: history, files, mentions, and an
// encrypted call that rings everyone when it starts.

const GROUP_MAX = 10;
const isGroupSpace = (space) => Boolean(space && space.kind === 'group');
const groupChatOf = (space) => space.channels.find((c) => c.kind !== 'voice') || null;
const groupCallOf = (space) => space.channels.find((c) => c.kind === 'voice') || null;

// The group a channel belongs to, if it's a group's.
function groupOfChannel(channelId) {
  const c = S.channels.get(channelId);
  const space = c && S.spaces.get(c.spaceId);
  return isGroupSpace(space) ? space : null;
}

// "Bea, Cleo and Dan", or "a, b and c".
function listNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Its name, or (without one) the other people's.
function groupTitle(space) {
  if (!space) return '';
  if (space.name) return space.name;
  const others = (space.people || []).filter((p) => p.id !== S.clientId).map((p) => friendName(p.id)).sort((a, b) => a.localeCompare(b));
  if (!others.length) return 'Just you';
  return others.length > 3 ? `${others.slice(0, 3).join(', ')} and ${others.length - 3} more` : listNames(others);
}

function groupFace(space, size = '') {
  const face = document.createElement('span');
  face.className = `face group-face ${size}`.trim();
  face.style.setProperty('--face-bg', faceColor(space.id));
  face.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-users"/></svg>';
  return face;
}

const groupLastAt = (space) => {
  const chat = groupChatOf(space);
  return (chat && S.dms.has(`ch:${chat.id}`) && S.dms.get(`ch:${chat.id}`).lastAt) || 0;
};
const groupInCall = (space) => {
  const call = groupCallOf(space);
  return call ? (S.voiceStates.get(call.id) || []).length : 0;
};

// Home: your groups, the latest first.
function renderGroups() {
  const groups = [...S.spaces.values()].filter(isGroupSpace).sort((a, b) => groupLastAt(b) - groupLastAt(a));
  el.groups.hidden = !groups.length && S.friends.size < 2;
  el.newGroupBtn.hidden = S.friends.size < 2;
  el.groupsEmpty.hidden = groups.length > 0;
  el.groupList.replaceChildren(...groups.map(groupRow));
}

function groupRow(space) {
  const li = document.createElement('li');
  li.className = 'person-row';
  const chat = groupChatOf(space);
  const key = chat ? `ch:${chat.id}` : '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `person${S.openDm === key ? ' open' : ''}`;
  const title = groupTitle(space);
  btn.title = title;
  const calling = groupInCall(space);
  const typing = key && typersIn(key).length > 0;
  const text = personText(title, typing ? 'typing…' : calling ? `In a call · ${calling} here` : `${(space.people || []).length} people`);
  if (typing) text.querySelector('.person-sub').classList.add('typing-now');
  if (calling && !typing) text.querySelector('.person-sub').classList.add('in-call-now');
  btn.append(groupFace(space), text);
  const dm = key && S.dms.get(key);
  if (dm && dm.unread) {
    const badge = document.createElement('span');
    badge.className = `badge${dm.mentions ? ' mention' : ''}`;
    badge.textContent = dm.unread > 99 ? '99+' : String(dm.unread);
    badge.title = `${dm.unread} unread`;
    btn.append(badge);
  }
  btn.addEventListener('click', () => openGroup(space.id));
  li.append(btn);
  return li;
}

function openGroup(spaceId) {
  const space = S.spaces.get(spaceId);
  const chat = space && groupChatOf(space);
  if (!chat) return;
  if (!space.members) loadMembers(space.id); // (for @mentions, and the people panel)
  openDm(`ch:${chat.id}`);
}

async function joinGroupCall(spaceId) {
  const space = S.spaces.get(spaceId);
  const call = space && groupCallOf(space);
  if (!call) return;
  if (!S.voiceEnabled) return toast("Calls with more than one friend aren't set up on this server yet.");
  await joinVoice(call.id);
}

// "Bea added Cleo", "Dan left the group", "Cleo named the group “Movie night”".
function groupNoteText(m) {
  const meta = m.meta || {};
  const who = m.author === S.clientId ? 'You' : friendName(m.author);
  const names = (ids) => listNames((ids || []).map((id) => (id === S.clientId ? 'you' : friendName(id))));
  switch (meta.action) {
    case 'add': return `${who} added ${names(meta.people)}`;
    case 'remove': return `${who} took ${names(meta.people)} out of the group`;
    case 'leave': return `${who} left the group`;
    case 'rename': return meta.name ? `${who} named the group “${meta.name}”` : `${who} took the group's name away`;
    default: return '';
  }
}

// ----- Making a group, or adding people to one -----

let groupPick = { mode: 'new', spaceId: null };

function openGroupPick(mode, spaceId = null) {
  groupPick = { mode, spaceId };
  const space = spaceId && S.spaces.get(spaceId);
  el.groupPickTitle.textContent = mode === 'new' ? 'New group' : `Add people to ${groupTitle(space)}`;
  el.groupPickNameField.hidden = mode !== 'new';
  el.groupPickName.value = '';
  el.groupPickGo.textContent = mode === 'new' ? 'Make the group' : 'Add them';
  el.groupPickError.hidden = true;
  const inGroup = new Set(space ? (space.people || []).map((p) => p.id) : []);
  const room = GROUP_MAX - (space ? inGroup.size : 1);
  el.groupPickHint.textContent = mode === 'new'
    ? `Pick two or more of your friends (up to ${GROUP_MAX - 1}). You can add more later.`
    : room > 0 ? `Pick friends of yours to add (up to ${room} more).` : `This group is full: groups can have up to ${GROUP_MAX} people.`;
  const friends = [...S.friends.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  el.groupPickList.replaceChildren(...friends.map((f) => {
    const li = document.createElement('li');
    const row = document.createElement('label');
    row.className = 'pick-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = f.id;
    box.checked = inGroup.has(f.id);
    box.disabled = inGroup.has(f.id);
    row.append(box, makeFace(f, f.presence), personText(f.displayName, inGroup.has(f.id) ? 'Already in the group' : `@${f.username}`));
    li.append(row);
    return li;
  }));
  if (!friends.length) {
    const li = document.createElement('li');
    li.className = 'side-empty';
    li.textContent = 'Add some friends first.';
    el.groupPickList.replaceChildren(li);
  }
  el.groupPick.showModal();
}

async function onGroupPickSubmit(e) {
  e.preventDefault();
  const ids = [...el.groupPickList.querySelectorAll('input:checked:not(:disabled)')].map((b) => b.value);
  el.groupPickGo.disabled = true;
  try {
    if (groupPick.mode === 'new') {
      const { space } = await api('POST', '/groups', { members: ids, name: el.groupPickName.value });
      el.groupPick.close();
      await refreshSpaces();
      openGroup(space.id);
    } else {
      if (!ids.length) throw new Error('Pick someone to add.');
      await api('POST', `/spaces/${groupPick.spaceId}/people`, { members: ids });
      el.groupPick.close();
    }
  } catch (err) {
    el.groupPickError.textContent = err.message;
    el.groupPickError.hidden = false;
  } finally {
    el.groupPickGo.disabled = false;
  }
}

// ----- A group's details: its name, who's in it, notifications, and leaving -----

function openGroupInfo(spaceId) {
  if (!isGroupSpace(S.spaces.get(spaceId))) return;
  el.groupInfo.dataset.space = spaceId;
  renderGroupInfo();
  el.groupInfo.showModal();
}

function renderGroupInfo() {
  const space = S.spaces.get(el.groupInfo.dataset.space);
  if (!space) {
    if (el.groupInfo.open) el.groupInfo.close();
    return;
  }
  el.groupInfoTitle.textContent = groupTitle(space);
  if (document.activeElement !== el.groupRenameInput) el.groupRenameInput.value = space.name;
  el.groupRenameInput.placeholder = groupTitle({ ...space, name: '' });
  el.groupNotify.value = space.notify || 'all';
  const people = [...(space.people || [])].sort((a, b) => b.owner - a.owner || a.displayName.localeCompare(b.displayName));
  el.groupPeopleTitle.textContent = `People · ${people.length}`;
  el.groupAddBtn.disabled = people.length >= GROUP_MAX;
  el.groupAddBtn.title = people.length >= GROUP_MAX ? `Groups can have up to ${GROUP_MAX} people` : '';
  el.groupPeople.replaceChildren(...people.map((p) => {
    const li = document.createElement('li');
    li.className = 'person-row';
    const who = document.createElement('button');
    who.type = 'button';
    who.className = 'person';
    const me = p.id === S.clientId;
    who.append(makeFace(p, presenceIn(p)), personText(me ? `${p.displayName} (you)` : p.displayName, p.owner ? 'Owner' : `@${p.username}`));
    who.addEventListener('click', () => openMiniProfile(p.id));
    li.append(who);
    if (space.role === 'owner' && !me) {
      li.append(smallButton('i-close', `Take ${p.displayName} out of the group`, () => removeFromGroup(space.id, p), 'ghost'));
    }
    return li;
  }));
}

async function removeFromGroup(spaceId, p) {
  const space = S.spaces.get(spaceId);
  if (!space || !confirm(`Take ${p.displayName} out of ${groupTitle(space)}?`)) return;
  try {
    await api('DELETE', `/spaces/${spaceId}/people/${p.id}`);
  } catch (err) {
    toast(err.message);
  }
}

async function onGroupRename(e) {
  e.preventDefault();
  const spaceId = el.groupInfo.dataset.space;
  try {
    await api('PATCH', `/spaces/${spaceId}`, { name: el.groupRenameInput.value });
    el.groupRenameInput.blur();
  } catch (err) {
    toast(err.message);
  }
}

async function onGroupNotify() {
  const space = S.spaces.get(el.groupInfo.dataset.space);
  if (!space) return;
  try {
    await api('PUT', `/spaces/${space.id}/notify`, { level: el.groupNotify.value });
    space.notify = el.groupNotify.value;
  } catch (err) {
    toast(err.message);
  }
}

async function onGroupLeave() {
  const space = S.spaces.get(el.groupInfo.dataset.space);
  if (!space || !confirm(`Leave ${groupTitle(space)}? You'll stop getting its messages.`)) return;
  try {
    if (S.voice && S.voice.spaceId === space.id) await leaveVoice({ quiet: true });
    await api('POST', `/spaces/${space.id}/leave`, {});
    el.groupInfo.close();
  } catch (err) {
    toast(err.message);
  }
}

// ----- Being rung for a group's call -----
// Someone started one: the same ringing card as a friend's call ("Bea is calling you and
// Cleo"), until you join or decline, someone else answers for you on another device, or a
// minute passes.

function onGroupRing({ space: spaceId, channel, from }) {
  if (!from || (S.voice && S.voice.channelId === channel) || S.ringing) return;
  const space = S.spaces.get(spaceId);
  S.groupRing = { spaceId, channel, from };
  const caller = from.displayName || 'Someone';
  const others = space ? (space.people || []).filter((p) => p.id !== S.clientId && p.id !== from.id).map((p) => friendName(p.id)) : [];
  const whom = space && space.name ? space.name : `you${others.length ? ` and ${listNames(others)}` : ''}`;
  renderFace(el.ringFace, from, null);
  el.ringName.textContent = caller;
  el.ringSub.textContent = `is calling ${whom}`;
  el.ring.hidden = false;
  document.title = `${caller} is calling`;
  appNotify({ title: `${caller} is calling ${whom}`, body: `${ANDROID ? 'Tap' : 'Click'} to open Rainlit and join.`, call: true });
  clearInterval(S.ringTimer);
  playRingtone();
  S.ringTimer = setInterval(playRingtone, RING_EVERY_MS);
}

function stopGroupRinging(channel = null) {
  if (!S.groupRing || (channel && S.groupRing.channel !== channel)) return;
  S.groupRing = null;
  el.ring.hidden = true;
  clearInterval(S.ringTimer);
  if (ANDROID) ANDROID.clearRing().catch(() => {});
  updateTitle();
}

function renderFriends() {
  renderSpaces();
  const list = [...S.friends.values()].sort((a, b) =>
    PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] || a.displayName.localeCompare(b.displayName));
  const online = list.filter((f) => f.presence !== 'offline').length;
  el.friendsTitle.textContent = list.length ? `Friends · ${online} online` : 'Friends';
  el.friendList.replaceChildren(...list.map(friendRow));
  el.friendsEmpty.hidden = list.length > 0;
  // Their conversation is open but they're not a friend any more: close it.
  if (S.openDm && !convExists(S.openDm)) closeDm();
  else if (S.openDm) renderDmHead();

  const requests = [...S.incoming.map((u) => requestRow(u, true)), ...S.outgoing.map((u) => requestRow(u, false))];
  el.requests.hidden = !requests.length;
  el.requestList.replaceChildren(...requests);
}

function personText(name, sub) {
  const text = document.createElement('span');
  text.className = 'person-text';
  const n = document.createElement('span');
  n.className = 'person-name';
  n.textContent = name;
  const s = document.createElement('span');
  s.className = 'person-sub';
  s.textContent = sub;
  text.append(n, s);
  return text;
}

function friendRow(f) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `person ${f.presence}${S.openDm === f.id ? ' open' : ''}`;
  btn.title = `${f.displayName} (@${f.username})`;
  const inCallWith = S.inCall && S.callWith === f.id;
  const typing = typersIn(f.id).length > 0;
  const text = personText(f.displayName, typing ? 'typing…' : inCallWith ? 'In a call with you' : f.statusText || PRESENCE_LABEL[f.presence]);
  if (typing) text.querySelector('.person-sub').classList.add('typing-now');
  btn.append(makeFace(f, f.presence), text);
  const unread = S.dms.has(f.id) ? S.dms.get(f.id).unread : 0;
  if (unread) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.title = `${unread} unread`;
    btn.append(badge);
  }
  btn.addEventListener('click', () => openDm(f.id));
  li.className = 'person-row';
  const more = smallButton('i-more', `More for ${f.displayName}`, () => {
    const r = more.getBoundingClientRect();
    openFriendMenu(f.id, r.right - 190 * uiZoom(), r.bottom + 4, more);
  }, 'ghost person-more');
  // Right-click on a computer, long-press on a phone.
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openFriendMenu(f.id, e.clientX, e.clientY);
  });
  li.append(btn, more);
  return li;
}

function smallButton(icon, label, onClick, extraClass = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `icon-btn ${extraClass}`.trim();
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg>`;
  b.addEventListener('click', onClick);
  return b;
}

function requestRow(u, incoming) {
  const li = document.createElement('li');
  li.className = 'person';
  const actions = document.createElement('span');
  actions.className = 'person-actions';
  const act = (fn) => async () => {
    try {
      await fn();
      await refreshFriends();
    } catch (err) {
      toast(err.message);
    }
  };
  if (incoming) {
    actions.append(
      smallButton('i-check', `Accept ${u.displayName}`, act(() => api('POST', `/friends/${u.id}/accept`)), 'accept'),
      smallButton('i-close', `Decline ${u.displayName}`, act(() => api('DELETE', `/friends/${u.id}`)), 'ghost'));
  } else {
    actions.append(smallButton('i-close', `Cancel request to ${u.displayName}`, act(() => api('DELETE', `/friends/${u.id}`)), 'ghost'));
  }
  li.append(makeFace(u, null), personText(u.displayName, incoming ? 'Wants to be friends' : 'Request sent'), actions);
  return li;
}

async function onAddFriend(e) {
  e.preventDefault();
  const username = el.addFriendInput.value.trim();
  if (!username) return;
  try {
    const { status, user } = await api('POST', '/friends', { username });
    el.addFriendInput.value = '';
    toast(status === 'friends' ? `You and ${user.displayName} are friends now.` : `Friend request sent to ${user.displayName}.`);
    await refreshFriends();
  } catch (err) {
    toast(err.message);
  }
}

// ---------------- A friend's menu ----------------

let menuFriendId = null;
let menuOpener = null;

function openFriendMenu(friendId, x, y, opener = null) {
  if (!S.friends.has(friendId)) return;
  closeFriendMenu();
  menuFriendId = friendId;
  menuOpener = opener;
  if (opener) opener.classList.add('open');
  const here = S.inCall && S.callWith === friendId;
  el.menuCall.textContent = here ? 'Back to the call' : 'Call';
  el.menuCall.disabled = S.inCall && !here;
  el.menuCall.title = el.menuCall.disabled ? 'Leave your current call first' : '';
  el.menuRemove.textContent = 'Remove friend';
  delete el.menuRemove.dataset.confirm;
  el.menu.hidden = false;
  // Next to the pointer, but never off the edge of the screen.
  const r = el.menu.getBoundingClientRect();
  const z = uiZoom();
  el.menu.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8)) / z}px`;
  el.menu.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8)) / z}px`;
  el.menuMessage.focus();
}

function closeFriendMenu() {
  if (el.menu.hidden) return;
  el.menu.hidden = true;
  if (menuOpener) menuOpener.classList.remove('open');
  menuOpener = null;
}

// Runs one of the menu's choices for the friend it was opened on.
function menuAction(fn) {
  return () => {
    const id = menuFriendId;
    closeFriendMenu();
    if (id && S.friends.has(id)) fn(id);
  };
}

async function onMenuRemove() {
  // The first click asks, the second one removes.
  if (!el.menuRemove.dataset.confirm) {
    el.menuRemove.dataset.confirm = '1';
    el.menuRemove.textContent = 'Click again to remove';
    return;
  }
  const f = S.friends.get(menuFriendId);
  closeFriendMenu();
  if (!f) return;
  try {
    await api('DELETE', `/friends/${f.id}`);
    toast(`Removed ${f.displayName} from your friends.`);
    await refreshFriends();
  } catch (err) {
    toast(err.message);
  }
}

// ---------------- Badges ----------------

// The little marks on people's profiles, in the order they're shown. Their pictures are in
// /badges. So far there's one: a glowing leaf for everyone who joined during the alpha.
const BADGES = {
  alpha: { name: 'First Leaf', about: 'Here since the Rainlit alpha', when: 'Joined' },
};

function badgeImg(id, size = 22) {
  const img = document.createElement('img');
  img.src = `/badges/${id}.svg`;
  img.alt = '';
  img.width = img.height = size;
  img.draggable = false;
  return img;
}

// A row of someone's badges. Each says what it is on hover, or when tapped.
function renderBadges(box, badges) {
  const order = Object.keys(BADGES);
  const list = (badges || []).filter((b) => BADGES[b.id]).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  box.replaceChildren(...list.map((b) => {
    const info = BADGES[b.id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'user-badge';
    btn.setAttribute('aria-label', `${info.name}: ${info.about}`);
    const tip = document.createElement('span');
    tip.className = 'badge-tip';
    tip.setAttribute('role', 'tooltip');
    const name = document.createElement('strong');
    name.textContent = info.name;
    const about = document.createElement('span');
    about.textContent = info.about;
    tip.append(name, about);
    if (b.at) {
      const when = document.createElement('small');
      when.textContent = `${info.when} ${new Date(b.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
      tip.append(when);
    }
    btn.append(badgeImg(b.id), tip);
    btn.addEventListener('click', () => {
      const show = !btn.classList.contains('show');
      for (const other of box.querySelectorAll('.user-badge.show')) other.classList.remove('show');
      btn.classList.toggle('show', show);
    });
    btn.addEventListener('blur', () => btn.classList.remove('show'));
    return btn;
  }));
  box.hidden = !list.length;
  return list.length;
}

// ---------------- Someone's profile ----------------
//
// A friend's, someone's from one of your spaces, or yours: what they look like to everyone.

let miniProfileId = null;

function profileOf(id) {
  return id === S.clientId ? S.me : S.friends.get(id) || S.people.get(id) || null;
}

async function openMiniProfile(id) {
  miniProfileId = id;
  el.mpRemove.dataset.confirm = '';
  el.mpBlock.dataset.confirm = '';
  const known = profileOf(id);
  if (known) {
    renderMiniProfile();
    if (!el.miniProfile.open) el.miniProfile.showModal();
  }
  if (id === S.clientId || S.friends.has(id)) return;
  // Someone from a space: get their newest profile.
  try {
    const { user } = await api('GET', `/users/${id}`);
    S.people.set(id, Object.assign(S.people.get(id) || {}, user));
  } catch {
    return;
  }
  if (miniProfileId !== id || (known && !el.miniProfile.open)) return; // closed meanwhile
  renderMiniProfile();
  if (!el.miniProfile.open) el.miniProfile.showModal();
}

function renderMiniProfile() {
  const id = miniProfileId;
  const self = id === S.clientId;
  const f = S.friends.get(id);
  const p = profileOf(id);
  if (!p) return el.miniProfile.close(); // not friends, or in a space together, any more
  const presence = self ? myPresence() : f ? f.presence : null;
  renderFace(el.mpFace, p, presence);
  el.mpName.textContent = p.displayName;
  el.mpUsername.textContent = `@${p.username}`;
  renderBadges(el.mpBadges, p.badges);
  el.mpPresence.hidden = !presence;
  if (presence) {
    el.mpPresence.textContent = PRESENCE_LABEL[presence];
    el.mpPresence.dataset.presence = presence;
  }
  el.mpStatus.textContent = p.statusText || '';
  const blocked = !self && S.blocked && S.blocked.has(id);
  el.mpBlocked.hidden = !blocked;
  el.mpSafety.hidden = self;
  el.mpBlock.textContent = blocked ? 'Unblock' : el.mpBlock.dataset.confirm ? `Yes, block ${p.displayName}` : 'Block';
  // With a friend you can message or call; with anyone else, add them.
  el.mpMessage.hidden = el.mpCall.hidden = el.mpRemove.hidden = !f;
  el.mpAdd.hidden = self || Boolean(f) || blocked;
  el.mpEdit.hidden = !self;
  if (f) {
    const here = S.inCall && S.callWith === f.id;
    el.mpCall.textContent = here ? 'Back to the call' : 'Call';
    el.mpCall.disabled = S.inCall && !here;
    el.mpCall.title = el.mpCall.disabled ? 'Leave your current call first' : '';
    el.mpRemove.textContent = el.mpRemove.dataset.confirm ? 'Click again to remove' : 'Remove friend';
  } else if (!self) {
    const sent = S.outgoing.some((u) => u.id === id);
    const theyAsked = S.incoming.some((u) => u.id === id);
    el.mpAdd.textContent = sent ? 'Request sent' : theyAsked ? 'Accept friend request' : 'Add friend';
    el.mpAdd.disabled = sent;
  }
}

// Blocking asks first; unblocking doesn't.
async function onProfileBlock() {
  const id = miniProfileId;
  const p = profileOf(id);
  if (!p) return;
  const blocked = S.blocked.has(id);
  if (!blocked && !el.mpBlock.dataset.confirm) {
    el.mpBlock.dataset.confirm = '1';
    return renderMiniProfile();
  }
  el.mpBlock.dataset.confirm = '';
  await setBlocked(id, !blocked, p.displayName);
}

async function setBlocked(id, block, name) {
  try {
    await api(block ? 'PUT' : 'DELETE', `/blocks/${id}`);
    await refreshFriends();
    toast(block ? `You've blocked ${name}.` : `You've unblocked ${name}.`);
  } catch (err) {
    toast(err.message);
  }
}

// The space someone's profile was opened in, if any: its moderators see reports about them.
function currentSpaceId() {
  if (S.view !== 'home') return S.view;
  const c = isChannelKey(S.openDm) && S.channels.get(channelIdOf(S.openDm));
  return c ? c.spaceId : null;
}

async function onProfileAddFriend() {
  const p = profileOf(miniProfileId);
  if (!p) return;
  el.mpAdd.disabled = true;
  try {
    const { status } = await api('POST', '/friends', { username: p.username });
    toast(status === 'friends' ? `You and ${p.displayName} are friends now.` : `Friend request sent to ${p.displayName}.`);
    await refreshFriends();
  } catch (err) {
    toast(err.message);
  }
  if (el.miniProfile.open) renderMiniProfile();
}

async function onRemoveFriend() {
  // The first click asks, the second one removes.
  if (!el.mpRemove.dataset.confirm) {
    el.mpRemove.dataset.confirm = '1';
    return renderMiniProfile();
  }
  const f = S.friends.get(miniProfileId);
  el.miniProfile.close();
  if (!f) return;
  try {
    await api('DELETE', `/friends/${f.id}`);
    toast(`Removed ${f.displayName} from your friends.`);
    await refreshFriends();
  } catch (err) {
    toast(err.message);
  }
}

// ---------------- Your profile ----------------

function showProfileError(text) {
  el.profileError.textContent = text;
  el.profileError.hidden = !text;
}

function updateStatusCount() {
  el.statusCount.textContent = `${el.profileStatus.value.length}/120`;
}

function openProfile() {
  el.profileName.value = S.me.displayName;
  el.profileStatus.value = S.me.statusText;
  el.profilePresence.value = S.me.presence;
  el.profileAccount.textContent = `@${S.me.username} · ${S.me.email}`;
  renderProfileBadges();
  renderBlockedList();
  renderFace(el.profileFace, S.me, null);
  el.avatarRemoveBtn.hidden = !S.me.avatar;
  el.pwCurrent.value = el.pwNext.value = '';
  updateStatusCount();
  showProfileError('');
  el.profile.showModal();
}

function renderBlockedList() {
  const people = S.blockedUsers || [];
  el.blockedCount.textContent = people.length ? `(${people.length})` : '';
  if (!people.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = "You haven't blocked anyone.";
    return el.blockedList.replaceChildren(li);
  }
  el.blockedList.replaceChildren(...people.map((u) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'grow';
    name.textContent = `${u.displayName} (@${u.username})`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'text-btn';
    b.textContent = 'Unblock';
    b.addEventListener('click', () => setBlocked(u.id, false, u.displayName));
    li.append(makeFace(u, null), name, b);
    return li;
  }));
}

function renderProfileBadges() {
  el.profileBadges.parentElement.hidden = !renderBadges(el.profileBadges, S.me.badges);
}

async function onProfileSave(e) {
  e.preventDefault();
  showProfileError('');
  try {
    const { user } = await api('PATCH', '/me', {
      displayName: el.profileName.value,
      statusText: el.profileStatus.value,
      presence: el.profilePresence.value,
    });
    setMe(user);
    el.profile.close();
    toast('Profile saved.');
  } catch (err) {
    showProfileError(err.message);
  }
}

async function onAvatarPicked() {
  const file = el.avatarInput.files[0];
  el.avatarInput.value = '';
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) return showProfileError('Profile pictures can be up to 8 MB.');
  showProfileError('');
  el.avatarBtn.disabled = true;
  el.avatarBtn.textContent = 'Uploading';
  try {
    const { user } = await api('PUT', '/me/avatar', file);
    setMe(user);
    renderFace(el.profileFace, user, null);
    el.avatarRemoveBtn.hidden = false;
  } catch (err) {
    showProfileError(err.message);
  } finally {
    el.avatarBtn.disabled = false;
    el.avatarBtn.textContent = 'Change picture';
  }
}

async function onAvatarRemove() {
  try {
    const { user } = await api('DELETE', '/me/avatar');
    setMe(user);
    renderFace(el.profileFace, user, null);
    el.avatarRemoveBtn.hidden = true;
  } catch (err) {
    showProfileError(err.message);
  }
}

async function onPasswordChange() {
  showProfileError('');
  try {
    await api('POST', '/me/password', { current: el.pwCurrent.value, next: el.pwNext.value });
    el.pwCurrent.value = el.pwNext.value = '';
    el.pwCurrent.closest('details').open = false;
    toast('Password changed. Any other devices you were signed in on have been signed out.', 6000);
  } catch (err) {
    showProfileError(err.message);
  }
}

async function onSignOut() {
  // A signed-out phone shouldn't get anyone's calls or messages.
  const pushUrl = S.androidPush && S.androidPush.endpoint && S.androidPush.endpoint.url;
  if (pushUrl) {
    try { await api('DELETE', '/push', { endpoint: pushUrl }); } catch {}
    S.pushSent = '';
  }
  try { await api('POST', '/logout', {}); } catch {}
  signedOut();
}

// ---------------- Admin: invites and accounts ----------------

async function openAdmin() {
  el.admin.showModal();
  await renderAdmin();
}

async function renderAdmin() {
  let invites, users, reports, pairs;
  try {
    [{ invites }, { users }, { reports }, { pairs }] = await Promise.all([
      api('GET', '/admin/invites'), api('GET', '/admin/users'), api('GET', '/admin/reports'), api('GET', '/admin/traces'),
    ]);
  } catch (err) {
    return toast(err.message);
  }
  renderTraceList(pairs);
  if (!reports.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No reports.';
    el.reportList.replaceChildren(li);
  } else {
    el.reportList.replaceChildren(...reports.map((r) => reportItem(r, {
      onResolve: async (report, resolved) => {
        try {
          await api('POST', `/admin/reports/${report.id}/resolve`, { resolved });
          renderAdmin();
          refreshFriends();
        } catch (err) {
          toast(err.message);
        }
      },
    })));
  }
  el.inviteList.replaceChildren(...invites.map((inv) => {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = inv.code;
    const note = document.createElement('span');
    note.className = 'grow muted';
    note.textContent = inv.usedBy ? `Used by @${inv.usedBy}` : `Made ${fmtWhen(inv.createdAt)}`;
    li.append(code, note);
    if (!inv.usedBy) {
      li.append(
        smallButton('i-copy', 'Copy invite', () => copyInvite(inv.code), 'ghost'),
        smallButton('i-trash', 'Delete this invite', async () => {
          await api('DELETE', `/admin/invites/${inv.code}`).catch((err) => toast(err.message));
          renderAdmin();
        }, 'ghost'));
    }
    return li;
  }));
  if (!invites.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No invites yet.';
    el.inviteList.replaceChildren(li);
  }

  el.userList.replaceChildren(...users.map((u) => {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'grow';
    who.textContent = `${u.displayName} (@${u.username}) · ${u.email}${u.isAdmin ? ' · admin' : ''}`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'text-btn';
    reset.textContent = 'Reset link';
    reset.addEventListener('click', async () => {
      try {
        const { url, hours } = await api('POST', `/admin/users/${u.id}/reset-link`, {});
        const box = document.createElement('div');
        box.className = 'reset-link';
        box.textContent = `Send this to ${u.displayName}. It works once, for ${hours} hours: ${url}`;
        li.after(box);
        copyText(url, 'Reset link copied.');
      } catch (err) {
        toast(err.message);
      }
    });
    li.append(makeFace(u, null), who, reset);
    return li;
  }));
}

function copyInvite(code) {
  copyText(`Come hang out on Rainlit! ${SERVER}\nSign up with this invite code: ${code}`, 'Invite copied. Paste it to your friend.');
}

async function onMakeInvite() {
  try {
    const { code } = await api('POST', '/admin/invites', {});
    copyInvite(code);
    renderAdmin();
  } catch (err) {
    toast(err.message);
  }
}

// ---------------- Ringing ----------------

function startRinging(from) {
  if (!from || !from.id || (S.inCall && S.callWith === from.id)) return;
  const f = S.friends.get(from.id);
  if (f) Object.assign(f, from);
  if (S.groupRing) stopGroupRinging(); // (a friend's own call rings over a group's)
  S.ringing = f || from;
  renderFace(el.ringFace, S.ringing, null);
  el.ringName.textContent = S.ringing.displayName || 'A friend';
  el.ringSub.textContent = 'is calling you';
  el.ring.hidden = false;
  document.title = `${S.ringing.displayName} is calling`;
  appNotify({ title: `${S.ringing.displayName || 'A friend'} is calling`, body: `${ANDROID ? 'Tap' : 'Click'} to open Rainlit and answer.`, call: true });
  clearInterval(S.ringTimer);
  playRingtone();
  S.ringTimer = setInterval(playRingtone, RING_EVERY_MS);
}

function stopRinging(fromId) {
  if (!S.ringing || (fromId && S.ringing.id !== fromId)) return;
  S.ringing = null;
  el.ring.hidden = true;
  clearInterval(S.ringTimer);
  if (ANDROID) ANDROID.clearRing().catch(() => {});
  updateTitle();
}

function onRingJoin() {
  if (S.groupRing) {
    const { spaceId } = S.groupRing;
    stopGroupRinging();
    openGroup(spaceId);
    return joinGroupCall(spaceId);
  }
  const id = S.ringing && S.ringing.id;
  if (!id) return;
  if (S.inCall) return toast('Leave your current call first, then call them back.');
  if (S.voice) leaveVoice();
  stopRinging();
  startCall(id);
}

function onRingDecline() {
  if (S.groupRing) {
    wsSend({ type: 'group-ring-decline', channel: S.groupRing.channel });
    return stopGroupRinging();
  }
  if (!S.ringing) return;
  wsSend({ type: 'ring-decline', from: S.ringing.id });
  stopRinging();
}

// They declined, or didn't answer in time.
function callNotAnswered(friendId, why) {
  if (!S.inCall || S.callWith !== friendId || S.peer) return;
  S.callAnswer = why;
  renderPeer();
}

function ringAgain() {
  S.callAnswer = null;
  S.resumeCallId = null; // (their app still has its claim, so ringing and them coming back both work)
  S.resumeStartedAt = null;
  wsSend({ type: 'leave' }); // a fresh try at the call rings them again
  sendCallJoin();
  renderPeer();
}

// ---------------- Call debug log ----------------
// With Settings > Call debug log on, what happens to a call's connection is noted, with the
// time: the link to the server, the call's own link and the way it goes, the page being
// paused, hidden or started again, the network, the battery. The notes go to the server
// (lib/traces.js), for whoever runs it to see why a call dropped: never what's said or shared,
// and no addresses. They wait in this device's storage until the server has them, so a phone
// that was cut off still hands them over once it's back.

S.trace = store.get('callTrace', 'off') === 'on';
const traceQueue = [];
try { traceQueue.push(...JSON.parse(store.get('traceQueue', '[]'))); } catch {}
// (Saved at once: the page may not get another chance.)
const TRACE_NOW = new Set(['ws-close', 'ws-quiet', 'pc-state', 'page-hidden', 'page-freeze', 'pagehide', 'app-hidden', 'app-start', 'call-end', 'offline']);
const TRACED_MSGS = new Set(['joined', 'call-started', 'peer-joined', 'peer-away', 'peer-back', 'peer-moved', 'peer-left', 'call-ended', 'replaced', 'error']);

// A note about the call with friendId: the one you're in, unless it's about one you were in.
function trace(kind, data = {}, friendId = S.inCall ? S.callWith : '') {
  if (!S.trace || !friendId) return;
  const note = { t: Math.round(serverNow()), k: kind, w: friendId, c: (S.call && S.call.id) || S.resumeCallId || undefined, i: randomId().slice(0, 12) };
  for (const [key, value] of Object.entries(data)) if (value !== undefined && value !== null && value !== '') note[key] = value;
  traceQueue.push(note);
  if (traceQueue.length > 3000) traceQueue.splice(0, traceQueue.length - 3000);
  saveTrace(TRACE_NOW.has(kind));
}

function saveTrace(now) {
  const write = () => {
    S.traceSaveTimer = 0;
    store.set('traceQueue', JSON.stringify(traceQueue));
  };
  if (now) {
    clearTimeout(S.traceSaveTimer);
    write();
  } else if (!S.traceSaveTimer) {
    S.traceSaveTimer = setTimeout(write, 5000);
  }
}

// The oldest waiting notes, as many as fit in one request.
function traceBatch(maxBytes) {
  const batch = [];
  let size = 0;
  for (const note of traceQueue) {
    const n = JSON.stringify(note).length + 1;
    if (batch.length && (size + n > maxBytes || batch.length >= 100)) break;
    batch.push(note);
    size += n;
  }
  return batch;
}

// Hands the waiting notes to the server, a batch at a time. A page that's going away can only
// send one and not hear back; those go again next time (the server keeps each note once).
async function sendTrace({ leaving = false } = {}) {
  if (!S.trace || !traceQueue.length || !S.me) return;
  const body = (batch) => ({ device: traceDevice(), entries: batch });
  if (leaving) {
    try {
      fetch(`${SERVER}/api/traces`, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(traceBatch(20_000))),
      }).catch(() => {});
    } catch {}
    return;
  }
  if (S.traceSending) return;
  S.traceSending = true;
  try {
    while (traceQueue.length) {
      const batch = traceBatch(24_000);
      try {
        await api('POST', '/traces', body(batch));
      } catch (err) {
        if (err.status !== 400 && err.status !== 413) break; // (try again later; a batch it won't take is dropped)
      }
      traceQueue.splice(0, batch.length);
      saveTrace(true);
    }
  } finally {
    S.traceSending = false;
  }
}

// "Android app 1.4.0, Chrome 140, Android 16, UTC-5": which device the notes are from.
function traceDevice() {
  const ua = navigator.userAgent;
  const os = (ua.match(/Android [\d.]+/) || ua.match(/Windows NT [\d.]+/) || ua.match(/Mac OS X [\d_]+/) || ua.match(/Linux/) || [''])[0];
  const [, name, v] = ua.match(/(Edg|Firefox)\/(\d+)/) || ua.match(/(Chrome)\/(\d+)/) || [];
  const browser = name ? `${name === 'Edg' ? 'Edge' : name} ${v}` : '';
  const app = ANDROID ? `Android app ${(S.androidApp && S.androidApp.mine) || ''}` : DESKTOP ? `Windows app ${DESKTOP.version || ''}` : 'browser';
  const tz = -new Date().getTimezoneOffset() / 60;
  return [app.trim(), browser, os, `UTC${tz >= 0 ? '+' : ''}${tz}`].filter(Boolean).join(', ');
}

function netInfo() {
  const c = navigator.connection;
  if (!c) return undefined;
  return [c.type, c.effectiveType, c.downlink != null ? `${c.downlink}Mbps` : '', c.rtt != null ? `${c.rtt}ms` : ''].filter(Boolean).join(' ') || undefined;
}

function watchBattery() {
  if (S.batteryWatched || !navigator.getBattery) return;
  S.batteryWatched = true;
  navigator.getBattery().then((b) => {
    S.battery = b;
    b.addEventListener('chargingchange', () => trace('battery', { charging: b.charging, level: `${Math.round(b.level * 100)}%` }));
  }).catch(() => {});
}

// While in a call: every 5 seconds, a check that the page wasn't paused (a phone freezing the
// app stops its timers, so the gap shows how long); every minute, how the call's doing.
function startTraceWatch() {
  stopTraceWatch();
  if (!S.trace || !S.inCall) return;
  watchBattery();
  S.traceTickAt = Date.now();
  S.traceTick = setInterval(() => {
    const now = Date.now();
    if (now - S.traceTickAt > 20_000) trace('page-paused', { forS: Math.round((now - S.traceTickAt) / 1000) });
    S.traceTickAt = now;
  }, 5000);
  S.traceStatusTimer = setInterval(traceStatus, 60_000);
  S.traceSendTimer = setInterval(sendTrace, 60_000);
  traceStatus();
}

function stopTraceWatch() {
  clearInterval(S.traceTick);
  clearInterval(S.traceStatusTimer);
  clearInterval(S.traceSendTimer);
}

// How the call's doing: its own link (and how much sound came in and went out since last
// time), the link to the server, the page, the network and the battery.
async function traceStatus() {
  if (!S.trace || !S.inCall) return;
  const s = {
    ws: wsOpen() ? 'open' : 'down',
    quietS: wsOpen() ? Math.round((Date.now() - S.lastServerMsg) / 1000) : undefined,
    hidden: document.hidden || undefined,
    paused: S.androidPaused || undefined,
    peer: !S.peer ? 'none' : S.peer.away ? 'away' : 'here',
    out: S.audioRoute ? S.audioRoute.current : undefined,
    vol: `${Math.round(Math.min(S.volume, volumeCap()) * 100)}%`,
    echo: S.micFx.echoCancellation ? undefined : 'off',
    net: netInfo(),
    battery: S.battery ? `${Math.round(S.battery.level * 100)}%${S.battery.charging ? ' charging' : ''}` : undefined,
    // How big the page has grown (a phone short on memory closes the biggest apps first).
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined,
    nodes: document.getElementsByTagName('*').length,
  };
  // Their voice as this device plays it: its player going or not (muted while the boost plays
  // it instead), and the boost's own state and how far its clock moved since last time.
  const voice = [...S.remoteAudio.values()].find((a) => a.dataset.kind === 'voice');
  if (voice) s.player = voice.paused ? 'paused' : voice.muted ? 'muted' : 'playing';
  if (S.boostCtx) {
    const clock = S.boostCtx.currentTime;
    s.boost = S.boostCtx.state;
    if (S.traceBoostClock !== undefined && S.traceBoostCtx === S.boostCtx) s.boostS = Math.round(clock - S.traceBoostClock);
    S.traceBoostClock = clock;
    S.traceBoostCtx = S.boostCtx;
  }
  if (ANDROID) {
    try { s.duck = (await ANDROID.duckStatus()).state; } catch {}
  }
  const conn = S.conn;
  if (conn) {
    s.pc = conn.pc.connectionState;
    try {
      const stats = await conn.pc.getStats();
      let inAudio = null;
      let outAudio = null;
      let pair = null;
      stats.forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio' && (!inAudio || r.packetsReceived > inAudio.packetsReceived)) inAudio = r;
        else if (r.type === 'outbound-rtp' && r.kind === 'audio' && (!outAudio || r.packetsSent > outAudio.packetsSent)) outAudio = r;
        else if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
      });
      const last = conn.traceLast || { got: 0, lost: 0, sent: 0, played: 0 };
      const now = {
        got: inAudio ? inAudio.packetsReceived : 0, lost: inAudio ? inAudio.packetsLost || 0 : 0, sent: outAudio ? outAudio.packetsSent : 0,
        // (Seconds of their sound actually played out here: it stops going up if nothing plays it.)
        played: inAudio ? inAudio.totalSamplesDuration || (inAudio.totalSamplesReceived || 0) / 48000 : 0,
      };
      s.soundIn = now.got - last.got;
      s.playedS = Math.round(now.played - last.played);
      s.soundOut = now.sent - last.sent;
      if (now.lost > last.lost) s.lost = now.lost - last.lost;
      if (inAudio && inAudio.jitter) s.jitterMs = Math.round(inAudio.jitter * 1000);
      if (pair && pair.currentRoundTripTime != null) s.rttMs = Math.round(pair.currentRoundTripTime * 1000);
      conn.traceLast = now;
    } catch {}
  }
  trace('status', s);
}

// The way the call's sound goes: direct or through the relay, over which network. Noted when
// it changes (a phone moving from wifi to mobile data, say). No addresses.
function traceRoute(conn, stats, pair, local) {
  if (!S.trace) return;
  const remote = stats.get(pair.remoteCandidateId);
  const route = [local && local.candidateType, local && (local.relayProtocol || local.protocol), local && local.networkType, 'to', remote && remote.candidateType]
    .filter(Boolean).join(' ');
  if (route === conn.traceRoute) return;
  conn.traceRoute = route;
  trace('route', { route });
}

// Call debug logs in the admin box: one download per pair of people, both of their sides of
// their calls and the server's, as one timeline.
function renderTraceList(pairs) {
  if (!pairs.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'None yet.';
    return el.traceList.replaceChildren(li);
  }
  el.traceList.replaceChildren(...pairs.map((p) => {
    const li = document.createElement('li');
    const who = document.createElement('span');
    who.className = 'grow';
    who.textContent = `${p.names.join(' and ')} · last note ${fmtWhen(p.last)}`;
    const link = (hours, label) => {
      const a = document.createElement('a');
      a.className = 'text-btn';
      a.href = `${SERVER}/api/admin/traces/${encodeURIComponent(p.pair)}?hours=${hours}`;
      a.download = `rainlit-call-log-${new Date().toISOString().slice(0, 10)}.txt`;
      a.textContent = label;
      return a;
    };
    li.append(who, link(24, 'Last day'), link(168, 'Week'));
    return li;
  }));
}

// ---------------- Starting a call ----------------

// Calls a friend, answers them, or rejoins a call you dropped out of.
async function startCall(friendId) {
  const friend = S.friends.get(friendId);
  if (!friend) return toast('You can only call people on your friends list.');
  if (S.voice && !S.inCall && !S.startingCall) await leaveVoice(); // (a call and a voice channel at once would talk over each other)
  if (S.inCall || S.startingCall) {
    if (S.callWith !== friendId) toast('Leave your current call first.');
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices || !window.RTCPeerConnection) {
    return toast('Calls need a secure connection. Open Rainlit from its https:// address in Chrome, Edge or Firefox.', 8000);
  }
  S.startingCall = true;
  try {
    const data = await api('GET', '/ice');
    S.iceServers = data.iceServers || [];
    S.hasTurn = Boolean(data.hasTurn);
  } catch (err) {
    S.startingCall = false;
    return toast(err.message);
  }

  S.callWith = friendId;
  S.name = S.me.displayName;
  const active = readActiveCall();
  S.resumeCallId = active && active.with === friendId ? active.callId : null;
  S.resumeStartedAt = active && active.with === friendId ? active.startedAt || null : null;
  stopRinging(friendId);

  try {
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {}

  S.micOn = true;
  let micError = null;
  try {
    await setMicTrack(await getMicTrack(S.devices.mic));
  } catch (err) {
    S.micOn = false;
    micError = err;
  }

  S.startingCall = false;
  S.callJoined = false;
  S.inCall = true;
  S.mediaDropped = false;
  trace('call-start', { auto: S.restartNote ? true : undefined, claim: S.resumeCallId ? S.resumeCallId.slice(0, 8) : undefined, mic: S.micOn ? undefined : 'off' });
  startTraceWatch();
  updateTitle(); // (and the corner glow)
  clearInterval(S.iceTimer);
  S.iceTimer = setInterval(refreshIce, 3 * 3600_000);
  clearInterval(S.healthTimer);
  S.healthTimer = setInterval(checkCallSound, 2000);
  S.micDeadSince = 0;
  S.micRevivedAt = 0;
  S.micRevives = 0;
  S.micSilentRevived = false;
  S.micQuietIsNormal = false;
  S.soundStats = new Map();
  S.soundRestartedAt = 0;
  updateRain();
  syncDesktopPtt();
  sendBackground();
  // (Echo cancelling decides whether Android plays the call's sound as a call or like music.)
  if (ANDROID) ANDROID.callStarted({ name: friendName(S.callWith), echo: S.micFx.echoCancellation, duck: store.get('duck', 'on') !== 'off' }).then(renderRoute).catch(() => {});
  S.call = null;
  S.callAnswer = null;
  S.lastLogSeq = 0;
  S.lastPeerName = '';
  el.roomLabel.textContent = friend.displayName;
  openDm(friendId);
  renderCallPlacement();
  renderRejoin();

  renderPeer();
  renderSelf();
  renderControls();
  renderTick();
  S.meterTimer = setInterval(tickMeters, 100);
  S.tickTimer = setInterval(renderTick, 1000);
  if (wsOpen()) sendCallJoin(); // otherwise it's sent as soon as the connection opens

  if (micError) toast(mediaErrorText(micError, 'Microphone'), 8000);
}

function readActiveCall() {
  try {
    const a = JSON.parse(store.get('activeCall', 'null'));
    // Anything older than a day is certainly over.
    return a && a.with && Date.now() - a.at < 24 * 3600_000 ? a : null;
  } catch {
    return null;
  }
}

// "You were in a call with Bea and didn't press Leave. Rejoin?"
function renderRejoin() {
  const a = readActiveCall();
  const f = a && S.friends.get(a.with);
  el.rejoin.hidden = !f || S.inCall;
  if (f) el.rejoinText.textContent = `You were in a call with ${f.displayName} and didn't press Leave.`;
}

// ---------------- Leaving a call ----------------

function onLeaveClick() {
  if (S.inCall) playCallSound(false);
  if (!S.callSounds) playClick(); // (without call sounds, it's still a button you pressed)
  let summary = null;
  if (S.call) {
    const now = serverNow();
    // The call ends if your friend isn't connected right now.
    const ended = !S.peer || Boolean(S.peer.away);
    const log = S.call.log.slice();
    log.push({ t: now, kind: 'leave', id: S.clientId, name: S.name });
    if (ended) log.push({ t: now, kind: 'end', durationMs: now - S.call.startedAt });
    summary = {
      id: S.call.id, with: S.callWith, startedAt: S.call.startedAt,
      endedAt: ended ? now : null, leftAt: now, ended,
      withName: S.peer ? S.peer.name : otherNameFromLog(log),
      stillWith: S.peer ? S.peer.name : '', log,
    };
  }
  teardown({ sendLeave: true });
  if (summary) {
    recordHistory(summary);
    showSummary(summary);
  }
}

// Ends the call on this device. The connection to the server stays open: you're still online.
function teardown({ sendLeave, keepActive = false }) {
  trace('call-end', { how: sendLeave ? 'you left' : keepActive ? 'moved to another device' : 'ended' });
  stopTraceWatch();
  sendTrace();
  for (const t of S.transfers.values()) {
    if (ACTIVE.has(t.state)) endTransfer(t, 'failed', t.dir === 'out' ? 'Not sent. You left the call.' : 'Stopped. You left the call.');
  }
  S.inCall = false;
  S.onPhone = false;
  S.facing = '';
  setStageFull(false);
  S.mediaDropped = false;
  updateTitle(); // (and the corner glow)
  clearInterval(S.iceTimer);
  clearInterval(S.healthTimer);
  updateRain();
  syncDesktopPtt();
  sendBackground();
  if (ANDROID) ANDROID.callEnded().catch(() => {});
  renderRoute(null);
  if (sendLeave) wsSend({ type: 'leave' });
  if (!keepActive) store.set('activeCall', 'null');

  closePeer();
  // The volume boost stops with the call (never quite silent, it would keep the speaker going).
  if (S.boostCtx) {
    S.boostCtx.onstatechange = null;
    S.boostCtx.close().catch(() => {});
    S.boostCtx = null;
    S.boostKeeper = null;
  }
  S.peer = null;
  S.call = null;
  S.lastLogSeq = 0;
  S.resumeCallId = null;
  S.failCount = 0;
  S.wsDownSince = null;
  stopAllLocal();
  if (S.localMeter) S.localMeter.disconnect();
  S.localMeter = null;
  clearInterval(S.meterTimer);
  S.trayLitUntil = 0;
  renderTrayIcon(false);
  clearInterval(S.tickTimer);
  if (S.audioCtx) S.audioCtx.close().catch(() => {});
  S.audioCtx = null;
  if (S.wakeLock) S.wakeLock.release().catch(() => {});

  // Files sent through the call stay in the conversation (and savable) until you reload.
  S.transfers.clear();
  S.outbox = [];
  S.inbox = null;
  S.deletedIds.clear();
  el.dropOverlay.hidden = true;
  S.pttHeld = false;
  if (el.settings.open) el.settings.close();
  el.toast.hidden = true;
  S.callWith = '';
  S.callAnswer = null;
  S.peerMissing = false;
  clearTimeout(S.holdTimer);
  updateRingback();
  el.stage.classList.remove('self-big');
  renderCallPlacement();
  renderSelf();
  renderRejoin();
  renderFriends();
  updateTitle();
}

// ---------------- Wire up ----------------

async function init() {
  window.rainlitRunning = true; // (for boot.js: this started, so a wait for the server is just that)
  // ----- Signing in -----
  el.signinTab.addEventListener('click', () => showAuth('signin'));
  el.signupTab.addEventListener('click', () => showAuth('signup'));
  el.signinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth(el.signinForm, () => api('POST', '/login', { login: el.signinLogin.value, password: el.signinPassword.value }));
  });
  el.signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth(el.signupForm, () => api('POST', '/signup', {
      code: el.signupCode.value, email: el.signupEmail.value, username: el.signupUsername.value,
      displayName: el.signupName.value, password: el.signupPassword.value,
    }));
  });
  el.resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth(el.resetForm, () => api('POST', '/reset', { token: S.resetToken, password: el.resetPassword.value }));
  });

  // ----- Friends, profiles, admin -----
  el.addFriendForm.addEventListener('submit', onAddFriend);
  el.meBtn.addEventListener('click', openProfile);
  el.adminBtn.addEventListener('click', openAdmin);
  el.inviteBtn.addEventListener('click', onMakeInvite);
  el.mpMessage.addEventListener('click', () => {
    el.miniProfile.close();
    openDm(miniProfileId);
  });
  el.mpCall.addEventListener('click', () => {
    el.miniProfile.close();
    if (S.inCall && S.callWith === miniProfileId) openDm(miniProfileId);
    else startCall(miniProfileId);
  });
  el.mpAdd.addEventListener('click', onProfileAddFriend);
  el.mpBlock.addEventListener('click', onProfileBlock);
  el.mpReport.addEventListener('click', () => {
    const p = profileOf(miniProfileId);
    if (!p) return;
    const spaceId = currentSpaceId();
    el.miniProfile.close();
    openReportDialog({ userId: p.id, name: p.displayName, spaceId }); // (the server checks you're both in it)
  });
  el.reportForm.addEventListener('submit', onReportSend);
  el.reportForm.addEventListener('change', () => {
    const reason = el.reportForm.querySelector('input[name="report-reason"]:checked');
    el.reportDanger.hidden = !reason || reason.value !== 'danger';
    if (reason) el.reportError.hidden = true;
  });
  el.msgReport.addEventListener('click', () => {
    const li = msgMenuLi;
    closeMessageMenu();
    if (li) openReportDialog({ messageId: li.dataset.id, channelId: li.dataset.channel || null, userId: li.dataset.author, name: friendName(li.dataset.author) });
  });
  el.mpEdit.addEventListener('click', () => {
    el.miniProfile.close();
    openProfile();
  });

  // ----- A friend's menu -----
  el.menuMessage.addEventListener('click', menuAction(openDm));
  el.menuCall.addEventListener('click', menuAction((id) => (S.inCall && S.callWith === id ? openDm(id) : startCall(id))));
  el.menuProfile.addEventListener('click', menuAction(openMiniProfile));
  el.menuBlock.addEventListener('click', menuAction((id) => {
    const f = S.friends.get(id);
    if (f && confirm(`Block ${f.displayName}? You won't be friends any more, they can't message you or ask to be friends, and their messages in spaces fold away.`)) setBlocked(id, true, f.displayName);
  }));
  el.menuRemove.addEventListener('click', onMenuRemove);
  // ----- The message menu -----
  el.msgReply.addEventListener('click', () => startReply(msgMenuLi));
  // Spaces.
  el.railHome.addEventListener('click', showHome);
  el.railAdd.addEventListener('click', openSpaceNew);
  el.spaceHead.addEventListener('click', openSpaceMenu);
  el.smInvite.addEventListener('click', openInvite);
  el.smMembers.addEventListener('click', openMembers);
  el.smSettings.addEventListener('click', openSpaceSettings);
  el.smNotify.addEventListener('click', onSpaceNotify);
  el.membersToggle.addEventListener('click', () => {
    S.showMembers = !S.showMembers;
    store.set('showMembers', S.showMembers ? 'on' : 'off');
    renderMemberPanel();
  });
  addEventListener('resize', () => { if (widePanel.matches !== panelWide) renderMemberPanel(); });
  el.addVoiceBtn.addEventListener('click', () => startNewChannel('voice'));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-voice]');
    if (b) onVoiceControl(b.dataset.voice);
  });
  el.voicePanelWhere.addEventListener('click', showVoiceView);
  el.voiceBack.addEventListener('click', hideVoiceView);
  el.smLeave.addEventListener('click', onSpaceLeave);
  el.addChannelBtn.addEventListener('click', () => startNewChannel('text'));
  el.spaceCreateForm.addEventListener('submit', onSpaceCreate);
  el.spaceJoinForm.addEventListener('submit', onSpaceJoinCode);
  el.spaceImportForm.addEventListener('submit', onSpaceImport);
  el.spaceImportLink.addEventListener('input', () => {
    if (discordTemplateCode(el.spaceImportLink.value) !== discordImport.code) resetDiscordImport();
  });
  el.spaceInviteCopy.addEventListener('click', copySpaceInvite);
  el.spaceJoinBtn.addEventListener('click', onJoinSpace);
  el.spaceRenameForm.addEventListener('submit', onSpaceRename);
  el.modForm.addEventListener('submit', onModConfirm);
  el.spaceTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    el.spaceSettings.dataset.tab = tab.dataset.tab;
    el.spaceSettings.dataset.role = '';
    el.spaceSettings.dataset.channel = '';
    showSettingsError('');
    renderSpaceSettings();
  });
  el.spaceDeleteBtn.addEventListener('click', onSpaceDelete);
  document.addEventListener('click', (e) => {
    if (!el.spaceMenu.hidden && !el.spaceMenu.contains(e.target) && !el.spaceHead.contains(e.target)) closeSpaceMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSpaceMenu(); });
  el.msgEdit.addEventListener('click', () => startEdit(msgMenuLi));
  el.replyCancel.addEventListener('click', () => { stopReply(); el.chatInput.focus(); });
  el.msgCopy.addEventListener('click', onMessageMenuCopy);
  el.msgSave.addEventListener('click', onMessageMenuSave);
  el.msgOpen.addEventListener('click', onMessageMenuOpen);
  el.routeBtn.addEventListener('click', nextRoute);
  if (ANDROID) {
    ANDROID.addListener('audioroutes', (r) => {
      if (!S.inCall) return;
      trace('audio-out', { out: r && r.current });
      renderRoute(r);
    });
  }
  if (ANDROID) {
    ANDROID.addListener('phonecall', (d) => {
      trace('phone-call', { on: Boolean(d && d.on) });
      setOnPhone(Boolean(d && d.on));
    });
  }
  // In the Android app, Save buttons (links to files) save to Downloads.
  document.addEventListener('click', (e) => {
    const a = ANDROID && e.target.closest && e.target.closest('a[download]');
    if (!a || !a.getAttribute('href')) return;
    e.preventDefault();
    const li = a.closest('li');
    saveUrl(a.getAttribute('href'), a.download || 'file', (li && li.dataset.type) || '');
  }, true);
  el.msgDelete.addEventListener('click', onMessageMenuDelete);
  el.editCancel.addEventListener('click', () => { stopEdit(); el.chatInput.focus(); });
  if (newLineOnEnter()) el.editHint.textContent = 'Editing your message. Send saves it.';
  // Sending leaves you in the message box (on a phone, the keyboard stays up).
  el.chatForm.querySelector('.send-btn').addEventListener('mousedown', (e) => {
    if (document.activeElement === el.chatInput) e.preventDefault();
  });
  el.chatInput.addEventListener('input', onTypingInput);
  el.chatInput.addEventListener('input', onMentionInput);
  el.chatInput.addEventListener('keydown', onMentionKey);
  el.chatInput.addEventListener('blur', () => setTimeout(closeMentionPick, 150));
  el.chatInput.addEventListener('input', fitChatInput);
  el.chatInput.addEventListener('keydown', (e) => {
    // (Ctrl+Enter sends everywhere, for a phone with a keyboard. Not while an accent or a
    // character is still being put together.)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && (!newLineOnEnter() || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      el.chatForm.requestSubmit();
      return;
    }
    if (e.key === 'Escape' && S.editing) {
      e.preventDefault();
      stopEdit();
    } else if (e.key === 'Escape' && S.replying) {
      e.preventDefault();
      stopReply();
    } else if (e.key === 'ArrowUp' && !S.editing && !el.chatInput.value) {
      const li = lastEditable();
      if (li) {
        e.preventDefault();
        startEdit(li);
      }
    }
  });
  // Right-click a message on a computer; hold one down on a phone.
  let press = null;
  el.dm.addEventListener('pointerdown', (e) => {
    const li = e.pointerType === 'touch' && e.target.closest('.chat-log > li');
    if (!li || e.target.closest('a, button, video, audio, input')) return;
    press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => {
      press.fired = true;
      if (navigator.vibrate) navigator.vibrate(10);
      openMessageMenu(li, press.x, press.y);
    }, 450) };
  });
  const endPress = () => { if (press) clearTimeout(press.timer); };
  el.dm.addEventListener('pointerup', endPress);
  el.dm.addEventListener('pointercancel', endPress);
  el.dm.addEventListener('pointermove', (e) => {
    if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) endPress();
  });
  el.dm.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('.chat-log > li');
    if (!li || (!messageActions(li).length && !canReact(li))) return;
    if (e.target.closest('a') && !press) return; // a link's own menu (copy the address, and so on)
    e.preventDefault();
    if (!press) return openMessageMenu(li, e.clientX, e.clientY);
    // A phone's own long-press event, maybe before ours: open it now (once).
    if (!press.fired) {
      clearTimeout(press.timer);
      press.fired = true;
      openMessageMenu(li, press.x, press.y);
    }
  });
  el.dm.addEventListener('click', (e) => {
    // The tap that ends a long press shouldn't also click what's under it.
    if (press && press.fired) { e.preventDefault(); e.stopPropagation(); }
    press = null;
  }, true);
  document.addEventListener('pointerdown', (e) => { if (!el.msgMenu.contains(e.target) && !e.target.closest('.msg-tools')) closeMessageMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMessageMenu(); });
  window.addEventListener('blur', closeMessageMenu);
  window.addEventListener('resize', closeMessageMenu);
  el.dm.addEventListener('scroll', closeMessageMenu, true);

  // It closes when you click anywhere else, press Esc, or the page moves under it.
  document.addEventListener('pointerdown', (e) => { if (!el.menu.contains(e.target)) closeFriendMenu(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFriendMenu(); });
  window.addEventListener('blur', closeFriendMenu);
  window.addEventListener('resize', closeFriendMenu);
  document.querySelector('.side-scroll').addEventListener('scroll', closeFriendMenu);

  // ----- GIFs -----
  el.gifBtn.addEventListener('click', () => (el.gifPanel.hidden ? openGifPanel() : closeGifPanel()));
  el.gifSearch.addEventListener('input', () => {
    clearTimeout(gifs.timer);
    gifs.timer = setTimeout(() => loadGifs(el.gifSearch.value.trim(), true), 400); // wait until you pause typing
  });
  el.gifGrid.addEventListener('scroll', () => {
    const g = el.gifGrid;
    if (g.scrollHeight - g.scrollTop - g.clientHeight < 200) loadGifs(gifs.q, false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.gifPanel.hidden && !el.gifPanel.contains(e.target) && e.target !== el.gifBtn) closeGifPanel();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGifPanel(); });

  // ----- Conversations -----
  el.dmBack.addEventListener('click', closeDm);
  el.dmClose.addEventListener('click', closeDm);
  el.dmWho.addEventListener('click', () => {
    const group = isChannelKey(S.openDm) && groupOfChannel(channelIdOf(S.openDm));
    if (group) openGroupInfo(group.id);
    else if (isChannelKey(S.openDm)) openMembers();
    else openMiniProfile(S.openDm);
  });
  el.dmSave.addEventListener('click', onSaveToggle);
  el.dmCallBtn.addEventListener('click', () => {
    const group = isChannelKey(S.openDm) && groupOfChannel(channelIdOf(S.openDm));
    if (group) joinGroupCall(group.id);
    else startCall(S.openDm);
  });
  el.newGroupBtn.addEventListener('click', () => openGroupPick('new'));
  el.groupPickForm.addEventListener('submit', onGroupPickSubmit);
  el.groupRenameForm.addEventListener('submit', onGroupRename);
  el.groupNotify.addEventListener('change', onGroupNotify);
  el.groupAddBtn.addEventListener('click', () => {
    const spaceId = el.groupInfo.dataset.space;
    el.groupInfo.close();
    openGroupPick('add', spaceId);
  });
  el.groupLeaveBtn.addEventListener('click', onGroupLeave);
  el.callElsewhereBtn.addEventListener('click', () => openDm(S.callWith));
  el.mpRemove.addEventListener('click', onRemoveFriend);
  el.profileForm.addEventListener('submit', onProfileSave);
  el.profileStatus.addEventListener('input', updateStatusCount);
  el.avatarBtn.addEventListener('click', () => el.avatarInput.click());
  el.avatarInput.addEventListener('change', onAvatarPicked);
  el.avatarRemoveBtn.addEventListener('click', onAvatarRemove);
  el.pwBtn.addEventListener('click', onPasswordChange);
  el.signoutBtn.addEventListener('click', onSignOut);
  // Dialogs close with their X, or by clicking outside them.
  for (const d of [el.miniProfile, el.profile, el.admin, el.serverDialog, el.spaceNew, el.spaceInvite, el.spaceMembers, el.spaceSettings, el.spaceJoin, el.modDialog, el.reportDialog, el.groupPick, el.groupInfo]) {
    closeOnBackdrop(d, (e) => e.target.closest('[data-close]'));
  }

  // ----- Calls -----
  el.ringJoin.addEventListener('click', onRingJoin);
  el.ringDecline.addEventListener('click', onRingDecline);
  el.ringAgainBtn.addEventListener('click', ringAgain);
  el.rejoinBtn.addEventListener('click', () => {
    const a = readActiveCall();
    if (a) startCall(a.with);
  });
  el.clearHistoryBtn.addEventListener('click', () => { store.set('history', '[]'); renderHistory(); });

  // Sounds can only start after a click or key press, so get them ready on the first one.
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlockSounds, { once: true, capture: true });
  if (DESKTOP || ANDROID) unlockSounds(); // the apps are allowed to make sound straight away
  // Friends see you as away after a while without any activity here.
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(type, noteActivity, { passive: true });
  }
  setInterval(() => {
    if (S.me && !S.idle && !S.inCall && Date.now() - S.lastActive > IDLE_MS) setIdle(true);
  }, 30_000);

  el.micBtn.addEventListener('click', () => { if (!S.ptt) toggleMic(); });
  // In push to talk, hold the mic button to talk (handy on a phone).
  el.micBtn.addEventListener('pointerdown', (e) => {
    if (!S.ptt || e.button !== 0) return;
    el.micBtn.setPointerCapture(e.pointerId); // keeps talking if your finger slides a little
    setPttHeld(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.micBtn.addEventListener(type, () => setPttHeld(false));
  }
  el.micBtn.addEventListener('contextmenu', (e) => { if (S.ptt) e.preventDefault(); }); // long press on a phone
  el.camBtn.addEventListener('click', toggleCam);
  el.screenBtn.addEventListener('click', () => {
    if (!S.callSounds) playClick(); // (its own sound is a call sound; without those, the plain click)
    toggleScreen();
  });
  el.leaveBtn.addEventListener('click', onLeaveClick);
  el.fullscreenBtn.addEventListener('click', () => setStageFull(!stageFull()));
  el.flipBtn.addEventListener('click', flipCam);
  el.remoteVideo.addEventListener('dblclick', () => el.fullscreenBtn.click());
  // Click your own camera or screen to see it big; click it (or your friend) again to swap back.
  el.selfView.addEventListener('click', () => toggleSelfBig());
  el.remoteVideo.addEventListener('click', () => toggleSelfBig(false));
  el.peerCard.addEventListener('click', () => toggleSelfBig(false));

  el.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!S.openDm) return;
    if (S.editing) return saveEdit();
    const dm = dmFor(S.openDm);
    const text = el.chatInput.value.trim();
    if (!text && !dm.pending.length) return;
    if (dm.pending.length && !canSendFiles(dm)) {
      toast(`Saving is off here, so files can only go straight to ${friendName(dm.friendId)} during a call.`, 6000);
      return; // keep the files and the message, in case the call's about to start
    }
    const replyTo = replyingTo(dm.friendId);
    if (text) {
      sendText(dm.friendId, text, replyTo);
      setChatText('');
    }
    stopTyping();
    if (dm.pending.length) sendPending(dm, text ? null : replyTo); // (with no words, the first file answers it)
    stopReply();
  });

  el.lightboxClose.addEventListener('click', () => el.lightbox.close());
  // Clicking anywhere around the picture closes it, like Esc.
  closeOnBackdrop(el.lightbox);
  el.lightbox.addEventListener('close', () => {
    el.lightboxImg.removeAttribute('src');
    resetLbZoom();
  });
  el.lightboxImg.addEventListener('pointerdown', onLbDown);
  el.lightboxImg.addEventListener('pointermove', onLbMove);
  for (const type of ['pointerup', 'pointercancel']) el.lightboxImg.addEventListener(type, onLbUp);
  el.lightboxImg.addEventListener('wheel', onLbWheel, { passive: false });
  el.lightboxImg.addEventListener('dragstart', (e) => e.preventDefault()); // (a drag moves it, not the file)
  // (A tap that closed it doesn't also press whatever was underneath: on a phone, its click
  // comes just after the picture has gone.)
  el.lightboxImg.addEventListener('touchend', (e) => { if (!el.lightbox.open) e.preventDefault(); });

  el.attachBtn.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    addPending(el.fileInput.files);
    el.fileInput.value = '';
  });
  // Pasting a screenshot into the chat box attaches it, ready to send. (Text copied from apps like Word
  // can carry a picture of itself too, so anything with text pastes as text.)
  el.chatInput.addEventListener('paste', (e) => {
    const data = e.clipboardData;
    if (data && data.files.length && !data.types.includes('text/plain')) {
      e.preventDefault();
      addPending(data.files);
    }
  });
  // Drop files anywhere on a conversation to attach them.
  let dragDepth = 0;
  const hasFiles = (e) => Boolean(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files'));
  el.dm.addEventListener('dragenter', (e) => {
    if (!hasFiles(e) || dragDepth++) return;
    const who = isChannelKey(S.openDm) ? `#${(S.channels.get(channelIdOf(S.openDm)) || {}).name || 'this channel'}` : friendName(S.openDm);
    const c = isChannelKey(S.openDm) && S.channels.get(channelIdOf(S.openDm));
    const canSend = dmFor(S.openDm).save || (S.inCall && S.callWith === S.openDm && S.peer);
    el.dropText.textContent = c && c.can && !c.can.files ? `You can't send files in ${who}`
      : canSend ? `Drop to attach for ${who}` : `Saving is off, so files can only go to ${who} during a call`;
    el.dropOverlay.hidden = false;
  });
  el.dm.addEventListener('dragleave', (e) => {
    if (hasFiles(e) && dragDepth && --dragDepth === 0) el.dropOverlay.hidden = true;
  });
  el.dm.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  el.dm.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); // otherwise the browser opens the file in place of the call
    dragDepth = 0;
    el.dropOverlay.hidden = true;
    addPending(e.dataTransfer.files);
  });

  for (const btn of [el.settingsBtn, el.appSettingsBtn]) {
    btn.addEventListener('click', async () => {
      await fillDeviceLists();
      el.settings.showModal();
    });
  }
  el.micSelect.addEventListener('change', onMicChange);
  for (const input of [el.noiseInput, el.echoInput, el.gainInput]) input.addEventListener('change', onMicFxChange);
  el.camSelect.addEventListener('change', onCamChange);
  el.speakerSelect.addEventListener('change', onSpeakerChange);
  el.volumeInput.addEventListener('input', onVolumeChange);
  el.shareQuality.addEventListener('change', onShareQualityChange);
  el.streamMute.addEventListener('click', () => {
    S.streamMuted = !S.streamMuted;
    store.set('streamMuted', S.streamMuted ? 'yes' : 'no');
    applyVolume();
    renderStreamAudio();
  });
  el.streamVolume.addEventListener('input', () => {
    S.streamVolume = Number(el.streamVolume.value) / 100;
    store.set('streamVolume', el.streamVolume.value);
    if (S.streamMuted) {
      S.streamMuted = false; // moving the slider turns the sound back on
      store.set('streamMuted', 'no');
    }
    applyVolume();
    renderStreamAudio();
  });
  el.pttInput.addEventListener('change', () => {
    setPtt(el.pttInput.checked);
    el.pttDetails.hidden = !S.ptt;
  });
  // Pick a talk key: click the key button, then press the key you want (Esc keeps the old one).
  let pickingKey = false;
  const stopPickingKey = () => {
    pickingKey = false;
    el.pttKeyBtn.classList.remove('listening');
    el.pttKeyBtn.textContent = S.pttKeyName;
  };
  el.pttKeyBtn.addEventListener('click', () => {
    pickingKey = true;
    el.pttKeyBtn.classList.add('listening');
    el.pttKeyBtn.textContent = 'Press a key';
  });
  document.addEventListener('keydown', (e) => {
    if (!pickingKey) return;
    // Nothing else gets this key press: not the dialog (Esc would close it), not push to talk.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key !== 'Escape') {
      S.pttKey = e.code;
      S.pttKeyName = keyName(e);
      store.set('pttKey', S.pttKey);
      store.set('pttKeyName', S.pttKeyName);
      syncDesktopPtt();
      renderPttHint();
      renderControls();
    }
    stopPickingKey();
  }, true);
  el.settings.addEventListener('close', () => { if (pickingKey) stopPickingKey(); });

  el.rainInput.addEventListener('change', () => {
    S.rain = el.rainInput.checked;
    store.set('rain', S.rain ? 'on' : 'off');
    updateRain();
  });
  el.uiScale.addEventListener('change', () => setUiScale(Number(el.uiScale.value) || 1));
  el.traceInput.addEventListener('change', () => {
    S.trace = el.traceInput.checked;
    store.set('callTrace', S.trace ? 'on' : 'off');
    if (!S.trace) {
      stopTraceWatch();
      traceQueue.length = 0;
      saveTrace(true);
    } else if (S.inCall) {
      wsSend({ type: 'trace', on: true });
      trace('log-on');
      startTraceWatch();
    }
  });
  el.statsInput.addEventListener('change', () => {
    S.showStats = el.statsInput.checked;
    store.set('streamStats', S.showStats ? 'on' : 'off');
    if (!S.showStats) el.streamStats.hidden = true;
  });
  el.duckInput.addEventListener('change', () => {
    store.set('duck', el.duckInput.checked ? 'on' : 'off');
    if (ANDROID && S.inCall) ANDROID.setDucking({ on: el.duckInput.checked }).then(renderDuckStatus).catch(() => {});
    else renderDuckStatus();
  });
  el.callSoundsInput.addEventListener('change', () => {
    S.callSounds = el.callSoundsInput.checked;
    store.set('callSounds', S.callSounds ? 'on' : 'off');
    playCallSound(true); // so you hear what you turned on
  });
  el.clicksInput.addEventListener('change', () => {
    S.clickSounds = el.clicksInput.checked;
    store.set('clickSounds', S.clickSounds ? 'on' : 'off');
    playClick(); // so you hear what you turned on (silent if you turned it off)
  });
  // Pressing anything clickable makes a soft click (if that's on in settings).
  document.addEventListener('click', (e) => {
    const target = e.target.closest && e.target.closest(CLICKABLE);
    if (target && !target.disabled && e.target !== el.clicksInput && !target.closest('[data-sound], [data-voice]:not([data-voice="hear"])')) playClick();
  }, true);
  el.soundsInput.addEventListener('change', () => {
    S.sounds = el.soundsInput.checked;
    store.set('sounds', S.sounds ? 'on' : 'off');
    if (S.sounds) playChime(); // so you know what it sounds like
  });

  // Ctrl+Shift+M toggles your microphone, like Discord.
  document.addEventListener('keydown', (e) => {
    if (S.inCall && !S.ptt && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      toggleMic();
    }
  });

  // Push to talk: hold the talk key.
  document.addEventListener('keydown', (e) => {
    if (!(S.inCall || S.voice) || !S.ptt || e.code !== S.pttKey || isTyping(e.target)) return;
    e.preventDefault(); // e.g. Space would otherwise press whichever button has focus
    setPttHeld(true); // key repeat while holding just finds it already held
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === S.pttKey) setPttHeld(false);
  });
  // If you switch windows while holding the key, the browser never sees you let go. Stop talking.
  window.addEventListener('blur', () => setPttHeld(false));

  // Push: when the phone's push app hands Rainlit a new address, send it to the server.
  if (ANDROID) ANDROID.addListener('push', () => syncAndroidPush());
  // The Android app going to the background and coming back.
  if (ANDROID) {
    ANDROID.addListener('visibility', (d) => {
      S.androidPaused = !(d && d.visible);
      trace(S.androidPaused ? 'app-hidden' : 'app-visible');
      sendBackground();
      if (!S.androidPaused) syncAndroidPush();
    });
  }
  // Back to the window (the desktop app, or from another app): catch up on what came in.
  window.addEventListener('focus', () => {
    if (!S.openDm) return;
    const dm = dmFor(S.openDm);
    if (dm.unread || (dm.divider && !dm.divider.seen)) markDmSeen(dm);
  });

  document.addEventListener('visibilitychange', () => {
    trace(document.hidden ? 'page-hidden' : 'page-visible');
    if (document.visibilityState !== 'visible') return setPttHeld(false);
    if (!S.me) checkForUpdateSignedOut();
    syncAndroidPush(); // maybe ntfy was just installed
    if (S.conn && S.conn.pc.connectionState === 'connected') requestWakeLock();
    // Back from another tab or app with the chat already open: you've seen what came in.
    if (S.openDm) {
      const dm = dmFor(S.openDm);
      if (dm.unread || (dm.divider && !dm.divider.seen)) markDmSeen(dm);
    }
  });
  // Closing the tab or losing signal counts as dropping out, not leaving: your spot stays saved.
  window.addEventListener('offline', () => {
    trace('offline');
    if (S.ws) socketLost(S.ws);
  });
  window.addEventListener('online', () => {
    trace('online');
    if (S.me && !S.ws) { S.wsRetry = 0; connectSocket(); }
  });
  // (For the call debug log.)
  document.addEventListener('freeze', () => trace('page-freeze'));
  document.addEventListener('resume', () => trace('page-resume'));
  window.addEventListener('pagehide', () => {
    trace('pagehide');
    sendTrace({ leaving: true });
  });
  if (navigator.connection) navigator.connection.addEventListener('change', () => trace('network', { net: netInfo() }));

  renderControls();
  updateRain();
  addEventListener('resize', () => { if (S.rainFrame) sizeRain(); });
  // The desktop app hears the talk key while you're in another app, and tells us.
  if (DESKTOP) DESKTOP.onPushToTalk((held) => { if (S.inCall || S.voice) setPttHeld(held); });
  renderAppNote();
  initServerSwitch();
  el.serverSwitchBtn.addEventListener('click', openServerDialog);
  el.serverChangeBtn.addEventListener('click', () => {
    if (el.settings.open) el.settings.close();
    openServerDialog();
  });
  el.serverForm.addEventListener('submit', onServerConnect);
  el.serverDefaultBtn.addEventListener('click', onServerDefault);
  el.getApps.hidden = Boolean(DESKTOP || ANDROID); // already in one
  setTimeout(checkAndroidApp, 3000); // (after signing in and settling)

  if ('serviceWorker' in navigator && location.origin === SERVER) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // A password reset link opens straight to "choose a new password".
  S.resetToken = new URLSearchParams(location.hash.slice(1)).get('reset') || '';
  if (S.resetToken) return showAuth('reset');

  // Just reloaded into a new version.
  try {
    if (sessionStorage.getItem('rainlit.updated')) {
      sessionStorage.removeItem('rainlit.updated');
      setTimeout(() => toast('Rainlit was updated.'), 1500);
    }
  } catch {}

  // Already signed in on this device? If the server's restarting (an update), wait for it
  // rather than showing the sign-in screen.
  // (If the answer's slow, say what's happening; one that never comes counts as no answer.)
  let user = null;
  const slow = setTimeout(() => { el.starting.hidden = false; }, 2500);
  for (let wait = 1500; ; wait = Math.min(wait * 1.5, 8000)) {
    try {
      ({ user } = await api('GET', '/me', undefined, { timeout: 8000 }));
      break;
    } catch (err) {
      if (err.status === 401) break;
      if (err.status && err.status < 500) {
        clearTimeout(slow);
        el.starting.hidden = true;
        showAuth('signin');
        return showAuthError(err.message);
      }
      el.starting.hidden = false;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  clearTimeout(slow);
  el.starting.hidden = true;
  if (user) return signedIn(user);
  try {
    S.setupNeeded = Boolean((await api('GET', '/config')).setupNeeded);
  } catch {}
  showAuth(S.setupNeeded ? 'signup' : 'signin');
}

init();
