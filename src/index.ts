import { Client, Events, GatewayIntentBits, MessageFlags, type Interaction } from "discord.js";
import { UserError } from "./lib/api.js";
import { errorEmbed } from "./lib/embed.js";
import { loadCommands } from "./commands/index.js";
import { startPriceUpdater } from "./lib/networth.js";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is missing from .env");

const commands = await loadCommands();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => console.log(`Logged in as ${c.user.tag} with ${commands.size} commands`));
client.on(Events.Error, (err) => console.error(err));

client.on(Events.InteractionCreate, async (i: Interaction) => {
  try {
    if (i.isAutocomplete()) return await commands.get(i.commandName)?.autocomplete?.(i);
    if (i.isChatInputCommand()) return await commands.get(i.commandName)?.run(i);
    if (i.isModalSubmit()) {
      const [name, ...args] = i.customId.split(":");
      return await commands.get(name)?.modal?.(i, args);
    }
    if (i.isMessageComponent()) {
      const [name, ...args] = i.customId.split(":");
      return await commands.get(name)?.component?.(i, args);
    }
  } catch (err) {
    if (!(err instanceof UserError)) console.error(err);
    if (i.isAutocomplete()) return;
    try {
      const payload = { embeds: [errorEmbed(err instanceof UserError ? err.message : "Something went wrong. Try again in a bit.")] };
      if (i.deferred && !i.replied && (i.isChatInputCommand() || (i.isModalSubmit() && !i.isFromMessage()))) {
        try {
          await i.deleteReply();
        } catch {
          await i.editReply(payload);
          return;
        }
        await i.followUp({ ...payload, flags: MessageFlags.Ephemeral });
      } else if (i.deferred || i.replied) await i.followUp({ ...payload, flags: MessageFlags.Ephemeral });
      else await i.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } catch {}
  }
});

await client.login(token);
startPriceUpdater();
