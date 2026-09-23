# Discord Bot

Personal bot with an architecture designed to host several independent features:

- **livechat** (`src/features/livechat`) : relays live reactions (gif/image/video/text) to a dedicated channel while streaming. *Available.*
- **music** (`src/features/music`) : playback from YouTube links/search and Spotify track links. *Available.*
- **stats** (`src/features/stats`) : LoL stat tracker — on-demand lookup plus auto-posted match results with pre-made messages based on the score. *Available.*

## Architecture

```
src/
  bot/            # Discord client, interaction routing
  features/       # one feature = one folder (commands + dedicated services)
  shared/         # config, logger, storage, shared types
  scripts/        # one-off scripts (command deployment)
```

## Setup

```
npm install
cp .env.example .env
```

Fill in `.env`:

- `DISCORD_TOKEN` / `DISCORD_CLIENT_ID`: from the [Discord Developer Portal](https://discord.com/developers/applications), Bot / General Information tabs of your application.
- `DISCORD_GUILD_ID`: your personal server's ID (right-click the server > Copy ID, requires Developer Mode enabled in Discord). Leave empty later for a global deployment on your friends' server.
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (optional, only for Spotify links in `/play`): create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and copy its Client ID / Client Secret. Any redirect URI works, it's unused. Without these, YouTube links and search still work fine.
- `RIOT_API_KEY` (optional, only for the LoL stats feature): generate a development key at the [Riot Developer Portal](https://developer.riotgames.com/) (valid 24h, regenerate it each dev session; apply for a personal key for long-term use). Without it, the `/lol-*` commands reply with an error and the match tracker stays idle.

`npm install` also downloads a `yt-dlp` binary into `bin/` (used by the music feature to resolve and stream audio). This happens automatically via the `postinstall` script; if it fails (no internet access, firewall), download it manually from the [yt-dlp releases page](https://github.com/yt-dlp/yt-dlp/releases/latest) and place it in `bin/` as `yt-dlp.exe` (Windows) or `yt-dlp` (macOS/Linux).

## Invite the bot to your test server

In the Developer Portal, OAuth2 > URL Generator tab:

- scopes: `bot`, `applications.commands`
- minimum permissions: `Send Messages`, `Embed Links`, `Attach Files`, `Manage Guild` (needed to test `/livechat-config`), `Connect`, `Speak` (needed for the music feature)

Open the generated URL and select your personal server.

## Running the bot

```
npm run deploy:commands   # registers the slash commands (instant with DISCORD_GUILD_ID set)
npm run dev               # runs the bot in watch mode
```

## Using the livechat feature

1. An admin configures the relay channel: `/livechat-config channel:#live-chat`
2. Viewers send their reactions: `/react gif`, `/react image`, `/react video` (file or URL) or `/react text message:...`
3. The streamer keeps `#live-chat` open next to the game to watch reactions roll in.

## Using the music feature

1. Join a voice channel.
2. `/play query:<YouTube URL, Spotify track URL, or search term>` — joins your channel and queues the track.
3. `/skip`, `/stop` (leaves the channel and clears the queue), `/queue` (shows what's playing and up next).

Playlists (YouTube or Spotify) aren't supported yet — only single tracks and search terms.

**Reliability note**: YouTube extraction is the fragile part of any Discord music bot right now — YouTube actively fights programmatic access, and previously-popular libraries (`play-dl`, `@distube/ytdl-core`) were abandoned in 2025 because of it. This project uses `yt-dlp`, which is updated continuously to keep up, but expect the occasional break. If playback suddenly stops working, try re-running `node scripts/downloadYtDlp.js` after deleting the `bin/` folder to fetch the latest `yt-dlp` build.

## Using the LoL stats feature

1. Each player links their Riot account: `/lol-link riot-id:Name#Tag region:<your region>`.
2. `/lol-stats [player:@someone]` looks up the most recent match for a linked account on demand (defaults to yourself) — champion, KDA, CS, KP%, level, duration, ranked standing (with a rank emblem next to it), and a summoner spells/runes/items loadout image.
3. `/lol-leaderboard` ranks every linked account in the server by their best queue (Solo/Duo or Flex), medals for the top 3.
4. An admin configures the announce channel: `/lol-config channel:#lol-stats`.
5. Every 5 minutes, the bot checks each linked account for a new match and, if one finished, auto-posts a result embed to every server's configured channel the player is a member of. The very first check after linking only records a baseline — it won't announce old history.
6. Daily (22:00), weekly (Monday 22:00) and monthly (1st of the month, 22:00 — all the bot process's local time) recap embeds are posted to each configured channel: gains/losses in ranked LP over that period, split by queue, with the most and least performant players. LP is tracked as one continuous score across tier/division boundaries, so promotions and demotions don't throw off the numbers. Players with no ranked games in the period are left out. Edit `RECAP_HOUR` in `lolDailyRecap.service.ts` / `lolWeeklyRecap.service.ts` / `lolMonthlyRecap.service.ts` to change the times.
7. `/lol-unlink` removes your link.

Supported regions: EU West, EU Nordic & East, North America, Korea, Brazil (see `src/features/stats/lol.types.ts` to add more).

Champion/item/summoner spell/rune icons come from Data Dragon; rank emblems come from Community Dragon and are uploaded once as Discord "application emojis" (bot-wide, shown inline next to rank text) — see `src/features/stats/lolRankEmoji.ts`. The match summary embed's items/spells/runes loadout is rendered as a composite image via `@napi-rs/canvas` (`lolLoadoutImage.ts`), since a Discord embed can only carry one image.

## Moving from your personal server to your friends' server

1. Remove `DISCORD_GUILD_ID` from `.env` (or leave it empty).
2. Run `npm run deploy:commands` again for a global deployment (propagation up to 1h).
3. Generate a new OAuth2 invite URL and add the bot to your friends' server.
