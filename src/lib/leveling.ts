import { emoji } from "./emoji.js";
import { neu } from "./neu.js";

export interface Level {
  level: number;
  xp: number;
  cap: number;
  progress: number;
  xpCurrent: number;
  xpForNext: number;
  maxed: boolean;
  overflow: number;
}

export function levelFromTable(xp: number, perLevel: number[], cap = perLevel.length, cumulative = false): Level {
  xp = Math.max(0, xp ?? 0);
  const steps = cumulative ? perLevel.map((v, i) => v - (i ? perLevel[i - 1] : 0)) : perLevel;
  const max = Math.min(cap, steps.length);
  let level = 0;
  let remaining = xp;
  while (level < max && remaining >= steps[level]) {
    remaining -= steps[level];
    level++;
  }
  const maxed = level >= max;
  const xpForNext = maxed ? 0 : steps[level];
  return {
    level,
    xp,
    cap: max,
    progress: maxed ? 1 : remaining / xpForNext,
    xpCurrent: remaining,
    xpForNext,
    maxed,
    overflow: maxed ? remaining : 0,
  };
}

export const SKILLS = [
  "farming", "mining", "combat", "foraging", "fishing", "enchanting", "alchemy", "taming", "carpentry", "hunting", "runecrafting", "social",
] as const;
export type Skill = (typeof SKILLS)[number];
export const COSMETIC_SKILLS: readonly Skill[] = ["runecrafting", "social"];

export function skillLevel(skill: Skill, xp: number, capBonus = 0): Level {
  const L = neu.leveling;
  if (skill === "runecrafting") return levelFromTable(xp, L.runecrafting_xp, L.leveling_caps.runecrafting);
  if (skill === "social") return levelFromTable(xp, L.social, L.leveling_caps.social);
  return levelFromTable(xp, L.leveling_xp, (L.leveling_caps[skill] ?? 50) + capBonus);
}

export function catacombsLevel(xp: number): Level {
  return levelFromTable(xp, neu.leveling.catacombs, 50);
}

export const SLAYERS = {
  zombie: { name: "Revenant Horror", short: "Revenant", emoji: emoji("slayer_zombie", "🧟") },
  spider: { name: "Tarantula Broodfather", short: "Tarantula", emoji: emoji("slayer_spider", "🕷️") },
  wolf: { name: "Sven Packmaster", short: "Sven", emoji: emoji("slayer_wolf", "🐺") },
  enderman: { name: "Voidgloom Seraph", short: "Voidgloom", emoji: emoji("slayer_enderman", "🔮") },
  blaze: { name: "Inferno Demonlord", short: "Inferno", emoji: emoji("slayer_blaze", "🔥") },
  vampire: { name: "Riftstalker Bloodfiend", short: "Riftstalker", emoji: emoji("slayer_vampire", "🧛") },
} as const;
export type SlayerId = keyof typeof SLAYERS;

export function slayerLevel(id: SlayerId, xp: number): Level {
  return levelFromTable(xp, neu.leveling.slayer_xp[id], undefined, true);
}

export function hotmLevel(xp: number): Level {
  return treeLevel(xp, neu.leveling.HOTM);
}

export function hotfLevel(xp: number): Level {
  return treeLevel(xp, neu.leveling.HOTF);
}

function treeLevel(xp: number, table: number[]): Level {
  const r = levelFromTable(xp, table.slice(1));
  return { ...r, level: r.level + 1, cap: r.cap + 1 };
}

export function levelWithProgress(l: Level): number {
  return l.level + (l.maxed ? 0 : l.progress);
}
