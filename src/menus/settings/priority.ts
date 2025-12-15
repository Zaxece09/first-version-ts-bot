import { Menu } from "@grammyjs/menu";
import type { CustomContext } from "../../types";
import { settingsView, priorityView } from "../../views/settings";

export const priorityMenu = new Menu<CustomContext>("priority-menu")
  .text("🔄 Обновить", async (ctx) => {
    await ctx.answerCallbackQuery("🔄 Обновлено");
    await priorityView(ctx);
  })
  .row()
  .text("✏️ Изменить приоритет", async (ctx) => {
    await ctx.conversation.enter("priorityEditConv");
  })
  .text("🗑 Сбросить приоритет", async (ctx) => {
    await ctx.answerCallbackQuery("✅ Приоритеты сброшены");
  })
  .row()
  .text("🔙 Назад", async (ctx) => {
    await settingsView(ctx);
  })
  .text("♻️ Скрыть", async (ctx) => {
    await ctx.answerCallbackQuery("♻️ Скрыто");
    await ctx.deleteMessage();
  });
