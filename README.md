# Rainlit

Private voice calls, video, screen sharing, messages and file sharing with your
friends. Everyone has an account, adds friends by username, and can see who's
online. Each friend has a conversation where messages and files are kept (or
not, if you turn saving off). Groups are a few friends (up to 10) with a chat and a call
of their own. Spaces are communities with text and voice channels that anyone can make and
invite people to (or bring over from Discord, with a server template link). Calls between two friends (video and screen sharing too) go directly
between your devices; the server only helps them find each other. Group calls and voice
channels go through a media server (Cloudflare's, or LiveKit), end-to-end encrypted (see
[SELF-HOSTING.md](SELF-HOSTING.md)), and others' video only comes while you're looking at
it. Someone left alone in a voice channel for 15 minutes is asked if they're still there, and
taken out if they don't answer, so a channel isn't left open overnight by accident.

**Run your own:** anyone can host a Rainlit for their friends or community, on Render in
a few clicks or on any machine with Docker. See [SELF-HOSTING.md](SELF-HOSTING.md). Where
it's headed (free accounts on rainlit.app, voice channels, one account everywhere) is in
[ROADMAP.md](ROADMAP.md).

## 1. Try it on your own computer

1. Install Node.js (version 24 or newer) from https://nodejs.org
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. The terminal prints a **setup code**. Open http://localhost:3000, sign up
   with that code, and you're the admin.
4. To try a call with yourself, open the admin panel (the key button next to
   your name), make an invite, then open http://127.0.0.1:3000 in another tab
   and sign up there with the invite. (That second address keeps its own
   sign-in, so the two tabs can be two different people.) Add each other as
   friends and call. Mute one tab so it doesn't echo.

Everything is kept in a `data` folder next to `server.js`. Delete it to start
over.

## 2. Put it online

[SELF-HOSTING.md](SELF-HOSTING.md) has it all: Render in a few clicks, or Docker on your
own computer or server (with `https://` set up for you), your own address, backups and
updating.

## 3. Invite your friends

Rainlit is invite-only to start with, so strangers who find your address can't
make an account.

1. Press the key button next to your name.
2. Press **Make an invite**. A message with your app's address and the code is
   copied, ready to paste to your friend.
3. They sign up with it, then add you (or you add them) by username.

Each code works once. Unused codes can be deleted.

**Birthdays:** signing up asks for a birthday, without saying what age it takes
(a "neutral age screen"). Anyone under 13 is told they can't make an account,
and that device can't try again for a day. The birthday isn't kept: someone
13 to 17 keeps only the day they turn 18, and 18+ channels stay closed to them
until then. A server can ask for more than 13 with `MIN_AGE` (some countries'
laws want 14, 15 or 16).

