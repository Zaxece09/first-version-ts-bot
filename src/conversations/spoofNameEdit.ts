import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { spoofNameView } from "../views/settings";
import { UserRepo } from "../db/queries";

const composer = new Composer<CustomContext>();

async function spoofNameEditConv(
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
      await spoofNameView(ctx);
      await conversation.halt();
    });

  const waitingText =
    "✍️ Введите новое имя для спуфинга:\n\n" +
    "<i>Только текст, до 64 символов.</i>";

  // Отправляем инструкцию
  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  // Ждём корректный ввод пользователя
  const answer = await conversation.waitFor(":text").and(
    (ctx) => {
      const input = ctx.msg.text.trim();
      return input.length > 0 && input.length <= 64;
    },
    {
      otherwise: async (ctx) => {
        if (ctx.callbackQuery) return;
        await ctx.deleteMessage();
        if (requestMsg !== true)
          try {
            await requestMsg.editText(
              `${waitingText}\n\n❌ <b>Некорректный ввод!</b> Нужно от 1 до 64 символов.`,
              {
                parse_mode: "HTML",
                reply_markup: cancelMenu,
              }
            );
          } catch {}
      },
    }
  );

  const spoofName = answer.msg.text.trim();
  await answer.deleteMessage();

  try {
    await conversation.external(async (ctx) => {
      await UserRepo.setSpoofName(ctx.from!.id, spoofName);
    });

    if (requestMsg !== true)
      await requestMsg?.editText("✅ Имя для спуфинга успешно обновлено!");
  } catch (err) {
    if (requestMsg !== true)
      await requestMsg.editText(
        `❌ Ошибка при обновлении имени: <code>${(err as Error).message}</code>`,
        { parse_mode: "HTML" }
      );
    await conversation.halt();
  }

  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await spoofNameView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(spoofNameEditConv));
export default composer;
