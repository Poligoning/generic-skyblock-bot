import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) throw new Error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env");

const DIR = "emojis";
const OUT = "data/emojis.json";
const HASHES = "data/emoji-hashes.json";
const endpoint = `https://discord.com/api/v10/applications/${clientId}/emojis`;
const force = process.argv.includes("--force");
const prune = !process.argv.includes("--no-prune");

function readJson(file: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

async function discord(method: string, path = "", body?: unknown): Promise<any> {
  for (;;) {
    const res = await fetch(endpoint + path, {
      method,
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const data: any = await res.json().catch(() => ({}));
      await sleep(Math.ceil((data.retry_after ?? 1) * 1000) + 250);
      continue;
    }
    if (!res.ok) throw new Error(`Discord ${method} ${path || "/"} failed: HTTP ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
}

const files = readdirSync(DIR).filter((f) => /^[a-z0-9_]{2,32}\.(png|gif|webp|jpe?g)$/.test(f)).sort();
const local = new Set(files.map((f) => f.replace(/\.\w+$/, "")));
const remote: { id: string; name: string; animated?: boolean }[] = (await discord("GET")).items;
const existing = new Map(remote.map((e) => [e.name, e]));
const hashes = readJson(HASHES);
const map: Record<string, string> = {};
let uploaded = 0, replaced = 0, kept = 0, removed = 0;

if (prune) {
  for (const e of remote.filter((e) => !local.has(e.name))) {
    await discord("DELETE", `/${e.id}`);
    existing.delete(e.name);
    delete hashes[e.name];
    removed++;
    console.log(`Removed ${e.name}`);
  }
}

for (const file of files) {
  const name = file.replace(/\.\w+$/, "");
  const buf = readFileSync(`${DIR}/${file}`);
  const hash = createHash("sha256").update(buf).digest("hex");
  const current = existing.get(name);
  if (current && !force && (hashes[name] === hash || !hashes[name])) {
    map[name] = `<${current.animated ? "a" : ""}:${name}:${current.id}>`;
    hashes[name] = hash;
    kept++;
    continue;
  }
  if (current) await discord("DELETE", `/${current.id}`);
  const mime = file.endsWith(".gif") ? "image/gif" : file.endsWith(".webp") ? "image/webp" : /jpe?g$/.test(file) ? "image/jpeg" : "image/png";
  const created = await discord("POST", "", { name, image: `data:${mime};base64,${buf.toString("base64")}` });
  map[name] = `<${created.animated ? "a" : ""}:${name}:${created.id}>`;
  hashes[name] = hash;
  if (current) replaced++;
  else uploaded++;
  console.log(`${current ? "Replaced" : "Uploaded"} ${name}`);
}

mkdirSync("data", { recursive: true });
writeFileSync(OUT, JSON.stringify(map, null, 2));
writeFileSync(HASHES, JSON.stringify(Object.fromEntries(Object.entries(hashes).filter(([k]) => local.has(k)).sort()), null, 2));
console.log(`Done: ${uploaded} uploaded, ${replaced} replaced, ${kept} unchanged, ${removed} removed (${files.length} in ${DIR}/)`);
