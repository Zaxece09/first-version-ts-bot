import type { CustomContext } from "../types";
import { Command } from "@grammyjs/commands";
import { EmailStreamManager } from "../emailStream";

export default new Command<CustomContext>(
  "status",
  "Проверить статус потока чтения",
  async (ctx) => {
    await ctx.deleteMessage();
    const statusText = await EmailStreamManager.status(ctx.from!.id);
    await ctx.reply(statusText, { parse_mode: "HTML" });
  }
);
