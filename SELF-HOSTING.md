# Run your own Rainlit

Anyone can run their own Rainlit: your own private place for calls, chat and files, for
your friends or your community. Your server keeps its own accounts and conversations, and
you're its admin. It's invite-only, so only people you invite can get in.

The Windows and Android apps work with any Rainlit server (step 8), and in a browser
people just open your server's address.

You need one of these:

- **Render** (easiest, no computer of your own needed): about $7 a month.
- **Any computer or server with Docker**, and a domain name: a small cloud server is
  about $4–6 a month, or free on a computer you already have that stays on.

## 1. The easy way: Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/coldsignals/rainlit)

1. Make a GitHub account, and **fork** this repository (the **Fork** button at the top of
   its GitHub page). Your fork is your copy; updating it later is one click (step 10).
2. Make an account at https://render.com, then press the **Deploy to Render** button
   above (or in Render: **New → Blueprint**, and pick your fork).
3. Render reads `render.yaml` and sets up everything: a **Starter** instance (a few
   dollars a month; the free one can't keep a disk) with a 1 GB disk for accounts and
   files. Press **Apply**.
4. After a minute or two, your Rainlit is at an address like
   `https://rainlit-xxxx.onrender.com`. Go on to step 3.

Prefer to set it up by hand? **New → Web Service**, pick your fork, then: build command
`npm ci --omit=dev`, start command `node server.js`, instance type **Starter**, a **Disk**
mounted at `/var/data`, and an environment variable `DATA_DIR` = `/var/data`.

**Your own address (optional):** in Render, open the service's **Settings → Custom
Domains**, add your domain, and follow what it says to add at your domain's registrar
(usually an **A** record for the bare domain and a **CNAME** for `www`). The `https://`
certificate follows by itself.

## 2. The other way: Docker, on your own computer or server

You need a machine that stays on, with [Docker](https://docs.docker.com/engine/install/)
installed, and a domain (or subdomain, like `chat.yourname.com`) pointed at it. Rainlit
needs `https://` for calls, and this sets it up for you with a free certificate.

1. At your domain's registrar, add an **A** record pointing your domain (or subdomain) at
   the machine's public IP address. On a home connection, forward ports **80** and **443**
   on your router to the machine.
2. Download this repository onto the machine (`git clone`, or GitHub's **Code → Download
   ZIP**) and open a terminal in its folder.
3. Copy `.env.example` to `.env` and fill it in. Only `DOMAIN` is needed to start.
4. Run `docker compose up -d`. The first time takes a minute or two.
5. Your Rainlit is at `https://` your domain. Go on to step 3.

Everything is kept in a Docker volume (`rainlit-data`), so it survives restarts and
updates.

## 3. Make the admin account

The first account is the admin. To make sure it's you, it needs a **setup code** that's
only printed in the server's logs:

- **Render:** your service, then **Logs**.
- **Docker:** `docker compose logs rainlit`

Open your Rainlit, press **Sign up**, and use that code. After that, the code is gone.

## 4. Invite people

Press the key button next to your name, then **Make an invite**. A message with your
Rainlit's address and a one-time code is copied, ready to paste to a friend. They sign up
with it, then add each other (or you) by username. If someone forgets their password, the
same panel makes them a reset link.

## 5. Make calls work on every network (recommended)

Most of the time, calls connect directly between people. Some mobile networks and home
routers block that, and the call gets stuck on "Connecting". A relay (a TURN server)
fixes it by passing the call through a middle point when it has to. Cloudflare's has a
generous free allowance:

1. Make a free account at https://dash.cloudflare.com
2. In the sidebar, open **Realtime**, then under **TURN Server**, click **Create**.
3. Copy the **Turn Token ID** and the **API Token**, and add them as `CF_TURN_KEY_ID` and
   `CF_TURN_API_TOKEN`: in Render under your service's **Environment**, or in your `.env`
   file (then `docker compose up -d` again).

Keep these private. Using another TURN server instead? Set `TURN_URLS` (comma-separated),
`TURN_USERNAME` and `TURN_CREDENTIAL`.

If calls drop and you want to know why, ask the people in them to turn on **Settings >
Call debug log**. Their apps then note what happens to each call's connection (never
what's said) and send it to your server. Under **Invites and accounts > Call debug
logs**, you can download both sides of their calls, and what your server saw, as one
timeline. The notes are kept for a week.

## 6. Turn on GIFs (optional)

The GIF button searches [KLIPY](https://klipy.com), a free GIF library, and needs a key: at
https://klipy.com/developers, press **Create API Key**, make a free account, and create a
key in its Partner Panel under **API Keys**. Add it as `KLIPY_API_KEY`. A new key allows
100 searches an hour, shared by everyone on your Rainlit; if that's not enough, ask for
production access in the Partner Panel (free).

## 7. Give it a name (optional)

Set `SERVER_NAME` (for example `Moonlight Cove`), and it shows on the sign-in page and in
the apps, so people know where they are.

## 8. Use the apps with your Rainlit

- **Windows** (from https://rainlit.app/download) and **Android** (from
  https://rainlit.app/android): open the app, and on the sign-in screen press **Use a
  different Rainlit server**, then type your Rainlit's address. Already signed in
  somewhere? **Settings → Server → Change**. To go back: the same place, or on Windows,
  the tray menu.
- **Browsers:** just open your Rainlit's address.
- **Notifications on Android** while the app is closed need
  [ntfy](https://ntfy.sh/docs/subscribe/phone/) installed (free, no Google needed), same
  as on rainlit.app.

## 9. Backups

Everything (accounts, conversations, files, and the keys for notifications) is in one
folder: the Render disk, or the Docker volume. Keep a copy now and then:

- **Render:** disks are snapshotted daily; you can restore one from the disk's page.
  For your own copy, use the service's **Shell** tab to make a zip of `/var/data`.
- **Docker:** `docker compose cp rainlit:/data ./rainlit-backup` copies it all into a
  `rainlit-backup` folder.

## 10. Updating

- **Render:** on your fork's GitHub page, press **Sync fork**. Render sees the change and
  updates your Rainlit by itself. (Calls in progress carry on.)
- **Docker:** in the folder, `git pull` (or download the new ZIP over the old folder),
  then `docker compose up -d --build`.

When an update needs to change the database, Rainlit first saves a copy of it as it was
in the `backups` folder inside the data folder. The newest three copies are kept.

## 11. Turn on voice channels and group calls (optional)

Voice channels (drop-in rooms in a space, for any number of people, with video and screen
sharing) and group calls (a group of friends calling together) go through
[LiveKit](https://livekit.io): a media server in the middle that everyone in a call
connects to. Without it, everything else works: spaces just don't offer voice channels, and
groups have their chat but no call button. (Calls between two friends don't need it.)

- **LiveKit Cloud** (easiest; it has a free tier): make an account at
  https://cloud.livekit.io and create a project. In the project's settings, make an API
  key. You'll have three things: the project's URL (it starts with `wss://`), the API key,
  and its secret. Add them as `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`: on
  Render under your service's **Environment**, or in your `.env` file (then
  `docker compose up -d` again).
- **Your own LiveKit, with the Docker setup** (step 2): it comes with it. In your `.env`,
  set these, then `docker compose up -d` again:
  ```
  COMPOSE_PROFILES=voice
  LIVEKIT_URL=wss://chat.example.com/livekit
  LIVEKIT_API_URL=http://livekit:7880
  LIVEKIT_API_KEY=rainlit
  LIVEKIT_API_SECRET=a-long-random-secret-of-at-least-32-characters
  ```
  Use your own domain in `LIVEKIT_URL` (with `/livekit` on the end), and make up a secret:
  `openssl rand -hex 24` makes a good one. Then let **TCP 7881** and **UDP 7882** through
  to the machine (on a home connection, forward them on your router, like 80 and 443).
  That's where the sound and video go; everything else goes through `https://` as usual.
- **Your own LiveKit server, elsewhere:** it's free software too
  (https://docs.livekit.io/home/self-hosting/deployment/). It needs its own network ports,
  so it runs on a server of your own, not on Render. Point the same three settings at it.

Keep the secret private. The sound and video in voice channels and group calls are
end-to-end encrypted with a key only your Rainlit hands out, so LiveKit (or whoever runs
it) can't listen in.

## All the settings

| Setting | What it does |
| --- | --- |
| `DATA_DIR` | Where everything is kept. Render: `/var/data`. Docker: set for you. |
| `PORT` | The port the server listens on (3000 unless your host sets it). |
| `PUBLIC_URL` | Your Rainlit's address, like `https://chat.example.com`. Render and the Docker setup fill it in for you. |
| `SERVER_NAME` | Your Rainlit's name, on the sign-in page and in the apps. |
| `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN` | Cloudflare's call relay (step 5). |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Another call relay instead. |
| `KLIPY_API_KEY` | GIFs (step 6). |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Voice channels and group calls (step 11). |
| `LIVEKIT_API_URL` | Where Rainlit reaches LiveKit's controls, if not at `LIVEKIT_URL` (`http://livekit:7880` with LiveKit in the Docker setup). |
| `COMPOSE_PROFILES` | Docker only: `voice` runs LiveKit alongside Rainlit (step 11). |
| `MAX_FILE_MB` | The biggest file people can send, in MB (100 to start with). |
| `LINK_PREVIEWS` | `off` turns off link previews (an X post, a video, or a page's title and picture under links in messages). They're on to start with: your server fetches the links people send, and passes their pictures along. |
| `RECONNECT_MINUTES` | How long someone who dropped out of a call can take to come back (30). |
| `SOURCE_URL` | Only if you've changed Rainlit's code: where your version's code is. Rainlit's license (the AGPL) asks that the people using a changed version can get it; Settings links there. |

## Being in charge

Your Rainlit, your rules: you decide who gets an invite, and you can remove accounts from
the admin panel. People's conversations and files are on your server, not end-to-end
encrypted, so run it for people who trust you, keep your server's keys and passwords to
yourself, and keep it updated.
