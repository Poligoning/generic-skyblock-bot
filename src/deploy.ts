import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { REST, Routes } from "discord.js";
import { loadCommands } from "./commands/index.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) throw new Error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required in .env");

const body = [...(await loadCommands()).values()].map((c) => c.data.toJSON());
const target = DISCORD_GUILD_ID ? `guild ${DISCORD_GUILD_ID}` : "global";
const hash = createHash("sha256").update(JSON.stringify({ target, client: DISCORD_CLIENT_ID, body })).digest("hex");
const STATE = "data/commands.hash";

let previous = "";
try {
  previous = readFileSync(STATE, "utf8").trim();
} catch {}

if (previous === hash && !process.argv.includes("--force")) {
  console.log(`Commands unchanged (${body.length}), skipping registration`);
} else {
  const rest = new REST().setToken(DISCORD_TOKEN);
  const route = DISCORD_GUILD_ID ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID) : Routes.applicationCommands(DISCORD_CLIENT_ID);
  await rest.put(route, { body });
  mkdirSync("data", { recursive: true });
  writeFileSync(STATE, hash);
  console.log(`Registered ${body.length} commands (${target})`);
}
