import { emoji } from "./emoji.js";
import type { APIEmbedField } from "discord.js";
import type { Json } from "./api.js";
import { skills, skillsApiEnabled, type Ctx } from "./context.js";
import { commas, short, titleCase } from "./format.js";
import { hotfLevel, hotmLevel, type Level } from "./leveling.js";
import { neu } from "./neu.js";

export type Tree = "mining" | "foraging";
export type PowderType = "mithril" | "gemstone" | "glacite";
export const POWDER_TYPES: readonly PowderType[] = ["mithril", "gemstone", "glacite"];

export interface Powder {
  available: number;
  spent: number;
  total: number;
}

export interface TreeNode {
  id: string;
  name: string;
  x: number;
  y: number;
  level: number;
  maxLevel: number;
  enabled: boolean;
  ability: boolean;
  core: boolean;
}

export interface TreeState {
  tree: Tree;
  unlocked: boolean;
  level: Level;
  slot: number;
  loadoutName?: string;
  loadouts: number;
  tokensSpent: number;
  tokensTotal?: number;
  ability?: string;
  lastReset?: number;
  nodes: TreeNode[];
}

export interface HotmSummary {
  unlocked: boolean;
  level: Level;
  tokens: { spent: number; total: number };
  mithril: Powder;
  gemstone: Powder;
  glacite: Powder;
}

const LAYOUT: Record<Tree, Record<string, Json>> = { mining: neu.hotm.hotm.perks, foraging: neu.hotf.hotf.perks };
const CORE: Record<Tree, string> = { mining: "core_of_the_mountain", foraging: "center_of_the_forest" };
const TOKEN_KEY: Record<Tree, string> = { mining: "mountain", foraging: "forest" };
const HOTM_TOKENS = [0, 1, 2, 2, 2, 2, 2, 3, 2, 2, 2];
const COTM_TOKENS: Record<number, number> = { 1: 1, 5: 1, 7: 1, 10: 2 };

function slotKey(base: string, slot: number): string {
  return slot > 1 ? `${base}_${slot}` : base;
}

export function activeSlot(ctx: Ctx, tree: Tree): number {
  const s = Number(ctx.member.skill_tree?.selected_skill_tree_slot?.[tree]);
  return Number.isInteger(s) && s > 0 ? s : 1;
}

export function perkName(tree: Tree, id: string | undefined): string | undefined {
  if (!id) return undefined;
  return LAYOUT[tree][id]?.name ?? titleCase(id);
}

function isAbility(tree: Tree, p: Json): boolean {
  return tree === "foraging" ? !!p.isAbility : p.item === "(api level0)";
}

export function treeState(ctx: Ctx, tree: Tree): TreeState {
  const st = ctx.member.skill_tree ?? {};
  const slot = activeSlot(ctx, tree);
  const raw: Json = st.nodes?.[slotKey(tree, slot)] ?? (slot > 1 ? {} : st.nodes?.[tree]) ?? {};
  const xp = Number(st.experience?.[tree]) || 0;
  const level = tree === "mining" ? hotmLevel(xp) : hotfLevel(xp);
  const nodes: TreeNode[] = Object.entries(LAYOUT[tree]).map(([id, p]) => {
    const lvl = Math.max(0, Math.min(p.maxLevel, Number(raw[id]) || 0));
    return {
      id,
      name: p.name,
      x: p.x,
      y: p.y,
      level: lvl,
      maxLevel: p.maxLevel,
      enabled: raw[`toggle_${id}`] !== false,
      ability: isAbility(tree, p),
      core: id === CORE[tree],
    };
  });
  const loadouts = Object.keys(st.nodes ?? {}).filter((k) => k === tree || k.startsWith(`${tree}_`)).length;
  const tokensSpent = Number(st.tokens_spent?.[slotKey(TOKEN_KEY[tree], slot)]) || 0;
  const core = nodes.find((n) => n.core)?.level ?? 0;
  let tokensTotal: number | undefined;
  if (tree === "mining") {
    tokensTotal = HOTM_TOKENS.slice(0, level.level + 1).reduce((a, b) => a + b, 0);
    for (const [l, t] of Object.entries(COTM_TOKENS)) if (core >= Number(l)) tokensTotal += t;
  }
  const abilityId = st.selected_ability?.[slotKey(tree, slot)] ?? (slot > 1 ? undefined : st.selected_ability?.[tree]);
  const lastReset = Number(st.last_reset?.[slotKey(tree, slot)] ?? st.last_reset?.[tree]) || undefined;
  return {
    tree,
    unlocked: xp > 0 || nodes.some((n) => n.level > 0),
    level,
    slot,
    loadoutName: st[slotKey(tree, slot)]?.custom_name,
    loadouts,
    tokensSpent,
    tokensTotal,
    ability: perkName(tree, abilityId),
    lastReset,
    nodes,
  };
}

