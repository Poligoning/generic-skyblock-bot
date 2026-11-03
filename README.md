# Generic Skyblock Bot

A Hypixel SkyBlock stats bot for Discord, written in TypeScript with discord.js v14.

## Setup

Requires Node.js 22+.

1. Create an application at https://discord.com/developers/applications and copy its Application ID and bot token.
2. `cp .env.example .env` and fill it in:
   - `SKYBLOCK_API_KEY` / `SKYBLOCK_API_BASE`: a SkyBlock data API that serves `/{name}` (Hypixel player) and `/{name}/skyblock` (Hypixel SkyBlock profiles) with an `apiKey` query parameter.
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`: from the developer portal.
   - `DISCORD_GUILD_ID` (optional): registers commands instantly in one server instead of globally.
3. Invite the bot: `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot+applications.commands&permissions=0`
4. Install and run:

```sh
npm install
npm run emojis   # upload/update emojis
npm run deploy   # register slash commands
npm start
```

## For AI
- `npm run preview -- <command|all> <name> [profile|-] [view]` renders commands against live data without Discord and writes a Discord-style HTML preview to `preview/`. It flags embed limit problems with `!!`.
- `npm run typecheck`
