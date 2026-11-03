import { emoji } from "../lib/emoji.js";
import { escapeMarkdown, type EmbedBuilder } from "discord.js";
import { playerCommand } from "../lib/command.js";
import type { Ctx } from "../lib/context.js";
import { baseEmbed } from "../lib/embed.js";
import { commas, pct, short } from "../lib/format.js";
import { CATEGORIES, getNetworth, type Networth, type NetworthCategory, type NetworthItem } from "../lib/networth.js";

const UNGATED = new Set<string>(["pets", "essence"]);
const API_OFF = `${emoji("warning", "⚠️")} **Inventory API is off** — inventories, ender chest, storage, wardrobe and accessories can't be seen, so this is only a partial value.`;

export const networthCommand = playerCommand({
  name: "networth",
  description: "Networth breakdown by category with the most valuable items",
  views: [{ id: "overview", label: "Overview", emoji: emoji("stats", "📊") }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.name, emoji: c.emoji }))],
  async render(ctx, view) {
    const nw = await getNetworth(ctx);
    const cat = nw.categories.find((c) => c.id === view);
    const embed = cat ? category(ctx, nw, cat) : overview(ctx, nw);
    return { embeds: [embed] };
  },
});

const GROUPS: { name: string; emoji: string; ids: string[] }[] = [
  { name: "Storage", emoji: emoji("storage", "📦"), ids: ["inventory", "enderchest", "storage", "personal_vault", "misc"] },
  { name: "Armor & Wardrobe", emoji: emoji("armor", "🛡️"), ids: ["armor", "wardrobe", "equipment"] },
  { name: "Pets", emoji: emoji("pets", "🐾"), ids: ["pets"] },
  { name: "Accessories", emoji: emoji("accessories", "💍"), ids: ["accessories"] },
  { name: "Sacks & Essence", emoji: emoji("essence", "✨"), ids: ["sacks", "essence"] },
];

function overview(ctx: Ctx, nw: Networth): EmbedBuilder {
  const embed = baseEmbed(ctx, "Networth");
  const head = [
    `${emoji("coins", "💰")} Networth: **${short(nw.total)}**`,
    `${emoji("purse", "👛")} Purse: **${short(Math.floor(nw.purse))}**`,
    `${emoji("bank", "🏦")} Bank: ${nw.bankApi ? `**${short(Math.floor(nw.bank))}**` : "API off"}${nw.personalBank ? ` + **${short(Math.floor(nw.personalBank))}** personal` : ""}`,
  ];
  if (!nw.inventoryApi) head.push("", API_OFF);
  const groups = GROUPS.map((g) => {
    const cats = nw.categories.filter((c) => g.ids.includes(c.id));
    return { ...g, total: cats.reduce((a, c) => a + c.total, 0), items: cats.flatMap((c) => c.items).sort((x, y) => y.price - x.price) };
  })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  const build = (top: number) =>
    [
      ...head,
      ...groups.flatMap((g) => ["", `${g.emoji} ${g.name} (**${short(g.total)}**):`, ...g.items.slice(0, top).map((i) => `↳ ${itemLabel(i, 48)} (**${short(i.price)}**)`)]),
    ].join("\n");
  let top = 5, description = build(top);
  while (top > 0 && description.length > 4000) description = build(--top);
  if (!groups.length) description += `\n\n${nw.inventoryApi ? "No valuable items found." : "No items visible."}`;
  return embed.setDescription(description);
}

function category(ctx: Ctx, nw: Networth, c: NetworthCategory): EmbedBuilder {
  const embed = baseEmbed(ctx, "Networth");
  const count = sumCounts(c.items);
  if (!c.items.length) {
    const hidden = !nw.inventoryApi && !UNGATED.has(c.id);
    return embed.setDescription(`${c.emoji} **${c.name}**\n\n${hidden ? "Nothing visible — this player's **Inventory API** is off." : "Nothing of value here."}`);
  }
  const lines = [
    `${c.emoji} **${c.name}**: ${amount(c.total)}`,
    `${emoji("unlocked", "🔓")} Unsoulbound: **${short(c.unsoulbound)}**${nw.total > 0 && c.total > 0 ? ` · ${pct(c.total / nw.total)} of networth` : ""}${count ? ` · ${commas(count)} item${count === 1 ? "" : "s"}` : ""}`,
    "",
  ];
  const build = (top: number) => {
    const shown = c.items.slice(0, top);
    const out = [...lines, ...shown.map((i, n) => `\`${String(n + 1).padStart(2)}.\` ${itemLabel(i, 48)} · **${short(i.price)}**${i.soulbound ? ` ${emoji("locked", "🔒")}` : ""}`)];
    const rest = c.items.slice(shown.length);
    if (rest.length) out.push(`-# …and ${rest.length} more worth ${short(rest.reduce((a, i) => a + i.price, 0))}`);
    if (shown.some((i) => i.soulbound)) out.push(`-# ${emoji("locked", "🔒")} Soulbound (can't be traded)`);
    if (!nw.inventoryApi && !UNGATED.has(c.id)) out.push("", API_OFF);
    return out.join("\n");
  };
  const budget = Math.min(4096, 6000 - embed.length);
  let top = Math.min(25, c.items.length), description = build(top);
  while (top > 0 && description.length > budget) description = build(--top);
  return embed.setDescription(description);
}

function amount(n: number): string {
  return Math.abs(n) >= 1000 ? `**${short(n)}** (${commas(n)})` : `**${short(Math.floor(n))}**`;
}

function itemLabel(i: NetworthItem, max: number): string {
  const name = i.name.length > max ? `${i.name.slice(0, max - 1)}…` : i.name;
  return `${escapeMarkdown(name)}${i.count > 1 ? ` ×${commas(i.count)}` : ""}`;
}

function sumCounts(items: NetworthItem[]): number {
  return items.reduce((a, i) => a + i.count, 0);
}
