import { Menu, MenuRange } from "@grammyjs/menu";
import type { CustomContext } from "../../types";
import { settingsView, presetsView } from "../../views/settings";
import { PresetRepo } from "../../db/queries";

const presetsMenu = new Menu<CustomContext>("presets-menu", { autoAnswer: false })
  .text("➕ Добавить пресет", async (ctx) => {
    await ctx.conversation.enter("presetAddConv");
  })
  .text("✏️ Изменить пресет", async (ctx) => {
    const presets = await PresetRepo.list(ctx.from!.id);

    if (presets.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет пресетов",
        show_alert: true,
      });
    } else {
      await ctx.replyOrEdit("📋 Ваши пресеты:", {
        reply_markup: presetsEditMenu,
      });
    }
  })
  .row()
  .text("🗑 Удалить пресет", async (ctx) => {
    const presets = await PresetRepo.list(ctx.from!.id);

    if (presets.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет пресетов",
        show_alert: true,
      });
    } else {
      await ctx.replyOrEdit("🗑 Выберите пресет для удаления:", {
        reply_markup: presetsDeleteMenu,
      });
    }
  })
  .text("🗑 Удалить все", async (ctx) => {
    const presets = await PresetRepo.list(ctx.from!.id);

    if (presets.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет пресетов",
        show_alert: true,
      });
    } else {
      await PresetRepo.clear(ctx.from!.id);
      await ctx.answerCallbackQuery("✅ Все пресеты удалены");
      await presetsView(ctx);
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

const presetsEditMenu = new Menu<CustomContext>("presets-edit-menu").dynamic(
  async (ctx) => {
    const range = new MenuRange<CustomContext>();
    const presets = await PresetRepo.list(ctx.from!.id);

    for (const preset of presets) {
      range
        .text(preset.title, (ctx) =>
          ctx.answerCallbackQuery(`📌 Пресет выбран: ${preset.title}`)
        )
        .text("✏️", async (ctx) => {
          await ctx.conversation.enter("presetEditConv", preset.id, preset.title);
        })
        .row();
    }

    range
      .text("🔙 Назад", async (ctx) => {
        await presetsView(ctx);
      })
      .text("♻️ Скрыть", async (ctx) => {
        await ctx.answerCallbackQuery("♻️ Скрыто");
        await ctx.deleteMessage();
      });

    return range;
  }
);

const presetsDeleteMenu = new Menu<CustomContext>("presets-delete-menu").dynamic(
  async (ctx) => {
    const range = new MenuRange<CustomContext>();
    const presets = await PresetRepo.list(ctx.from!.id);

    for (const preset of presets) {
      range
        .text(preset.title, (ctx) =>
          ctx.answerCallbackQuery(`📌 Пресет выбран: ${preset.title}`)
        )
        .text("🗑", async (ctx) => {
          await PresetRepo.remove(ctx.from!.id, preset.id);
          await ctx.answerCallbackQuery({
            text: `🗑 Пресет удалён: ${preset.title}`,
            show_alert: true,
          });
          await ctx.menu.update(); // перерисовать меню
        })
        .row();
    }

    range
      .text("🔙 Назад", async (ctx) => {
        await presetsView(ctx);
      })
      .text("♻️ Скрыть", async (ctx) => {
        await ctx.answerCallbackQuery("♻️ Скрыто");
        await ctx.deleteMessage();
      });

    return range;
  }
);

presetsMenu.register(presetsEditMenu);
presetsMenu.register(presetsDeleteMenu);

export { presetsMenu };