export function powder(ctx: Ctx, type: PowderType): Powder {
  const mc = ctx.member.mining_core ?? {};
  const slot = activeSlot(ctx, "mining");
  const available = Number(mc[`powder_${type}`]) || 0;
  const spent = Number(mc[slotKey(`powder_spent_${type}`, slot)] ?? mc[`powder_spent_${type}`]) || 0;
  return { available, spent, total: available + spent };
}

export function hotmSummary(ctx: Ctx): HotmSummary {
  const t = treeState(ctx, "mining");
  return {
    unlocked: t.unlocked,
    level: t.level,
    tokens: { spent: t.tokensSpent, total: t.tokensTotal ?? 0 },
    mithril: powder(ctx, "mithril"),
    gemstone: powder(ctx, "gemstone"),
    glacite: powder(ctx, "glacite"),
  };
}

export type Whisper = "forest" | "desert";

export function whispers(ctx: Ctx, type: Whisper): Powder {
  const fc = ctx.member.foraging_core ?? {};
  const w = fc.whispers?.[type];
  if (w) {
    const total = Number(w.total) || 0;
    const spent = Number(w[activeSlot(ctx, "foraging")]?.spent) || 0;
    return { available: Math.max(0, total - spent), spent, total: Math.max(total, spent) };
  }
  const key = type === "forest" ? "forests_whispers" : "deserts_whispers";
  const available = Number(fc[key]) || 0;
  const spent = Number(fc[`${key}_spent`]) || 0;
  return { available, spent, total: available + spent };
}

export const GRID = { empty: "⬛", locked: "🔲", partial: "🟨", maxed: "🟩", disabled: "🟥", ability: "🟪", core: "🟦" } as const;
export const GRID_LEGEND = `${GRID.maxed} Maxed · ${GRID.partial} Upgrading · ${GRID.locked} Locked · ${GRID.disabled} Disabled · ${GRID.ability} Ability · ${GRID.core} Core`;

export function nodeSymbol(n: TreeNode, itemIcons = false): string {
  if (itemIcons) {
    if (!n.enabled) return emoji("hotm_redstone", "🟥");
    if (n.core) return emoji("hotm_redstone_block", "🟥");
    if (n.ability) return n.level <= 0 ? emoji("hotm_coal_block", "⬛") : emoji("hotm_emerald_block", "🟩");
    if (n.level <= 0) return emoji("hotm_coal", "⬛");
    return n.level >= n.maxLevel ? emoji("hotm_diamond", "💎") : emoji("hotm_emerald", "🟩");
  }
  if (n.level <= 0) return GRID.locked;
  if (!n.enabled) return GRID.disabled;
  if (n.core) return GRID.core;
  if (n.ability) return GRID.ability;
  return n.level >= n.maxLevel ? GRID.maxed : GRID.partial;
}

export function renderGrid(nodes: TreeNode[], itemIcons = false): string {
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const at = new Map(nodes.map((n) => [`${n.x},${n.y}`, n]));
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const n = at.get(`${x},${y}`);
      row += n ? nodeSymbol(n, itemIcons) : itemIcons ? emoji("blank", "⬛") : GRID.empty;
    }
    rows.push(row);
  }
  return rows.join("\n");
}

export function treeOrder(a: TreeNode, b: TreeNode): number {
  return b.y - a.y || a.x - b.x;
}

