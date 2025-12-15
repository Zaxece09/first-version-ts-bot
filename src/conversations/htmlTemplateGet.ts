import { Composer, InputFile } from "grammy";
import { type Conversation, createConversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";
import { readFile } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HERE =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

const TPL_DIR = resolve(HERE, "../templates");

async function renderTemplate(
  name: "back" | "go" | "push" | "sms",
  link: string
): Promise<string> {
  const file = join(TPL_DIR, `${name}.html`);
  const html = await readFile(file, "utf8");
  return html.replace(/ADVERT_LINK|advert_link/g, link);
}

const composer = new Composer<CustomContext>();

async function htmlTemplateGetConv(
  conversation: Conversation<CustomContext, CustomContext>,
  ctx: CustomContext,
  template: "back" | "go" | "push" | "sms"
) {
  const cancelMenu = conversation
    .menu("cancel-api", { autoAnswer: false })
    .text("🚫 Отмена", async (ctx) => {
      await ctx.menu.close();
      await ctx.answerCallbackQuery("⚡️ Действие отменено");
      await ctx.deleteMessage().catch(() => {});
      await conversation.halt();
    });

  const waitingText = `Отправьте ссылку для шаблона ${template}`;

  const requestMsg = await ctx.editMessageText(waitingText, {
    parse_mode: "HTML",
    reply_markup: cancelMenu,
  });

  const answer = await conversation.waitFor(":text").and(
    (ctx) => {
      const text = ctx.msg.text.trim();
      return (
        text.length > 0 && text.length <= 255 && /^https:\/\/.+/i.test(text)
      );
    },
    {
      otherwise: async (ctx) => {
        if (ctx.callbackQuery) return;
        await ctx.deleteMessage().catch(() => {});
        if (requestMsg !== true) {
          try {
            await requestMsg.editText(
              `${waitingText}\n\n❌ <b>Некорректный ввод!</b> Введите корректную ссылку, начинающуюся с <code>https://</code>`,
              { parse_mode: "HTML", reply_markup: cancelMenu }
            );
          } catch {}
        }
      },
    }
  );

  const link = answer.msg.text.trim();
  if (requestMsg !== true) await requestMsg.delete();
  await answer.deleteMessage();

  const html = await renderTemplate(template, link);
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(html, "utf-8"), `${template}.txt`)
  );
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(html, "utf-8"), `${template}.html`)
  );

  await conversation.halt();
}

composer.use(createConversation(htmlTemplateGetConv));
export default composer;
