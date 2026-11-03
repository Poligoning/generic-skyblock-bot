import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type AutocompleteInteraction,
  type BaseMessageOptions,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { getAccount } from "./api.js";
import { anonymize, loadCtx, resolveName, type Ctx } from "./context.js";

export type Payload = Pick<BaseMessageOptions, "embeds" | "components" | "files">;

export interface Command {
  data: { name: string; toJSON(): unknown };
  run(i: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(i: AutocompleteInteraction): Promise<void>;
  component?(i: MessageComponentInteraction, args: string[]): Promise<void>;
  modal?(i: ModalSubmitInteraction, args: string[]): Promise<void>;
}

export interface View {
  id: string;
  label: string;
  emoji?: string;
}

export interface PlayerCommandSpec {
  name: string;
  description: string;
  views?: View[];
  viewStyle?: "buttons" | "select";
  variant?: { suffix: string; on: string; off: string };
  extraOptions?: (b: SlashCommandOptionsOnlyBuilder) => SlashCommandOptionsOnlyBuilder;
  initialView?: (i: ChatInputCommandInteraction) => string | undefined;
  render(ctx: Ctx, view: string | undefined): Payload | Promise<Payload>;
}

export const MAX_ID = 100;

const anonTargets = new Map<string, [string, string]>();

function anonToken(ctx: Ctx): string {
  const token = randomBytes(9).toString("base64url");
  anonTargets.set(token, [ctx.uuid, ctx.profile.profile_id]);
  if (anonTargets.size > 5000) anonTargets.delete(anonTargets.keys().next().value!);
  return token;
}

export function viewRow(spec: PlayerCommandSpec, ctx: Ctx, current: string | undefined): ActionRowBuilder<any>[] {
  const views = spec.views;
  if (!views?.length) return [];
  const target = ctx.anon ? `anon:${anonToken(ctx)}` : `${ctx.uuid}:${ctx.profile.profile_id}`;
  const id = (v: string) => `${spec.name}:${v}:${target}`.slice(0, MAX_ID);
  if (spec.viewStyle === "select" || views.length > 5) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(id("_select"))
      .addOptions(views.slice(0, 25).map((v) => ({ label: v.label, value: v.id, emoji: v.emoji, default: v.id === current })));
    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
  }
  const suffix = spec.variant?.suffix ?? "";
  const active = !!suffix && !!current?.endsWith(suffix);
  const base = active ? current!.slice(0, -suffix.length) : current;
  const rows: ActionRowBuilder<any>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      views.map((v) => {
        const b = new ButtonBuilder().setCustomId(id(v.id + (active ? suffix : ""))).setLabel(v.label).setStyle(v.id === base ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(v.id === base);
        if (v.emoji) b.setEmoji(v.emoji);
        return b;
      }),
    ),
  ];
  if (spec.variant) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(id(`${base}${active ? "" : suffix}`)).setLabel(active ? spec.variant.off : spec.variant.on).setStyle(active ? ButtonStyle.Danger : ButtonStyle.Secondary),
      ),
    );
  }
  return rows;
}

export async function renderWithViews(spec: PlayerCommandSpec, ctx: Ctx, view: string | undefined): Promise<Payload> {
  const v = view ?? spec.views?.[0]?.id;
  const out = await spec.render(ctx, v);
  return { ...out, components: [...(out.components ?? []), ...viewRow(spec, ctx, v)] };
}

export function playerCommand(spec: PlayerCommandSpec): Command & { spec: PlayerCommandSpec } {
  let builder: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
    .setName(spec.name)
    .setDescription(spec.description)
    .addStringOption((o) => o.setName("name").setDescription("Minecraft username (leave empty for an anonymous lookup)").setMinLength(1).setMaxLength(36))
    .addStringOption((o) => o.setName("profile").setDescription("Profile name (defaults to the selected one)").setMaxLength(32).setAutocomplete(true));
  if (spec.extraOptions) builder = spec.extraOptions(builder);

  return {
    spec,
    data: builder,
    async run(i) {
      if (!i.options.getString("name")?.trim()) {
        const input = new TextInputBuilder().setCustomId("ign").setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(36).setPlaceholder("Hidden from the reply");
        const modal = new ModalBuilder()
          .setCustomId(`${spec.name}:_anon:${i.options.getString("profile") ?? ""}`.slice(0, MAX_ID))
          .setTitle("Anonymous lookup")
          .addLabelComponents(new LabelBuilder().setLabel("Minecraft username").setTextInputComponent(input));
        await i.showModal(modal);
        return;
      }
      await i.deferReply();
      const ctx = await loadCtx(resolveName(i.options.getString("name")), i.options.getString("profile"));
      await i.editReply(await renderWithViews(spec, ctx, spec.initialView?.(i)));
    },
    autocomplete: profileAutocomplete,
    async modal(i, [kind, ...profile]) {
      if (kind !== "_anon") return;
      await i.deferReply();
      const ctx = anonymize(await loadCtx(i.fields.getTextInputValue("ign").trim(), profile.join(":") || null));
      await i.editReply(await renderWithViews(spec, ctx, spec.views?.[0]?.id));
    },
    async component(i, [view, uuid, profileId]) {
      if (i.user.id !== i.message.interaction?.user.id && i.message.interactionMetadata?.user.id !== i.user.id) {
        await i.reply({ content: "Run the command yourself to switch views.", ephemeral: true });
        return;
      }
      if (view === "_select" && i.isStringSelectMenu()) view = i.values[0];
      let anon = false;
      if (uuid === "anon") {
        const target = anonTargets.get(profileId);
        if (!target) {
          await i.reply({ content: "This lookup expired, run the command again.", ephemeral: true });
          return;
        }
        [uuid, profileId] = target;
        anon = true;
      }
      await i.deferUpdate();
      const loaded = await loadCtx(uuid, profileId);
      const ctx = anon ? anonymize(loaded) : loaded;
      await i.editReply(await renderWithViews(spec, ctx, view));
    },
  };
}

export async function profileAutocomplete(i: AutocompleteInteraction) {
  const focused = i.options.getFocused(true);
  if (focused.name !== "profile") return i.respond([]);
  try {
    const name = resolveName(i.options.getString("name"));
    const account = await Promise.race([getAccount(name), new Promise<never>((_, r) => setTimeout(() => r(new Error("slow")), 2500))]);
    const q = focused.value.toLowerCase();
    await i.respond(
      account.profiles
        .filter((p) => p.members?.[account.uuid] && p.cute_name?.toLowerCase().includes(q))
        .slice(0, 25)
        .map((p) => ({ name: `${p.cute_name}${p.selected ? " (selected)" : ""}${p.game_mode ? ` · ${p.game_mode}` : ""}`, value: p.cute_name })),
    );
  } catch {
    await i.respond([]).catch(() => {});
  }
}
