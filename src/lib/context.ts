import { emoji } from "./emoji.js";
import { getAccount, UserError, type Account, type Json } from "./api.js";
import { skillLevel, SKILLS, type Level, type Skill } from "./leveling.js";

export interface Ctx {
  account: Account;
  uuid: string;
  name: string;
  profile: Json;
  member: Json;
  members: Record<string, Json>;
  fresh?: boolean;
  anon?: boolean;
}

export function resolveName(name: string | null | undefined): string {
  const n = name?.trim();
  if (!n) throw new UserError("Give a Minecraft username.");
  return n;
}

export function pickProfile(account: Account, profileName?: string | null): Json {
  const profiles = account.profiles.filter((p) => p.members?.[account.uuid]);
  if (!profiles.length) throw new UserError(`**${account.name}** has no SkyBlock profiles.`);
  if (profileName) {
    const p = profiles.find((x) => x.cute_name?.toLowerCase() === profileName.toLowerCase() || x.profile_id === profileName);
    if (!p) throw new UserError(`**${account.name}** has no profile called \`${profileName}\`. Their profiles: ${profiles.map((x) => x.cute_name).join(", ")}.`);
    return p;
  }
  return profiles.find((p) => p.selected) ?? profiles.sort((a, b) => lastSave(b, account.uuid) - lastSave(a, account.uuid))[0];
}

function lastSave(p: Json, uuid: string): number {
  return p.members?.[uuid]?.profile?.first_join ?? 0;
}

export async function loadCtx(name: string, profileName?: string | null, fresh = false): Promise<Ctx> {
  const account = await getAccount(name, fresh);
  const profile = pickProfile(account, profileName);
  const members: Record<string, Json> = {};
  for (const [id, m] of Object.entries<Json>(profile.members ?? {})) if (!m.profile?.deletion_notice || id === account.uuid) members[id] = m;
  return { account, uuid: account.uuid, name: account.name, profile, member: profile.members[account.uuid], members };
}

export function anonymize(ctx: Ctx): Ctx {
  return { ...ctx, name: "Anonymous", anon: true };
}

export function gameModeIcon(profile: Json): string {
  switch (profile.game_mode) {
    case "ironman": return ` ${emoji("armor", "♲")}`;
    case "bingo": return ` ${emoji("bingo", "🎲")}`;
    case "island": return ` ${emoji("island", "🏝️")}`;
    default: return "";
  }
}

export function skillCapBonus(ctx: Ctx, skill: Skill): number {
  const m = ctx.member;
  if (skill === "farming") return m.jacobs_contest?.perks?.farming_level_cap ?? 0;
  if (skill === "taming") return Math.min(10, m.pets_data?.pet_care?.pet_types_sacrificed?.length ?? 0);
  return m.player_data?.experience?.[`SKILL_${skill.toUpperCase()}_extra_level_cap`] ?? 0;
}

export function skillsApiEnabled(ctx: Ctx): boolean {
  return ctx.member.player_data?.experience != null;
}

export function skills(ctx: Ctx): Record<Skill, Level> {
  const exp = ctx.member.player_data?.experience ?? {};
  const out = {} as Record<Skill, Level>;
  for (const s of SKILLS) {
    let xp = exp[`SKILL_${s.toUpperCase()}`] ?? 0;
    if (s === "social") xp = Object.values<Json>(ctx.profile.members ?? {}).reduce((a, m) => a + (m?.player_data?.experience?.SKILL_SOCIAL ?? 0), 0);
    out[s] = skillLevel(s, xp, skillCapBonus(ctx, s));
  }
  return out;
}
