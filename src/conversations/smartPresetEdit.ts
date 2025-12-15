import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { smartPresetsView } from "../views/settings";
import { SmartPresetRepo, TopicRepo } from "../db/queries";

const composer = new Composer<CustomContext>();

async function smartPresetEditConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext,
  presetId: number,
  oldText: string
) {
  const cancelMenu = conversation
    .menu("cancel", { autoAnswer: false })
    .text("🚫 Отмена", async (ctx) => {
      await ctx.menu.close();
      await Menus.middleware()(ctx, () => Promise.resolve());
      await ctx.answerCallbackQuery("⚡️ Действие отменено");
      await smartPresetsView(ctx);
      await conversation.halt();
    });

  const waitingText =
    `✍️ Редактирование умного пресета:\n\n<code>${oldText}</code>\n\n` +
    "<i>Введите новый текст (до 512 символов).";

  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  const answer = await conversation.waitFor(":text").and(
    (ctx) => {
      const text = ctx.msg.text.trim();
      if (text.length === 0 || text.length > 512) return false;
      return true;
    },
    {
      otherwise: async (ctx) => {
        if (ctx.callbackQuery) return;
        await ctx.deleteMessage();
        if (requestMsg !== true) {
          try {
            await requestMsg.editText(
              `${waitingText}\n\n❌ <b>Некорректный ввод!</b>\nДо 512 символов и хотя бы одна тема в тексте.`,
              { parse_mode: "HTML", reply_markup: cancelMenu }
            );
          } catch {}
        }
      },
    }
  );

  const newText = answer.msg.text.trim();
  await answer.deleteMessage();

  try {
    await conversation.external((ctx) =>
      SmartPresetRepo.update(ctx.from!.id, presetId, newText)
    );
    if (requestMsg !== true) {
      await requestMsg.editText("✅ Умный пресет успешно обновлён!");
    }
  } catch (err) {
    if (requestMsg !== true) {
      await requestMsg.editText(
        `❌ Ошибка: <code>${(err as Error).message}</code>`,
        { parse_mode: "HTML" }
      );
    }
    await conversation.halt();
  }

  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await smartPresetsView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(smartPresetEditConv));
export default composer;
