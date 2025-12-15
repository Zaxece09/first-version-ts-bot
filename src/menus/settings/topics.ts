import { Menu, MenuRange } from "@grammyjs/menu";
import type { CustomContext } from "../../types";
import { settingsView, topicsView } from "../../views/settings";
import { TopicRepo } from "../../db/queries";

const topicsMenu = new Menu<CustomContext>("topics-menu", { autoAnswer: false })
  .text("➕ Добавить тему", async (ctx) => {
    await ctx.conversation.enter("topicAddConv");
  })
  .text("✏️ Изменить тему", async (ctx) => {
    const topics = await TopicRepo.list(ctx.from!.id);

    if (topics.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет тем",
        show_alert: true,
      });
    } else {
      await ctx.replyOrEdit("📋 Ваши темы:", {
        reply_markup: topicsEditMenu,
      });
    }
  })
  .row()
  .text("🗑 Удалить тему", async (ctx) => {
    const topics = await TopicRepo.list(ctx.from!.id);

    if (topics.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет тем",
        show_alert: true,
      });
    } else {
      await ctx.replyOrEdit("🗑 Выберите тему для удаления:", {
        reply_markup: topicsDeleteMenu,
      });
    }
  })
  .text("🗑 Удалить все", async (ctx) => {
    const topics = await TopicRepo.list(ctx.from!.id);

    if (topics.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет тем",
        show_alert: true,
      });
    } else {
      await TopicRepo.clear(ctx.from!.id);
      await ctx.answerCallbackQuery("✅ Все темы удалены");
      await topicsView(ctx);
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

const topicsEditMenu = new Menu<CustomContext>("topics-edit-menu").dynamic(
  async (ctx) => {
    const range = new MenuRange<CustomContext>();
    const topics = await TopicRepo.list(ctx.from!.id);

    for (const topic of topics) {
      range
        .text(topic.title, (ctx) =>
          ctx.answerCallbackQuery(`📌 Тема выбрана: ${topic.title}`)
        )
        .text("✏️", async (ctx) => {
          await ctx.conversation.enter("topicEditConv", topic.id, topic.title);
        })
        .row();
    }

    range
      .text("🔙 Назад", async (ctx) => {
        await topicsView(ctx);
      })
      .text("♻️ Скрыть", async (ctx) => {
        await ctx.answerCallbackQuery("♻️ Скрыто");
        await ctx.deleteMessage();
      });

    return range;
  }
);

const topicsDeleteMenu = new Menu<CustomContext>("topics-delete-menu").dynamic(
  async (ctx) => {
    const range = new MenuRange<CustomContext>();
    const topics = await TopicRepo.list(ctx.from!.id);

    for (const topic of topics) {
      range
        .text(topic.title, (ctx) =>
          ctx.answerCallbackQuery(`📌 Тема выбрана: ${topic.title}`)
        )
        .text("🗑", async (ctx) => {
          await TopicRepo.remove(ctx.from!.id, topic.id);
          await ctx.answerCallbackQuery({
            text: `🗑 Тема удалена: ${topic.title}`,
            show_alert: true,
          });
          await ctx.menu.update(); // перерисовать меню
        })
        .row();
    }

    range
      .text("🔙 Назад", async (ctx) => {
        await topicsView(ctx);
      })
      .text("♻️ Скрыть", async (ctx) => {
        await ctx.answerCallbackQuery("♻️ Скрыто");
        await ctx.deleteMessage();
      });

    return range;
  }
);

topicsMenu.register(topicsEditMenu);
topicsMenu.register(topicsDeleteMenu);

export { topicsMenu };
