import { emoji } from "./emoji.js";
import { EmbedBuilder } from "discord.js";
import { gameModeIcon, type Ctx } from "./context.js";

export const FOOTER = "made w <3 and a lot of tokens";
export const COLOR = 0x5865f2;
export const ERROR_COLOR = 0xed4245;

export function avatar(uuid: string): string {
  return `https://mc-heads.net/body/${uuid}/left`;
}

export function head(uuid: string): string {
  return `https://mc-heads.net/avatar/${uuid}/64`;
}

export const ANON_SKIN = "https://mc-heads.net/body/MHF_Steve/left";

export function embedTitle(ctx: Ctx, title: string): string {
  if (ctx.anon) return `Anonymous ${title}${gameModeIcon(ctx.profile)}`;
  return `${ctx.name}'s ${title} on ${ctx.profile.cute_name ?? "Unknown"}${gameModeIcon(ctx.profile)}`;
}

export function baseEmbed(ctx: Ctx, title: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(embedTitle(ctx, title))
    .setThumbnail(ctx.anon ? ANON_SKIN : avatar(ctx.uuid))
    .setFooter({ text: FOOTER })
    .setTimestamp(ctx.account.fetchedAt);
  if (!ctx.anon) embed.setURL(`https://sky.shiiyu.moe/stats/${ctx.name}/${encodeURIComponent(ctx.profile.cute_name ?? "Unknown")}`);
  return embed;
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(ERROR_COLOR).setDescription(`${emoji("missing", "❌")} ${message}`.slice(0, 4096));
}
