import { mkdirSync, writeFileSync } from "node:fs";
import { loadCommands } from "./commands/index.js";
import { renderWithViews, type Payload, type PlayerCommandSpec } from "./lib/command.js";
import { loadCtx } from "./lib/context.js";

const [cmdName, name, profile, onlyView] = process.argv.slice(2);
if (!cmdName || !name) {
  console.error("usage: npm run preview -- <command|all> <name> [profile|-] [view]");
  process.exit(1);
}

const commands = await loadCommands();
const targets = cmdName === "all" ? [...commands.values()] : [commands.get(cmdName)];
if (!targets[0]) throw new Error(`no command ${cmdName}`);

const ctx = await loadCtx(name, profile && profile !== "-" ? profile : undefined);
const sections: string[] = [];
for (const c of targets) {
  const spec: PlayerCommandSpec | undefined = (c as any).spec;
  if (!spec) continue;
  const views = onlyView ? [onlyView] : spec.views?.map((v) => v.id) ?? [undefined];
  for (const v of views) {
    const out = await renderWithViews(spec, ctx, v);
    const json = toJson(out);
    console.log(`\n===== /${spec.name}${v ? ` [${v}]` : ""} =====`);
    console.log(JSON.stringify(json, null, 1).slice(0, 6000));
    validate(spec.name, v, json);
    sections.push(`<h3>/${spec.name}${v ? ` · ${v}` : ""}</h3>${renderHtml(json)}`);
  }
}
mkdirSync("preview", { recursive: true });
const file = `preview/${cmdName}-${name}.html`;
writeFileSync(file, page(sections.join("\n")));
console.log(`\nwrote ${file}`);

function toJson(p: Payload): any {
  return JSON.parse(JSON.stringify({ embeds: p.embeds ?? [], components: p.components ?? [] }, (_k, v) => (v && typeof v.toJSON === "function" ? v.toJSON() : v)));
}

function validate(cmd: string, view: string | undefined, json: any) {
  const where = `/${cmd}${view ? ` [${view}]` : ""}`;
  let total = 0;
  for (const e of json.embeds) {
    const len = (s?: string) => (s ? s.length : 0);
    if (len(e.title) > 256) console.error(`!! ${where}: title > 256`);
    if (len(e.description) > 4096) console.error(`!! ${where}: description > 4096`);
    if ((e.fields?.length ?? 0) > 25) console.error(`!! ${where}: > 25 fields`);
    for (const f of e.fields ?? []) {
      if (!f.name || !f.value) console.error(`!! ${where}: empty field name/value`, f);
      if (len(f.name) > 256 || len(f.value) > 1024) console.error(`!! ${where}: field too long: ${f.name}`);
      total += len(f.name) + len(f.value);
    }
    total += len(e.title) + len(e.description) + len(e.footer?.text);
    if (/NaN|undefined|\[object Object\]/.test(JSON.stringify(e))) console.error(`!! ${where}: contains NaN/undefined/[object Object]`);
  }
  if (total > 6000) console.error(`!! ${where}: embeds total > 6000 chars`);
  if (json.components.length > 5) console.error(`!! ${where}: > 5 action rows`);
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function md(s = ""): string {
  return esc(s)
    .replace(/&lt;t:(\d+):\w&gt;/g, (_m, t) => new Date(Number(t) * 1000).toLocaleString())
    .replace(/&lt;a?:\w+:(\d+)&gt;/g, (_m, id) => `<img class=emoji src="https://cdn.discordapp.com/emojis/${id}.webp?size=44">`)
    .replace(/```(?:\w*\n)?([\s\S]*?)```/g, "<pre>$1</pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "<a href='$2'>$1</a>")
    .replace(/^-# (.*)$/gm, "<small>$1</small>")
    .replace(/^### (.*)$/gm, "<b class=h3>$1</b>")
    .replace(/\n/g, "<br>");
}

// isn't 1:1 to discord this is just for AI agents to roughly know what they're doing and how it'll look and make sure it's not horribly broken
function renderHtml(json: any): string {
  const embeds = json.embeds.map((e: any) => {
    const fields: string[] = [];
    let row: string[] = [];
    const flush = () => {
      if (row.length) fields.push(`<div class=row>${row.join("")}</div>`);
      row = [];
    };
    for (const f of e.fields ?? []) {
      if (!f.inline || row.length === 3) flush();
      row.push(`<div class=field><div class=fn>${md(f.name)}</div><div class=fv>${md(f.value)}</div></div>`);
      if (!f.inline) flush();
    }
    flush();
    const color = `#${(e.color ?? 0x202225).toString(16).padStart(6, "0")}`;
    return `<div class=embed style="border-color:${color}">
      ${e.thumbnail ? `<img class=thumb src="${e.thumbnail.url}">` : ""}
      ${e.author ? `<div class=author>${esc(e.author.name)}</div>` : ""}
      ${e.title ? `<div class=title>${md(e.title)}</div>` : ""}
      ${e.description ? `<div class=desc>${md(e.description)}</div>` : ""}
      ${fields.join("")}
      ${e.image ? `<img class=image src="${e.image.url}">` : ""}
      ${e.footer ? `<div class=footer>${esc(e.footer.text)}</div>` : ""}
    </div>`;
  });
  const rows = json.components.map(
    (r: any) =>
      `<div class=crow>${r.components
        .map((c: any) => (c.type === 2 ? `<span class="btn ${c.style === 1 ? "primary" : ""}">${c.emoji?.name ?? ""} ${esc(c.label ?? "")}</span>` : `<span class=select>${esc(c.options?.find((o: any) => o.default)?.label ?? c.placeholder ?? "Select")} ▾</span>`))
        .join("")}</div>`,
  );
  return embeds.join("") + rows.join("");
}

function page(body: string) {
  return `<!doctype html><meta charset=utf-8><style>
body{background:#313338;color:#dbdee1;font:15px/1.375 "gg sans","Noto Sans",Helvetica,Arial,sans-serif;padding:16px;max-width:560px}
h3{color:#949ba4;font-size:12px;text-transform:uppercase;margin:24px 0 6px}
.embed{position:relative;background:#2b2d31;border-left:4px solid;border-radius:4px;padding:8px 16px 16px 12px;max-width:520px;margin-bottom:4px}
.thumb{position:absolute;right:16px;top:16px;max-width:80px;max-height:80px;border-radius:3px}
.title{font-weight:600;color:#fff;margin:8px 96px 8px 0}
.desc,.fv{font-size:14px;white-space:normal}
.desc{margin-right:90px}
.row{display:flex;gap:8px;margin-top:8px}.field{flex:1;min-width:0}
.fn{font-weight:600;font-size:14px;color:#fff;margin-bottom:2px}
.footer{font-size:12px;color:#b5bac1;margin-top:8px}
.image{max-width:100%;border-radius:4px;margin-top:16px}
code{background:#1e1f22;border-radius:3px;padding:0 3px;font-size:85%}pre{background:#1e1f22;padding:6px;border-radius:4px;font-size:12px}
small{color:#949ba4;font-size:12px}.h3{font-size:16px;color:#fff}
a{color:#00a8fc;text-decoration:none}.emoji{width:18px;height:18px;vertical-align:-3px}
.crow{display:flex;gap:8px;margin:8px 0;flex-wrap:wrap}.btn{background:#4e5058;color:#fff;padding:2px 16px;border-radius:3px;font-size:14px;line-height:32px}.btn.primary{background:#5865f2}
.select{background:#1e1f22;border:1px solid #1e1f22;padding:8px;border-radius:4px;min-width:400px}
</style>${body}`;
}
