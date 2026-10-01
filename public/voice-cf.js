'use strict';

// Voice channels through Cloudflare's SFU (lib/voice-cf.js on the server): a stand-in for the
// parts of LiveKit's Room that app.js uses (the people in the room, their tracks, and events),
// built on the browser's own WebRTC, so the same voice screens work with either.
//
// Two connections to Cloudflare, so offers never cross (as LiveKit does it): one only sends your
// mic (and camera, and screen), and this page makes its offers; the other only receives everyone
// else's, and Cloudflare makes its offers. Rainlit's server says who's in the channel and what
// each of them is sending (sync, from its "voice-state" messages; only once it's flowing, which
// this page tells it: announce), decides who may send and get what, and passes the offers and
// answers along. Changes go one at a time (queue). Everything
// sent is end-to-end encrypted with the channel's key (voice-e2ee.js). Others' video only comes
// while it's being looked at (the voice view, or popped out), and a little after (switching back
// quickly shouldn't start it all again): Cloudflare charges for what it sends.

(() => {
  const Source = { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio' };
  const SOURCE = { mic: Source.Microphone, cam: Source.Camera, screen: Source.ScreenShare, screenAudio: Source.ScreenShareAudio };
  const RoomEvent = {
    TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed', TrackMuted: 'trackMuted', TrackUnmuted: 'trackUnmuted',
    LocalTrackPublished: 'localTrackPublished', LocalTrackUnpublished: 'localTrackUnpublished',
    ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected',
    Reconnecting: 'reconnecting', Reconnected: 'reconnected', Disconnected: 'disconnected',
    AudioPlaybackStatusChanged: 'audioPlaybackChanged', ParticipantPermissionsChanged: 'participantPermissionsChanged',
    EncryptionError: 'encryptionError',
  };
  const DisconnectReason = { UNKNOWN: 0, DUPLICATE_IDENTITY: 1, PARTICIPANT_REMOVED: 2, ROOM_DELETED: 3 };

  // End-to-end encryption needs the browser to hand each frame over: RTCRtpScriptTransform
  // (Firefox, Safari, newer Chrome), or Chrome's createEncodedStreams.
  const scriptTransform = typeof RTCRtpScriptTransform !== 'undefined';
  const encodedStreams = !scriptTransform && typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype;
  const isE2EESupported = () => scriptTransform || encodedStreams;

  const fromBase64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  // Opus with DTX: next to nothing is sent while you're quiet, which in a voice channel is most
  // of the time.
  function withDtx(sdp) {
    const m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp || '');
    if (!m) return sdp;
    const re = new RegExp(`a=fmtp:${m[1]} ([^\\r\\n]*)`);
    return sdp.replace(re, (line, params) => (/usedtx=/.test(params) ? line : `a=fmtp:${m[1]} ${params};usedtx=1`));
  }

  // A screen's sound goes in stereo, at music's quality: up to 128 kb/s. (Sent like a voice, it's
  // mono and thinner, which makes a game's sound quieter too.) Opus does that when the receiving
  // end's description asks for it: each of their lines (by mid), said so, sending and receiving.
  function withStereo(sdp, mids) {
    if (!sdp || !mids.length) return sdp;
    return sdp.split(/(?=\r\nm=)/).map((part) => {
      const mid = /\r\na=mid:([^\r\n]+)/.exec(part);
      if (!mid || !mids.includes(mid[1]) || !/\bm=audio /.test(part)) return part;
      const opus = /a=rtpmap:(\d+) opus\/48000/i.exec(part);
      if (!opus) return part;
      return part.replace(new RegExp(`a=fmtp:${opus[1]} ([^\\r\\n]*)`), (line, params) => {
        const keep = params.split(';').map((p) => p.trim()).filter((p) => p && !/^(stereo|sprop-stereo|maxaveragebitrate|usedtx)=/.test(p));
        return `a=fmtp:${opus[1]} ${[...keep, 'stereo=1', 'sprop-stereo=1', 'maxaveragebitrate=128000'].join(';')}`;
      });
    }).join('');
  }

  // Video goes as VP8 (the encryption leaves its first few bytes readable, which is VP8's layout).
  function preferVp8(transceiver) {
    try {
      const codecs = RTCRtpReceiver.getCapabilities('video').codecs;
      const vp8 = codecs.filter((c) => /\/vp8$/i.test(c.mimeType));
      const extras = codecs.filter((c) => /\/(rtx|red|ulpfec)$/i.test(c.mimeType));
      if (vp8.length) transceiver.setCodecPreferences([...vp8, ...extras]);
    } catch {}
  }

  let sids = 0;

  class Track {
    constructor(room, mediaStreamTrack, source) {
      this.room = room;
      this.mediaStreamTrack = mediaStreamTrack;
      this.kind = mediaStreamTrack.kind;
      this.source = source;
      this.sid = `cf${++sids}`;
      this.elements = [];
      this.sender = null;
    }

    attach() {
      const el = document.createElement(this.kind === 'audio' ? 'audio' : 'video');
      el.autoplay = true;
      el.playsInline = true;
      el.srcObject = new MediaStream([this.mediaStreamTrack]);
      this.elements.push(el);
      if (this.kind === 'audio') this.room.playAudio(el);
      else el.play().catch(() => {});
      return el;
    }

    detach() {
      const els = this.elements;
      this.elements = [];
      for (const el of els) el.srcObject = null;
      return els;
    }

    // Another camera (front or back, on a phone): swapped in, without renegotiating.
    async restartTrack(constraints = {}) {
      if (!this.sender) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { ...this.room.camConstraints, ...constraints } });
      const next = stream.getVideoTracks()[0];
      await this.sender.replaceTrack(next);
      this.mediaStreamTrack.stop();
      this.mediaStreamTrack = next;
      for (const el of this.elements) el.srcObject = new MediaStream([next]);
    }
  }

  class Publication {
    constructor(source, track) {
      this.source = source;
      this.track = track;
      this.isMuted = false;
    }
  }

  class Participant {
    constructor(identity) {
      this.identity = identity;
      this.name = '';
      this.pubs = new Map(); // source -> Publication
      this.muted = false;
    }

    getTrackPublication(source) {
      return this.pubs.get(source);
    }
  }

  class LocalParticipant extends Participant {
    constructor(room, identity, speak) {
      super(identity);
      this.room = room;
      this.permissions = { canPublish: speak };
    }

    get isMicrophoneEnabled() {
      const p = this.pubs.get(Source.Microphone);
      return Boolean(p && !p.isMuted);
    }

    get isCameraEnabled() {
      return this.pubs.has(Source.Camera);
    }

    get isScreenShareEnabled() {
      return this.pubs.has(Source.ScreenShare);
    }

    setMicrophoneEnabled(on, options) {
      return this.room.setMic(on, options);
    }

    setCameraEnabled(on, options) {
      return this.room.setCamera(on, options);
    }

    setScreenShareEnabled(on, options) {
      return this.room.setScreen(on, options);
    }
  }

  const cantTalk = () => Object.assign(new Error("You can't talk here right now."), { name: 'NotAllowedError' });

  class Room {
    // options: { audioCaptureDefaults, audioOutput: { deviceId } }, like LiveKit's.
    constructor(options = {}) {
      this.options = options;
      this.handlers = new Map();
      this.remoteParticipants = new Map();
      this.localParticipant = null;
      this.canPlaybackAudio = true;
      this.sinkId = (options.audioOutput && options.audioOutput.deviceId) || '';
      this.chain = Promise.resolve();
      this.local = new Map(); // kind -> RTCRtpTransceiver (sending)
      this.names = {}; // kind -> its track name at Cloudflare (from the server)
      this.pulled = new Map(); // "user:kind" -> { key, user, kind, trackName, state, mid, track, pub }
      this.byMid = new Map(); // mid (receiving) -> the same
      this.dead = 0; // receiving slots closed (they can't be used again)
      this.protectedEnds = new WeakSet();
      this.seen = new Set(); // (who's been in Rainlit's list since reconnecting to it)
      this.videoUntil = 0;
      this.retry = new Map(); // "user:kind" -> { at, name, n }: when to try getting it (that track) again
      this.members = [];
      this.wantVideo = false;
      this.closed = false;
      this.reconnecting = false;
      this.camConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
    }

    on(event, fn) {
      if (!this.handlers.has(event)) this.handlers.set(event, []);
      this.handlers.get(event).push(fn);
      return this;
    }

    emit(event, ...args) {
      for (const fn of this.handlers.get(event) || []) {
        try {
          fn(...args);
        } catch (err) {
          console.error(err);
        }
      }
    }

    // One change at a time (an offer and its answer before the next).
    queue(job) {
      const run = this.chain.then(() => (this.closed ? null : job()));
      this.chain = run.catch((err) => console.warn('[voice]', err && err.message ? err.message : err));
      return run;
    }

    // pass: Rainlit's (key, speak, iceServers, limits). api: app.js's, for Rainlit's routes.
    async connect({ channelId, pass, api, me, tab }) {
      Object.assign(this, { channelId, pass, api, tab });
      this.limits = pass.limits || {};
      this.localParticipant = new LocalParticipant(this, me, Boolean(pass.speak));
      this.worker = new Worker('/voice-e2ee.js');
      this.worker.onmessage = (e) => {
        if (e.data && e.data.type === 'error') this.emit(RoomEvent.EncryptionError, new Error("A frame couldn't be decrypted."));
      };
      this.worker.postMessage({ type: 'key', key: fromBase64url(pass.key) });
      await this.open();
    }

    newPc(receiving = false) {
      const pc = new RTCPeerConnection({ iceServers: this.pass.iceServers || [], bundlePolicy: 'max-bundle', ...(encodedStreams ? { encodedInsertableStreams: true } : {}) });
      if (receiving) pc.ontrack = (e) => this.onTrack(e);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected' && !pc.connectedAt) pc.connectedAt = Date.now();
        this.onConnectionState(pc);
      };
      return pc;
    }

    closePc(pc) {
      if (!pc) return;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch {}
    }

    async open() {
      this.pubPc = this.newPc();
      this.subPc = this.newPc(true);
      const { session, sub } = await this.api('POST', `/channels/${this.channelId}/voice/session`, { tab: this.tab });
      this.session = session;
      this.subSession = sub;
      this.names = {};
    }

    // Each frame, encrypted on its way out and decrypted on its way in (voice-e2ee.js). (Once
    // for each sender or receiver.)
    protect(end, kind, operation) {
      if (this.protectedEnds.has(end)) return;
      this.protectedEnds.add(end);
      if (scriptTransform) {
        end.transform = new RTCRtpScriptTransform(this.worker, { operation, kind });
      } else if (encodedStreams) {
        const { readable, writable } = end.createEncodedStreams();
        this.worker.postMessage({ type: 'streams', readable, writable, operation, kind }, [readable, writable]);
      }
    }

    // ---------- Sending ----------

    // (Sharper, for people supporting Rainlit, while the server says so: twice the frames. Not
    // with the data saver.)
    encodingFor(kind, smooth) {
      if (kind === 'cam') return { maxBitrate: (this.limits.camKbps || 800) * 1000, maxFramerate: 30 };
      const sharp = Boolean(this.limits.sharp) && !this.screenSaver;
      return { maxBitrate: (this.limits.screenKbps || 1500) * 1000, maxFramerate: (smooth ? 30 : 15) * (sharp ? 2 : 1) };
    }

    // New limits from the server, mid-call (sharper streams stopping for the month, say): what's
    // being sent now follows them.
    async setLimits(limits) {
      this.limits = limits || {};
      for (const kind of ['cam', 'screen']) {
        const tr = this.local.get(kind);
        if (!tr || !tr.sender) continue;
        const params = tr.sender.getParameters();
        if (!params.encodings || !params.encodings.length) continue;
        Object.assign(params.encodings[0], this.encodingFor(kind, kind === 'screen' && Boolean(this.screenSmooth)));
        await tr.sender.setParameters(params).catch(() => {});
      }
    }

    // Starts sending tracks ([{ kind, mst, smooth }]): one negotiation for them all. (With the
    // sending connection closed, for having had nothing on it, a fresh one first.)
    async publishNow(list) {
      if (!this.pubPc) {
        const { session } = await this.api('POST', `/channels/${this.channelId}/voice/repub`, {});
        this.session = session;
        this.pubPc = this.newPc();
      }
      const pc = this.pubPc;
      const added = [];
      for (const { kind, mst, smooth } of list) {
        const video = mst.kind === 'video';
        const tr = pc.addTransceiver(mst, { direction: 'sendonly', ...(video ? { sendEncodings: [this.encodingFor(kind, smooth)] } : {}) });
        if (video) preferVp8(tr);
        this.protect(tr.sender, mst.kind, 'encrypt');
        added.push({ kind, tr, mst });
      }
      const offer = await pc.createOffer();
      // (Which line a screen's sound is on: the one with its track's id.)
      const midOf = (mst) => (/\r\na=mid:([^\r\n]+)/.exec(offer.sdp.split(/(?=\r\nm=)/).find((part) => part.includes(` ${mst.id}\r\n`)) || '') || [])[1];
      const stereo = added.filter(({ kind }) => kind === 'screenAudio').map(({ mst }) => midOf(mst)).filter(Boolean);
      await pc.setLocalDescription({ type: 'offer', sdp: withStereo(withDtx(offer.sdp), stereo) });
      let r;
      try {
        r = await this.api('POST', `/channels/${this.channelId}/voice/publish`, { sdp: pc.localDescription.sdp, tracks: added.map(({ kind, tr }) => ({ kind, mid: tr.mid })) });
      } catch (err) {
        await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
        for (const { tr } of added) {
          try { tr.stop(); } catch {}
        }
        throw err;
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: withStereo(withDtx(r.sdp), stereo) });
      for (const { kind, tr } of added) this.local.set(kind, tr);
      Object.assign(this.names, r.tracks || {});
      this.watch(pc);
      this.announce(pc, added.map(({ kind, tr }) => ({ kind, tr, name: this.names[kind] })));
    }

    // Once the sending connection's up and they're flowing, they're listed for the others. (Asked
    // for any sooner, Cloudflare can lose them for good.) Not flowing after 15 seconds: listed
    // anyway (a stuck connection's dealt with by watch).
    async announce(pc, list) {
      const flowing = async () => {
        if (pc.connectionState !== 'connected') return false;
        for (const { tr } of list) {
          let sent = 0;
          try {
            (await tr.sender.getStats()).forEach((x) => { if (x.type === 'outbound-rtp') sent += x.packetsSent || 0; });
          } catch {}
          if (!sent) return false;
        }
        return true;
      };
      for (let i = 0; i < 150 && !(await flowing()); i++) {
        if (this.closed || this.pubPc !== pc) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 250));
      // (Tried again if it doesn't get through. After the server's restarted, it's checked with
      // Cloudflare anyway: voice-join.)
      for (let attempt = 0; attempt < 4; attempt++) {
        if (this.closed || this.pubPc !== pc) return;
        const tracks = {};
        for (const { kind, name } of list) if (name && this.names[kind] === name) tracks[kind] = name;
        if (!Object.keys(tracks).length) return;
        try {
          await this.api('POST', `/channels/${this.channelId}/voice/ready`, { tracks });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    // A connection still not up 10 seconds after it was set going (it happens: stuck connecting,
    // saying nothing) is given up on, as if it had failed.
    watch(pc) {
      if (pc.watching || pc.connectionState === 'connected') return;
      pc.watching = setTimeout(() => {
        if (this.closed || (pc !== this.pubPc && pc !== this.subPc) || pc.connectionState === 'connected') return;
        this.lost();
        this.rejoin();
      }, 10_000);
    }

    // Stops sending some (a camera off, a screen share stopped), and lets Cloudflare know.
    async unpublishNow(kinds) {
      const have = kinds.filter((k) => this.local.has(k));
      if (!have.length) return;
      for (const k of have) {
        const tr = this.local.get(k);
        try {
          if (tr.sender.track) tr.sender.track.stop();
          tr.stop();
        } catch {}
        this.local.delete(k);
        delete this.names[k];
      }
      // (Nothing left being sent: there's no offer to make, so the server stops them, and the
      // sending connection closes. Something sent later starts a fresh one.)
      if (!this.local.size) {
        await this.api('POST', `/channels/${this.channelId}/voice/unpublish`, { kinds: have }).catch(() => {});
        this.closePc(this.pubPc);
        this.pubPc = null;
        return;
      }
      const offer = await this.pubPc.createOffer();
      await this.pubPc.setLocalDescription(offer);
      const r = await this.api('POST', `/channels/${this.channelId}/voice/unpublish`, { sdp: this.pubPc.localDescription.sdp, kinds: have }).catch(() => ({}));
      if (r.sdp) await this.pubPc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
      else await this.pubPc.setLocalDescription({ type: 'rollback' }).catch(() => {});
    }

    addLocal(kind, mst) {
      const lp = this.localParticipant;
      const track = new Track(this, mst, SOURCE[kind]);
      track.sender = this.local.get(kind) ? this.local.get(kind).sender : null;
      const pub = new Publication(SOURCE[kind], track);
      lp.pubs.set(SOURCE[kind], pub);
      this.emit(RoomEvent.LocalTrackPublished, pub, lp);
      return pub;
    }

    dropLocal(kinds) {
      const lp = this.localParticipant;
      for (const k of kinds) {
        const pub = lp.pubs.get(SOURCE[k]);
        if (!pub) continue;
        lp.pubs.delete(SOURCE[k]);
        try { pub.track.mediaStreamTrack.stop(); } catch {}
        this.emit(RoomEvent.LocalTrackUnpublished, pub, lp);
      }
    }

    // (One change to the mic at a time: turning it on while it's still starting waits for that.)
    async setMic(on, options) {
      if (this.micBusy) await this.micBusy.catch(() => {});
      const run = this.setMicNow(on, options);
      this.micBusy = run;
      try {
        return await run;
      } finally {
        if (this.micBusy === run) this.micBusy = null;
      }
    }

    // Muted: the mic stays on its way out, but silent (so it's not dropped as gone quiet, and
    // costs next to nothing, with DTX). A new mic, or new effects: swapped in.
    async setMicNow(on, options) {
      const lp = this.localParticipant;
      const pub = lp.pubs.get(Source.Microphone);
      if (!on) {
        if (pub && !pub.isMuted) {
          pub.isMuted = true;
          pub.track.mediaStreamTrack.enabled = false;
          this.emit(RoomEvent.TrackMuted, pub, lp);
        }
        return;
      }
      if (!lp.permissions.canPublish) throw cantTalk();
      if (pub && !options) {
        pub.isMuted = false;
        pub.track.mediaStreamTrack.enabled = true;
        this.emit(RoomEvent.TrackUnmuted, pub, lp);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(this.options.audioCaptureDefaults || {}), ...(options || {}) } });
      const mst = stream.getAudioTracks()[0];
      if (pub && this.local.get('mic')) {
        await this.local.get('mic').sender.replaceTrack(mst);
        pub.track.mediaStreamTrack.stop();
        pub.track.mediaStreamTrack = mst;
        pub.isMuted = false;
        this.emit(RoomEvent.TrackUnmuted, pub, lp);
        return;
      }
      try {
        await this.queue(() => this.publishNow([{ kind: 'mic', mst }]));
      } catch (err) {
        mst.stop();
        throw err;
      }
      if (!this.local.get('mic')) {
        mst.stop();
        throw new Error("Your mic couldn't be connected. Try again.");
      }
      this.addLocal('mic', mst);
    }

    async setCamera(on, options) {
      const lp = this.localParticipant;
      if (!on) {
        await this.queue(() => this.unpublishNow(['cam']));
        return this.dropLocal(['cam']);
      }
      if (lp.pubs.has(Source.Camera)) return;
      if (!lp.permissions.canPublish) throw cantTalk();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { ...this.camConstraints, ...(options || {}) } });
      const mst = stream.getVideoTracks()[0];
      try {
        await this.queue(() => this.publishNow([{ kind: 'cam', mst }]));
      } catch (err) {
        mst.stop();
        throw err;
      }
      this.addLocal('cam', mst);
    }

    // A screen share: sharp (1080p, 15 a second, for text) or smooth (720p, 30), and never more
    // than the server's limit, which keeps what Cloudflare sends on in check. Supporters' are
    // sharper (1080p, at 30 or 60 a second), unless they chose the data saver.
    async setScreen(on, options = {}) {
      const lp = this.localParticipant;
      if (!on) {
        await this.queue(() => this.unpublishNow(['screen', 'screenAudio']));
        return this.dropLocal(['screen', 'screenAudio']);
      }
      if (lp.pubs.has(Source.ScreenShare)) return;
      if (!lp.permissions.canPublish) throw cantTalk();
      const smooth = options.contentHint === 'motion';
      this.screenSmooth = smooth;
      this.screenSaver = Boolean(options.saver);
      const sharp = Boolean(this.limits.sharp) && !this.screenSaver;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: sharp ? { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: smooth ? 60 : 30 } }
          : smooth ? { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } } : { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 15 } },
        audio: Boolean(options.audio),
      });
      const video = stream.getVideoTracks()[0];
      if (options.contentHint) video.contentHint = options.contentHint;
      const audio = stream.getAudioTracks()[0];
      const list = [{ kind: 'screen', mst: video, smooth }, ...(audio ? [{ kind: 'screenAudio', mst: audio }] : [])];
      try {
        await this.queue(() => this.publishNow(list));
      } catch (err) {
        for (const t of stream.getTracks()) t.stop();
        throw err;
      }
      this.addLocal('screen', video);
      if (audio) this.addLocal('screenAudio', audio);
      // (Stopped from the browser's own "Stop sharing".)
      video.addEventListener('ended', () => { if (lp.pubs.has(Source.ScreenShare)) this.setScreen(false).catch(() => {}); });
    }

    // What's being sent (to send again, on a new connection).
    sending() {
      const lp = this.localParticipant;
      return Object.entries(SOURCE).map(([kind, source]) => {
        const pub = lp && lp.pubs.get(source);
        return pub && pub.track ? { kind, mst: pub.track.mediaStreamTrack, smooth: kind === 'screen' && Boolean(this.screenSmooth) } : null;
      }).filter(Boolean);
    }

    // (Each one's new sender: a camera's swapped on it, without renegotiating.)
    sendersFor(list) {
      for (const { kind } of list) {
        const pub = this.localParticipant.pubs.get(SOURCE[kind]);
        if (pub && pub.track) pub.track.sender = this.local.get(kind) ? this.local.get(kind).sender : null;
      }
    }

    // What you're sending got lost at Cloudflare's end (the server noticed nobody could get it):
    // it's all sent again, on a new sending connection. (Not when that connection's only just come
    // up, or isn't up yet: then it's slow, not lost.) If that fails, everything starts again.
    resend() {
      const pc = this.pubPc;
      if (!pc || !pc.connectedAt || Date.now() - pc.connectedAt < 3000) return;
      this.queue(async () => {
        if (this.pubPc !== pc) return;
        const list = this.sending();
        this.local.clear();
        this.names = {};
        this.closePc(pc);
        this.pubPc = null;
        if (!list.length) return;
        await this.publishNow(list);
        this.sendersFor(list);
      }).catch(() => this.rejoin());
    }

    // Not allowed to talk any more (a timeout, a role change), or allowed again. The server's
    // already stopped what you were sending.
    setCanPublish(speak) {
      const lp = this.localParticipant;
      if (!lp || lp.permissions.canPublish === speak) return;
      const before = { ...lp.permissions };
      lp.permissions = { canPublish: speak };
      if (!speak) {
        const kinds = [...this.local.keys()];
        this.queue(() => this.unpublishNow(kinds)).catch(() => {});
        this.dropLocal(kinds);
      }
      this.emit(RoomEvent.ParticipantPermissionsChanged, before, lp);
    }

    // ---------- Getting everyone else's ----------

    // Rainlit's list of who's here and what each of them is sending: this page gets what it
    // should (everyone's sound; their video only while it's being looked at), and lets go of
    // what it shouldn't. (A member whose "pub" is null is being checked, after the server
    // restarted: what's coming from them is left as it is.)
    sync(members) {
      if (this.closed || !this.localParticipant) return;
      this.members = members;
      if (!this.subSession) return;
      const me = this.localParticipant.identity;
      const here = new Set();
      for (const m of members) {
        if (m.id === me) continue;
        here.add(m.id);
        let p = this.remoteParticipants.get(m.id);
        if (!p) {
          p = new Participant(m.id);
          this.remoteParticipants.set(m.id, p);
          this.emit(RoomEvent.ParticipantConnected, p);
        }
        p.muted = Boolean(m.muted);
        const mic = p.pubs.get(Source.Microphone);
        if (mic && mic.isMuted !== p.muted) {
          mic.isMuted = p.muted;
          this.emit(p.muted ? RoomEvent.TrackMuted : RoomEvent.TrackUnmuted, mic, p);
        }
      }
      const want = new Map();
      const unknown = new Set();
      const video = this.wantVideo || Date.now() < this.videoUntil;
      for (const m of members) {
        if (m.id === me) continue;
        this.seen.add(m.id);
        if (m.pub === null) {
          unknown.add(m.id);
          continue;
        }
        for (const kind of ['mic', 'screenAudio', ...(video ? ['cam', 'screen'] : [])]) {
          if (m.pub && m.pub[kind]) want.set(`${m.id}:${kind}`, m.pub[kind]);
        }
      }
      // (Just after Rainlit restarted, people come back into its list one by one: for a while,
      // anyone not back yet is kept, as they were.)
      // (Someone who was back and then went, left.)
      const waiting = Date.now() < this.graceUntil;
      const notBack = (id) => waiting && !here.has(id) && !this.seen.has(id);
      for (const id of this.remoteParticipants.keys()) if (notBack(id)) unknown.add(id);
      const drop = [...this.pulled.values()].filter((x) => x.state === 'open' && !unknown.has(x.user) && want.get(x.key) !== x.trackName);
      for (const x of drop) {
        x.state = 'closing';
        this.dropPulled(x);
      }
      const now = Date.now();
      const waitFor = (key, trackName) => {
        const r = this.retry.get(key);
        return Boolean(r && r.name === trackName && r.at > now);
      };
      const add = [...want].filter(([key, trackName]) => !this.pulled.has(key) && !waitFor(key, trackName)).map(([key, trackName]) => {
        const [user, kind] = key.split(':');
        const x = { key, user, kind, trackName, state: 'pending' };
        this.pulled.set(key, x);
        return x;
      });
      if (drop.length) this.queue(() => this.unpullNow(drop)).then(() => this.sync(this.members)).catch(() => {});
      if (add.length) {
        this.queue(() => this.pullNow(add)).catch(() => {
          for (const x of add) {
            if (this.pulled.get(x.key) !== x) continue;
            this.pulled.delete(x.key);
            this.later(x.key, x.trackName);
          }
        });
      }
      for (const [id, p] of this.remoteParticipants) {
        if (here.has(id) || notBack(id)) continue;
        this.remoteParticipants.delete(id);
        this.emit(RoomEvent.ParticipantDisconnected, p);
      }
      // (What's no longer wanted isn't tried again; what is, is, when it's due.)
      for (const [key, r] of this.retry) if (want.get(key) !== r.name) this.retry.delete(key);
      this.retrySoon();
    }

    // Connected to Rainlit again (it may have restarted: an update). What's coming in carries on
    // (Cloudflare has it), and for 20 seconds nobody's dropped for not being in its list yet.
    serverBack() {
      this.graceUntil = Date.now() + 20_000;
      this.seen = new Set();
      clearTimeout(this.graceTimer);
      this.graceTimer = setTimeout(() => this.sync(this.members), 20_500);
    }

    // Something that couldn't be had yet (their connection's still starting, say): tried again
    // soon, then less often.
    later(key, trackName) {
      const r = this.retry.get(key);
      const n = r && r.name === trackName ? r.n + 1 : 0;
      this.retry.set(key, { at: Date.now() + [500, 1000, 1500, 2500, 4000][Math.min(n, 4)], name: trackName, n });
      this.retrySoon();
    }

    // Looks again when the next one's due. (Only ones still to come count: going by one that's
    // already being fetched, it'd look too soon, find nothing due, and never look again.)
    retrySoon() {
      const now = Date.now();
      const due = [...this.retry.values()].map((r) => r.at).filter((t) => t > now);
      clearTimeout(this.retryTimer);
      if (due.length) this.retryTimer = setTimeout(() => this.sync(this.members), Math.min(...due) - now + 50);
    }

    // Others' video, or not: it's only fetched while it's being looked at, and for 10 seconds
    // after (switching back quickly shouldn't start it all again).
    setWantVideo(on) {
      if (this.wantVideo === on) return;
      this.wantVideo = on;
      clearTimeout(this.videoTimer);
      if (!on) {
        this.videoUntil = Date.now() + 10_000;
        this.videoTimer = setTimeout(() => this.sync(this.members), 10_100);
      } else {
        this.videoUntil = 0;
      }
      this.sync(this.members);
    }

    async pullNow(list) {
      const r = await this.api('POST', `/channels/${this.channelId}/voice/pull`, { tracks: list.map(({ user, kind }) => ({ user, kind })) });
      const got = new Map((r.tracks || []).map((t) => [`${t.user}:${t.kind}`, t]));
      for (const x of list) {
        const t = got.get(x.key);
        if (!t) {
          if (this.pulled.get(x.key) === x) this.pulled.delete(x.key);
          this.later(x.key, x.trackName);
          continue;
        }
        this.retry.delete(x.key);
        Object.assign(x, { trackName: t.trackName, mid: String(t.mid), state: 'open' });
        this.byMid.set(x.mid, x);
      }
      if (r.sdp) {
        await this.subPc.setRemoteDescription({ type: 'offer', sdp: r.sdp });
        const answer = await this.subPc.createAnswer();
        const stereo = [...this.byMid.values()].filter((x) => x.kind === 'screenAudio').map((x) => x.mid);
        await this.subPc.setLocalDescription({ type: 'answer', sdp: withStereo(answer.sdp, stereo) });
        this.watch(this.subPc);
        try {
          await this.api('POST', `/channels/${this.channelId}/voice/answer`, { sdp: this.subPc.localDescription.sdp });
        } catch (err) {
          // (Cloudflare didn't take the answer: it waits a few seconds for the connection, and it
          // didn't come. A fresh receiving connection, getting everything again; a second time
          // soon after, and the watch deals with it.)
          if (Date.now() - (this.resubAt || 0) < 10_000) throw err;
          this.resubAt = Date.now();
          await this.resubscribe();
        }
      }
    }

    onTrack(e) {
      this.protect(e.receiver, e.track.kind, 'decrypt');
      const mid = e.transceiver && e.transceiver.mid;
      const x = mid != null ? this.byMid.get(String(mid)) : null;
      if (x && x.state === 'open' && !x.track) this.arrived(x, e.transceiver);
    }

    arrived(x, transceiver) {
      this.protect(transceiver.receiver, transceiver.receiver.track.kind, 'decrypt');
      let p = this.remoteParticipants.get(x.user);
      if (!p) {
        p = new Participant(x.user);
        this.remoteParticipants.set(x.user, p);
      }
      const source = SOURCE[x.kind];
      const track = new Track(this, transceiver.receiver.track, source);
      let pub = p.pubs.get(source);
      if (!pub) {
        pub = new Publication(source, null);
        p.pubs.set(source, pub);
      }
      pub.track = track;
      if (source === Source.Microphone) pub.isMuted = p.muted;
      Object.assign(x, { track, pub });
      this.emit(RoomEvent.TrackSubscribed, track, pub, p);
    }

    // (Straight away: their sound stops now, and Cloudflare's told after.)
    dropPulled(x) {
      if (!x.track) return;
      const p = this.remoteParticipants.get(x.user) || new Participant(x.user);
      if (x.pub && x.pub.track === x.track) {
        x.pub.track = null;
        p.pubs.delete(x.pub.source);
      }
      this.emit(RoomEvent.TrackUnsubscribed, x.track, x.pub, p);
      x.track = null;
    }

    async unpullNow(list) {
      const done = list.filter((x) => x.mid);
      for (const x of list) {
        if (x.mid) this.byMid.delete(x.mid);
        if (this.pulled.get(x.key) === x) this.pulled.delete(x.key);
      }
      if (!done.length) return;
      await this.api('POST', `/channels/${this.channelId}/voice/unpull`, { mids: done.map((x) => x.mid) });
      this.dead += done.length;
      if (this.dead >= 24) await this.resubscribe();
    }

    // The receiving connection's grown (closed slots can't be used again): a fresh one, getting
    // everything again. (A moment's gap in what's coming in, once in a long while.)
    async resubscribe() {
      const old = this.subPc;
      for (const x of this.pulled.values()) this.dropPulled(x);
      this.pulled.clear();
      this.byMid.clear();
      this.dead = 0;
      const { sub } = await this.api('POST', `/channels/${this.channelId}/voice/resub`, {});
      this.subPc = this.newPc(true);
      this.subSession = sub;
      this.closePc(old);
      setTimeout(() => this.sync(this.members), 0);
    }

    // ---------- The connections ----------

    onConnectionState(pc) {
      if ((pc !== this.pubPc && pc !== this.subPc) || this.closed) return;
      const states = [this.pubPc, this.subPc].filter(Boolean).map((c) => c.connectionState);
      if (states.includes('failed')) {
        this.lost();
        this.rejoin();
      } else if (states.includes('disconnected')) {
        this.lost();
        clearTimeout(this.lostTimer);
        this.lostTimer = setTimeout(() => this.rejoin(), 10_000);
      } else if (states.includes('connected')) {
        clearTimeout(this.lostTimer);
        if (this.reconnecting) {
          this.reconnecting = false;
          this.emit(RoomEvent.Reconnected);
        }
      }
    }

    lost() {
      if (this.reconnecting) return;
      this.reconnecting = true;
      this.emit(RoomEvent.Reconnecting);
    }

    // The connections to Cloudflare broke for good: new ones, sending what you were, and getting
    // everyone else's again. (It says it's connected again when the new ones do.)
    async rejoin() {
      if (this.closed || this.rejoining) return;
      this.rejoining = true;
      clearTimeout(this.lostTimer);
      try {
        const sending = this.sending();
        for (const x of this.pulled.values()) this.dropPulled(x);
        this.pulled.clear();
        this.byMid.clear();
        this.local.clear();
        this.dead = 0;
        this.chain = Promise.resolve();
        this.closePc(this.pubPc);
        this.closePc(this.subPc);
        await this.open();
        if (sending.length) {
          await this.queue(() => this.publishNow(sending));
          this.sendersFor(sending);
        }
        this.sync(this.members);
        this.emit(RoomEvent.Rejoined);
      } catch {
        this.disconnect(DisconnectReason.UNKNOWN, true);
      } finally {
        this.rejoining = false;
      }
    }

    // ---------- Sound ----------

    playAudio(el) {
      if (this.sinkId && el.setSinkId) el.setSinkId(this.sinkId).catch(() => {});
      el.play().then(() => this.setPlayback(true)).catch((err) => {
        if (err && err.name === 'NotAllowedError') this.setPlayback(false);
      });
    }

    setPlayback(ok) {
      if (this.canPlaybackAudio === ok) return;
      this.canPlaybackAudio = ok;
      this.emit(RoomEvent.AudioPlaybackStatusChanged, ok);
    }

    heard() {
      return [...this.pulled.values()].flatMap((x) => (x.track ? x.track.elements : [])).filter((el) => el.tagName === 'AUDIO');
    }

    async startAudio() {
      for (const el of this.heard()) await el.play().catch(() => {});
      this.setPlayback(true);
    }

    async switchActiveDevice(kind, deviceId) {
      if (kind !== 'audiooutput') return;
      this.sinkId = deviceId;
      for (const el of this.heard()) if (el.setSinkId) await el.setSinkId(deviceId).catch(() => {});
    }

    async disconnect(reason = DisconnectReason.UNKNOWN, tell = false) {
      if (this.closed) return;
      this.closed = true;
      clearTimeout(this.lostTimer);
      clearTimeout(this.retryTimer);
      clearTimeout(this.graceTimer);
      clearTimeout(this.videoTimer);
      for (const pub of this.localParticipant ? this.localParticipant.pubs.values() : []) {
        try { pub.track.mediaStreamTrack.stop(); } catch {}
      }
      for (const x of this.pulled.values()) if (x.track) for (const el of x.track.detach()) el.remove();
      this.closePc(this.pubPc);
      this.closePc(this.subPc);
      try { this.worker && this.worker.terminate(); } catch {}
      if (tell) this.emit(RoomEvent.Disconnected, reason);
    }
  }

  RoomEvent.Rejoined = 'rejoined';

  window.RainlitCfVoice = { Room, Track: { Source }, RoomEvent, DisconnectReason, isE2EESupported };
})();
