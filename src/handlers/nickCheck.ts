import { Composer } from "grammy";
import type { CustomContext } from "../types";

const composer = new Composer<CustomContext>();

// Автоматический запуск при отправке .json или .txt файлов
composer.on("message:document", async (ctx: CustomContext) => {
  const fileName = ctx.message.document.file_name || "";
  if (fileName.endsWith(".json") || fileName.endsWith(".txt")) {
    await ctx.conversation.enter("nickCheckConv");
  }
});

export default composer;
