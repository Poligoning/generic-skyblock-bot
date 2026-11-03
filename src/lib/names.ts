const cache = new Map<string, string>();

export async function nameOf(uuid: string): Promise<string | null> {
  const id = uuid.replace(/-/g, "");
  if (cache.has(id)) return cache.get(id)!;
  try {
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const name = (await res.json())?.name;
    if (typeof name === "string") cache.set(id, name);
    return name ?? null;
  } catch {
    return null;
  }
}
