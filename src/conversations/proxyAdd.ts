import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { proxiesView } from "../views/settings";
import { ProxyRepo } from "../db/queries";
import { checkProxyHttp } from "../utils/checkProxyHttp";

const composer = new Composer<CustomContext>();


async function proxyAddConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext
) {
  // Кнопка отмены
  const cancelMenu = conversation
    .menu("cancel", { autoAnswer: false })
    .text("🚫 Отмена", async (ctx) => {
      await ctx.menu.close();
      await Menus.middleware()(ctx, () => Promise.resolve());
      await ctx.answerCallbackQuery("⚡️ Действие отменено");
      await proxiesView(ctx);
      await conversation.halt();
    });

  const waitingText =
    "✍️ Отправьте список прокси:\n\n" +
    "<i>Формат: <code>host:port:user:pass</code>\n" +
    "Каждый прокси — с новой строки.\n" +
    "Пример:\n" +
    "proxy.loma.host:38174:m1gtCAPtOj:atamnVzz8r</i>";

  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  // Ждём список
  const answer = await conversation.waitFor(":text");

  const proxiesRaw = answer.msg.text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^.+:\d+:.+:.+$/.test(l)); // фильтруем сразу только по формату

  await answer.deleteMessage();

  if (proxiesRaw.length === 0) {
    if (requestMsg !== true) {
      await requestMsg.editText(
        `${waitingText}\n\n❌ <b>Не найдено корректных строк.</b>`,
        { parse_mode: "HTML", reply_markup: cancelMenu }
      );
    }
    await conversation.halt();
    return;
  }

  // проверка валидности параллельно
  if (requestMsg !== true) {
    await requestMsg.editText("⏳ Проверяем прокси, подождите...", {
      parse_mode: "HTML",
      reply_markup: cancelMenu,
    });
  }

  const results = await Promise.all(
    proxiesRaw.map(async (p) => {
      try {
        const ok = await checkProxyHttp(p);
        return { proxy: p, valid: ok };
      } catch {
        return { proxy: p, valid: false };
      }
    })
  );

  const valid = results.filter((r) => r.valid).map((r) => r.proxy);
  const invalid = results.filter((r) => !r.valid).map((r) => r.proxy);

  try {
    let added = 0;
    if (valid.length > 0) {
      added = await conversation.external((ctx) =>
        ProxyRepo.add(ctx.from!.id, valid)
      );
    }

    if (requestMsg !== true) {
      await requestMsg.editText(
        `✅ Добавлено: <b>${added}</b>\n` +
          `❌ Невалидных: <b>${invalid.length}</b>`,
        { parse_mode: "HTML" }
      );
    }
  } catch (err) {
    if (requestMsg !== true) {
      await requestMsg.editText(
        `❌ Ошибка: <code>${(err as Error).message}</code>`,
        { parse_mode: "HTML" }
      );
    }
    await conversation.halt();
    return;
  }

  // Возврат в меню
  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await proxiesView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(proxyAddConv));
export default composer;
