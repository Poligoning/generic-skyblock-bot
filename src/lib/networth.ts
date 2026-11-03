import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { emoji } from "./emoji.js";
import type { Item, NetworthResult } from "skyhelper-networth";
import { UserError } from "./api.js";
import type { Ctx } from "./context.js";

const lib = await (async () => {
  const original = globalThis.setInterval;
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => original(...args).unref()) as typeof setInterval;
  try {
    return await import("skyhelper-networth");
  } finally {
    globalThis.setInterval = original;
  }
})();
(lib.UpdateManager as unknown as { disable(): void }).disable();

export type CategoryId =
  | "armor" | "equipment" | "wardrobe" | "inventory" | "enderchest" | "storage" | "personal_vault"
  | "accessories" | "pets" | "sacks" | "essence" | "misc";

export const CATEGORIES: { id: CategoryId; name: string; emoji: string; sources: string[] }[] = [
  { id: "armor", name: "Armor", emoji: emoji("armor", "🛡️"), sources: ["armor"] },
  { id: "equipment", name: "Equipment", emoji: emoji("equipment", "🧣"), sources: ["equipment"] },
  { id: "wardrobe", name: "Wardrobe", emoji: emoji("wardrobe", "👔"), sources: ["wardrobe"] },
  { id: "inventory", name: "Inventory", emoji: emoji("inventory", "🎒"), sources: ["inventory"] },
  { id: "enderchest", name: "Ender Chest", emoji: emoji("enderchest", "📦"), sources: ["enderchest"] },
  { id: "storage", name: "Storage", emoji: emoji("storage", "🗄️"), sources: ["storage"] },
  { id: "personal_vault", name: "Personal Vault", emoji: emoji("personal_bank", "🔐"), sources: ["personal_vault"] },
  { id: "accessories", name: "Accessories", emoji: emoji("accessories", "💍"), sources: ["accessories"] },
  { id: "pets", name: "Pets", emoji: emoji("pets", "🐾"), sources: ["pets"] },
  { id: "sacks", name: "Sacks", emoji: emoji("inventory", "💰"), sources: ["sacks"] },
  { id: "essence", name: "Essence", emoji: emoji("essence", "✨"), sources: ["essence"] },
  {
    id: "misc",
    name: "Misc",
    emoji: emoji("carpentry", "🧰"),
    sources: ["fishing_bag", "potion_bag", "sacks_bag", "candy_inventory", "carnival_mask_inventory", "quiver", "farming_toolkit", "hunting_toolkit"],
  },
];

export interface NetworthItem {
  id: string;
  name: string;
  count: number;
  price: number;
  soulbound: boolean;
  cosmetic: boolean;
}

export interface NetworthCategory {
  id: CategoryId;
  name: string;
  emoji: string;
  total: number;
  unsoulbound: number;
  items: NetworthItem[];
}

export interface Networth {
  total: number;
  unsoulbound: number;
  purse: number;
  bank: number;
  personalBank: number;
  coins: number;
  inventoryApi: boolean;
  bankApi: boolean;
  museumIncluded: boolean;
  categories: NetworthCategory[];
  computedAt: number;
}

const TTL = 5 * 60 * 1000;
const PRICE_TTL = 60 * 60 * 1000;
const PRICE_RETRY = 5 * 60 * 1000;
const PRICE_TIMEOUT = 20_000;
const PRICE_FILE = new URL("../../data/prices.json", import.meta.url);
const cache = new Map<string, { at: number; value: Networth }>();
interface PriceSnapshot {
  fetchedAt: number;
  prices: Record<string, number>;
}
let priceCache: PriceSnapshot | undefined;
let priceRefresh: Promise<void> | undefined;
let priceUpdaterStarted = false;

export function startPriceUpdater(): void {
  if (priceUpdaterStarted) return;
  priceUpdaterStarted = true;
  try {
    const saved = JSON.parse(readFileSync(PRICE_FILE, "utf8"));
    if (saved && typeof saved.fetchedAt === "number" && Number.isFinite(saved.fetchedAt)
      && saved.fetchedAt >= 0 && saved.fetchedAt <= Date.now() && validPrices(saved.prices)) {
      priceCache = { fetchedAt: saved.fetchedAt, prices: saved.prices };
    }
  } catch {}
  const remaining = priceCache ? PRICE_TTL - (Date.now() - priceCache.fetchedAt) : 0;
  if (remaining > 0) schedulePriceRefresh(remaining);
  else void refreshPrices();
}

