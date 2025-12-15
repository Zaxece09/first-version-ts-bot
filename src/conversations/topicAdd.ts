import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { topicsView } from "../views/settings";
import { TopicRepo } from "../db/queries";

const composer = new Composer<CustomContext>();

async function topicAddConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext
) {
  const cancelMenu = conversation.menu("cancel", { autoAnswer: false }).text("🚫 Отмена", async (ctx) => {
    await ctx.menu.close();
    await Menus.middleware()(ctx, () => Promise.resolve());
    await ctx.answerCallbackQuery("⚡️ Действие отменено");
    await topicsView(ctx);
    await conversation.halt();
  });

  const waitingText =
    "✍️ Введите название темы (до 32 символов):";

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
              `${waitingText}\n\n❌ <b>Некорректный ввод!</b> Название должно быть длиной до 32 символов..`,
              { parse_mode: "HTML", reply_markup: cancelMenu }
            );
          } catch {}
        }
      },
    }
  );

  const title = answer.msg.text.trim().toUpperCase();
  await answer.deleteMessage();

  try {
    await conversation.external((ctx) => TopicRepo.add(ctx.from!.id, title));
    if (requestMsg !== true) await requestMsg.editText("✅ Тема успешно добавлена!");
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

composer.use(createConversation(topicAddConv));
export default composer;
