import { emoji } from "./emoji.js";
import type { Json } from "./api.js";
import { titleCase } from "./format.js";
import { neu } from "./neu.js";

export const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "DIVINE", "SPECIAL", "VERY_SPECIAL"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_EMOJI: Record<string, string> = {
  COMMON: emoji("white", "⚪"), UNCOMMON: emoji("green", "🟢"), RARE: emoji("blue", "🔵"), EPIC: emoji("purple", "🟣"), LEGENDARY: emoji("yellow", "🟡"), MYTHIC: emoji("mythic", "🌸"), DIVINE: emoji("crystals", "💠"), SPECIAL: emoji("red", "🔴"), VERY_SPECIAL: emoji("red", "🔴"),
};

const SCORE_VALUE: Record<string, number> = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6 };
const SCORE_REWARDS: [number, number][] = [[10, 1], [25, 2], [50, 3], [75, 4], [100, 5], [130, 6], [175, 7], [225, 8], [275, 9], [325, 10], [375, 11], [450, 12], [500, 13]];

const NAME_OVERRIDES: Record<string, string> = {
  ...neu.pets.id_to_display_name,
  FRACTURED_MONTEZUMA_SOUL: "Montezuma",
  TYRANNOSAURUS: "T-Rex",
  BAL: "Bal",
};

const WISPS = new Set(["DROPLET_WISP", "FROST_WISP", "GLACIAL_WISP", "SUBZERO_WISP"]);
const HATCH_LEVELS = [0, 5555];

const ITEM_NAMES: Record<string, string> = {
  GRANDMAS_KNITTING_NEEDLE: "Grandma's Knitting Needle",
  DWARF_TURTLE_SHELMET: "Dwarf Turtle Shelmet",
  REAPER_GEM: "Reaper Gem",
  MINOS_RELIC: "Minos Relic",
  CROCHET_TIGER_PLUSHIE: "Crochet Tiger Plushie",
  ANTIQUE_REMEDIES: "Antique Remedies",
  WASHED_UP_SOUVENIR: "Washed-up Souvenir",
};
for (const [display, id] of Object.entries<string>(neu.pets.pet_item_display_name_to_id)) {
  ITEM_NAMES[id] ??= display.replace(/§./g, "");
}

export interface PetLevel {
  level: number;
  maxLevel: number;
  xp: number;
  xpCurrent: number;
  xpForNext: number;
  progress: number;
  maxed: boolean;
}

export interface Pet {
  type: string;
  name: string;
  rarity: string;
  level: PetLevel;
  active: boolean;
  heldItem: string | null;
  heldItemId: string | null;
  candy: number;
  skin: string | null;
}

export function rarityName(rarity: string): string {
  return titleCase(rarity);
}

export function bumpRarity(rarity: string, steps = 1): string {
  const order = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
  const i = order.indexOf(rarity);
  return i < 0 ? rarity : order[Math.min(order.length - 1, i + steps)];
}

export function petMaxLevel(type: string): number {
  return neu.pets.custom_pet_leveling[type]?.max_level ?? 100;
}

export function petLevel(type: string, rarity: string, exp: number): PetLevel {
  const custom = neu.pets.custom_pet_leveling[type] ?? {};
  const offset: number = custom.rarity_offset?.[rarity] ?? neu.pets.pet_rarity_offset[rarity] ?? 0;
  const maxLevel = petMaxLevel(type);
  const base: number[] = neu.pets.pet_levels;
  let table = base.slice(offset, offset + Math.min(99, maxLevel - 1));
  if (maxLevel > 100) table = [...table, ...HATCH_LEVELS, ...(custom.pet_levels ?? [])].slice(0, maxLevel - 1);
  const xp = Math.max(0, exp ?? 0);
  let level = 1;
  let remaining = xp;
  while (level < maxLevel && remaining >= table[level - 1]) {
    remaining -= table[level - 1];
    level++;
  }
  const maxed = level >= maxLevel;
  const xpForNext = maxed ? 0 : table[level - 1];
  return { level, maxLevel, xp, xpCurrent: remaining, xpForNext, progress: maxed ? 1 : xpForNext ? remaining / xpForNext : 0, maxed };
}

