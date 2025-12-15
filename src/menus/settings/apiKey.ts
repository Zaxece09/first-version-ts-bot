import { Menu } from "@grammyjs/menu";
import type { CustomContext } from "../../types";
import { settingsView } from "../../views/settings";
import { UserRepo } from "../../db/queries";

export const apiKeyMenu = new Menu<CustomContext>("api-key-menu")
  .text("🔄 Установить", async (ctx) => {
    const team = await UserRepo.getTeam(ctx.from!.id);
    await ctx.conversation.enter("apiKeyEditConv", team);
  })
  .text("🔙 Назад", async (ctx) => {
    await settingsView(ctx);
  })
  .row()
  .text("♻️ Скрыть", async (ctx) => {
    await ctx.answerCallbackQuery("♻️ Скрыто");
    await ctx.deleteMessage();
  });