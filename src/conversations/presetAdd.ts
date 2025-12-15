import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import Menus from "../menus";
import { presetsView } from "../views/settings";
import { PresetRepo } from "../db/queries";

const composer = new Composer<CustomContext>();

async function presetAddConv(
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
      await presetsView(ctx);
      await conversation.halt();
    });

  // --- Ввод TITLE ---
  const titleText =
    "✍️ Введите название пресета:\n\n" +
    "<i>До 32 символов, буквы/цифры/пробелы, будет автоматически переведено в ЗАГЛАВНЫЕ.</i>";

  const titleMsg = await ctx.editMessageText(titleText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  const titleAnswer = await conversation
    .waitFor(":text")
    .and(
      (ctx) =>
        ctx.msg.text.trim().length > 0 && ctx.msg.text.trim().length <= 32,
      {
        otherwise: async (ctx) => {
          if (ctx.callbackQuery) return;
          await ctx.deleteMessage();
          if (titleMsg !== true) {
            try {
              await titleMsg.editText(
                `${titleText}\n\n❌ <b>Некорректный ввод!</b> Название должно быть от 1 до 32 символов.`,
                { parse_mode: "HTML", reply_markup: cancelMenu }
              );
            } catch {}
          }
        },
      }
    );

  const title = titleAnswer.msg.text.trim().toUpperCase();
  await titleAnswer.deleteMessage();

  // --- Ввод TEXT ---
  const textInstruction = `📝 Теперь введите текст для пресета <b>${title}</b>`;

  if (titleMsg !== true) {
    await titleMsg.editText(textInstruction, {
      parse_mode: "HTML",
      reply_markup: cancelMenu,
    });
  }

  const textAnswer = await conversation
    .waitFor(":text")
    .and(
      (ctx) =>
        ctx.msg.text.trim().length > 0 && ctx.msg.text.trim().length <= 1024,
      {
        otherwise: async (ctx) => {
          if (ctx.callbackQuery) return;
          await ctx.deleteMessage();
          if (titleMsg !== true) {
            try {
              await titleMsg.editText(
                `${textInstruction}\n\n❌ <b>Некорректный ввод!</b> Текст должен быть от 1 до 1024 символов.`,
                { parse_mode: "HTML", reply_markup: cancelMenu }
              );
            } catch {}
          }
        },
      }
    );

  const text = textAnswer.msg.text.trim();
  await textAnswer.deleteMessage();

  // --- Сохраняем ---
  try {
    await conversation.external((ctx) =>
      PresetRepo.add(ctx.from!.id, title, text)
    );
    if (titleMsg !== true)
      await titleMsg.editText("✅ Пресет успешно добавлен!");
  } catch (err) {
    if (titleMsg !== true) {
      await titleMsg.editText(
        `❌ Ошибка: <code>${(err as Error).message}</code>`,
        { parse_mode: "HTML" }
      );
    }
    await conversation.halt();
  }

  // --- Возврат в меню ---
  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await presetsView(ctx);
  });

  await conversation.halt();
}

composer.use(createConversation(presetAddConv));
export default composer;
