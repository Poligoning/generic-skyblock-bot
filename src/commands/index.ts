import { readdirSync } from "node:fs";
import type { Command } from "../lib/command.js";

export async function loadCommands(): Promise<Map<string, Command>> {
  const dir = new URL(".", import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f) && !f.startsWith("index.") && !f.startsWith("_"));
  const map = new Map<string, Command>();
  for (const f of files) {
    const mod = await import(new URL(f, dir).href);
    for (const c of Object.values<any>(mod)) if (c?.data?.name && typeof c.run === "function") map.set(c.data.name, c);
  }
  return map;
}
