import { InlineKeyboard } from "grammy";
import type { CustomContext } from "../types";
import { UserRepo } from "../db/queries";

const ADMIN_PANEL_TEXT = "👑 <b>Админ панель</b>\n\nВыберите действие:";
const ADMIN_SESSION_KEY = "await_user_management_id";

function buildAdminPanelKeyboard() {
  return new InlineKeyboard()
    .text("👥 Управление пользователями", "admin_manage")
    .row()
    .text("📋 Просмотр доступа", "admin_access")
    .row()
    .text("🔑 Ключи", "admin_keys")
    .row()
    .text("⬅️ Закрыть", "admin_close");
}

function buildUserActionsKeyboard(telegramId: number, backCallback: string = "admin_manage") {
  const keyboard = new InlineKeyboard()
    .text("✅ Выдать доступ (user)", `grant_user_${telegramId}`)
    .row()
    .text("👑 Сделать админом", `grant_admin_${telegramId}`)
    .row()
    .text("🚫 Заблокировать доступ", `revoke_access_${telegramId}`)
    .row()
    .text("📋 Копировать ID", `copy_id_${telegramId}`);

  if (backCallback) {
    keyboard.row().text("🔙 Назад", backCallback);
  }

  return keyboard;
}

async function ensureAdmin(ctx: CustomContext): Promise<boolean> {
  if (!ctx.from) {
    await ctx.reply("❌ Ошибка: Не удалось определить пользователя");
    return false;
  }

  try {
    const role = await UserRepo.getRole(ctx.from.id);
    if (role !== "admin") {
      await ctx.reply("🚫 У вас нет доступа к админ панели.");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error checking admin role:", error);
    await ctx.reply("❌ Ошибка проверки прав доступа");
    return false;
  }
}

export async function showAdminPanel(
  ctx: CustomContext,
  mode: "reply" | "edit" = "reply"
) {
  const keyboard = buildAdminPanelKeyboard();
  const payload = {
    reply_markup: keyboard,
    parse_mode: "HTML" as const,
  };

  if (mode === "edit" && "editMessageText" in ctx) {
    try {
      await ctx.editMessageText(ADMIN_PANEL_TEXT, payload);
      return;
    } catch (error) {
      console.error("Error editing admin panel message:", error);
    }
  }

  await ctx.reply(ADMIN_PANEL_TEXT, payload);
}

export async function handleAdminPanelCommand(ctx: CustomContext) {
  const isAllowed = await ensureAdmin(ctx);
  if (!isAllowed) return;

  ctx.session.step = "";
  await showAdminPanel(ctx);
}

export async function promptUserIdInput(
  ctx: CustomContext,
  mode: "reply" | "edit" = "reply"
) {
  const isAllowed = await ensureAdmin(ctx);
  if (!isAllowed) return;

  ctx.session.step = ADMIN_SESSION_KEY;

  const text =
    "� <b>Управление пользователями</b>\n\n" +
    "Отправьте Telegram ID пользователя, которому хотите выдать доступ.\n" +
    "Можно отправить несколько ID подряд или нажмите ⬅️ Назад.";

  const keyboard = new InlineKeyboard()
    .text("📋 Просмотр доступа", "admin_access")
    .row()
    .text("⬅️ Назад", "admin_home");

  const payload = {
    reply_markup: keyboard,
    parse_mode: "HTML" as const,
  };

  if (mode === "edit" && "editMessageText" in ctx) {
    try {
      await ctx.editMessageText(text, payload);
      return;
    } catch (error) {
      console.error("Error editing user management prompt:", error);
    }
  }

  await ctx.reply(text, payload);
}

export async function showAccessList(
  ctx: CustomContext,
  mode: "reply" | "edit" = "reply"
) {
  const isAllowed = await ensureAdmin(ctx);
  if (!isAllowed) return;

  try {
    const usersWithAccess = await UserRepo.getUsersWithAccess();

    let message = "👥 <b>Пользователи с доступом</b>\n\n";

    if (usersWithAccess.length === 0) {
      message += "❌ Нет пользователей с доступом";
    } else {
      usersWithAccess.forEach((user, index) => {
        const roleEmoji = user.role === "admin" ? "👑" : "👤";
        const username = user.username ? `@${user.username}` : "Без ника";
        const lastOnline = new Date(user.lastOnline).toLocaleString("ru-RU");

        message += `${index + 1}. ${roleEmoji} <b>${username}</b>\n`;
        message += `   ID: <code>${user.telegramId}</code>\n`;
        message += `   Роль: ${user.role}\n`;
        message += `   Онлайн: ${lastOnline}\n\n`;
      });
    }

    const keyboard = new InlineKeyboard()
      .text("👥 Управление", "admin_manage")
      .row()
      .text("⬅️ Назад", "admin_home");

    const payload = {
      reply_markup: keyboard,
      parse_mode: "HTML" as const,
    };

    if (mode === "edit" && "editMessageText" in ctx) {
      try {
        await ctx.editMessageText(message, payload);
        return;
      } catch (error) {
        console.error("Error editing access list:", error);
      }
    }

    await ctx.reply(message, payload);
  } catch (error) {
    console.error("Error getting users with access:", error);
    await ctx.reply("❌ Ошибка получения списка пользователей");
  }
}

export async function processUserIdSubmission(ctx: CustomContext, text: string) {
  if (!(await ensureAdmin(ctx))) {
    ctx.session.step = "";
    return;
  }

  const normalized = text.trim();
  const telegramId = parseInt(normalized, 10);

  if (Number.isNaN(telegramId)) {
    await ctx.reply("❌ Неверный формат ID. Введите числовой ID пользователя");
    return;
  }

  try {
    const user = await UserRepo.getUserByTelegramId(telegramId);

    if (!user) {
      await ctx.reply(
        `❌ Пользователь с ID <code>${telegramId}</code> не найден.\n` +
          "Пользователь должен сначала запустить бота командой /start",
        { parse_mode: "HTML" }
      );
      return;
    }

    const roleEmoji = user.role === "admin" ? "👑" : user.role === "user" ? "👤" : "🚫";
    const username = user.username ? `@${user.username}` : "Без ника";

    const message =
      `👤 <b>Пользователь найден</b>\n\n` +
      `${roleEmoji} <b>${username}</b>\n` +
      `ID: <code>${telegramId}</code>\n` +
      `Роль: <b>${user.role}</b>\n` +
      `Дата регистрации: ${new Date(user.createdAt).toLocaleString("ru-RU")}\n` +
      `Последняя активность: ${new Date(user.lastOnline).toLocaleString("ru-RU")}\n\n` +
      "Выберите действие:";

    await ctx.reply(message, {
      reply_markup: buildUserActionsKeyboard(telegramId),
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error("Error in user management:", error);
    await ctx.reply("❌ Ошибка при поиске пользователя");
  }
}

export function resetAdminStep(ctx: CustomContext) {
  if (ctx.session.step === ADMIN_SESSION_KEY) {
    ctx.session.step = "";
  }
}

export { ADMIN_SESSION_KEY, buildAdminPanelKeyboard, buildUserActionsKeyboard };