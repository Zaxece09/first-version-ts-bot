import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { proxiesView } from "../views/settings";
import { ProxyRepo } from "../db/queries";
import { checkProxyHttp } from "../utils/checkProxyHttp";

const composer = new Composer<CustomContext>();

async function proxyEditConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext,
  proxyId: number,
  oldProxy: string
) {
  const cancelMenu = conversation
    .menu("cancel", { autoAnswer: false })
    .text("🚫 Отмена", async (ctx) => {
      await ctx.menu.close();
      await Menus.middleware()(ctx, () => Promise.resolve());
      await ctx.answerCallbackQuery("⚡️ Действие отменено");
      await proxiesView(ctx);
      await conversation.halt();
    });

  let requestMsg = await ctx.editMessageText(
    `✍️ Редактирование прокси:\n\n<code>${oldProxy}</code>\n\n` +
      "<i>Введите новый прокси в формате <code>host:port:user:pass</code></i>",
    { parse_mode: "HTML", reply_markup: cancelMenu }
  );

  // Ставим чекпоинт
  const checkpoint = conversation.checkpoint();

  // === Ввод прокси ===
  const askProxy = async () => {
    const answer = await conversation.waitFor(":text").and(
      (ctx) => /^.+:\d+:.+:.+$/.test(ctx.msg.text.trim()),
      {
        otherwise: async (ctx) => {
          if (ctx.callbackQuery) return;
          await ctx.deleteMessage();
          if (requestMsg !== true) {
            await requestMsg.editText(
              `❌ Некорректный ввод!\n\nВведите прокси в формате <code>host:port:user:pass</code>`,
              { parse_mode: "HTML", reply_markup: cancelMenu }
            );
          }
          await conversation.rewind(checkpoint); // вернуться к запросу
        },
      }
    );

    const newProxy = answer.msg.text.trim();
    await answer.deleteMessage();

    if (requestMsg !== true) {
      await requestMsg.editText(
        `⏳ Проверка прокси...\n\n<code>${newProxy}</code>`,
        { parse_mode: "HTML", reply_markup: cancelMenu }
      );
    }

    const isValid = await checkProxyHttp(newProxy);

    if (!isValid) {
      if (requestMsg !== true) {
        await requestMsg.editText(
          `❌ Данные прокси невалидны.\n\nВведите новые прокси в формате <code>host:port:user:pass</code>`,
          { parse_mode: "HTML", reply_markup: cancelMenu }
        );
      }
      await conversation.rewind(checkpoint); // вернуться к запросу
      return;
    }

    // валидный → сохраняем
    await conversation.external((ctx) =>
      ProxyRepo.update(ctx.from!.id, proxyId, newProxy, true)
    );

    if (requestMsg !== true) {
      await requestMsg.editText(
        `✅ Прокси обновлён и прошёл проверку!\n\n<code>${newProxy}</code>`,
        { parse_mode: "HTML" }
      );
    }
  };

  await askProxy();

  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await proxiesView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(proxyEditConv));
export default composer;
