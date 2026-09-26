# Rainlit for Android

The Android app opens https://rainlit.app in its own full-screen window, like the
Windows app, so website updates show up without reinstalling. It can open another
Rainlit server instead (**Use a different Rainlit server** on the sign-in screen):
`ServerChoice.java` checks it's a Rainlit server, remembers it, and starts the app with
that server's address in place of rainlit.app, so everything below works there too. If
that server can't be reached, its "can't reach" page offers the way back to rainlit.app.
On top of the website:

- **Calls keep going** when you switch apps or turn the screen off. An ongoing
  "In a call with …" notification is what Android requires for that; tap it to get
  back to the call.
- **Notifications** when someone calls or messages while you're not looking at
  Rainlit.
- **Push, for when the app is fully closed**, through UnifiedPush: install a push
  app like [ntfy](https://ntfy.sh/docs/subscribe/phone/) and Rainlit connects to it
  on its own, no Google needed. The server sends each phone a small note that's
  encrypted for that phone ("Alice is calling", "New message from Alice"). The
  message text is never in it. `PushServiceImpl.java` receives them and
  `Notifications.java` shows them. A call rings like a phone call and turns into
  "Missed call" if nobody answers.
- **The back button** closes whatever's open, then tucks the app away without
  ending a call.
- **Rainlit's own sounds** for notifications: the same bell chime and ringtone the
  app plays, rendered to `res/raw` by `make-sounds.js` (run `node make-sounds.js`
  after changing them). People can still pick other sounds in Android's settings.
- The Rainlit icon, a themed icon on Android 13 and up, and a dark splash screen.

People install it from rainlit.app/android, which points at `Rainlit.apk` on the
newest release in the public repo `coldsignals/rainlit-android` (Obtainium users add
that repo). The first time, Android asks to
allow installing apps from the browser.

## Building it

You need Android Studio (for the Android SDK) and JDK 17 to 22. The Gradle version
here doesn't run on the JDK 25 that ships inside Android Studio.

```bash
cd mobile
npm install
npx cap sync android
cd android
JAVA_HOME="C:/Program Files/Java/jdk-22" ./gradlew.bat assembleRelease
```

The APK lands in `android/app/build/outputs/apk/release/app-release.apk`.
`android/local.properties` (not in git) tells Gradle where the SDK is:
`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`.

## The signing key

Release builds are signed with Rainlit's own key, which is kept **outside** the repo
in `.PROJECT PORCHLIGHT/rainlit-android-signing/`. Set `RAINLIT_SIGNING` to point
somewhere else. Every update must be signed with that same key, or phones won't
accept it as an update, so keep a backup of that folder somewhere safe.

## Releasing an update

1. Raise `versionCode` (by 1) and `versionName` in `android/app/build.gradle`.
2. Build as above, copy the APK to `Rainlit.apk`, and publish it as its own release,
   tagged with the new `versionName` so Obtainium reads the right version:
   `gh release create v1.3.3 Rainlit.apk --repo coldsignals/rainlit-android --title "Rainlit 1.3.3" --notes "..." --latest`
   Windows releases live separately in `coldsignals/rainlit-releases`.
