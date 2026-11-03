import type { APIEmbedField } from "discord.js";
import { emoji } from "../lib/emoji.js";
import { playerCommand } from "../lib/command.js";
import type { Json } from "../lib/api.js";
import type { Ctx } from "../lib/context.js";
import { baseEmbed } from "../lib/embed.js";
import { commas, short, titleCase } from "../lib/format.js";
import { CLASSES, dungeonsSummary } from "../lib/dungeons.js";
import { levelWithProgress } from "../lib/leveling.js";
import { neu } from "../lib/neu.js";

const MM = "_mm";
const BOSSES = [
  ["The Watcher", "boss_watcher"], ["Bonzo", "boss_bonzo"], ["Scarf", "boss_scarf"], ["The Professor", "boss_professor"],
  ["Thorn", "boss_thorn"], ["Livid", "boss_livid"], ["Sadan", "boss_sadan"], ["Necron", "boss_necron"],
] as const;
const SPACER: APIEmbedField = { name: "​", value: "​", inline: true };

function time(ms: number): string {
  const cs = Math.floor(ms / 10);
  const s = Math.floor(cs / 100);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function bossName(f: number): string {
  return `${emoji(BOSSES[f][1], "💀")} ${BOSSES[f][0]}`;
}

function floorRange(master: boolean): number[] {
  return Array.from({ length: master ? 7 : 8 }, (_, i) => (master ? i + 1 : i));
}

function twoPerRow(fields: APIEmbedField[]): APIEmbedField[] {
  return fields.flatMap((f, i) => (i % 2 === 1 ? [f, SPACER] : [f]));
}

function info(ctx: Ctx, master: boolean) {
  const d = dungeonsSummary(ctx);
  const embed = baseEmbed(ctx, master ? "Master Mode Catacombs" : "Catacombs");
  const cata = d.catacombs;
  const table: number[] = neu.leveling.catacombs;
  const max = table.slice(0, 50).reduce((a, b) => a + b, 0);
  const frac = Math.min(1, cata.xp / max);
  const filled = Math.floor(frac * 10);
  const progress = cata.maxed ? "" : ` (\`${short(cata.xpCurrent, 1)}\`/\`${short(cata.xpForNext, 1)}\`)`;
  const classAvg = CLASSES.reduce((a, c) => a + d.classes[c].level, 0) / CLASSES.length;
  embed.setDescription(
    [
      `${emoji("catacombs", "💀")} Catacombs: **${(cata.maxed ? d.overflowLevel : levelWithProgress(cata)).toFixed(1)}**${progress} \`${short(cata.xp, 1)}\``,
      `${emoji("secrets", "🔍")} Secrets found: **${commas(d.secrets)}** (Per Run: **${d.secretsPerRun.toFixed(2)}**)`,
      `${emoji("skill_dungeoneering", "📊")} Class Average: **${classAvg.toFixed(1)}** (\`${d.classAverage.toFixed(1)}\`)`,
      `${emoji("pane_green", "🟩").repeat(filled)}${emoji("pane_gray", "⬜").repeat(10 - filled)} (${(frac * 100).toFixed(1)}% of level 50 maxed)`,
    ].join("\n"),
  );
  const type: Json = ctx.member.dungeons?.dungeon_types?.[master ? "master_catacombs" : "catacombs"] ?? {};
  for (const f of floorRange(master)) {
    const k = String(f);
    const kills = type.tier_completions?.[k] ?? 0;
    const splus = type.fastest_time_s_plus?.[k];
    const pb = type.fastest_time?.[k];
    const line = splus ? `PB S+: **${time(splus)}**` : pb ? `PB Time: **${time(pb)}**` : "PB Time: **/**";
    embed.addFields({ name: bossName(f), value: `Kills: **${commas(kills)}**\n${line}`, inline: true });
  }
  return embed;
}

function classes(ctx: Ctx) {
  const d = dungeonsSummary(ctx);
  const embed = baseEmbed(ctx, "Catacombs Classes");
  const classAvg = CLASSES.reduce((a, c) => a + d.classes[c].level, 0) / CLASSES.length;
  embed.setDescription(`${emoji("skill_dungeoneering", "📊")} Class Average: **${classAvg.toFixed(1)}** (\`${d.classAverage.toFixed(1)}\`)`);
  for (const c of ["mage", "berserk", "archer", "tank", "healer"] as const) {
    const l = d.classes[c];
    const progress = l.maxed ? "" : `\n\`${short(l.xpCurrent, 1)}\`/\`${short(l.xpForNext, 1)}\``;
    embed.addFields({ name: `${emoji(`class_${c}`, "▫️")} ${titleCase(c)} ${l.level}`, value: `Experience: **${short(l.xp, 1)}**${progress}`, inline: true });
  }
  return embed;
}

function collections(ctx: Ctx, master: boolean) {
  const embed = baseEmbed(ctx, master ? "Master Mode Boss Collections" : "Boss Collections");
  const types: Json = ctx.member.dungeons?.dungeon_types ?? {};
  const fields = floorRange(true).map((f) => {
    const normal = types.catacombs?.tier_completions?.[String(f)] ?? 0;
    const mm = types.master_catacombs?.tier_completions?.[String(f)] ?? 0;
    return { name: bossName(f), value: `**${commas(master ? mm : normal + mm * 2)}** kills`, inline: true };
  });
  const k: Json = ctx.member.nether_island_player_data?.kuudra_completed_tiers ?? {};
  const kuudra = ["none", "hot", "burning", "fiery", "infernal"].reduce((a, t, i) => a + (k[t] ?? 0) * (i + 1), 0);
  fields.push({ name: `${emoji("boss_kuudra", "🔥")} Kuudra`, value: `**${commas(kuudra)}** kills`, inline: true });
  return embed.addFields(twoPerRow(fields));
}

export const dungeonsCommand = playerCommand({
  name: "dungeons",
  description: "Catacombs level, boss PBs, classes and boss collections",
  views: [
    { id: "info", label: "Basic Info" },
    { id: "classes", label: "Classes" },
    { id: "collections", label: "Boss Collections" },
  ],
  variant: { suffix: MM, on: "Master Mode", off: "Catacombs" },
  render(ctx, view = "info") {
    if (!dungeonsSummary(ctx).played) return { embeds: [baseEmbed(ctx, "Catacombs").setDescription(`**${ctx.name}** hasn't entered the Catacombs on this profile yet.`)] };
    const master = view.endsWith(MM);
    const base = master ? view.slice(0, -MM.length) : view;
    if (base === "classes") return { embeds: [classes(ctx)] };
    if (base === "collections") return { embeds: [collections(ctx, master)] };
    return { embeds: [info(ctx, master)] };
  },
});
