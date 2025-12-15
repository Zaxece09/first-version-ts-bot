import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { topicsView } from "../views/settings";
import { TopicRepo } from "../db/queries";

const composer = new Composer<CustomContext>();

async function topicEditConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext,
  topicId: number,
  oldTitle: string
) {
  const cancelMenu = conversation.menu("cancel", { autoAnswer: false }).text("🚫 Отмена", async (ctx) => {
    await ctx.menu.close();
    await Menus.middleware()(ctx, () => Promise.resolve());
    await ctx.answerCallbackQuery("⚡️ Действие отменено");
    await topicsView(ctx);
    await conversation.halt();
  });

  const waitingText =
    `✍️ Редактирование темы: <b>${oldTitle}</b>\n\n` +
    "<i>Введите новое название (до 32 символов)</i>";

  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  const answer = await conversation.waitFor(":text").and(
    (ctx) => /^.{1,32}$/s.test(ctx.msg.text.trim()),
    {
      otherwise: async (ctx) => {
        if (ctx.callbackQuery) return;
        await ctx.deleteMessage();
        if (requestMsg !== true) {
          try {
            await requestMsg.editText(
              `${waitingText}\n\n❌ <b>Некорректный ввод!</b> Название должно быть длиной до 32 символов.`,
              { parse_mode: "HTML", reply_markup: cancelMenu }
            );
          } catch {}
        }
      },
    }
  );

  const newTitle = answer.msg.text.trim().toUpperCase();
  await answer.deleteMessage();

  try {
    await conversation.external((ctx) => TopicRepo.update(ctx.from!.id, topicId, newTitle));
    if (requestMsg !== true) await requestMsg.editText(`✅ Тема обновлена!`);
  } catch (err) {
    if (requestMsg !== true) {
      await requestMsg.editText(`❌ Ошибка: <code>${(err as Error).message}</code>`, { parse_mode: "HTML" });
    }
    await conversation.halt();
  }

  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await topicsView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(topicEditConv));
export default composer;
