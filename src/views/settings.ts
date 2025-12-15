import type { CustomContext } from "../types";

import { settingsMenu } from "../menus/settings";
import { presetsMenu } from "../menus/settings/presets";
import { topicsMenu } from "../menus/settings/topics";
import { spoofMenu } from "../menus/settings/spoof";
import { emailsMenu } from "../menus/settings/emails";
import { proxiesMenu } from "../menus/settings/proxies";
import { intervalMenu } from "../menus/settings/interval";
import { apiKeyMenu } from "../menus/settings/apiKey";
import { priorityMenu } from "../menus/settings/priority";
import { smartPresetsMenu } from "../menus/settings/smartPresets";
import { profileIdMenu } from "../menus/settings/profileId";

import { getPriorityList } from "../utils/priority";

import {
  UserRepo,
  TopicRepo,
  PresetRepo,
  ProxyRepo,
  SmartPresetRepo,
  EmailRepo,
} from "../db/queries";

export async function settingsView(ctx: CustomContext) {
  await ctx.replyOrEdit("⚙️ <b>Настройки:</b>", {
    parse_mode: "HTML",
    reply_markup: settingsMenu,
  });
}

export async function priorityView(ctx: CustomContext) {
  const priorities = await getPriorityList();
  const list = priorities.map((domain, i) => `${i + 1}. ${domain}`).join("\n");

  await ctx.replyOrEdit(`📌 <b>Текущий приоритет:</b>\n\n${list}`, {
    parse_mode: "HTML",
    reply_markup: priorityMenu,
  });
}

export async function presetsView(ctx: CustomContext) {
  const presets = await PresetRepo.list(ctx.from!.id);

  const text =
    "<b>Ваши пресеты:</b>\n\n" +
    (presets.length === 0
      ? "❌ Нет пресетов"
      : presets
          .map(
            (p, i) =>
              `<u><b>Пресет #${i + 1}</b></u>\n\n<code>${p.title}</code>\n<blockquote><code>${p.text}</code></blockquote>`
          )
          .join("\n\n"));

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: presetsMenu,
  });
}

export async function topicsView(ctx: CustomContext) {
  const topics = await TopicRepo.list(ctx.from!.id);

  let text =
    "<b>Ваши темы для писем:</b>\n\n" +
    (topics.length === 0
      ? "❌ Нет тем"
      : topics
          .map(
            (p, i) => `<u><b>Тема #${i + 1}</b></u>\n\n<code>${p.title}</code>`
          )
          .join("\n\n"));

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: topicsMenu,
  });
}

export async function smartPresetsView(ctx: CustomContext) {
  const presets = await SmartPresetRepo.list(ctx.from!.id);

  let text =
    "<b>Ваши умные пресеты:</b>\n\n" +
    (presets.length === 0
      ? "❌ Нет умных пресетов"
      : presets
          .map(
            (p, i) => `<u><b>Пресет #${i + 1}</b></u>\n\n<code>${p.text}</code>`
          )
          .join("\n\n"));

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: smartPresetsMenu,
  });
}

export async function spoofNameView(ctx: CustomContext) {
  const spoofName = await UserRepo.getSpoofName(ctx.from!.id);
  await ctx.replyOrEdit(
    `<b>Текущее имя для спуфинга:</b>\n\n <code>${spoofName}</code>`,
    {
      parse_mode: "HTML",
      reply_markup: spoofMenu,
    }
  );
}

export async function emailsView(ctx: CustomContext, page: number = 1) {
  // получаем список e-mail из базы постранично
  const perPage = 20;
  const total = await EmailRepo.getTotalPages(ctx.from!.id, perPage);
  const current = Math.min(Math.max(page, 1), total);

  const emails = await EmailRepo.listPaginated(
    ctx.from!.id,
    perPage,
    (current - 1) * perPage
  );

  let text =
    "<b>Ваши e-mail:</b>\n\n" +
    (emails.length === 0
      ? "❌ Нет e-mail"
      : emails
          .map((e, i) => {
            const status =
              (e.isValid ? "🟢 Валид" : "🔴 Не валид") +
              (e.isSpam ? " 🚫 Спам" : "");
            return (
              `<u><b>E-mail #${(current - 1) * perPage + i + 1}</b></u>\n\n` +
              `👤 <code>${e.name}</code> ${status}\n` +
              `<code>${e.email}</code>`
            );
          })
          .join("\n\n"));

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: emailsMenu,
  });
}

export async function proxiesView(ctx: CustomContext) {
  const proxies = await ProxyRepo.list(ctx.from!.id);

  let text =
    "<b>Ваши прокси:</b>\n\n" +
    (proxies.length === 0
      ? "❌ Нет прокси"
      : proxies
          .map(
            (p, i) =>
              `<u><b>Прокси #${i + 1}</b></u>\n\n` +
              `<code>${p.proxy}</code>\n` +
              `Статус: ${p.isValid ? "🟢 Валид" : "🔴 Не валид"}`
          )
          .join("\n\n"));

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: proxiesMenu,
  });
}

export async function intervalView(ctx: CustomContext) {
  const { min, max } = await UserRepo.getInterval(ctx.from!.id);
  await ctx.replyOrEdit(
    `<b>Текущий интервал:</b>\n\n<code>[${min},${max}]</code>`,
    {
      parse_mode: "HTML",
      reply_markup: intervalMenu,
    }
  );
}

export async function apiKeyView(ctx: CustomContext) {
  const telegramId = ctx.from!.id;
  const team = await UserRepo.getTeam(telegramId); // ← получаем текущую команду
  const apiKey = await UserRepo.getApiKey(team, telegramId);

  const text = `<b>🔑 Текущий API-ключ (${team.toUpperCase()}):</b>\n\n<code>${apiKey || "—"}</code>`;

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: apiKeyMenu,
  });
}

export async function profileIdView(ctx: CustomContext) {
  const telegramId = ctx.from!.id;
  const team = await UserRepo.getTeam(telegramId); // ← получаем текущую команду
  const profileId = await UserRepo.getProfileId(team, telegramId);

  const text = `<b>🆔 Текущий Profile ID (${team.toUpperCase()}):</b>\n\n<code>${profileId || "—"}</code>`;

  await ctx.replyOrEdit(text, {
    parse_mode: "HTML",
    reply_markup: profileIdMenu,
  });
}
