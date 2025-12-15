import type { CustomContext } from "../types";
import { UserRepo } from "../db/queries";
import { InlineKeyboard } from "grammy";
import {
  showAdminPanel,
  promptUserIdInput,
  showAccessList,
  buildUserActionsKeyboard,
  resetAdminStep,
} from "./adminPanel";

export async function handleAdminCallbacks(ctx: CustomContext) {
  if (!ctx.callbackQuery?.data || !ctx.from) return;

  const data = ctx.callbackQuery.data;
  
  // Проверяем админские права
  const userIsAdmin = await isAdmin(ctx.from.id);
  if (!userIsAdmin) {
    await ctx.answerCallbackQuery("🚫 У вас нет прав доступа");
    return;
  }

  try {
    if (data === "admin_manage") {
      resetAdminStep(ctx);
      await ctx.answerCallbackQuery();
      await promptUserIdInput(ctx, "edit");

    } else if (data === "admin_access" || data === "access_view") {
      resetAdminStep(ctx);
      await ctx.answerCallbackQuery();
      await showAccessList(ctx, "edit");

    } else if (data === "admin_home" || data === "admin_back") {
      resetAdminStep(ctx);
      await ctx.answerCallbackQuery();
      await showAdminPanel(ctx, "edit");

    } else if (data === "admin_close") {
      resetAdminStep(ctx);
      await ctx.answerCallbackQuery("Админ панель закрыта");
      try {
        await ctx.editMessageText("👋 Админ панель закрыта.");
      } catch (error) {
        console.error("Error closing admin panel:", error);
      }

    } else if (data.startsWith("grant_user_")) {
      const telegramId = parseInt(data.replace("grant_user_", ""));
      await UserRepo.setRole(telegramId, "user");
      
      await ctx.answerCallbackQuery("✅ Доступ выдан!");
      await ctx.editMessageText(
        `✅ <b>Доступ выдан</b>\n\nПользователь с ID <code>${telegramId}</code> получил роль "user"`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("👥 Управление", "admin_manage")
            .row()
            .text("⬅️ Назад", "admin_home"),
        }
      );

    } else if (data.startsWith("grant_admin_")) {
      const telegramId = parseInt(data.replace("grant_admin_", ""));
      await UserRepo.setRole(telegramId, "admin");
      
      await ctx.answerCallbackQuery("👑 Админские права выданы!");
      await ctx.editMessageText(
        `👑 <b>Админские права выданы</b>\n\nПользователь с ID <code>${telegramId}</code> получил роль "admin"`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("👥 Управление", "admin_manage")
            .row()
            .text("⬅️ Назад", "admin_home"),
        }
      );

    } else if (data.startsWith("revoke_access_")) {
      const telegramId = parseInt(data.replace("revoke_access_", ""));
      await UserRepo.setRole(telegramId, "guest");
      
      await ctx.answerCallbackQuery("🚫 Доступ заблокирован!");
      await ctx.editMessageText(
        `🚫 <b>Доступ заблокирован</b>\n\nПользователь с ID <code>${telegramId}</code> получил роль "guest"`,
        {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("👥 Управление", "admin_manage")
            .row()
            .text("⬅️ Назад", "admin_home"),
        }
      );

    } else if (data.startsWith("user_manage_")) {
      const telegramId = parseInt(data.replace("user_manage_", ""));
      
      const user = await UserRepo.getUserByTelegramId(telegramId);
      if (!user) {
        await ctx.answerCallbackQuery("❌ Пользователь не найден");
        return;
      }

      const roleEmoji = user.role === "admin" ? "👑" : user.role === "user" ? "👤" : "🚫";
      const username = user.username ? `@${user.username}` : "Без ника";

      await ctx.editMessageText(
        `👤 <b>Управление пользователем</b>\n\n` +
        `${roleEmoji} <b>${username}</b>\n` +
        `ID: <code>${telegramId}</code>\n` +
        `Роль: <b>${user.role}</b>\n` +
        `Дата регистрации: ${new Date(user.createdAt).toLocaleString("ru-RU")}\n` +
        `Последняя активность: ${new Date(user.lastOnline).toLocaleString("ru-RU")}\n\n` +
        "Выберите действие:",
        {
          reply_markup: buildUserActionsKeyboard(telegramId)
            .row()
            .text("� Назад к списку", "admin_access"),
          parse_mode: "HTML",
        }
      );

    } else if (data.startsWith("copy_id_")) {
      const telegramId = data.replace("copy_id_", "");
      await ctx.answerCallbackQuery(`📋 ID скопирован: ${telegramId}`, { show_alert: true });

    } else if (data === "admin_keys") {
      // Показать список ключей
      console.log("🔑 Keys management requested by user:", ctx.from?.id);
      await showKeysManagement(ctx);

    } else if (data === "keys_add") {
      // Добавить новый ключ
      console.log("➕ Add key requested by user:", ctx.from?.id);
      await promptAddKey(ctx);

    } else if (data.startsWith("key_view_")) {
      const keyId = parseInt(data.replace("key_view_", ""));
      console.log("👁️ View key requested:", keyId, "by user:", ctx.from?.id);
      await showKeyDetails(ctx, keyId);

    } else if (data.startsWith("key_edit_")) {
      const keyId = parseInt(data.replace("key_edit_", ""));
      console.log("✏️ Edit key requested:", keyId, "by user:", ctx.from?.id);
      await promptEditKey(ctx, keyId);

    } else if (data.startsWith("key_delete_")) {
      const keyId = parseInt(data.replace("key_delete_", ""));
      console.log("🗑️ Delete key requested:", keyId, "by user:", ctx.from?.id);
      await deleteKey(ctx, keyId);
    }

  } catch (error) {
    console.error("Error in admin callbacks:", error);
    await ctx.answerCallbackQuery("❌ Ошибка выполнения операции");
  }
}