export const NUCLEUS_CRYSTALS = ["jade", "amber", "sapphire", "amethyst", "topaz"] as const;
export const OTHER_CRYSTALS = ["jasper", "ruby", "peridot", "onyx", "citrine", "opal", "aquamarine"] as const;
export const CRYSTAL_EMOJI: Record<string, string> = {
  amethyst: emoji("crystal_amethyst", "🟣"), amber: emoji("crystal_amber", "🟠"), sapphire: emoji("crystal_sapphire", "🔵"), jade: emoji("crystal_jade", "🟢"), topaz: emoji("crystal_topaz", "🟡"),
  ruby: emoji("crystal_ruby", "❤️"), jasper: emoji("crystal_jasper", "🩷"), opal: emoji("crystal_opal", "🤍"), onyx: emoji("crystal_onyx", "🖤"), aquamarine: emoji("crystal_aquamarine", "🩵"), citrine: emoji("crystal_citrine", "💛"), peridot: emoji("crystal_peridot", "💚"),
};

export interface Crystal {
  id: string;
  name: string;
  state: "PLACED" | "FOUND" | "NOT_FOUND";
  found: number;
  placed: number;
  canPlace: boolean;
}

export function crystals(ctx: Ctx): Crystal[] {
  const raw = ctx.member.mining_core?.crystals ?? {};
  return [...NUCLEUS_CRYSTALS, ...OTHER_CRYSTALS].map((id) => {
    const c = raw[`${id}_crystal`] ?? {};
    const state = c.state === "PLACED" || c.state === "FOUND" ? c.state : "NOT_FOUND";
    return {
      id, name: `${titleCase(id)} Crystal`, state, found: Number(c.total_found) || 0, placed: Number(c.total_placed) || 0,
      canPlace: (NUCLEUS_CRYSTALS as readonly string[]).includes(id) || c.total_placed != null,
    };
  });
}

export function nucleusRuns(ctx: Ctx): number {
  const fromCompletions = Number(ctx.member.leveling?.completions?.NUCLEUS_RUNS);
  if (Number.isFinite(fromCompletions) && fromCompletions > 0) return fromCompletions;
  const placed = crystals(ctx).filter((c) => (NUCLEUS_CRYSTALS as readonly string[]).includes(c.id)).map((c) => c.placed);
  return Math.min(...placed);
}

export function commissionMilestone(ctx: Ctx): number {
  let tier = 0;
  for (const t of ctx.member.objectives?.tutorial ?? []) {
    const m = /^commission_milestone_reward_mining_xp_tier_(\d+)$/.exec(t);
    if (m) tier = Math.max(tier, Number(m[1]));
  }
  return tier;
}

export function killsMatching(ctx: Ctx, re: RegExp): number {
  const kills = ctx.member.player_stats?.kills ?? {};
  let n = 0;
  for (const [k, v] of Object.entries<Json>(kills)) if (re.test(k)) n += Number(v) || 0;
  return n;
}

