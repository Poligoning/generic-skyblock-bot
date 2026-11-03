export function short(n: number | undefined | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, s] of units) if (abs >= v) return `${trim((n / v).toFixed(digits))}${s}`;
  return trim(n.toFixed(abs < 10 && !Number.isInteger(n) ? 1 : 0));
}

function trim(s: string) {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function commas(n: number | undefined | null): string {
  return Math.floor(n ?? 0).toLocaleString("en-US");
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function relTime(ms: number | undefined): string {
  return ms ? `<t:${Math.floor(ms / 1000)}:R>` : "Never";
}

export function bar(fraction: number, width = 10): string {
  const f = Math.max(0, Math.min(1, fraction));
  const full = Math.round(f * width);
  return "█".repeat(full) + "░".repeat(width - full);
}

export function duration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const parts: string[] = [];
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length || (!d && !h && sec)) parts.push(`${sec}s`);
  return parts.slice(0, 2).join(" ");
}
