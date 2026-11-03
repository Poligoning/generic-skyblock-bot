import { playerCommand } from "../lib/command.js";
import { baseEmbed } from "../lib/embed.js";
import { commas } from "../lib/format.js";
import { slayerSummary } from "../lib/slayers.js";

export const slayersCommand = playerCommand({
  name: "slayers",
  description: "Slayer levels, XP and boss kills",
  render(ctx) {
    const s = slayerSummary(ctx);
    const embed = baseEmbed(ctx, "Slayers");
    if (!s.totalXp && !s.totalKills) return { embeds: [embed.setDescription(`**${ctx.name}** hasn't started any Slayer quests on this profile yet.`)] };
    embed.setDescription(
      `**${s.slayers.map((sl) => sl.level.level).join(" / ")}**\nTotal Slayer XP: **${commas(s.totalXp)}**`,
    );
    const NAMES: Record<string, string> = { zombie: "Revenant", spider: "Tarantula", wolf: "Sven", enderman: "Enderman", vampire: "Vampire", blaze: "Blaze" };
    for (const sl of s.slayers) {
      const l = sl.level;
      const value = [
        `Next Level: **${l.maxed ? "MAX" : commas(l.xpForNext - l.xpCurrent)}**`,
        `Total XP: **${commas(l.xp)}**`,
        ...sl.kills.map((kills, tier) => `Tier ${["I", "II", "III", "IV", "V"][tier]}: **${commas(kills)}**`),
      ].filter(Boolean).join("\n");
      embed.addFields({ name: `${sl.emoji} ${NAMES[sl.id] ?? sl.short} ${l.level}`, value, inline: true });
    }
    return { embeds: [embed] };
  },
});
