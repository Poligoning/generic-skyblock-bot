import type { Json } from "./api.js";
import type { Ctx } from "./context.js";
import { neu } from "./neu.js";
import { memberPets, type Pet } from "./pets.js";

export const MINION_SLOTS: [number, number][] = [
  [0, 5], [5, 6], [15, 7], [30, 8], [50, 9], [75, 10], [100, 11], [125, 12], [150, 13], [175, 14], [200, 15], [225, 16],
  [250, 17], [275, 18], [300, 19], [350, 20], [400, 21], [450, 22], [500, 23], [550, 24], [600, 25], [650, 26], [700, 27],
];

export function skyblockLevel(ctx: Ctx): number {
  return (ctx.member.leveling?.experience ?? 0) / 100;
}

export function fairySouls(ctx: Ctx): { collected: number; total: number; unspent: number; exchanges: number } {
  const f = ctx.member.fairy_soul ?? {};
  return {
    collected: f.total_collected ?? 0,
    total: neu.fairySouls["Max Souls"] ?? 0,
    unspent: f.unspent_souls ?? 0,
    exchanges: f.fairy_exchanges ?? 0,
  };
}

export function craftedGenerators(ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const m of Object.values<Json>(ctx.profile.members ?? {})) for (const g of m?.player_data?.crafted_generators ?? []) out.add(g);
  return out;
}

export function communityUpgrade(ctx: Ctx, id: string): number {
  return (ctx.profile.community_upgrades?.upgrade_states ?? []).filter((u: Json) => u.upgrade === id).reduce((a: number, u: Json) => Math.max(a, u.tier ?? 0), 0);
}

export interface MinionSlots {
  total: number;
  crafted: number;
  community: number;
  uniqueCrafted: number;
  nextAt: number | null;
}

export function minionSlots(ctx: Ctx): MinionSlots {
  const uniqueCrafted = craftedGenerators(ctx).size;
  let crafted = 5;
  let nextAt: number | null = null;
  for (const [need, slots] of MINION_SLOTS) {
    if (uniqueCrafted >= need) crafted = slots;
    else {
      nextAt = need;
      break;
    }
  }
  const community = communityUpgrade(ctx, "minion_slots");
  return { total: crafted + community, crafted, community, uniqueCrafted, nextAt };
}

export function activePet(ctx: Ctx): Pet | null {
  return memberPets(ctx.member).find((p) => p.active) ?? null;
}
