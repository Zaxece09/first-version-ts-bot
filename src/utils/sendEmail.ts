// send-email.ts
import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import type { CustomContext } from "../types";
import { EmailMsgRepo, ProxyRepo, AdvertsRepo, UserRepo } from "../db/queries";
import { toProxyAuth } from "../utils/proxyForm";
import { InputFile } from "grammy";
import { bot } from "../bot";

import { isUserSending } from "../emailSender";

// ниже, рядом с утилитами
const makeHtmlFile = (html: string, filename = "message.html") =>
  new InputFile(Buffer.from(html, "utf8"), filename);

const safeFileName = (raw?: string) => {
  const base =
    (raw || "message").replace(/[^\p{L}\p{N}\-_. ]/gu, "").trim() || "message";
  return `${base.slice(0, 60)}.html`;
};

// низкоуровневая отправка
export async function sendEmail(options: {
  login: string;
  appPassword: string;
  proxy?: string; // "http://user:pass@host:port" или без
  displayName: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
}) {
  const {
    login,
    appPassword,
    proxy,
    displayName,
    to,
    subject,
    text,
    html,
    inReplyTo,
  } = options;

  const domain = login.split("@")[1]?.toLowerCase();
  let host: string;
  let port: number;
  let secure: boolean;

  switch (domain) {
    case "gmail.com":
      host = "smtp.gmail.com";
      port = 465;
      secure = true;
      break;
    case "yahoo.com":
      host = "smtp.mail.yahoo.com";
      port = 465;
      secure = true;
      break;
    case "outlook.com":
    case "hotmail.com":
    case "live.com":
      host = "smtp.office365.com";
      port = 587;
      secure = false;
      break;
    case "icloud.com":
    case "me.com":
    case "mac.com":
      host = "smtp.mail.me.com";
      port = 465;
      secure = true;
      break;
    default:
      host = `smtp.${domain}`;
      port = 465;
      secure = true;
      break;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: login, pass: appPassword },
    ...(proxy
      ? { proxy: proxy.startsWith("http") ? proxy : `http://${proxy}` }
      : {}),
  } as SMTPTransport.Options);

  return transporter.sendMail({
    from: `"${displayName}" <${login}>`,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
  });
}

// классификатор сетевых/прокси-ошибок — на экспорт (вдруг пригодится снаружи)
export function isConnectionError(err: any): boolean {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  const CODES = new Set([
    "ECONNECTION",
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENOTFOUND",
    "ESOCKET",
    "EPIPE",
  ]);
  return (
    CODES.has(code) ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("proxy") ||
    msg.includes("socks") ||
    msg.includes("tunneling") ||
    msg.includes("failed to setup proxy connection") ||
    msg.includes("connection closed") ||
    msg.includes("getaddrinfo")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const defaultBackoff = (attempt: number) => 1000 * attempt;

/** 🔁 Универсальная отправка с ретраями/бэкоффом. Без побочных эффектов. */
export async function sendWithRetry(options: {
  login: string;
  appPassword: string;
  proxy?: string;
  displayName: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  retries?: number; // по умолчанию 3
  backoffMs?: (attempt: number) => number; // по умолчанию линейный 1s, 2s, 3s
}) {
  const { retries = 5, backoffMs = defaultBackoff, ...mail } = options;

  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const info = await sendEmail(mail);
      return { info, attempt };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
      }
    }
  }
  throw lastError;
}

// pre-send-email.ts

