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

## Stage 2: Communities (done)

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
- [x] Blocking and reporting: blocked people can't be your friends or message you, and their
      messages in spaces fold away; messages and people can be reported to a space's
      moderators and the server's admin
- [x] Mentions (@name, and @everyone for roles allowed to), with their own counts, and
      notifications from spaces: all messages, only mentions, or nothing, each space

## Stage 3: Voice channels and group calls (in progress)

Drop-in voice channels, and calls with more than two people. Past a few people, calls go
through a media server instead of directly between everyone. That's LiveKit: open source,
so people running their own Rainlit can run it too, or use LiveKit Cloud.

- [x] Voice channels in spaces: join and leave any time, mute and deafen, video and screen
      sharing, push to talk, who's in each one in the sidebar, and end-to-end encryption
      (the media server can't listen in)
- [x] Voice permissions: who can join, who can talk (or only listen), private voice
      channels, and timeouts and kicks that reach voice too
- [x] Groups: up to 10 friends with a chat and a call of their own (anyone in one can add
      their friends and name it), where starting a call rings everyone
- [ ] LiveKit alongside Rainlit in the Docker setup, for one-piece self-hosting

## Stage 4: Open the doors

Free accounts on rainlit.app for anyone, no invite code needed. What has to be in place
first:

- [ ] A setting that opens sign-ups (on for rainlit.app; servers people run themselves
      stay invite-only unless they turn it on)
- [ ] Protection against spam accounts: checking email addresses, and limits on sign-ups
- [ ] Password-reset emails (the admin can't make reset links by hand for everyone)
- [ ] Terms of service and a privacy policy in plain language (what Rainlit keeps, why,
      and for how long), and a minimum age
- [ ] Reports that reach whoever runs the server, and tools to act on them
- [ ] Limits that keep free affordable, mainly on file sizes (Discord's free limit is
      10 MB)
- [ ] Bring a Discord server over: paste a Discord server template link and get a space
      with the same channels, roles and permissions
- [ ] A "Switching from Discord" page: what works the same, what's different, and how to
      move a community over

## Stage 5: One account everywhere, and bots

- Your rainlit.app account signs you in on every Rainlit server, so joining a community
  that runs its own is one click on an invite link.
- Take your space with you: move a space from rainlit.app to your own server (or back),
  with its members and history.
- The apps keep a list of your servers, like Discord's sidebar.
- A bot API: bot accounts, events, slash commands. Close enough to Discord's that
  existing bots are easy to bring over, and adding bots to a space is always free.

## Stage 6: Keeping it going, fairly

- Only once Rainlit has a solid foundation and people using it: a supporter tier, never
  more than $5 a month and with the price shown up front, that pays for the free tier: cosmetics
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
