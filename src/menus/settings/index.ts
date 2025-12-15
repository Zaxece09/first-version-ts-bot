import { Menu, MenuRange } from "@grammyjs/menu";
import type { CustomContext } from "../../types";

import {
  priorityView,
  presetsView,
  topicsView,
  smartPresetsView,
  spoofNameView,
  emailsView,
  proxiesView,
  intervalView,
  apiKeyView,
  profileIdView,
} from "../../views/settings";

import { priorityMenu } from "./priority";
import { presetsMenu } from "./presets";
import { topicsMenu } from "./topics";
import { smartPresetsMenu } from "./smartPresets";
import { spoofMenu } from "./spoof";
import { emailsMenu } from "./emails";
import { proxiesMenu } from "./proxies";
import { intervalMenu } from "./interval";
import { apiKeyMenu } from "./apiKey";
import { profileIdMenu } from "./profileId";
import { teamMenu } from "./team";

import { UserRepo } from "../../db/queries";

export const settingsMenu = new Menu<CustomContext>("settings-menu").dynamic(
  async (ctx) => {
    const range = new MenuRange<CustomContext>();
    const flags = await UserRepo.getFlags(ctx.from!.id);

    range
      .text("Domains 💌", async (ctx) => {
        await priorityView(ctx);
      })
      .text("шаблоны📧", async (ctx) => {
        await presetsView(ctx);
      })
      .row()
      .text("Тема письма ✍️", async (ctx) => {
        await topicsView(ctx);
      })
      .text("📚 Умные пресеты", async (ctx) => {
        await smartPresetsView(ctx);
      })
      .row()
      .text(`${flags.spoofMode ? "🟢" : "🔴"} Спуфинг`, async (ctx) => {
        await UserRepo.toggleFlag(ctx.from!.id, "spoofMode");
        await ctx.menu.update();
      })
      .text("Подмена ника🫰", async (ctx) => {
        await spoofNameView(ctx);
      })
      .row()
      .text(
        `${flags.lockMode ? "🟢" : "🔴"} Контроль блокировок`,
        async (ctx) => {
          await UserRepo.toggleFlag(ctx.from!.id, "lockMode");
          await ctx.menu.update();
        }
      )
      .row()
      .text("Почты 📤", async (ctx) => {
        await emailsView(ctx);
      })
      .text("Loma Proxy🖥️", async (ctx) => {
        await proxiesView(ctx);
      })
      .row()
      .text("Тайминги⌛️", async (ctx) => {
        await intervalView(ctx);
      })
      .text(`${flags.giroMode ? "📲 Giro" : "💳 Card"}`, async (ctx) => {
        await UserRepo.toggleFlag(ctx.from!.id, "giroMode");
        await ctx.menu.update();
      })
      .row()
      .text("Profile 👤", async (ctx) => {
        await profileIdView(ctx);
      })
      .text("Ключ 🔑", async (ctx) => {
        await apiKeyView(ctx);
      })
      .row()
      .text("🎮 Команда", async (ctx) => {
        await ctx.replyOrEdit("Выбор команды:", {
          parse_mode: "HTML",
          reply_markup: teamMenu,
        });
      })
      .row()
      .text("♻️ Скрыть", async (ctx) => {
        await ctx.answerCallbackQuery("♻️ Скрыто");
        await ctx.deleteMessage();
      });

    return range;
  }
);

settingsMenu.register(priorityMenu);
settingsMenu.register(presetsMenu);
settingsMenu.register(topicsMenu);
settingsMenu.register(smartPresetsMenu);
settingsMenu.register(spoofMenu);
settingsMenu.register(emailsMenu);
settingsMenu.register(proxiesMenu);
settingsMenu.register(intervalMenu);
settingsMenu.register(apiKeyMenu);
settingsMenu.register(profileIdMenu);
settingsMenu.register(teamMenu);