export const FORGE_MINUTES: Record<string, number> = {
  REFINED_DIAMOND: 480, REFINED_MITHRIL: 360, REFINED_TITANIUM: 720, REFINED_UMBER: 60, REFINED_TUNGSTEN: 60,
  BEJEWELED_HANDLE: 0.5, DRILL_ENGINE: 1800, FUEL_TANK: 600, GEMSTONE_MIXTURE: 240, GLACITE_AMALGAMATION: 240,
  GOLDEN_PLATE: 360, MITHRIL_PLATE: 1080, TUNGSTEN_PLATE: 180, UMBER_PLATE: 180, PERFECT_PLATE: 30,
  MITHRIL_DRILL_1: 240, MITHRIL_DRILL_2: 0.5, GEMSTONE_DRILL_1: 240, GEMSTONE_DRILL_2: 0.5, GEMSTONE_DRILL_3: 0.5,
  GEMSTONE_DRILL_4: 0.5, POLISHED_TOPAZ_ROD: 720, TITANIUM_DRILL_1: 240, TITANIUM_DRILL_2: 0.5, TITANIUM_DRILL_3: 0.5,
  TITANIUM_DRILL_4: 0.5, CHISEL: 240, REINFORCED_CHISEL: 0.5, GLACITE_CHISEL: 0.5, PERFECT_CHISEL: 0.5, DIVAN_DRILL: 0.5,
  MITHRIL_NECKLACE: 60, MITHRIL_CLOAK: 60, MITHRIL_BELT: 60, MITHRIL_GAUNTLET: 60,
  TITANIUM_NECKLACE: 270, TITANIUM_CLOAK: 270, TITANIUM_BELT: 270, TITANIUM_GAUNTLET: 270,
  TITANIUM_TALISMAN: 840, TITANIUM_RING: 1200, TITANIUM_ARTIFACT: 2160, TITANIUM_RELIC: 4320,
  DIVAN_POWDER_COATING: 2160, DIVAN_HELMET: 1440, DIVAN_CHESTPLATE: 1440, DIVAN_LEGGINGS: 1440, DIVAN_BOOTS: 1440,
  AMBER_NECKLACE: 1440, SAPPHIRE_CLOAK: 1440, JADE_BELT: 1440, AMETHYST_GAUNTLET: 1440,
  GEMSTONE_CHAMBER: 240, DWARVEN_HANDWARMERS: 240, DWARVEN_METAL: 1440, DIVAN_PENDANT: 10080, POWER_RELIC: 480,
  DIAMONITE: 360, POCKET_ICEBERG: 360, PETRIFIED_STARFALL: 360, PURE_MITHRIL: 360, ROCK_GEMSTONE: 360,
  TITANIUM_TESSERACT: 360, GLEAMING_CRYSTAL: 360, HOT_STUFF: 360, AMBER_MATERIAL: 360, FRIGID_HUSK: 360,
  STARFALL_SEASONING: 1080, GOBLIN_OMELETTE: 1080, GOBLIN_OMELETTE_SPICY: 1080, GOBLIN_OMELETTE_PESTO: 1080,
  GOBLIN_OMELETTE_SUNNY_SIDE: 1080, GOBLIN_OMELETTE_BLUE_CHEESE: 1080, TUNGSTEN_KEYCHAIN: 1080,
  MITHRIL_DRILL_ENGINE: 1440, TITANIUM_DRILL_ENGINE: 0.5, RUBY_POLISHED_DRILL_ENGINE: 0.5,
  SAPPHIRE_POLISHED_DRILL_ENGINE: 0.5, AMBER_POLISHED_DRILL_ENGINE: 0.5, MITHRIL_FUEL_TANK: 1440,
  TITANIUM_FUEL_TANK: 0.5, GEMSTONE_FUEL_TANK: 0.5, PERFECTLY_CUT_FUEL_TANK: 0.5,
  PERFECT_AMBER_GEM: 1200, PERFECT_AMETHYST_GEM: 1200, PERFECT_JADE_GEM: 1200, PERFECT_JASPER_GEM: 1200,
  PERFECT_OPAL_GEM: 1200, PERFECT_RUBY_GEM: 1200, PERFECT_SAPPHIRE_GEM: 1200, PERFECT_TOPAZ_GEM: 1200,
  PERFECT_ONYX_GEM: 1200, PERFECT_CITRINE_GEM: 1200, PERFECT_AQUAMARINE_GEM: 1200, PERFECT_PERIDOT_GEM: 1200,
  BEJEWELED_COLLAR: 120, MOLE: 4320, AMMONITE: 4320, PENGUIN: 10080, TYRANNOSAURUS: 10080, SPINOSAURUS: 10080,
  GOBLIN: 10080, ANKYLOSAURUS: 10080, MAMMOTH: 10080,
  BEACON_2: 1200, BEACON_3: 1800, BEACON_4: 2400, BEACON_5: 3000,
  FORGE_TRAVEL_SCROLL: 300, BASE_CAMP_TRAVEL_SCROLL: 600, POWER_CRYSTAL: 120, SECRET_RAILROAD_PASS: 0.5,
  TUNGSTEN_KEY: 30, UMBER_KEY: 30, SKELETON_KEY: 30, PORTABLE_CAMPFIRE: 30,
};