export function petName(type: string, level?: number): string {
  const name = NAME_OVERRIDES[type] ?? titleCase(type);
  if (level != null && petMaxLevel(type) > 100 && level < 100) return `${name} Egg`;
  return name;
}

export function petItemName(id: string | null | undefined): string | null {
  if (!id) return null;
  return ITEM_NAMES[id] ?? titleCase(id.replace(/^PET_ITEM_/, "").replace(/_(COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC)$/, ""));
}

export function skinName(skin: string | null | undefined): string | null {
  return skin ? titleCase(skin.replace(/^PET_SKIN_/, "")) : null;
}

export function parsePet(raw: Json): Pet {
  let rarity: string = raw.tier ?? "COMMON";
  if (raw.heldItem === "PET_ITEM_TIER_BOOST") rarity = bumpRarity(rarity);
  const level = petLevel(raw.type, rarity, raw.exp ?? 0);
  return {
    type: raw.type,
    name: petName(raw.type, level.level),
    rarity,
    level,
    active: !!raw.active,
    heldItem: petItemName(raw.heldItem),
    heldItemId: raw.heldItem ?? null,
    candy: raw.candyUsed ?? 0,
    skin: skinName(raw.skin),
  };
}

export function rarityIndex(r: string): number {
  const order = ["COMMON", "UNCOMMON", "RARE", "EPIC", "SPECIAL", "LEGENDARY", "VERY_SPECIAL", "MYTHIC", "DIVINE"];
  const i = order.indexOf(r);
  return i < 0 ? -1 : i;
}

export function sortPets(pets: Pet[]): Pet[] {
  return [...pets].sort((a, b) => Number(b.active) - Number(a.active) || rarityIndex(b.rarity) - rarityIndex(a.rarity) || b.level.level - a.level.level || b.level.xp - a.level.xp || a.name.localeCompare(b.name));
}

export function petScore(pets: Pet[]): { score: number; magicFind: number; next: number | null } {
  const best = new Map<string, number>();
  const maxed = new Set<string>();
  for (const p of pets) {
    if (p.type === "FRACTURED_MONTEZUMA_SOUL" || p.rarity === "SPECIAL" || p.rarity === "VERY_SPECIAL") continue;
    best.set(p.type, Math.max(best.get(p.type) ?? 0, SCORE_VALUE[p.rarity] ?? 0));
    if (p.level.maxed) maxed.add(p.type);
  }
  const score = [...best.values()].reduce((a, b) => a + b, 0) + maxed.size;
  let magicFind = 0;
  let next: number | null = null;
  for (const [need, mf] of SCORE_REWARDS) {
    if (score >= need) magicFind = mf;
    else {
      next = need;
      break;
    }
  }
  return { score, magicFind, next };
}

export function allPetTypes(gameMode?: string): string[] {
  const types = Object.keys(neu.petnums).filter((t) => t !== "BINGO" || gameMode === "bingo");
  return [...new Set(types.map((t) => (WISPS.has(t) ? "WISP" : t)))];
}

export function missingPets(pets: Pet[], gameMode?: string): string[] {
  const owned = new Set(pets.map((p) => (WISPS.has(p.type) ? "WISP" : p.type)));
  return allPetTypes(gameMode)
    .filter((t) => !owned.has(t))
    .map((t) => (t === "WISP" ? "Wisp" : petName(t)))
    .sort();
}

export function memberPets(member: Json): Pet[] {
  return (member?.pets_data?.pets ?? []).filter((p: Json) => p?.type).map(parsePet);
}

export function petLabel(p: Pet): string {
  return `[Lvl ${p.level.level}] ${p.name}`;
}
