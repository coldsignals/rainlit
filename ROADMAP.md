# Rainlit roadmap

Where Rainlit is headed: a place for your people that's as easy as Discord and free to
start, where calls just work, and where any community can pick up its place and run it
themselves.

- **rainlit.app is the front door.** A free account, free spaces (Rainlit's servers), one
  click to make one, and an invite link for your friends. Nobody should have to pay for
  something they haven't tried.
- **Running your own is the way out, not the way in.** Rainlit is free software. A
  community that wants its own rules, its own data or just its own place can run its own
  Rainlit ([SELF-HOSTING.md](SELF-HOSTING.md)), and later bring its space along.
- **Why not Matrix:** it's self-hostable, but it's not pleasant to use and its calls
  struggle. Rainlit's calls have been hardened the hard way (reconnecting, relays, phones
  pausing apps, switching devices), and that's the part to keep getting right.

## Stage 1: Anyone can run their own Rainlit (done)

- [x] Settings for running your own (data folder, name, relay, GIFs) and a first-run
      setup code for the admin account
- [x] One-click deploy on Render (`render.yaml`), and Docker with automatic `https://`
      (`docker-compose.yml`, `Caddyfile`)
- [x] The apps can switch to any Rainlit server (Windows 1.1.0, Android 1.4.0)
- [x] [SELF-HOSTING.md](SELF-HOSTING.md): setting up, the relay, backups, updating
- [x] The code is public, under the GNU AGPL v3 ([LICENSE](LICENSE))

## Stage 2: Communities (in progress)

Groups with more than two people. On Rainlit they're called spaces, and one Rainlit
server can hold many of them, the way Discord holds many servers.

- [x] Spaces with text channels: anyone can make one, and anyone on the server can
      join with an invite link
- [x] Profiles you can open for anyone in your spaces, and First Leaf: a badge for
      everyone who joins during the alpha
- [x] Roles and permissions: roles with names, colors and an order; what @everyone can
      do; private channels, and channels only some roles post in
- [x] Moderation for the people running a space: kick, ban (and clear away their recent
      messages), timeout, deleting others' messages, and a log of who did what
- [ ] Blocking and reporting
- [ ] Mentions, and notifications from spaces

## Stage 3: Open the doors

Free accounts on rainlit.app for anyone, no invite code needed. What has to be in place
first:

- [ ] A setting that opens sign-ups (on for rainlit.app; servers people run themselves
      stay invite-only unless they turn it on)
- [ ] Protection against spam accounts: checking email addresses, and limits on sign-ups
- [ ] Password-reset emails (the admin can't make reset links by hand for everyone)
- [ ] Terms of service, a privacy policy, and a minimum age
- [ ] Reports that reach whoever runs the server, and tools to act on them
- [ ] Limits that keep free affordable, mainly on file sizes (Discord's free limit is
      10 MB)

## Stage 4: Voice channels and group calls

Drop-in voice channels, and calls with more than two people. Past a few people, calls go
through a media server instead of directly between everyone (bundled with each Rainlit
server; LiveKit is the likely choice), so hosting stays one piece. The media server can
relay calls too, which should let people running their own skip setting up a separate
relay.

## Stage 5: One account everywhere, and bots

- Your rainlit.app account signs you in on every Rainlit server, so joining a community
  that runs its own is one click on an invite link.
- Take your space with you: move a space from rainlit.app to your own server (or back),
  with its members and history.
- The apps keep a list of your servers, like Discord's sidebar.
- A bot API: bot accounts, events, slash commands. Close enough to Discord's that
  existing bots are easy to bring over.

## Stage 6: Keeping it going, fairly

- A supporter tier, never more than $5 a month, that pays for the free tier: cosmetics
  that show on every server (profile themes, badges, animated avatars, name colors, app
  themes) and perks that cost real money to provide (bigger uploads, higher-quality
  streams through the relay). Talking to your friends and running a community stay free,
  and nothing that communities could do on their own servers is ever paywalled.
- Maybe "Rainlit Cloud": servers hosted for communities that outgrow what's free on
  rainlit.app and don't want to run their own, for a few dollars a month (members can
  chip in), with no lock-in: export your whole server and run it yourself any time.

## Along the way

- Notifications on Android through Google too (for people who won't install ntfy)
- Code-signing the Windows installer (no more "Windows protected your PC")
- Screen sharing from Android
- End-to-end encrypted conversations
