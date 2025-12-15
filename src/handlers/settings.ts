import { Composer } from "grammy";

import type { CustomContext } from "../types";
import { settingsView } from "../views/settings";

const composer = new Composer<CustomContext>();

composer.hears("⚙️ Настройки", async (ctx) => {
  await settingsView(ctx);
  await ctx.deleteMessage();
});


/*composer.hears("📧 Отправить email", async (ctx) => {
  await priorityView(ctx);
});*/

export default composer;