const FORGE_NAMES: Record<string, string> = {
  MITHRIL_DRILL_1: "Mithril Drill SX-R226", MITHRIL_DRILL_2: "Mithril Drill SX-R326",
  GEMSTONE_DRILL_1: "Ruby Drill TX-15", GEMSTONE_DRILL_2: "Gemstone Drill LT-522", GEMSTONE_DRILL_3: "Topaz Drill KGR-12", GEMSTONE_DRILL_4: "Jasper Drill X",
  TITANIUM_DRILL_1: "Titanium Drill DR-X355", TITANIUM_DRILL_2: "Titanium Drill DR-X455", TITANIUM_DRILL_3: "Titanium Drill DR-X555", TITANIUM_DRILL_4: "Titanium Drill DR-X655",
  DIVAN_DRILL: "Divan's Drill", DIVAN_POWDER_COATING: "Divan's Powder Coating", DIVAN_HELMET: "Helmet of Divan", DIVAN_CHESTPLATE: "Chestplate of Divan",
  DIVAN_LEGGINGS: "Leggings of Divan", DIVAN_BOOTS: "Boots of Divan", DIVAN_PENDANT: "Divan's Alloy Pendant",
  GOBLIN_OMELETTE_SPICY: "Spicy Goblin Omelette", GOBLIN_OMELETTE_PESTO: "Pesto Goblin Omelette", GOBLIN_OMELETTE_SUNNY_SIDE: "Sunny Side Goblin Omelette",
  GOBLIN_OMELETTE_BLUE_CHEESE: "Blue Cheese Goblin Omelette", DRILL_ENGINE: "Drill Motor", FUEL_TANK: "Fuel Canister", POWER_RELIC: "Relic of Power",
  FORGE_TRAVEL_SCROLL: "Travel Scroll to the Dwarven Forge", BASE_CAMP_TRAVEL_SCROLL: "Travel Scroll to the Dwarven Base Camp",
  BEACON_2: "Beacon II", BEACON_3: "Beacon III", BEACON_4: "Beacon IV", BEACON_5: "Beacon V", AMBER_MATERIAL: "Amber Material",
  DWARVEN_METAL: "Dwarven Metal Talisman", HOT_STUFF: "Hot Stuff", POCKET_ICEBERG: "Pocket Iceberg",
};

export function forgeItemName(id: string, type?: string): string {
  if (type === "PETS") return `[Lvl 1] ${titleCase(id)}`;
  if (FORGE_NAMES[id]) return FORGE_NAMES[id];
  const gem = /^PERFECT_(\w+)_GEM$/.exec(id);
  if (gem) return `Perfect ${titleCase(gem[1])} Gemstone`;
  return titleCase(id);
}

export function quickForgeReduction(level: number): number {
  if (level <= 0) return 0;
  return level >= 20 ? 0.3 : (10 + level * 0.5) / 100;
}

export interface ForgeSlot {
  slot: number;
  id: string;
  name: string;
  startedAt: number;
  endsAt?: number;
}

export function forgeSlots(ctx: Ctx): { quickForge: number; slots: ForgeSlot[]; slotCount: number } {
  const qf = treeState(ctx, "mining").nodes.find((n) => n.id === "quick_forge")?.level ?? 0;
  const mult = 1 - quickForgeReduction(qf);
  const slots: ForgeSlot[] = [];
  let slotCount = 0;
  for (const forge of Object.values<Json>(ctx.member.forge?.forge_processes ?? {})) {
    for (const [key, p] of Object.entries<Json>(forge ?? {})) {
      const slot = Number(p?.slot ?? key);
      if (!Number.isInteger(slot) || slot < 1) continue;
      slotCount = Math.max(slotCount, slot);
      if (!p?.id) continue;
      const startedAt = Number(p.startTime) || 0;
      const minutes = FORGE_MINUTES[p.id];
      slots.push({
        slot,
        id: p.id,
        name: forgeItemName(p.id, p.type),
        startedAt,
        endsAt: minutes != null && startedAt ? startedAt + minutes * 60_000 * mult : undefined,
      });
    }
  }
  return { quickForge: qf, slots: slots.sort((a, b) => a.slot - b.slot), slotCount };
}

export function skillLine(ctx: Ctx, skill: "mining" | "foraging", emoji: string): string {
  if (!skillsApiEnabled(ctx)) return `${emoji} ${titleCase(skill)}: *Skills API off*`;
  return `${emoji} ${titleCase(skill)}: **${skills(ctx)[skill].level}**`;
}

export function treeLevelLine(label: string, emoji: string, l: Level): string {
  const xp = l.maxed ? `${short(l.xp)} XP` : `${short(l.xpCurrent)} / ${short(l.xpForNext)} XP`;
  return `${emoji} ${label}: **${l.level}** (\`${xp}\`)`;
}

export function powderLine(emoji: string, label: string, p: Powder): string {
  return `${emoji} ${label}: **${commas(p.available)}** (Total: **${commas(p.total)}**)`;
}

