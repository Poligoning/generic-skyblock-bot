import { readFileSync } from "node:fs";

const emojis: Record<string, string> = (() => {
  try {
    const data: Record<string, unknown> = JSON.parse(readFileSync(new URL("../../data/emojis.json", import.meta.url), "utf8"));
    return Object.fromEntries(Object.entries(data).filter((e): e is [string, string] => typeof e[1] === "string" && /^<a?:[a-z0-9_]{2,32}:\d+>$/.test(e[1])));
  } catch {
    return {};
  }
})();

export function emoji(key: string, fallback: string): string {
  return Object.hasOwn(emojis, key) ? emojis[key] : fallback;
}
