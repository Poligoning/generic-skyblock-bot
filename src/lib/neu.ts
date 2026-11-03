import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const REPO = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants";
const DIR = "data/neu";

async function load(name: string): Promise<any> {
  const file = `${DIR}/${name}.json`;
  try {
    const res = await fetch(`${REPO}/${name}.json`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, text);
    return data;
  } catch (err) {
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      console.warn(`NEU ${name}: using cached copy (${(err as Error).message})`);
      return data;
    } catch {
      throw new Error(`Couldn't download NEU constant "${name}" and there's no cached copy in ${DIR}/: ${(err as Error).message}`);
    }
  }
}

const [leveling, hotm, hotf, pets, petnums, misc, fairySouls] = await Promise.all(
  ["leveling", "hotmlayout", "hotflayout", "pets", "petnums", "misc", "fairy_souls"].map(load),
);

export const neu = { leveling, hotm, hotf, pets, petnums, misc, fairySouls };
