import type { Json } from "./api.js";
import type { Ctx } from "./context.js";
import { catacombsLevel, levelFromTable, levelWithProgress, type Level } from "./leveling.js";
import { neu } from "./neu.js";

export const CLASSES = ["healer", "mage", "berserk", "archer", "tank"] as const;
export type DungeonClass = (typeof CLASSES)[number];

export interface FloorStats {
  floor: number;
  label: string;
  boss: string;
  completions: number;
  played: number;
  bestScore: number;
  fastest: number;
  fastestS: number;
  fastestSPlus: number;
  mobsKilled: number;
  mostMobs: number;
  watcherKills: number;
}

export interface DungeonsSummary {
  catacombs: Level;
  overflowLevel: number;
  classes: Record<DungeonClass, Level>;
  classAverage: number;
  selectedClass: DungeonClass | null;
  secrets: number;
  totalRuns: number;
  secretsPerRun: number;
  highestFloor: number | null;
  highestMasterFloor: number | null;
  floors: FloorStats[];
  masterFloors: FloorStats[];
  journals: number;
  lastRun: string | null;
  played: boolean;
}

const BOSSES = ["The Watcher", "Bonzo", "Scarf", "The Professor", "Thorn", "Livid", "Sadan", "Necron"];

export function floorLabel(floor: number, master = false): string {
  if (master) return `M${floor}`;
  return floor === 0 ? "Entrance" : `F${floor}`;
}

function floors(type: Json, master: boolean): FloorStats[] {
  if (!type) return [];
  const out: FloorStats[] = [];
  for (let f = master ? 1 : 0; f <= 7; f++) {
    const k = String(f);
    const s: FloorStats = {
      floor: f,
      label: floorLabel(f, master),
      boss: BOSSES[f],
      completions: type.tier_completions?.[k] ?? 0,
      played: type.times_played?.[k] ?? 0,
      bestScore: type.best_score?.[k] ?? 0,
      fastest: type.fastest_time?.[k] ?? 0,
      fastestS: type.fastest_time_s?.[k] ?? 0,
      fastestSPlus: type.fastest_time_s_plus?.[k] ?? 0,
      mobsKilled: type.mobs_killed?.[k] ?? 0,
      mostMobs: type.most_mobs_killed?.[k] ?? 0,
      watcherKills: type.watcher_kills?.[k] ?? 0,
    };
    if (s.completions || s.played || s.bestScore || s.mobsKilled) out.push(s);
  }
  return out;
}

function prettyRun(id: string | undefined): string | null {
  if (!id) return null;
  const m = /^(MASTER_)?CATACOMBS_FLOOR_(\w+)$/.exec(id);
  if (!m) return null;
  const n = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN"].indexOf(m[2]);
  if (n < 0) return null;
  return m[1] ? `Master ${floorLabel(n, true)}` : n === 0 ? "Entrance" : `Floor ${n}`;
}

function completedRuns(type: Json): number {
  const completions = type.tier_completions ?? {};
  return completions.total ?? Object.entries<number>(completions)
    .filter(([floor, count]) => /^[1-9]\d*$/.test(floor) && Number.isFinite(count))
    .reduce((total, [, count]) => total + count, 0);
}

export function dungeonsSummary(ctx: Ctx): DungeonsSummary {
  const d = ctx.member.dungeons ?? {};
  const cata = d.dungeon_types?.catacombs ?? {};
  const master = d.dungeon_types?.master_catacombs ?? {};
  const catacombs = catacombsLevel(cata.experience ?? 0);
  const overflow = levelFromTable(cata.experience ?? 0, neu.leveling.catacombs, neu.leveling.catacombs.length);
  const classes = {} as Record<DungeonClass, Level>;
  for (const c of CLASSES) classes[c] = catacombsLevel(d.player_classes?.[c]?.experience ?? 0);
  const classAverage = CLASSES.reduce((a, c) => a + levelWithProgress(classes[c]), 0) / CLASSES.length;
  const totalRuns = completedRuns(cata) + completedRuns(master);
  const secrets = d.secrets ?? ctx.account.player?.achievements?.skyblock_treasure_hunter ?? 0;
  const selected = CLASSES.includes(d.selected_dungeon_class) ? (d.selected_dungeon_class as DungeonClass) : null;
  return {
    catacombs,
    overflowLevel: levelWithProgress(overflow),
    classes,
    classAverage,
    selectedClass: selected,
    secrets,
    totalRuns,
    secretsPerRun: totalRuns ? secrets / totalRuns : 0,
    highestFloor: cata.highest_tier_completed ?? null,
    highestMasterFloor: master.highest_tier_completed ?? null,
    floors: floors(cata, false),
    masterFloors: floors(master, true),
    journals: d.dungeon_journal?.unlocked_journals?.length ?? 0,
    lastRun: prettyRun(d.last_dungeon_run),
    played: (cata.experience ?? 0) > 0 || totalRuns > 0,
  };
}

export function classBestDamage(ctx: Ctx, cls: DungeonClass): { value: number; floor: string } | null {
  const types = ctx.member.dungeons?.dungeon_types ?? {};
  let best: { value: number; floor: string } | null = null;
  for (const [type, master] of [["catacombs", false], ["master_catacombs", true]] as const) {
    const dmg = types[type]?.[`most_damage_${cls}`] ?? {};
    for (const [k, v] of Object.entries<number>(dmg)) {
      if (k === "best" || !Number.isFinite(v)) continue;
      if (!best || v > best.value) best = { value: v, floor: floorLabel(Number(k), master) };
    }
  }
  return best;
}
