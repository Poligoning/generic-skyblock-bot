import { emoji } from "../lib/emoji.js";
import { playerCommand, type PlayerCommandSpec } from "../lib/command.js";
import { skills, skillsApiEnabled, type Ctx } from "../lib/context.js";
import { baseEmbed } from "../lib/embed.js";
import { commas, short, titleCase } from "../lib/format.js";
import { COSMETIC_SKILLS, SKILLS, levelWithProgress } from "../lib/leveling.js";
import { getNetworth } from "../lib/networth.js";
import { dungeonsSummary } from "../lib/dungeons.js";
import { slayerSummary } from "../lib/slayers.js";
import { minionSlots, skyblockLevel } from "../lib/misc.js";
import { nameOf } from "../lib/names.js";
import { skillsCommand } from "./skills.js";
import { networthCommand } from "./networth.js";
import { dungeonsCommand } from "./dungeons.js";
import { slayersCommand } from "./slayers.js";
import { miningCommand } from "./mining.js";

const SECTIONS: Record<string, { spec: PlayerCommandSpec; label: string; emoji: string }> = {
  skills: { spec: skillsCommand.spec, label: "Skills", emoji: emoji("stats", "📊") },
  networth: { spec: networthCommand.spec, label: "Networth", emoji: emoji("coins", "💰") },
  dungeons: { spec: dungeonsCommand.spec, label: "Dungeons", emoji: emoji("catacombs", "💀") },
  slayers: { spec: slayersCommand.spec, label: "Slayers", emoji: emoji("slayers", "🗡️") },
  mining: { spec: miningCommand.spec, label: "Heart of the Mountain", emoji: emoji("hotm", "⛏️") },
};

async function overview(ctx: Ctx) {
  const embed = baseEmbed(ctx, "Profile");
  const nw = await getNetworth(ctx).catch(() => null);
  const dungeons = dungeonsSummary(ctx);
  const slayers = slayerSummary(ctx);
  const slots = minionSlots(ctx);

  let skillAvg = "API off";
  if (skillsApiEnabled(ctx)) {
    const all = skills(ctx);
    const main = SKILLS.filter((s) => !COSMETIC_SKILLS.includes(s));
    skillAvg = (main.reduce((a, s) => a + levelWithProgress(all[s]), 0) / main.length).toFixed(2);
  }

  const coop = ctx.anon ? [] : await Promise.all(
    Object.entries<any>(ctx.profile.members ?? {}).map(async ([id, m]) => {
      const name = id === ctx.uuid ? ctx.name : (await nameOf(id)) ?? id.slice(0, 8);
      return m.profile?.deletion_notice ? `~~${name}~~` : `**${name}**`;
    }),
  );
  const created = Number(ctx.profile.created_at) || Number(ctx.member.profile?.first_join) || 0;
  const mode = ctx.profile.game_mode ? titleCase(ctx.profile.game_mode) : "Normal";
  embed.setDescription(
    ctx.anon ? `Type: **${mode}**` : [
      `Profile: **${ctx.profile.cute_name ?? "Unknown"}**`,
      created ? `Created: <t:${Math.floor(created / 1000)}:f>` : null,
      `Selected: **${ctx.profile.selected ? "Yes" : "No"}**`,
      `Type: **${mode}**`,
      coop.length > 1 ? `Co-op: ${coop.join(", ")}` : null,
    ].filter(Boolean).join("\n"),
  );

  const bank = ctx.profile.banking?.balance;
  const personal = ctx.member.profile?.bank_account;
  const bankText = bank == null && personal == null ? "API off" : personal != null ? `${short(Math.floor(bank ?? 0))} + ${short(Math.floor(personal))}` : short(Math.floor(bank ?? 0));
  const mp = Number(ctx.member.accessory_bag_storage?.highest_magical_power) || 0;

  embed.addFields(
    { name: `${emoji("stats", "📊")} Skill Average`, value: skillAvg, inline: true },
    { name: `${emoji("catacombs", "💀")} Catacombs`, value: dungeons.played ? levelWithProgress(dungeons.catacombs).toFixed(2) : "0", inline: true },
    { name: `${emoji("accessories", "💍")} Accessory Power`, value: commas(mp), inline: true },
    { name: `${emoji("coins", "💰")} Networth`, value: nw ? short(nw.total) : "Unavailable", inline: true },
    { name: `${emoji("bank", "🏦")} Bank`, value: bankText, inline: true },
    { name: `${emoji("purse", "👛")} Purse`, value: short(ctx.member.currencies?.coin_purse ?? 0), inline: true },
    { name: `${emoji("slayers", "🗡️")} Slayers`, value: slayers.slayers.map((s) => s.level.level).join(" / "), inline: true },
    { name: `${emoji("skyblock_level", "⭐")} SkyBlock Level`, value: skyblockLevel(ctx).toFixed(2), inline: true },
    { name: `${emoji("minions", "🧱")} Minion Slots`, value: `${slots.crafted} + ${slots.community}`, inline: true },
  );
  return { embeds: [embed] };
}

export const profileCommand = playerCommand({
  name: "profile",
  description: "Overview of a SkyBlock profile",
  views: [{ id: "overview", label: "Overview", emoji: emoji("profile", "👤") }, ...Object.entries(SECTIONS).map(([id, s]) => ({ id, label: s.label, emoji: s.emoji }))],
  viewStyle: "select",
  async render(ctx, view) {
    const section = view && SECTIONS[view];
    if (!section) return overview(ctx);
    const out = await section.spec.render(ctx, section.spec.views?.[0]?.id);
    return { ...out, components: [] };
  },
});
