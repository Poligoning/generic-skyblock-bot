export class UserError extends Error {}

export type Json = any;

export interface Account {
  uuid: string;
  name: string;
  player: Json;
  profiles: Json[];
  fetchedAt: number;
}

// i use my router instead of the actual skyblock api for this, you can easily swap it out if u want to use the real one and have a key
const BASE = (process.env.SKYBLOCK_API_BASE ?? "https://api.60000i.sk").replace(/\/$/, "");
const KEY = process.env.SKYBLOCK_API_KEY ?? "";
const TTL = 5 * 60 * 1000;

const cache = new Map<string, Account>();
const inflight = new Map<string, Promise<Account>>();

async function call(path: string): Promise<Json> {
  const url = `${BASE}/${path}${path.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(KEY)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new UserError("The SkyBlock API didn't respond. Try again in a moment.");
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) throw new Error("API key rejected (check SKYBLOCK_API_KEY)");
  if (res.status === 404 || res.status === 400 || (body && body.success === false && /not found|no player|not a valid username/i.test(body.cause ?? ""))) {
    throw new UserError("That player doesn't exist.");
  }
  if (!res.ok || !body?.success) {
    throw new UserError(`The SkyBlock API returned an error${body?.cause ? `: ${body.cause}` : ""}.`);
  }
  return body;
}

export async function getAccount(name: string, fresh = false): Promise<Account> {
  let key = name.toLowerCase().trim();
  if (/^[0-9a-f-]{32,36}$/.test(key)) key = key.replace(/-/g, "");
  if (!/^[a-z0-9_]{1,16}$/.test(key) && !/^[0-9a-f]{32}$/.test(key)) {
    throw new UserError(`\`${name}\` isn't a valid Minecraft username.`);
  }
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.fetchedAt < TTL) return hit;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const [p, sb] = await Promise.all([call(encodeURIComponent(key)), call(`${encodeURIComponent(key)}/skyblock`)]);
    if (!p.player) throw new UserError(`\`${name}\` has never joined Hypixel.`);
    const account: Account = {
      uuid: p.player.uuid,
      name: p.player.displayname ?? name,
      player: p.player,
      profiles: sb.profiles ?? [],
      fetchedAt: Date.now(),
    };
    for (const k of new Set([key, account.uuid.replace(/-/g, ""), account.name.toLowerCase()])) cache.set(k, account);
    while (cache.size > 1500) cache.delete(cache.keys().next().value!);
    return account;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
