import type { Context, NextFunction } from "grammy";
import { UserRepo } from "../db/queries";

export async function userMiddleware(ctx: Context, next: NextFunction) {
  if (!ctx.from) return next();

  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  
  if (ctx.callbackQuery) {
    console.log(`🔍 [userMiddleware] Callback data: ${ctx.callbackQuery.data?.substring(0, 50)} from user ${telegramId}`);
  }

  try {
    // Проверяем является ли это /start или /admin
    const isStartOrAdmin = ctx.message?.text && 
      (ctx.message.text.startsWith('/start') || ctx.message.text.startsWith('/admin'));

    // Параллельные запросы вместо последовательных (в 3 раза быстрее)
    const [, , , userRole] = await Promise.all([
      UserRepo.upsert(telegramId, username).catch((err) => {
        console.error(`DB upsert error for user ${telegramId}:`, err);
      }),
      UserRepo.updateUsername(telegramId, username).catch((err) => {
        console.error(`DB updateUsername error for user ${telegramId}:`, err);
      }),
      UserRepo.updateLastOnline(telegramId).catch((err) => {
        console.error(`DB updateLastOnline error for user ${telegramId}:`, err);
      }),
      // ВСЕГДА получаем роль (кроме /start и /admin)
      isStartOrAdmin
        ? Promise.resolve("user")
        : UserRepo.getRole(telegramId).catch(() => "user")
    ]);

    // Проверяем роль пользователя для всех действий кроме /start и /admin
    const needsRoleCheck = (ctx.message || ctx.callbackQuery || ctx.inlineQuery) && !isStartOrAdmin;
    
    if (needsRoleCheck && userRole === "guest") {
      console.log(`🚫 [userMiddleware] Blocking guest user ${telegramId}, role: ${userRole}`);
      const message = "🚫 <b>Доступ ограничен</b>\n\n" +
        "У вас нет доступа к боту. Обратитесь к администратору для получения доступа.\n\n" +
        `Ваш ID: <code>${telegramId}</code>`;
      
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: "🚫 Нет доступа к боту", show_alert: true }).catch(() => {});
        await ctx.reply(message, { parse_mode: "HTML" }).catch(() => {});
      } else {
        await ctx.reply(message, { parse_mode: "HTML" }).catch(() => {});
      }
      return; // Не вызываем next(), прерываем обработку
    }
    
    if (ctx.callbackQuery) {
      console.log(`✅ [userMiddleware] Passing callback to next(), user ${telegramId} has role: ${userRole}`);
    }
  } catch (error) {
    console.error(`❌ Critical middleware error for user ${telegramId}:`, error);
    // Не блокируем пользователя при ошибке БД
  }

  // идём дальше по цепочке
  if (ctx.callbackQuery) {
    console.log(`➡️ [userMiddleware] Calling next() for callback from user ${telegramId}`);
  }
  await next();
  if (ctx.callbackQuery) {
    console.log(`⬅️ [userMiddleware] Returned from next() for callback from user ${telegramId}`);
  }
}
