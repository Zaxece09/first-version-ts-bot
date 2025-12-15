import { Menu, MenuRange } from "@grammyjs/menu";
import type { CustomContext } from "../../types";
import { settingsView, emailsView } from "../../views/settings";
import { EmailRepo } from "../../db/queries";
import { EmailStreamManager } from "../../emailStream";

// Главное меню email
const emailsMenu = new Menu<CustomContext>("emails-menu").dynamic(
  async (ctx) => {
    const range = new MenuRange<CustomContext>();

    const perPage = 20;
    const total = await EmailRepo.getTotalPages(ctx.from!.id, perPage);
    const page = Math.min(Math.max(Number(ctx.match) || 1, 1), total);

    // Циклические prev/next
    const prev = page > 1 ? page - 1 : total;
    const next = page < total ? page + 1 : 1;

    if (total > 1) {
      range
        .text({ text: "◀️", payload: String(prev) }, async (ctx) => {
          await emailsView(ctx, page);
        })
        .text(`${page}/${total}`, () => {})
        .text({ text: "▶️", payload: String(next) }, async (ctx) => {
          await emailsView(ctx, page);
        })
        .row();
    }
    range
      .text( { text: "➕ Добавить E-mail", payload: String(page) }, async (ctx) => {
        await ctx.conversation.enter("emailAddConv", page);
      })
      .text(
        { text: "✏️ Изменить E-mail", payload: String(page) },
        async (ctx) => {
          const emails = await EmailRepo.list(ctx.from!.id);
          if (emails.length === 0) {
            await ctx.answerCallbackQuery({
              text: "❌ Нет e-mail’ов",
              show_alert: true,
            });
          } else {
            await ctx.replyOrEdit("📋 Ваши e-mail:", {
              reply_markup: emailsEditMenu,
            });
          }
        }
      )
      .row()
      .text(
        { text: "🗑 Удалить E-mail", payload: String(page) },
        async (ctx) => {
          const emails = await EmailRepo.list(ctx.from!.id);
          if (emails.length === 0) {
            await ctx.answerCallbackQuery({
              text: "❌ Нет e-mail’ов",
              show_alert: true,
            });
          } else {
            await ctx.replyOrEdit("🗑 Выберите e-mail для удаления:", {
              reply_markup: emailsDeleteMenu,
            });
          }
        }
      )
      .text("🗑 Удалить все", async (ctx) => {
        console.log(`🗑 [emailsMenu] User ${ctx.from?.id} clicked "Удалить все"`);
        
        await ctx.answerCallbackQuery();
        
        const emails = await EmailRepo.list(ctx.from!.id);
        console.log(`📊 [emailsMenu] User has ${emails.length} emails`);
        
        if (emails.length === 0) {
          await ctx.answerCallbackQuery({
            text: "❌ Нет e-mail'ов",
            show_alert: true,
          });
        } else {
          console.log(`🗑 [emailsMenu] Clearing all emails from DB...`);
          await EmailRepo.clear(ctx.from!.id);
          
          console.log(`⏹️ [emailsMenu] Stopping all streams in background for user ${ctx.from!.id}...`);
          // Запускаем остановку в фоне, чтобы не блокировать UI
          EmailStreamManager.stopAllForUser(ctx.from!.id).catch((err) => {
            console.error(`❌ [emailsMenu] Failed to stop streams:`, err);
          });
          
          console.log(`✅ [emailsMenu] All emails deleted for user ${ctx.from!.id}`);
          await emailsView(ctx, 1);
        }
      })
      .row()
      .text("🔙 Назад", async (ctx) => {
        await settingsView(ctx);
      })
      .text("♻️ Скрыть", async (ctx) => {
        await ctx.answerCallbackQuery("♻️ Скрыто");
        await ctx.deleteMessage();
      });
    return range;
  }
);

/** ✏️ Подменю редактирования */
const emailsEditMenu = new Menu<CustomContext>("emails-edit-menu", {
  onMenuOutdated: "",
  autoAnswer: false,
}).dynamic(async (ctx) => {
  const range = new MenuRange<CustomContext>();

  const perPage = 20;
  const total = await EmailRepo.getTotalPages(ctx.from!.id, perPage);
  const page = Math.min(Math.max(Number(ctx.match) || 1, 1), total || 1);

  const emails = await EmailRepo.listPaginated(
    ctx.from!.id,
    perPage,
    (page - 1) * perPage
  );

  for (const email of emails) {
    range
      .text(`${email.name} <${email.email}>`, (ctx) =>
        ctx.answerCallbackQuery(`📌 Выбран: ${email.email}`)
      )
      .text({ text: "✏️", payload: String(page) }, async (ctx) => {
        await ctx.conversation.enter("emailEditConv", email.id, email.email, page);
      })
      .row();
  }

  // навигация
  if (total > 1) {
    const prev = page > 1 ? page - 1 : total;
    const next = page < total ? page + 1 : 1;
    range
      .text(
        { text: "◀️", payload: String(prev) },
        async (ctx) => await ctx.menu.update({ immediate: true })
      )
      .text(`${page}/${total}`, () => {})
      .text(
        { text: "▶️", payload: String(next) },
        async (ctx) => await ctx.menu.update({ immediate: true })
      )
      .row();
  }

  range
    .text({ text: "🔙 Назад", payload: String(page) }, async (ctx) => {
      await emailsView(ctx, page);
    })
    .text("♻️ Скрыть", async (ctx) => {
      await ctx.answerCallbackQuery("♻️ Скрыто");
      await ctx.deleteMessage();
    });

  return range;
});

/** 🗑 Подменю удаления */
const emailsDeleteMenu = new Menu<CustomContext>("emails-delete-menu", {
  onMenuOutdated: "",
  autoAnswer: false,
}).dynamic(async (ctx) => {
  const range = new MenuRange<CustomContext>();

  const perPage = 20;
  const total = await EmailRepo.getTotalPages(ctx.from!.id, perPage);
  const page = Math.min(Math.max(Number(ctx.match) || 1, 1), total || 1);

  const emails = await EmailRepo.listPaginated(
    ctx.from!.id,
    perPage,
    (page - 1) * perPage
  );

  for (const email of emails) {
    range
      .text(`${email.email}`, (ctx) =>
        ctx.answerCallbackQuery(`📌 Выбран: ${email.email}`)
      )
      .text({ text: "🗑", payload: String(page) }, async (ctx) => {
        await EmailStreamManager.stop(email.id);
        await EmailRepo.remove(ctx.from!.id, email.id);
        await ctx.answerCallbackQuery(`🗑 Удалён: ${email.email}`);
        await ctx.menu.update();
      })
      .row();
  }

  // навигация
  if (total > 1) {
    const prev = page > 1 ? page - 1 : total;
    const next = page < total ? page + 1 : 1;
    range
      .text(
        { text: "◀️", payload: String(prev) },
        async (ctx) => await ctx.menu.update({ immediate: true })
      )
      .text(`${page}/${total}`, () => {})
      .text(
        { text: "▶️", payload: String(next) },
        async (ctx) => await ctx.menu.update({ immediate: true })
      )
      .row();
  }

  range
    .text({ text: "🔙 Назад", payload: String(page) }, async (ctx) => {
      await emailsView(ctx, page);
    })
    .text("♻️ Скрыть", async (ctx) => {
      await ctx.answerCallbackQuery("♻️ Скрыто");
      await ctx.deleteMessage();
    });

  return range;
});

emailsMenu.register(emailsEditMenu);
emailsMenu.register(emailsDeleteMenu);

export { emailsMenu };
