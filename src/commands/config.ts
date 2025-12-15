import { Keyboard } from "grammy";
import type { CustomContext } from "../types";
import { Command } from "@grammyjs/commands";
import { isAdmin } from "../middlewares/roleMiddleware";
import { getConfig } from "../config";

export default new Command<CustomContext>(
  "config",
  "Проверить конфигурацию (только для админов)",
  async (ctx) => {
    if (!ctx.from) {
      await ctx.reply("❌ Ошибка: Не удалось определить пользователя");
      return;
    }

    // Проверяем является ли пользователь админом
    const userIsAdmin = await isAdmin(ctx.from.id);
    if (!userIsAdmin) {
      await ctx.reply("🚫 У вас нет доступа к просмотру конфигурации.");
      return;
    }

    try {
      const config = getConfig();
      
      let configMessage = "⚙️ <b>Текущая конфигурация</b>\n\n";
      
      configMessage += "🤖 <b>Telegram бот:</b>\n";
      configMessage += `• BOT_TOKEN: ${config.BOT_TOKEN}\n`;
      configMessage += `• ADMIN_IDS: ${config.ADMIN_IDS ? config.ADMIN_IDS.join(', ') : "используется система ролей"}\n\n`;
      
      configMessage += "🗄️ <b>База данных:</b>\n";
      configMessage += `• DB_FILE_NAME: ${config.DB_FILE_NAME}\n\n`;
      
      configMessage += "🧠 <b>AI сервис:</b>\n";
      configMessage += `• DEEPSEEK_API_KEY: ${config.DEEPSEEK_API_KEY}\n\n`;
      
      configMessage += "📧 <b>SMTP настройки:</b>\n";
      configMessage += `• SMTP_HOST: ${config.SMTP_HOST || "не установлен"}\n`;
      configMessage += `• SMTP_PORT: ${config.SMTP_PORT}\n`;
      configMessage += `• SMTP_USER: ${config.SMTP_USER || "не установлен"}\n\n`;
      
      configMessage += "🌐 <b>Прокси настройки:</b>\n";
      configMessage += `• PROXY_HOST: ${config.PROXY_HOST || "не установлен"}\n`;
      configMessage += `• PROXY_PORT: ${config.PROXY_PORT || "не установлен"}\n\n`;
      
      configMessage += "🔧 <b>Дополнительные настройки:</b>\n";
      configMessage += `• DEBUG_MODE: ${config.DEBUG_MODE ? "включен" : "выключен"}\n`;
      configMessage += `• MAX_RETRY_ATTEMPTS: ${config.MAX_RETRY_ATTEMPTS}\n`;
      configMessage += `• DEFAULT_SEND_INTERVAL: ${config.DEFAULT_SEND_INTERVAL}с\n`;

      await ctx.reply(configMessage, {
        parse_mode: "HTML",
      });

    } catch (error) {
      console.error("Error getting config:", error);
      await ctx.reply("❌ Ошибка получения конфигурации");
    }
  }
);