import type { Ctx } from "./context.js";
import { SLAYERS, slayerLevel, type Level, type SlayerId } from "./leveling.js";
import { neu } from "./neu.js";

export interface SlayerStats {
  id: SlayerId;
  name: string;
  short: string;
  emoji: string;
  level: Level;
  kills: number[];
  attempts: number[];
  totalKills: number;
  coinsSpent: number;
}

export interface SlayerSummary {
  slayers: SlayerStats[];
  totalXp: number;
  totalKills: number;
  coinsSpent: number;
}

const COSTS: number[] = neu.misc.slayer_cost ?? [2000, 7500, 20000, 50000, 100000];

export function slayerTiers(id: SlayerId): number {
  return neu.leveling.slayer_to_highest_tier?.[id] ?? 5;
}

export function slayerSummary(ctx: Ctx): SlayerSummary {
  const bosses = ctx.member.slayer?.slayer_bosses ?? {};
  const slayers = (["zombie", "spider", "wolf", "enderman", "vampire", "blaze"] as SlayerId[]).map((id): SlayerStats => {
    const b = bosses[id] ?? {};
    const tiers = slayerTiers(id);
    const kills = Array.from({ length: tiers }, (_, t) => b[`boss_kills_tier_${t}`] ?? 0);
    const attempts = Array.from({ length: tiers }, (_, t) => Math.max(b[`boss_attempts_tier_${t}`] ?? 0, kills[t]));
    const coinsSpent = id === "vampire" ? 0 : attempts.reduce((a, n, t) => a + n * (COSTS[t] ?? 0), 0);
    return {
      id,
      ...SLAYERS[id],
      level: slayerLevel(id, b.xp ?? 0),
      kills,
      attempts,
      totalKills: kills.reduce((a, n) => a + n, 0),
      coinsSpent,
    };
  });
  return {
    slayers,
    totalXp: slayers.reduce((a, s) => a + s.level.xp, 0),
    totalKills: slayers.reduce((a, s) => a + s.totalKills, 0),
    coinsSpent: slayers.reduce((a, s) => a + s.coinsSpent, 0),
  };
}
