import { emoji } from "../lib/emoji.js";
import { playerCommand } from "../lib/command.js";
import type { Ctx } from "../lib/context.js";
import { baseEmbed } from "../lib/embed.js";
import { commas, relTime, short, titleCase } from "../lib/format.js";
import {
  CRYSTAL_EMOJI,
  perkFields,
  powderLine,
  skillLine,
  crystals,
  forgeSlots,
  nucleusRuns,
  powder,
  quickForgeReduction,
  renderGrid,
  treeState,
} from "../lib/mining.js";

function hotmView(ctx: Ctx) {
  const embed = baseEmbed(ctx, "Heart of the Mountain");
  const t = treeState(ctx, "mining");
  const lines = [skillLine(ctx, "mining", emoji("mining", "⛏️"))];
  if (!t.unlocked) {
    lines.push("", "This player hasn't unlocked the **Heart of the Mountain** yet.");
    return embed.setDescription(lines.join("\n"));
  }
  const commissions = Number(ctx.account.player?.achievements?.skyblock_hard_working_miner) || 0;
  const ores = Number(ctx.member.player_stats?.pets?.milestone?.ores_mined) || 0;
  lines.push(
    `${emoji("hotm", "🏔️")} HOTM Level: **${t.level.level}** (\`${short(t.level.xp, 3)}\`)`,
    powderLine(emoji("mithril_powder", "🌿"), "Mithril Powder", powder(ctx, "mithril")),
    powderLine(emoji("gemstone_powder", "💗"), "Gemstone Powder", powder(ctx, "gemstone")),
    powderLine(emoji("glacite_powder", "🧊"), "Glacite Powder", powder(ctx, "glacite")),
    `${emoji("ores_mined", "💎")} Ores Mined: **${commas(ores)}**`,
    `${emoji("commissions", "📜")} Commissions: **${commas(commissions)}**`,
    `${emoji("mining", "⛏️")} Ability: **${t.ability ?? "None"}**`,
    "",
    renderGrid(t.nodes, true),
  );
  return embed.setDescription(lines.join("\n")).addFields(perkFields(t));
}

function hollowsView(ctx: Ctx) {
  const embed = baseEmbed(ctx, "Crystal Hollows");
  const mc = ctx.member.mining_core ?? {};
  const lines = [powderLine(emoji("gemstone_powder", "💗"), "Gemstone Powder", powder(ctx, "gemstone"))];
  lines.push(`${emoji("nucleus_runs", "🔮")} Crystal Nucleus Runs: **${commas(nucleusRuns(ctx))}**`);
  return embed.setDescription(lines.join("\n")).addFields(crystals(ctx).map((c) => {
    const value = [`Found: **${commas(c.found)}**`];
    return { name: `${CRYSTAL_EMOJI[c.id]} ${c.name.replace(/ Crystal$/, "")}`, value: value.join("\n"), inline: true };
  }));
}

const FOSSILS = ["CLAW", "SPINE", "CLUBBED", "UGLY", "HELIX", "FOOTPRINT", "WEBBED", "TUSK"];
const CORPSES: [string, string][] = [["lapis", "🔵"], ["umber", "🟤"], ["tungsten", "⚪"], ["vanguard", "🟣"]];

function glaciteView(ctx: Ctx) {
  const embed = baseEmbed(ctx, "Glacite Tunnels");
  const g = ctx.member.glacite_player_data;
  const donated: string[] = Array.isArray(g?.fossils_donated) ? g.fossils_donated : [];
  const corpses = g?.corpses_looted ?? {};
  const totalCorpses = Object.values(corpses).reduce<number>((a, n) => a + (Number(n) || 0), 0);
  return embed.setDescription([
    powderLine(emoji("glacite_powder", "🧊"), "Glacite Powder", powder(ctx, "glacite")),
    `${emoji("mineshafts", "🕳️")} Mineshafts Entered: **${commas(g?.mineshafts_entered)}**`,
    `${emoji("fossil_dust", "🦴")} Fossil Dust: **${commas(g?.fossil_dust)}**`,
    "",
    "__**Fossils:**__",
    ...FOSSILS.map((f) => `${emoji(`fossil_${f.toLowerCase()}`, "🦴")} ${titleCase(f)}: ${donated.includes(f) ? "**Donated**" : "Not Donated"}`),
    "",
    `__**Corpses (${commas(totalCorpses)}):**__`,
    ...CORPSES.map(([id, fallback]) => `${emoji(`corpse_${id}`, fallback)} ${titleCase(id)}: **${commas(corpses[id])}**`),
  ].join("\n"));
}

function forgeView(ctx: Ctx) {
  const embed = baseEmbed(ctx, "Forge");
  const { quickForge, slots, slotCount } = forgeSlots(ctx);
  const qf = `${emoji("quick_forge", "⚡")} Quick Forge: **${quickForge}** (−${Math.round(quickForgeReduction(quickForge) * 1000) / 10}% time)`;
  const now = Date.now();
  const lines = Array.from({ length: slotCount }, (_, i) => {
    const slot = i + 1;
    const s = slots.find((s) => s.slot === slot);
    if (!s) return `${emoji("forge", "🔥")} Slot ${slot}: Empty`;
    const status = s.endsAt == null ? `Started ${relTime(s.startedAt)}` : s.endsAt <= now ? "Ready" : relTime(s.endsAt);
    return `${emoji("forge", "🔥")} Slot ${slot}: **${s.name}** — ${status}`;
  });
  if (!slots.length) lines.push("Nothing is being forged right now.");
  return embed.setDescription([qf, "", ...lines].join("\n"));
}

export const miningCommand = playerCommand({
  name: "mining",
  description: "Heart of the Mountain, powder, Crystal Hollows, Glacite Tunnels and Forge",
  views: [
    { id: "hotm", label: "Heart of the Mountain", emoji: emoji("hotm", "🏔️") },
    { id: "hollows", label: "Crystal Hollows", emoji: emoji("crystal_amethyst", "🟣") },
    { id: "glacite", label: "Glacite Tunnels", emoji: emoji("glacite_powder", "🧊") },
    { id: "forge", label: "Forge", emoji: emoji("forge", "🔥") },
  ],
  render(ctx, view) {
    const embed = view === "hollows" ? hollowsView(ctx) : view === "glacite" ? glaciteView(ctx) : view === "forge" ? forgeView(ctx) : hotmView(ctx);
    return { embeds: [embed] };
  },
});
