// commands/stop.ts
import type { CustomContext } from "../types";
import { Command } from "@grammyjs/commands";
import { stopSendForUser } from "../emailSender";

export default new Command<CustomContext>(
  "stop",
  "Остановить рассылку",
  async (ctx) => {
    await stopSendForUser(ctx.from!.id);
    await ctx.deleteMessage();
  }
);