**Open sign-ups:** the same panel can let anyone sign up without an invite, with a
bot check, a daily limit and a waitlist (see [SELF-HOSTING.md](SELF-HOSTING.md#4-invite-people)).

**Forgot password:** in the same panel, press **Reset link** next to their
account and send them the link. It works once, for 24 hours, and signs them
out everywhere else.

**Flagged accounts:** the same panel lists accounts that look like they're
filling up the free tier (bots, mostly), each with what was noticed: a new
account hitting its daily limit, the same file sent again and again, a lot in
files nobody else opens, several accounts made from one place in a day. New
accounts can send up to 250 MB of files a day for their first week, and so can
a flagged one until you press **Looks fine**. Nobody's suspended unless you do
it.

**Announcements:** the same panel tells everyone something (a change to the
terms, some planned downtime). It shows once to each person, the next time
they open Rainlit (right away if it's open), until they press **Got it**. For
a big change to the terms or privacy policy, send it at least 3 days before
the change starts: they both promise that.

## 4. Relay and GIFs

If calls get stuck on "Connecting" on some networks, add a relay (a TURN server;
Cloudflare's is free to start). The GIF button needs a free KLIPY key. Both are in
[SELF-HOSTING.md](SELF-HOSTING.md) (steps 5 and 6).

## 5. The Android app

Get it from https://rainlit.app/android (or with [Obtainium](https://github.com/ImranR98/Obtainium),
from https://github.com/coldsignals/rainlit-android). It keeps calls going with the screen
off, rings like a phone call, and gets notifications while it's closed if
[ntfy](https://ntfy.sh/docs/subscribe/phone/) is installed. It opens rainlit.app; for
another Rainlit server, press **Use a different Rainlit server** on the sign-in screen (or
**Settings → Server → Change**). More in [mobile/README.md](mobile/README.md).

## 6. Rainlit for Windows

Get it from https://rainlit.app/download. It opens rainlit.app; for another Rainlit
server, press **Use a different Rainlit server** on the sign-in screen (or **Settings →
Server → Change**; the tray menu goes back to rainlit.app). It's the same Rainlit in its
own window, plus:

- Push to talk that works while you're in another app or a game.
- Screen sharing with sound, with Rainlit's own sound left out so your friend
  doesn't hear themselves.
- Your activity, if you want it: "Playing Hades" or "Listening to (a song)" by
  your name, for your friends and people in your spaces (see below).
- It keeps running in the tray by the clock, so calls and messages still reach
  you with the window closed, with Windows notifications and a flashing taskbar
  button.
- It updates itself.

The installer isn't code-signed yet, so Windows shows "Windows protected your
PC" the first time: click **More info**, then **Run anyway**. How it's built
and released is in [desktop/README.md](desktop/README.md).

## Friends and profiles

- **Add a friend:** type their username in the box at the top of the list.
  They get a request to accept. If they'd already asked you, you're friends
  straight away.
- **Online, away, offline:** the dot on each picture. You show as away after
  10 minutes without touching Rainlit (except during a call). You can also
  pick **Away**, **Do not disturb** or **Appear offline** yourself (Your
  profile, **Show me as**). Do not disturb shows red, and mutes you: no
  message sounds, no notifications on your computer or phone, and calls
  coming in don't ring (they still show in Rainlit).
- **Your profile:** click your name at the bottom left. Change your picture
  (PNG, JPG, WebP or GIF, up to 8 MB, and GIFs move; a big one's made 512 pixels
  across, losslessly, so it's never blurred or blocky), display name and a status
  of up to 120 characters. Your password, your email and sign out are there too,
  and **Your files**: everything you've sent, biggest first, to make room.
- **Your email:** new accounts get a link to confirm their email address (your
  profile says whether it's confirmed, and sends another). Forgot your password?
  **Forgot your password?** on the sign-in screen emails a link, good for an
  hour. Changing your email needs your password, and the old address is told.
  (A Rainlit that doesn't send email: its admin makes reset links instead. See
  [SELF-HOSTING.md](SELF-HOSTING.md) to turn email on.)
- **What you're doing:** with Rainlit for Windows, your friends and the people
  in your spaces can see "Playing Hades" or "Listening to (a song) · (artist)" by
  your name, and on your profile card, for how long you've played and how far
  into the song you are. It finds games itself (any Steam game, and popular ones
  from elsewhere: League, VALORANT, Minecraft, Roblox...), and you can add any
  program in **Settings**. Songs come from Spotify, Apple Music and other music
  apps, as Windows' media controls show them (web browsers only if you want).
  It's off until you say yes, it asks once, and nobody sees it while you appear
  offline. Only the game's or song's name leaves your computer, and Rainlit
  doesn't keep it. (Spotify's own API only lets small apps have 5 users, so
  Rainlit doesn't use it.)
- **A friend's menu:** right-click a friend in the list (long-press on a phone,
  or the "..." that appears when you hover) for **Message**, **Call**, **View
  profile** and **Remove friend**. Clicking their name at the top of your
  conversation shows their profile too.

## Themes

Settings > **Theme**: Rainlit's own (the night, lit by a lamp), **Dark** (plain
greys), **Midnight** (black, for OLED screens), **Light**, or **Auto** (Light
or Rainlit, as your device is set). With Glow (below), there's also
a theme for each season: **Sakura** (cherry blossoms at night, with falling
petals), **Monsoon** (deep green, and the rains), **Fireflies** (a summer
night in the woods), **Maple** (autumn at dusk, with falling leaves) and
**Aurora** (the northern lights, and snow), each with its own weather in
place of the rain; anyone else can try them on while Settings is open (and
sees what Glow gets you). Your theme is kept with your account, so it's the
same on all your devices. If your Glow ends, a Glow theme you're using stays
until you switch to another; switching back to it takes Glow again (the same
goes for a homepage's Glow extras).

## Homepages

Everyone has a homepage: a whole page of their own, like the personal pages of
the old web (GeoCities, Angelfire) or a Strawpage, where the profile card is the
quick look. Open anyone's from their profile card (**Homepage**), and yours
from your own (**Your homepage**, then **Edit**).

- **Put anything anywhere:** words in 14 fonts (pixel, handwriting, gothic,
  neon, Comic...), with boxes (a sticky note, a label, a speech bubble, a
  caution sign) and effects (glow, rainbow, blinking, scrolling, wavy);
  pictures and GIFs with frames (a photo with a caption, a stamp, a heart, a
  window from 1998); pixel stickers, any emoji and your spaces' emoji; tape
  and paper. Drag to move; the handles resize and turn (or press **R**).
  **To front** and **To back** stack them, and **Undo** takes anything back.
- **The old web:** a visitor counter (each visitor counts once every few
  hours; you don't), a guestbook anyone who can see your page can sign (they
  can delete what they wrote, and you can delete anything in it; you hear
  when someone signs it), and a music player for a song of yours (MP3, M4A,
  OGG, FLAC or WAV, up to 10 MB), as a tunebox, a cassette or just a button.
  It only plays when a visitor presses play.
- **Ask me anything:** a box visitors ask you things in, anonymously if you
  let them (you aren't told who asked; whoever runs the server is, only if
  you report the question). Only you see a question until you answer it,
  right on your page; then it shows there with your answer. Report one to
  stop whoever asked from asking again, without finding out who it was.
- **Shelves and buttons:** a shelf shows off favourite games, music or shows
  by their covers, with name tags and links: add pictures, or paste a link
  (a Steam page, an album, a film's page) and its cover and name are found
  for you. 88x31 buttons, the little badges old sites linked each other with,
  are made right on the page: a few words, a pixel sticker, a style, and a
  link (a link to someone's homepage opens it right in Rainlit).
- **The page:** a pattern, a color or your own picture behind it, weather
  over it (rain, snow, sparkles, floating hearts), and a name for it.
- **A pet:** a cat, a pup or a frog (each in four colours, with a name) lives
  on your page, like a Tamagotchi or the desktop pets of old. It wanders
  around the part of the page that's showing (and follows along as it's
  scrolled), naps, and comes over to see what the pointer's up to. Anyone who
  can see your page can pet it: it hops, hearts come up, and it counts how many
  times it's been petted. You look after it (the **Pet** tab, or click it on
  your page): feed it (a bowl comes, and it eats) and play with it (it chases a
  ball). It gets hungry over three days and glum over two, but never ill, and
  never runs away; hungry, it just mopes about, thinking of food, until it's fed.
- **Glow's extras:** people with Glow also get three more pets (a cloudlet
  that makes rainbows when it's petted, a dragon that puffs flames, and a spirit
  fox with glowing tails), backgrounds that move (a starfield, bokeh lights,
  holographic foil and waves, in the page's colours), effects for visitors (a
  trail of sparkles, hearts, stars, bubbles or raindrops behind their pointer,
  and confetti, hearts, stars or ripples where they click), a fortune ball
  visitors ask things (with its forecasts, or answers you write), fireflies, an
  aurora, a thunderstorm and cherry blossoms for weather, Shimmer and
  Lamplight words, and Gilded and Neon frames, and room for 200 MB and 500
  pieces. Anyone can try them on in the editor (nothing's saved). If Glow ends,
  what's on the page stays, until it's switched off.
- **Who can see it:** your friends, people in your spaces too (like your
  profile card; that's where it starts), or anyone with its link,
  `rainlit.app/@yourname`, even without an account, to put in a bio anywhere.
- Everyone starts with an "under construction" page until they make theirs.
- It's built from pieces, not code: pages can't run anything, and their
  pictures come from Rainlit itself. A page can be reported like a message.
  Pictures can be up to 5 MB each, songs 10 MB, and 40 MB in all.

## Feedback

Settings > **Feedback** sends a bug, an idea or anything else straight to
whoever runs the server (on rainlit.app, the people making Rainlit). With a
bug, a tick box sends diagnostics too: which app and browser, the screen,
the theme and call settings, whether you were in a call, and Rainlit's own
recent errors (never messages); you can read them before sending. The admin
sees it all in the Admin panel (the key button gets a dot for new feedback),
and can reply, which shows under what you sent, or mark it done. Up to 10 a
day each.

## Rainlit Glow

rainlit.app is free, and paid for by one person. **Glow** is how people support
it and keep it that way, for $5 a month or $50 a year (and tips), at
`rainlit.app/support` (Your profile, **Rainlit Glow**). What supporters get is
marked with a Glow tag wherever it is, and it's more of what costs money: files up
to 100 MB, 50 GB for them, 1,000 notes, sharper screen sharing in voice
channels (1080p at up to 60 fps, while it fits in what Cloudflare sends for
free), no slower start for a new account, homepage extras (three more pets,
moving backgrounds, effects for visitors, a fortune ball...), five themes with
weather of their own (Sakura, Monsoon, Fireflies, Maple and Aurora), and a badge, a
raindrop that gathers light the longer they support (Drizzle, then Shower,
Downpour, Storm, Monsoon and Lamplight). If they stop, it dims, and keeps its
level. Stripe takes the payments (as the seller, through Link), so Rainlit
never sees a card. Everything else stays free. The Google Play app doesn't
offer it (Play doesn't allow buying things outside it): support on the website
instead.

## Conversations

Click a friend to open your conversation with them, like a Discord DM. The ✕
at the top closes it (on a phone, the back arrow).

- **Messages stay.** Send them any time, even when your friend is offline;
  they'll see them next time they open Rainlit. Scroll up for older ones.
- **Unread messages:** a yellow number on your friend in the list, and a yellow
  "new messages" line above the first one you haven't seen. A soft "ding-dong"
  plays when a message arrives in a conversation you don't have open. Turn the
  sound off in settings. (On a phone it may not play while the app is in the
  background.)
- **Grouped messages:** several in a row from the same person, a few minutes
  apart, share one name and time.
- **Click sounds:** a soft click when you press buttons, friends and menu
  items (not while typing). Turn it off in settings.
- **GIFs:** press **GIF** next to the message box to see what's trending or
  search, and click one to send it. They play in the conversation (only while
  they're on screen, and not at all if your device is set to reduce motion,
  then click one to play it). See step 4 to turn this on.
- **Custom emoji:** a space's owner and admins (and roles with "Manage emoji")
  add up to 50 in the space's settings: PNG, GIF (they can move), WebP or JPG.
  Everyone in the space can use them anywhere they chat, in a DM too (on Discord
  that takes Nitro): type `:` and a name, or pick one from the emoji button,
  and react with them. A message that's only emoji shows them big.
- **18+ channels:** a space can mark a channel 18+ (in its settings, under
  **Who**), for things like horror, gory films and games, or crude jokes. Nothing in one reaches
  anyone until they've said they're 18 or older, which they're asked once, the
  first time they open one: not its messages, files, pings or who's in it.
  Channels that were age-restricted on Discord come over 18+. (On rainlit.app,
  nudity, sexually explicit things and real gore aren't allowed even there: see the
  terms.)
- **Notes:** a conversation with yourself, at the top of Home, for notes, links
  and files you want on all your devices (send a file from your phone, open it
  on your computer). Only you see it, and it's always kept. It holds 100 notes
  (`NOTES_MAX`; see [SELF-HOSTING.md](SELF-HOSTING.md)), and its files count
  toward your room for files, like everything else you send.
- **Link previews:** a link in a message shows what it is underneath, like
  Discord: an X post shows the post (who posted it, what they said, its
  pictures, and its video, which plays right there), a YouTube or TikTok link
  its video, and other pages their title, description and picture. Rainlit's
  server fetches them and passes their pictures along, so the sites don't see
  who's looking. Wrap a link in `<` and `>` for no preview, or turn them all off
  in settings.
- **Files:** press the paperclip, drag files onto the conversation, or paste a
  screenshot into the message box. Pictures show in place (a big photo as a
  smaller copy, like Discord; click it for the original, full size), and videos
  and audio play right there. Files are kept too: up to 25 MB each, and 1.5 GB
  for everything each person's sent that's still there (the admin can change
  both, and give someone more). It's not per month: deleting files makes room.
- **Hidden details come out:** photos, videos and recordings often carry where
  and when they were made, on what phone, and more. Rainlit takes that out of
  everything uploaded (files, profile pictures, homepages), keeping only which way
  up a photo goes and its colours. The picture or sound itself isn't touched,
  and neither is the file's name.
- **Edit, copy or delete a message:** hover over it and click **⋯** on the
  right, or right-click it (on a phone, press and hold it).
  - **Edit** (your own messages): the text goes back into the message box.
    Enter saves, Esc cancels, and both of you see "(edited)". In an empty
    message box, the Up arrow edits your last message.
  - **Copy:** copies the text, or a GIF's link.
  - **Delete:** asks once to be sure. It disappears for both of you, and a
    file is deleted from the server, leaving "You removed a message" for you
    and "Alice removed a message" for your friend.
- **Saving on or off:** the switch at the top of each conversation. Either of
  you can flip it, and a note in the conversation says who did. While it's off,
  nothing new is kept: messages only reach your friend if they have Rainlit
  open, they're gone after a reload, and files can only be sent during a call
  (straight from you to them, any size). Anything saved before stays.
- **Calls** leave notes in the conversation: who started one, how long it lasted, or
  that it was missed.

## How calls work

- **Calling:** press the phone button at the top of a conversation. It rings on
  every device your friend has Rainlit open on, for up to a minute, with a
  little four-note tune, and you hear the same tune (a bit softer) while you
  wait. They can join or decline. If they decline or don't answer, you can
  ring again.
- **The call shows above the conversation,** so you can keep chatting and
  sending files. If you open another conversation, a bar leads back to it.
- **The call starts** as soon as both of you are in it. The timer at the top
  shows how long it's been going.
- **If someone's internet cuts out,** the other person stays in the call. They
  see "Lost connection" with a counter, and the dropped person rejoins
  automatically once they're back online, even if that takes several minutes.
  If their phone died or the app closed, they open it again and press
  **Rejoin call**, or the call button. Rejoining from a different device works
  too.
- **Leaving** with the Leave button doesn't end the call for the other person.
  You can call back and pick up where you left off.
- **Someone waiting in your call:** while your friend is in your call and you
  aren't (the ringing stopped, or you left or dropped out), their row in your
  friends list says so, and your conversation with them shows a green bar with
  a **Join** button. It also says if their own connection has dropped.
- **Join and leave sounds:** a short rising "boop" when your friend joins or
  rejoins the call (or when you join them), and a falling one when someone
  drops or leaves. Turn them off in settings.
- **Server updates don't end calls.** While the server restarts, you keep
  talking directly; you'll see "Reconnecting to Rainlit" for a few seconds,
  and then the call carries on with the same timer.
- **Phones asleep don't end calls either.** A phone that's been locked a while
  freezes the app's page to save battery, even mid-call. The call itself
  carries on without it, so as long as your voices still get through, nobody
  is taken out of the call (all night, if you both fall asleep in it), even
  when the server's updated in the middle of it.
- **The call ends** when the last person still in it presses Leave, or when
  nobody has been connected for 30 minutes. You get a summary with the total
  length and a log of joins, drops and reconnects, and the home screen keeps a
  list of recent calls on each device.

To change the 30 minutes, set `RECONNECT_MINUTES` (for example `60`; see
[SELF-HOSTING.md](SELF-HOSTING.md)).

## During a call

- **Mute:** the microphone button, or **Ctrl+Shift+M** on a computer. Your
  friend sees a red mic badge on your picture (or next to your name on video)
  while you're muted.
- **Deafen:** the headphones button, or **Ctrl+Shift+D**. You hear nothing
  from the call (your friend, or their screen's sound) and your mic goes quiet
  too; your friend sees crossed-out headphones instead of the mic badge.
  Undeafening brings your mic back as it was, and pressing the mic button
  undeafens you too.
- **Push to talk:** turn it on in settings. Your mic stays silent until you hold
  the talk key (`` ` `` to start with; click it in settings to pick another) or
  hold the mic button. In a browser the key only works while Rainlit is the
  window you're using, so it won't work while you're clicked into a game. The
  Windows app fixes that.
- **Share screen with sound:** in Chrome's sharing window, tick the audio
  checkbox so your friend hears videos and games too: **Share window audio**
  when you share one app's window (just that app's sound), **Share system
  audio** for your whole screen, or **Share tab audio** for a browser tab.
  Rainlit's own sound (your friend's voice) is left out, so they don't hear
  themselves. This needs Chrome or Edge: Firefox can't include sound in a
  screen share at all. In the Windows app, tick **Share audio** in its own
  sharing window instead.
- **See your own stream big:** click the small "You" preview of your screen or
  camera. It fills the call and your friend moves to the corner; click either
  one to swap back.
- **Pick a headset or webcam:** the settings button. You can also turn your
  friend's volume down there, and switch the browser's noise suppression, echo
  cancellation and automatic mic volume on or off.
- **Full screen:** the button at the top right of your friend's video, or
  double-click the video.

## What it can't do yet

- Sounds (ringing, message chimes) only start working after you've clicked
  somewhere in Rainlit once since opening it. Browsers require that.
- No notifications while Rainlit is closed, except in the Windows app (while
  it's in the tray) and the Android app with [ntfy](https://ntfy.sh/docs/subscribe/phone/)
  installed (see [mobile/README.md](mobile/README.md)).
- Password reset emails. For now the admin makes reset links.
- Phones can't share their screen, even in the Android app (yet).
- In a phone's browser, the call may pause if you switch apps or turn the screen
  off. The Android app keeps it going.
- Calls and conversations are between two people (groups are on the
  [roadmap](ROADMAP.md)).
- Call history is saved on each device, not on the server.
- A file sent straight through a call (saving off) restarts from the beginning
  if the connection drops while it's on its way, and shares the connection with
  the call, so on a slow connection the call can get choppier until it's done.

## How it works

- `server.js` serves the app and the API for accounts, profiles, friends,
  invites and conversations. `lib/db.js` keeps them in a SQLite database (built
  into Node) in the data folder, and `lib/dms.js` keeps conversations' files
  in its `files` folder. Passwords are stored as scrypt hashes, and sign-ins as
  hashed tokens in a cookie scripts can't read. Files are only ever served to
  the two people in the conversation, and only pictures, videos and audio are
  shown in place; everything else only downloads.
- `lib/realtime.js` holds one WebSocket per open tab: who's online, new
  messages, ringing, and the setup messages that let two browsers connect for a
  call. It keeps track of each call (who's connected, who dropped, the event
  log) and prints when calls start and end, which you can see in Render's
  **Logs** tab.
- `public/app.js` uses WebRTC, which is built into every modern browser, for the
  actual audio, video and screen sharing, and a WebRTC data channel on the same
  connection for files sent during a call. Microphone echo cancellation and
  noise suppression come from the browser.
- `public/sw.js` and `public/manifest.webmanifest` make it installable on phones.
- `lib/supporters.js` is rainlit.app's supporter plan: Stripe's checkouts and
  webhook, the badge's levels, and the perks, which `lib/storage.js`,
  `lib/homepages.js`, `lib/abuse.js` and the voice limits in `server.js` ask
  it about.
- `desktop/` is the Windows app (Electron). It opens the website in its own
  window and adds the things a browser can't do; the page uses them through
  `window.rainlitDesktop` when it's there.
- `mobile/` is the Android app (Capacitor): the website in its own window, plus
  calls that keep going, notifications, and saving files. The page uses it
  through Capacitor's bridge when it's there.
- Both apps open rainlit.app unless you pick another Rainlit server
  (`desktop/servers.js`, `ServerChoice.java`); servers answer
  `/api/server-info` so the apps can tell they've found one.
- `Dockerfile`, `docker-compose.yml`, `Caddyfile` and `render.yaml` are for
  running your own (see [SELF-HOSTING.md](SELF-HOSTING.md)).
- `brand/` holds the logo and icon source files.

## License

Rainlit is free software under the [GNU AGPL v3](LICENSE) (or any later version). You can
run it, change it and share it. If you run a changed version for other people, share your
changes with them too: set `SOURCE_URL` to where your version's code is, and Settings
links there. The emoji picker in `public/vendor/emoji-picker` keeps its own license
(Apache 2.0).

The license covers the code, not the Rainlit name and drop logo. Running Rainlit and
calling it Rainlit is fine; a changed version you share with others should go by its own
name, so nobody mistakes one for the other.

Found a security problem? Please email rainlit.app@gmail.com rather than opening a public
issue (see [SECURITY.md](SECURITY.md)).
