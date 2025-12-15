import { Composer, InputFile } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";

import { startCheckFromDb, isUserProcessing } from "../emailQueue";
import { nickify, toTxt, buildAdverts } from "../utils/nickify";
import { AdvertsRepo } from "../db/queries/adverts";

const composer = new Composer<CustomContext>();

// --- Функция разговора ---
async function nickCheckConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext
) {
  if (isUserProcessing(ctx.from!.id)) {
    await ctx.reply(
      "⏳ У вас уже идёт подбор. Новый запуск невозможен до завершения текущего."
    );
    await conversation.halt();
  }

  // Файл уже отправлен пользователем, сразу получаем его из контекста
  const document = ctx.message?.document ? ctx : await conversation.waitFor(":document");

  const path = await conversation.external(async (ctx) => {
    const file = await ctx.getFile();
    return await file.download();
  });
  const content = await Bun.file(path).text();
  const candidates = buildAdverts(content);

  // сколько уникальных кандидатов прошло первичный фильтр
  const prepared = candidates.length;

  // добавляем в БД под текущего пользователя (по telegramId)
  const insertedCount = await AdvertsRepo.bulkAddByTelegramId(
    ctx.from!.id,
    candidates
  );

  // отдаём файл с никами, как и раньше
  const { nicks, text } = nickify(content);
  await ctx.replyWithDocument(new InputFile(toTxt(text), "nicks.txt"), {
    caption: `🔎 Найдено никнеймов: <b>${nicks.length}</b>\n🗃 Отобрано объявлений: <b>${prepared}</b>\n✅ Добавлено в БД: <b>${insertedCount}</b>`,
    parse_mode: "HTML",
  });

  await ctx.reply("⏳ Файл получен, начинаю обработку...");

  conversation.external(async (ctx) => {
    startCheckFromDb(ctx, 3000);
  });

  await conversation.halt();
}

composer.use(createConversation(nickCheckConv));

export default composer;
