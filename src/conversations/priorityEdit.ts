import { Composer } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import { getPriorityList } from "../utils/priority";
import Menus from "../menus";
import { priorityView } from "../views/settings";

const composer = new Composer<CustomContext>();

async function priorityEditConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext
) {

  const priorities = await getPriorityList();
  const count = priorities.length;
  // Генерируем список доменов
  const list = priorities.map((domain, i) => `${i + 1}. ${domain}`).join("\n");
  // Рандомный порядок для примера
  const numbers = Array.from({ length: count }, (_, i) => String(i + 1)).sort(
    () => Math.random() - 0.5
  );
  const example = numbers.join("");
  const exampleOrder = numbers.map((n) => priorities[+n - 1]!).join(", ");


  // Кнопка отмены
  const cancelMenu = conversation
    .menu("cancel", { autoAnswer: false })
    .text("🚫 Отмена", async (ctx) => {
      await ctx.menu.close();
      await Menus.middleware()(ctx, () => Promise.resolve());
      await ctx.answerCallbackQuery("⚡️ Действие отменено");
      await priorityView(ctx);
      await conversation.halt();
    });

  const waitingText =
    `Соответствие цифры с доменом:\n\n${list}\n\n` +
    `Введите ${count} цифр для установки приоритета 💪\n` +
    `(например, <b>${example}</b> → приоритет будет)\n` +
    `<code>${exampleOrder}</code>`;
  // Отправляем инструкцию
  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });
  // Ждём корректный ввод пользователя
  const answer = await conversation.waitFor(":text").and(
    (ctx) => {
      const input = ctx.msg.text.trim();
      // Проверки
      if (!/^\d+$/.test(input)) return false; // Только цифры
      if (input.length !== count) return false; // Длина
      const digits = input.split("").map(Number);
      if (digits.some((n) => n < 1 || n > count)) return false; // В диапазоне
      if (new Set(digits).size !== digits.length) return false; // Без дублей
      return true;
    },
    {
      otherwise: async (ctx) => {
        if (ctx.callbackQuery) return;
        ctx.deleteMessage();
        if (requestMsg !== true) {
          await requestMsg.editText(
            `${waitingText}\n\n❌ <b>Пошёл нахуй!</b> Введи корректные цифры 🤡`,
            {
              parse_mode: "HTML",
              reply_markup: cancelMenu,
            }
          );
        }
      },
    }
  );

  await answer.deleteMessage();
  if (requestMsg !== true)
    await requestMsg.editText("✅ Приоритет успешно обновлён!");

  await conversation.external(async (ctx) => {
    await Menus.middleware()(ctx, () => Promise.resolve());
    await priorityView(ctx);
  });
  await conversation.halt();
}

composer.use(createConversation(priorityEditConv));
export default composer;
