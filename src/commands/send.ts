import type { CustomContext } from "../types";
import { Command } from "@grammyjs/commands";
import { startSendFromDb } from "../emailSender";

export default new Command<CustomContext>(
  "send",
  "Запустить рассылку",
  async (ctx) => {
    await startSendFromDb(ctx.from!.id);
    await ctx.deleteMessage();
  }
);
