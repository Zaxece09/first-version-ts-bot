import { Menu, MenuRange } from "@grammyjs/menu";
import type { CustomContext } from "../../types";
import { settingsView, smartPresetsView } from "../../views/settings";
import { SmartPresetRepo, TopicRepo } from "../../db/queries";

const smartPresetsMenu = new Menu<CustomContext>("smart-presets-menu", {
  autoAnswer: false,
})
  .text("➕ Добавить пресет", async (ctx) => {
    await ctx.conversation.enter("smartPresetAddConv");
  })
  .text("✏️ Изменить пресет", async (ctx) => {
    const presets = await SmartPresetRepo.list(ctx.from!.id);

    if (presets.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет пресетов",
        show_alert: true,
      });
    } else {
      await ctx.replyOrEdit("📋 Ваши смарт-пресеты:", {
        reply_markup: smartPresetsEditMenu,
      });
    }
  })
  .row()
  .text("🗑 Удалить пресет", async (ctx) => {
    const presets = await SmartPresetRepo.list(ctx.from!.id);

    if (presets.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет пресетов",
        show_alert: true,
      });
    } else {
      await ctx.replyOrEdit("🗑 Выберите пресет для удаления:", {
        reply_markup: smartPresetsDeleteMenu,
      });
    }
  })
  .text("🗑 Удалить все", async (ctx) => {
    const presets = await SmartPresetRepo.list(ctx.from!.id);

    if (presets.length === 0) {
      await ctx.answerCallbackQuery({
        text: "❌ Нет пресетов",
        show_alert: true,
      });
    } else {
      await SmartPresetRepo.clear(ctx.from!.id);
      await ctx.answerCallbackQuery("✅ Все пресеты удалены");
      await ctx.editMessageText("❌ Пресетов пока нет.", {
        parse_mode: "HTML",
        reply_markup: smartPresetsMenu,
      });
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

const smartPresetsEditMenu = new Menu<CustomContext>(
  "smart-presets-edit-menu"
).dynamic(async (ctx) => {
  const range = new MenuRange<CustomContext>();
  const presets = await SmartPresetRepo.list(ctx.from!.id);

  for (const preset of presets) {
    range
      .text(`📝 ${preset.text.slice(0, 20)}...`, (ctx) =>
        ctx.answerCallbackQuery(`📌 Пресет выбран: ${preset.text.slice(0, 50)}`)
      )
      .text("✏️", async (ctx) => {
        await ctx.conversation.enter(
          "smartPresetEditConv",
          preset.id,
          preset.text
        );
      })
      .row();
  }

  range
    .text("🔙 Назад", async (ctx) => {
      await smartPresetsView(ctx);
    })
    .text("♻️ Скрыть", async (ctx) => {
      await ctx.answerCallbackQuery("♻️ Скрыто");
      await ctx.deleteMessage();
    });

  return range;
});

const smartPresetsDeleteMenu = new Menu<CustomContext>(
  "smart-presets-delete-menu"
).dynamic(async (ctx) => {
  const range = new MenuRange<CustomContext>();
  const presets = await SmartPresetRepo.list(ctx.from!.id);

  for (const preset of presets) {
    range
      .text(`📝 ${preset.text.slice(0, 20)}...`, (ctx) =>
        ctx.answerCallbackQuery(`📌 Пресет выбран: ${preset.text.slice(0, 50)}`)
      )
      .text("🗑", async (ctx) => {
        await SmartPresetRepo.remove(ctx.from!.id, preset.id);
        await ctx.answerCallbackQuery({
          text: "🗑 Пресет удалён",
          show_alert: true,
        });
        await ctx.menu.update();
      })
      .row();
  }

  range
    .text("🔙 Назад", async (ctx) => {
      await smartPresetsView(ctx);
    })
    .text("♻️ Скрыть", async (ctx) => {
      await ctx.answerCallbackQuery("♻️ Скрыто");
      await ctx.deleteMessage();
    });

  return range;
});

smartPresetsMenu.register(smartPresetsEditMenu);
smartPresetsMenu.register(smartPresetsDeleteMenu);

export { smartPresetsMenu };
