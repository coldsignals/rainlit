# Rainlit roadmap

Where Rainlit is headed: a place for your people that's as easy as Discord, that you
(or your community) can run yourselves, and where calls just work.

Why self-hosted: each community runs its own server, so each keeps its own space, rules
and data, and nobody has to pay for (or police) everyone's conversations in one place.
Why not Matrix: it's self-hostable, but it's not pleasant to use and its calls struggle.
Rainlit's calls have been hardened the hard way (reconnecting, relays, phones pausing
apps, switching devices), and that's the part to keep getting right.

## Stage 1: Anyone can run their own Rainlit (done)

- [x] Settings for running your own (data folder, name, relay, GIFs) and a first-run
      setup code for the admin account
- [x] One-click deploy on Render (`render.yaml`), and Docker with automatic `https://`
      (`docker-compose.yml`, `Caddyfile`)
- [x] The apps can switch to any Rainlit server (Windows 1.1.0, Android 1.4.0)
- [x] [SELF-HOSTING.md](SELF-HOSTING.md): setting up, the relay, backups, updating
- [x] The code is public, under the GNU AGPL v3 ([LICENSE](LICENSE))

## Stage 2: Communities

Servers with more than two people: text channels, roles and permissions, invite links
anyone can open, and moderation tools for the people running them (kick, ban, timeout,
an audit log). Blocking and reporting.

## Stage 3: Voice channels and group calls

Drop-in voice channels, and calls with more than two people. Past a few people, calls go
through a media server instead of directly between everyone (bundled with each Rainlit
server; LiveKit is the likely choice), so hosting stays one piece.

## Stage 4: One account everywhere, and bots

- A small central Rainlit account service, so one sign-in works on every Rainlit server,
  and joining another community is one click on an invite link. It holds accounts, not
  conversations.
- The apps keep a list of your servers, like Discord's sidebar.
- A bot API: bot accounts, events, slash commands. Close enough to Discord's that
  existing bots are easy to bring over.

## Stage 5: Keeping it going, fairly

- A supporter tier, never more than $5 a month: cosmetics that show on every server
  (profile themes, badges, animated avatars, name colors, app themes) and perks that
  cost real money to provide (bigger uploads, higher-quality streams through the relay).
  Nothing that communities could do on their own servers is ever paywalled.
- Maybe "Rainlit Cloud": servers hosted for communities that don't want to run their
  own, for a few dollars a month (members can chip in), with no lock-in: export your
  whole server and run it yourself any time.

## Along the way

- Notifications on Android through Google too (for people who won't install ntfy)
- Code-signing the Windows installer (no more "Windows protected your PC")
- Screen sharing from Android
- Password-reset emails
- End-to-end encrypted conversations
