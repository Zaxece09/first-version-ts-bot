import type { CustomContext } from "../types";
import type { NextFunction } from "grammy";

export default async function replyOrEditMiddleware(
  ctx: CustomContext,
  next: NextFunction
) {
  ctx.replyOrEdit = async (text, other) => {
    const send = () => ctx.reply(text, other);

    if (!ctx.callbackQuery) return send();

    try {
      return await ctx.editMessageText(text, {
        ...other,
        // В editMessageText допускаются только inline кнопки
        reply_markup:
          other?.reply_markup && "inline_keyboard" in other.reply_markup
            ? other.reply_markup
            : undefined,
      });
    } catch (err: any) {
      // Игнорируем ошибку "message is not modified"
      if (err?.description?.includes("message is not modified")) {
        return; // ничего не делаем
      }

      return send();
    }
  };

  await next();
}
