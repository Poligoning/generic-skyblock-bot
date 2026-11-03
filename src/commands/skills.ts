import { emoji } from "../lib/emoji.js";
import { playerCommand } from "../lib/command.js";
import { skills, skillsApiEnabled } from "../lib/context.js";
import { baseEmbed } from "../lib/embed.js";
import { short, titleCase } from "../lib/format.js";
import { COSMETIC_SKILLS, SKILLS, levelWithProgress, type Level } from "../lib/leveling.js";
import { dungeonsSummary } from "../lib/dungeons.js";

const ORDER = ["combat", "farming", "fishing", "mining", "foraging", "enchanting", "alchemy", "carpentry", "runecrafting", "taming", "social", "hunting"] as const;

function field(icon: string, label: string, l: Level) {
  const value = l.maxed ? `**${short(l.xp)}**` : `**${short(l.xpCurrent)}** / ${short(l.xpForNext)} XP`;
  return { name: `${icon} ${label} ${l.level}`, value, inline: true };
}

export const skillsCommand = playerCommand({
  name: "skills",
  description: "Skill levels, XP and progress",
  render(ctx) {
    const embed = baseEmbed(ctx, "Skills");
    if (!skillsApiEnabled(ctx)) return { embeds: [embed.setDescription("This player has their **Skills API** turned off.")] };
    const all = skills(ctx);
    const main = SKILLS.filter((s) => !COSMETIC_SKILLS.includes(s));
    const avg = main.reduce((a, s) => a + all[s].level, 0) / main.length;
    const avgProgress = main.reduce((a, s) => a + levelWithProgress(all[s]), 0) / main.length;
    const totalXp = main.reduce((a, s) => a + all[s].xp, 0);
    embed.setDescription(`Skill Average: **${avg.toFixed(2)}** (\`${avgProgress.toFixed(2)}\`)\nTotal XP: **${short(totalXp)}**`);
    embed.addFields(
      ...ORDER.map((s) => field(emoji(`skill_${s}`, "▫️"), titleCase(s), all[s])),
      field(emoji("skill_dungeoneering", "💀"), "Dungeoneering", dungeonsSummary(ctx).catacombs),
    );
    return { embeds: [embed] };
  },
});