// === УПРАВЛЕНИЕ КЛЮЧАМИ ===

async function showKeysManagement(ctx: CustomContext) {
  console.log("📋 Loading keys list...");
  const { KeysRepo } = await import("../db/queries");
  
  try {
    console.log("🔍 Fetching all keys from database...");
    const allKeys = await KeysRepo.getAll();
    console.log("📊 Keys fetched:", allKeys.length, "total");
    
    let message = "🔑 <b>Управление API ключами</b>\n\n";
    
    if (allKeys.length === 0) {
      console.log("❌ No keys found in database");
      message += "❌ Ключи отсутствуют\n\n";
      message += "Для работы парсера необходимо добавить хотя бы один ключ.";
      
      const keyboard = new InlineKeyboard()
        .text("➕ Добавить ключ", "keys_add")
        .row()
        .text("⬅️ Назад", "admin_home");
      
      await ctx.editMessageText(message, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      console.log("✅ Empty keys message sent");
      return;
    }
    
    console.log("🔨 Building keyboard with keys...");
    const keyboard = new InlineKeyboard();
    
    allKeys.forEach((key, index) => {
      const status = key.enabled ? "🟢" : "🔴";
      const maskedKey = key.keyValue.length > 8 
        ? `…${key.keyValue.slice(-8)}` 
        : key.keyValue;
      
      console.log(`📝 Adding key ${index + 1}: ${maskedKey} (enabled: ${key.enabled})`);
      keyboard.text(`${status} ${maskedKey} (${key.rps} RPS)`, `key_view_${key.id}`);
      if (index % 1 === 0) keyboard.row(); // Каждый ключ на новой строке
    });
    
    keyboard
      .text("➕ Добавить ключ", "keys_add")
      .row()
      .text("⬅️ Назад", "admin_home");
    
    message += `Всего ключей: ${allKeys.length}\n`;
    message += `Активных: ${allKeys.filter(k => k.enabled).length}\n`;
    message += `Неактивных: ${allKeys.filter(k => !k.enabled).length}\n\n`;
    message += "Нажмите на ключ для управления:";
    
    console.log("📤 Sending keys management message...");
    await ctx.editMessageText(message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    console.log("✅ Keys management message sent successfully");
    
  } catch (error) {
    console.error("❌ Error in showKeysManagement:", error);
    await ctx.answerCallbackQuery("❌ Ошибка загрузки ключей");
  }
}

async function showKeyDetails(ctx: CustomContext, keyId: number) {
  const { KeysRepo } = await import("../db/queries");
  
  try {
    const key = await KeysRepo.getById(keyId);
    
    if (!key) {
      await ctx.answerCallbackQuery("❌ Ключ не найден");
      return;
    }
    
    const status = key.enabled ? "🟢 Активен" : "🔴 Неактивен";
    const maskedKey = key.keyValue.length > 8 
      ? `…${key.keyValue.slice(-8)}` 
      : key.keyValue;
    
    let message = `🔑 <b>Детали ключа</b>\n\n`;
    message += `Ключ: <code>${maskedKey}</code>\n`;
    message += `Статус: ${status}\n`;
    message += `RPS: ${key.rps}\n`;
    message += `Создан: ${new Date(key.createdAt * 1000).toLocaleString("ru-RU")}\n`;
    
    if (!key.enabled && key.errorMessage) {
      message += `\n❌ <b>Ошибка:</b>\n<code>${key.errorMessage}</code>`;
    }
    
    const keyboard = new InlineKeyboard()
      .text("🔄 Заменить", `key_edit_${keyId}`)
      .text("🗑️ Удалить", `key_delete_${keyId}`)
      .row()
      .text("⬅️ К списку", "admin_keys");
    
    await ctx.editMessageText(message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка загрузки ключа");
  }
}

async function promptAddKey(ctx: CustomContext) {
  ctx.session.step = "await_key_add";
  
  const message = "🔑 <b>Добавление нового ключа</b>\n\n" +
    "Отправьте API ключ в формате:\n" +
    "<code>ключ:rps</code>\n\n" +
    "Например:\n" +
    "<code>sub_1SFE1jAJu6gy4fiYvO7eASIF:5</code>\n\n" +
    "Если не указать RPS, будет использовано значение по умолчанию (5).";
  
  const keyboard = new InlineKeyboard()
    .text("❌ Отмена", "admin_keys");
  
  await ctx.editMessageText(message, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function promptEditKey(ctx: CustomContext, keyId: number) {
  ctx.session.step = `await_key_edit_${keyId}`;
  
  const message = "🔄 <b>Замена ключа</b>\n\n" +
    "Отправьте новый API ключ в формате:\n" +
    "<code>ключ:rps</code>\n\n" +
    "Например:\n" +
    "<code>sub_1SFE1jAJu6gy4fiYvO7eASIF:5</code>";
  
  const keyboard = new InlineKeyboard()
    .text("❌ Отмена", `key_view_${keyId}`);
  
  await ctx.editMessageText(message, {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

async function deleteKey(ctx: CustomContext, keyId: number) {
  const { KeysRepo } = await import("../db/queries");
  
  try {
    const success = await KeysRepo.delete(keyId);
    
    if (success) {
      await ctx.answerCallbackQuery("🗑️ Ключ удален!");
      await showKeysManagement(ctx);
    } else {
      await ctx.answerCallbackQuery("❌ Ошибка удаления ключа");
    }
    
  } catch (error) {
    await ctx.answerCallbackQuery("❌ Ошибка удаления ключа");
  }
}

async function isAdmin(telegramId: number): Promise<boolean> {
  try {
    const role = await UserRepo.getRole(telegramId);
    return role === "admin";
  } catch {
    return false;
  }
}

// Экспортируем функции для использования в других файлах
export { showKeysManagement, showKeyDetails, promptAddKey, promptEditKey, deleteKey };