# Rainlit for Windows

The desktop app is a window onto https://rainlit.app, or onto another Rainlit server
you pick (**Use a different Rainlit server** on the sign-in screen, or **Settings →
Server → Change**; `servers.js` checks it's a Rainlit server and remembers it, and the
app starts again on it). Website updates show up in the app right away, with no
reinstall. On top of the website it adds:

- **Push to talk anywhere.** Your talk key works while you're in another app or a
  game. Letters, numbers, F keys, Ctrl, Alt and Shift all work.
- **Screen sharing with sound.** Share a screen or a window with everything your
  computer is playing, except Rainlit itself, so your friend doesn't hear their
  own voice come back.
- **Tray icon.** Closing the window keeps Rainlit running by the clock, so calls
  and messages still reach you. Right-click the tray icon to quit, or to start
  Rainlit with Windows.
- **Notifications.** A Windows notification and a flashing taskbar button when
  someone calls or messages while you're in another window, plus a dot on the
  taskbar button while there are unread messages.
- **Updates.** The app checks GitHub for a new version every few hours and installs
  it the next time it restarts.

## Working on it

```bash
cd desktop
npm install
npm run dev      # the app, pointed at a local server (http://localhost:3000)
npm start        # the app, pointed at https://rainlit.app
npm run dist     # builds dist/Rainlit-Setup.exe
```

`main.js` is the app itself: the window, tray, screen chooser, talk key and
notifications. `preload.js` is what the page can use (`window.rainlitDesktop`),
and `public/app.js` on the website checks for it.

## Releasing an update

Installers are published to the public repo `coldsignals/rainlit-releases`, which
the app checks for updates. rainlit.app/download always points at the newest one.

1. Raise `version` in `desktop/package.json` (for example 1.0.0 to 1.0.1).
2. With the GitHub CLI signed in (`gh auth login`), run
   `GH_TOKEN=$(gh auth token) npm run release`. That builds the installer and
   uploads it, with `latest.yml` and the `.blockmap` file, to a draft release.
   The updater needs all three.
3. Publish the draft (on GitHub, or `gh release edit v1.0.1 --repo
   coldsignals/rainlit-releases --draft=false`). Installed apps pick it up within
   a few hours.

The installer isn't code-signed, so Windows shows "Windows protected your PC" the
first time. Click **More info**, then **Run anyway**.