export async function preSendEmail(
  ctx: CustomContext,
  mailId: number,
  text?: string, // ← можно не передавать
  html?: string // ← можно передать только его
): Promise<void> {
  const tgId = ctx.from!.id;

  const msgRow = await EmailMsgRepo.getFullMessage(mailId);
  if (!msgRow) {
    await ctx.reply(`❌ Message with id=${mailId} not found`).catch(() => {});
    return;
  }

  const [login, appPassword] = msgRow.email.split(":");
  if (!login || !appPassword) {
    await ctx
      .reply(`❌ Invalid email format in DB: ${msgRow.email}`)
      .catch(() => {});
    return;
  }

  // берём прокси (если прокси подаешь снаружи — этот блок убери)
  const picked = await ProxyRepo.nextValidProxy(tgId);
  if (!picked) {
    await ctx.reply("❌ Нет валидных прокси для отправки.").catch(() => {});
    return;
  }
  const proxyUrl = toProxyAuth(picked.proxy);

  // префикс для статуса, чтобы не сыпать HTML в превью
  const contentLabel =
    text && text.trim().length > 0
      ? `<code>${text}</code>`
      : html
        ? "<i>[HTML]</i>"
        : "<i>[empty]</i>";

  const flags = await UserRepo.getFlags(ctx.from!.id);
  let senderName: string;
  if (html) {
    senderName = flags.spoofMode
      ? await UserRepo.getSpoofName(ctx.from!.id)
      : msgRow.name;
  } else {
    senderName = msgRow.name;
  }

  // стартовое уведомление
  const sent = await ctx.reply(
    `<b>Ответ:</b> ${contentLabel} <b>идет отправка</b> <code>${msgRow.emailFrom}</code> ⏳`,
    {
      parse_mode: "HTML",
      reply_parameters: {
        message_id: msgRow.tgMsgId,
        allow_sending_without_reply: true,
      },
    }
  );

  // ⚡️ фон
  void (async () => {
    try {
      const { info } = await sendWithRetry({
        login,
        appPassword,
        proxy: proxyUrl,
        displayName: senderName,
        to: msgRow.emailFrom,
        subject: msgRow.subject,
        text: text || undefined, // ← если текста нет — не отправляем
        html: html || undefined, // ← можно отправлять только HTML
        inReplyTo: msgRow.msgId,
        retries: 5,
      });

      await sent
        .editText(
          `<b>Ответ:</b> ${contentLabel} <b>успешно отправлен пользователю</b> <code>${msgRow.emailFrom}</code> ⚡️`,
          { parse_mode: "HTML" }
        )
        .catch(() => {});

      if (html && html.trim().length > 0) {
        const file = makeHtmlFile(html, safeFileName(msgRow.subject));
        await ctx.api
          .sendDocument(ctx.chat!.id, file, {
            caption: "📎 HTML, который был отправлен",
            parse_mode: "HTML",
            reply_parameters: {
              message_id: sent.message_id,
              allow_sending_without_reply: true,
            },
          })
          .catch(() => {});
      }

      await EmailMsgRepo.logSent(
        msgRow.emailId,
        String(info.messageId),
        msgRow.subject,
        msgRow.text,
        msgRow.senderName,
        login,
        sent.message_id,
        msgRow.advertId ?? null
      );
    } catch (err: any) {
      await sent
        .editText(
          `<b>Ответ:</b> ${contentLabel} <b>ошибка при отправке письма</b> <code>${msgRow.emailFrom}</code> <code>${err?.message ?? err?.code ?? "UNKNOWN"}</code> ❌`,
          { parse_mode: "HTML" }
        )
        .catch(() => {});
    }
  })();
}

export async function launchSend(
  telegramId: number,
  waitSec: number,
  leftBefore: number,
  emailId: number,
  email: string,
  proxyUrl: string,
  senderName: string,
  to: string,
  subject: string,
  text: string,
  advertId: number
): Promise<void> {
  const [login, appPassword] = email.split(":");
  if (!login || !appPassword) {
    await bot.api
      .sendMessage(telegramId, `❌ Invalid email format in DB: ${email}`)
      .catch(() => {});
    return;
  }

  // const sent = await bot.api.sendMessage(
  //   telegramId,
  //   `<b>Сообщение:</b> <code>${text}</code> <b>идет отправка</b> <code>${to}</code> ⏳`,
  //   { parse_mode: "HTML" }
  // );
  // ⚡️ фон
  void (async () => {
    try {
      const { info } = await sendWithRetry({
        login,
        appPassword,
        proxy: proxyUrl, // или прокси снаружи
        displayName: senderName,
        to: to,
        subject: subject,
        text: text,
        retries: 5,
      });

      // await sent.editText(
      //   `<b>Сообщение:</b> <code>${text}</code> <b>успешно отправлено пользователю</b> <code>${to}</code> ⚡️`,
      //   { parse_mode: "HTML" }
      // )
      //   .catch(() => { });

      await EmailMsgRepo.logSent(
        emailId,
        String(info.messageId),
        subject,
        text,
        senderName,
        login,
        null,
        advertId
      );

      await AdvertsRepo.setStatus(advertId, 3);
    } catch (err: any) {
      await bot.api
        .sendMessage(
          telegramId,
          `<b>Сообщение:</b> <code>${text}</code> <b>ошибка при отправке письма</b> <code>${to}</code> <code>${err?.message ?? err?.code ?? "UNKNOWN"}</code> ❌`,
          { parse_mode: "HTML" }
        )
        .catch(() => {});
    }
  })();
}