export function chunkFields(name: string, lines: string[], sep = "\n"): APIEmbedField[] {
  const out: APIEmbedField[] = [];
  let cur = "";
  for (const line of lines) {
    const next = cur ? cur + sep + line : line;
    if (next.length > 1024 && cur) {
      out.push({ name: out.length ? "\u200b" : name, value: cur });
      cur = line;
    } else cur = next;
  }
  if (cur) out.push({ name: out.length ? "\u200b" : name, value: cur });
  return out;
}

export function columns(name: string, lines: string[]): APIEmbedField[] {
  if (!lines.length) return [];
  const n = lines.length > 8 ? 3 : 1;
  const per = Math.ceil(lines.length / n);
  const parts: APIEmbedField[] = [];
  for (let i = 0; i < lines.length; i += per) parts.push(...chunkFields(name, lines.slice(i, i + per)));
  return parts.map((f, i) => ({ name: i ? "\u200b" : name, value: f.value, inline: n > 1 }));
}

const PERK_WIDTH = 18;

const POWDER_EMOJI: Record<string, () => string> = {
  MITHRIL: () => emoji("mithril_powder", "🟢"),
  GEMSTONE: () => emoji("gemstone_powder", "🟣"),
  GLACITE: () => emoji("glacite_powder", "🔵"),
  FOREST_WHISPERS: () => emoji("forest_whispers", "🌲"),
  DESERT_WHISPERS: () => emoji("desert_whispers", "🏜️"),
};

const POWDER_ORDER = ["MITHRIL", "GEMSTONE", "GLACITE", "FOREST_WHISPERS", "DESERT_WHISPERS"];

function perkPowderType(tree: Tree, n: TreeNode): string {
  let expr = String(LAYOUT[tree]?.[n.id]?.powder ?? "");
  const level = Math.min(n.level, n.maxLevel - 1);
  for (let guard = 0; guard < 5; guard++) {
    const m = /^\(if \(lt level (\d+)\) (\w+) (.*)\)$/.exec(expr.trim());
    if (!m) break;
    expr = level < Number(m[1]) ? m[2] : m[3];
  }
  return expr.trim();
}

function perkPowder(tree: Tree, n: TreeNode): string {
  return POWDER_EMOJI[perkPowderType(tree, n)]?.() ?? "";
}

function byPowder(tree: Tree) {
  const rank = (n: TreeNode) => {
    const i = POWDER_ORDER.indexOf(perkPowderType(tree, n));
    return i < 0 ? POWDER_ORDER.length : i;
  };
  return (a: TreeNode, b: TreeNode) => rank(a) - rank(b) || treeOrder(a, b);
}

function perkLine(tree: Tree, n: TreeNode): string {
  const levels = n.level >= n.maxLevel ? "MAX" : `${n.level}/${n.maxLevel}`;
  const room = PERK_WIDTH - levels.length - 2;
  const name = n.name.length > room ? `${n.name.slice(0, room - 2).trimEnd()}..` : n.name;
  const icon = perkPowder(tree, n);
  return `${icon ? `${icon} ` : ""}${name}: **${levels}**`;
}

export function perkFields(t: TreeState): APIEmbedField[] {
  const owned = t.nodes.filter((n) => n.level > 0).sort(byPowder(t.tree));
  const disabled = owned.filter((n) => !n.enabled);
  const upgrading = owned.filter((n) => n.enabled && n.level < n.maxLevel);
  const maxed = owned.filter((n) => n.enabled && n.level >= n.maxLevel);
  return [
    ...columns(`${emoji("hotm_redstone", "🟥")} Disabled Perks`, disabled.map((n) => perkLine(t.tree, n))),
    ...columns(`${emoji("hotm_emerald", "🟨")} Perks`, upgrading.map((n) => perkLine(t.tree, n))),
    ...columns(`${emoji("hotm_diamond", "🟩")} Maxed Perks`, maxed.map((n) => perkLine(t.tree, n))),
  ];
}

export function tokensLine(t: TreeState): string {
  return `${emoji("tokens", "🎟️")} Tokens Spent: **${t.tokensSpent}**${t.tokensTotal != null ? ` / ${t.tokensTotal}` : ""}`;
}

export function loadoutLine(t: TreeState): string[] {
  return t.loadouts > 1 || t.slot > 1 ? [`${emoji("stats", "🗂️")} Loadout: **${t.loadoutName ?? `#${t.slot}`}**`] : [];
}
