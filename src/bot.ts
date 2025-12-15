// bot.ts
import { Bot, GrammyError, HttpError, session, InlineKeyboard } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { autoRetry } from "@grammyjs/auto-retry";
import { conversations } from "@grammyjs/conversations";
import { commands } from "@grammyjs/commands";
import { limit } from "@grammyjs/ratelimiter";
import { hydrateApi, hydrateContext, hydrate } from "@grammyjs/hydrate";
import { hydrateFiles } from "@grammyjs/files";
import { EntitiesParser } from "@qz/telegram-entities-parser";
import type { Message } from "@qz/telegram-entities-parser/types";

import replyOrEditMiddleware from "./middlewares/ReplyOrEdit";
import type { CustomContext, CustomApi, SessionData } from "./types";
import { BOT_TOKEN } from "./config";
import { userCommands } from "./commands";
import { userMiddleware } from "./middlewares/userMiddleware";
import Conv from "./conversations";
import Handlers from "./handlers";
import Menus from "./menus";
import Callbacks from "./callbacks";

export const bot = new Bot<CustomContext, CustomApi>(BOT_TOKEN);

function initial(): SessionData {
  return { step: "" };
}

bot.use(limit());
bot.api.config.use(
  autoRetry({
    maxRetryAttempts: 3, // до 3 повторов
    maxDelaySeconds: 30, // ждём до 30 сек (Telegram retry_after обычно 10–20)
    rethrowInternalServerErrors: false, // 500ки тоже ретраим
    rethrowHttpErrors: false, // сетевые ошибки ретраим
  })
);

// Middleware для таймаута всех операций (защита от зависаний)
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery) {
    console.log(`🔍 [bot.ts] Callback received: ${ctx.callbackQuery.data?.substring(0, 50)} from user ${ctx.from?.id}`);
  }
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timeout")), 30000); // 30 секунд
  });

  try {
    await Promise.race([next(), timeoutPromise]);
    if (ctx.callbackQuery) {
      console.log(`✅ [bot.ts] Callback processed successfully for user ${ctx.from?.id}`);
    }
  } catch (err: any) {
    if (err?.message?.includes("timeout")) {
      console.error(`⏱ Timeout for user ${ctx.from?.id}, update ${ctx.update.update_id}`);
      await ctx.reply("⏱ Операция заняла слишком много времени. Попробуйте еще раз.").catch(() => {});
      // НЕ пробрасываем ошибку дальше - обработали
      return;
    } else {
      console.error(`❌ [bot.ts] Error in middleware chain:`, err);
      throw err;
    }
  }
});

// Удалено - фильтр блокировал нормальные conversation menu callback_query

bot.use(session({ 
  initial,
  // Защита от переполнения session
  getSessionKey: (ctx) => {
    return ctx.chat?.id && ctx.from?.id
      ? `${ctx.chat.id}:${ctx.from.id}`
      : undefined;
  },
}));
bot.use(replyOrEditMiddleware);
bot.use(hydrateContext());
bot.api.config.use(hydrateApi());
bot.api.config.use(hydrateFiles(bot.token));

bot.use(
  sequentialize((ctx) => {
    const chat = ctx.chat?.id.toString();
    const user = ctx.from?.id.toString();
    return [chat, user].filter((con) => con !== undefined);
  })
);

bot.use(
  conversations<CustomContext, CustomContext>({
    plugins: [hydrate(), replyOrEditMiddleware],
  })
);

bot.use(commands());
bot.use(userMiddleware);
bot.use(userCommands);
await userCommands.setCommands(bot);
bot.use(Conv);
bot.use(Menus);
bot.use(Callbacks);
bot.use(Handlers);

bot.catch(async (err) => {
  const ctx = err.ctx;
  console.error(`❌ Ошибка при обработке обновления ${ctx.update.update_id} (user: ${ctx.from?.id}):`);
  const e = err.error;
  
  if (e instanceof GrammyError) {
    console.error("Ошибка в запросе:", e.description);
    // Уведомляем пользователя о проблеме
    if (e.description.includes("message is not modified")) {
      // Игнорируем - это нормально
    } else {
      await ctx.reply("❌ Произошла ошибка. Попробуйте еще раз.").catch(() => {});
    }
  } else if (e instanceof HttpError) {
    console.error("Не удалось связаться с Telegram:", e);
    await ctx.reply("❌ Проблема связи с Telegram. Попробуйте позже.").catch(() => {});
  } else {
    console.error("Неизвестная ошибка:", e);
    await ctx.reply("❌ Произошла неожиданная ошибка. Попробуйте /start").catch(() => {});
  }
});
