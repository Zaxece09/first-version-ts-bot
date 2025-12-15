import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { intervalView } from "../views/settings";
import { UserRepo } from "../db/queries";

const composer = new Composer<CustomContext>();

async function intervalEditConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext
) {
  const cancelMenu = conversation
    .menu("cancel", { autoAnswer: false })
    .text("🚫 Отмена", async (ctx) => {
      await ctx.menu.close();
      await Menus.middleware()(ctx, () => Promise.resolve());
      await ctx.answerCallbackQuery("⚡️ Действие отменено");
      await intervalView(ctx);
      await conversation.halt();
    });

  const waitingText =
    "✍️ Введите новый интервал через пробел:\n\n" +
    "<i>Два числа от 0 до 30, где первое ≤ второе.</i>\n\n" +
    "Пример: <code>5 15</code>";

  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  const answer = await conversation.waitFor(":text").and(
    (ctx) => {
      const raw = ctx.msg.text.trim().split(/\s+/);
      if (raw.length !== 2) return false;
      const min = Number(raw[0]);
      const max = Number(raw[1]);
      return (
        !isNaN(min) &&
        !isNaN(max) &&
        min >= 0 &&
        max >= 0 &&
        min <= 30 &&
        max <= 30 &&
        min <= max
      );
    },
    {
      otherwise: async (ctx) => {
        if (ctx.callbackQuery) return;
        await ctx.deleteMessage();
        if (requestMsg !== true) {
          try {
            await requestMsg.editText(
              `${waitingText}\n\n❌ <b>Некорректный ввод!</b> Введите два числа от 0 до 30 (min ≤ max).`,
              { parse_mode: "HTML", reply_markup: cancelMenu }
            );
          } catch {}
        }
      },
    }
  );

  const raw = answer.msg.text.trim().split(/\s+/);
  const min = Number(raw[0]);
  const max = Number(raw[1]);
  await answer.deleteMessage();

  try {
    await conversation.external((ctx) => UserRepo.setInterval(ctx.from!.id, min, max));
    if (requestMsg !== true) {
      await requestMsg.editText("✅ Интервал успешно обновлён!");
    }
  } catch (err) {
    if (requestMsg !== true) {
      await requestMsg.editText(
        `❌ Ошибка при обновлении интервала: <code>${(err as Error).message}</code>`,
        { parse_mode: "HTML" }
      );
    }
    await conversation.halt();
  }

  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await intervalView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(intervalEditConv));
export default composer;