function schedulePriceRefresh(delay: number): void {
  setTimeout(() => void refreshPrices(), delay).unref();
}

function refreshPrices(): Promise<void> {
  if (priceRefresh) return priceRefresh;
  priceRefresh = (async () => {
    let delay = PRICE_TTL;
    try {
      const prices = await fetchPrices();
      const snapshot = { fetchedAt: Date.now(), prices };
      priceCache = snapshot;
      void persistPrices(snapshot).catch((err) => console.error("Couldn't persist item prices", err));
    } catch (err) {
      delay = PRICE_RETRY;
      console.error("Couldn't refresh item prices", err);
    } finally {
      priceRefresh = undefined;
      schedulePriceRefresh(delay);
    }
  })();
  return priceRefresh;
}

async function persistPrices(snapshot: PriceSnapshot): Promise<void> {
  await mkdir(new URL(".", PRICE_FILE), { recursive: true });
  const temporary = new URL("prices.json.tmp", PRICE_FILE);
  await writeFile(temporary, JSON.stringify(snapshot), "utf8");
  await rename(temporary, PRICE_FILE);
}

function validPrices(data: unknown): data is Record<string, number> {
  return !!data && typeof data === "object" && !Array.isArray(data) && !!Object.keys(data).length
    && Object.values(data).every((v) => typeof v === "number" && Number.isFinite(v));
}

export async function getNetworth(ctx: Ctx): Promise<Networth> {
  const key = `${ctx.profile.profile_id}:${ctx.uuid}`;
  const hit = cache.get(key);
  if (!ctx.fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  cache.delete(key);
  const value = await compute(ctx);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return value;
}

async function loadPrices(): Promise<Record<string, number>> {
  if (!priceCache) await refreshPrices();
  if (!priceCache) throw new UserError("Couldn't load item prices, try again shortly");
  return priceCache.prices;
}

async function fetchPrices(): Promise<Record<string, number>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch("https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json", { signal: controller.signal });
        if (!response.ok) throw new Error(`Price request failed: ${response.status}`);
        const data: unknown = await response.json();
        if (!validPrices(data)) throw new Error("Invalid item prices");
        return data;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Price request timed out")), PRICE_TIMEOUT);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function compute(ctx: Ctx): Promise<Networth> {
  const prices = await loadPrices();
  const bank = ctx.profile.banking?.balance;
  const calc = new lib.ProfileNetworthCalculator(ctx.member, undefined, bank ?? 0);
  const r: NetworthResult = await calc.getNetworth({ prices, sortItems: true, stackItems: true });
  const types = r.types as Record<string, { total: number; unsoulboundTotal: number; items?: Item[] }>;

  const categories = CATEGORIES.map(({ id, name, emoji, sources }) => {
    const parts = sources.map((s) => types[s]).filter(Boolean);
    return {
      id,
      name,
      emoji,
      total: sum(parts.map((p) => p.total)),
      unsoulbound: sum(parts.map((p) => p.unsoulboundTotal)),
      items: parts
        .flatMap((p) => p.items ?? [])
        .map(toItem)
        .filter((i) => i.price > 0)
        .sort((a, b) => b.price - a.price),
    };
  });

  return {
    total: num(r.networth),
    unsoulbound: num(r.unsoulboundNetworth),
    purse: num(r.purse),
    bank: num(r.bank),
    personalBank: num(r.personalBank),
    coins: num(r.purse) + num(r.bank) + num(r.personalBank),
    inventoryApi: ctx.member.inventory?.inv_contents != null,
    bankApi: bank != null,
    museumIncluded: false,
    categories,
    computedAt: Date.now(),
  };
}

function toItem(i: Item): NetworthItem {
  return {
    id: i.id ?? "",
    name: itemName(i),
    count: Number.isFinite(i.count) && i.count > 0 ? i.count : 1,
    price: num(i.price),
    soulbound: !!i.soulbound,
    cosmetic: !!i.cosmetic,
  };
}

function itemName(i: Item): string {
  const rune = /^Rune (.+) (\d)$/.exec(i.name ?? "");
  if (rune) return `${rune[1]} Rune ${["I", "II", "III"][Number(rune[2]) - 1] ?? rune[2]}`;
  return (i.name ?? i.id ?? "Unknown Item").replace(/§./g, "").replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ").trim();
}

function num(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function sum(ns: number[]): number {
  return ns.reduce((a, n) => a + num(n), 0);
}
