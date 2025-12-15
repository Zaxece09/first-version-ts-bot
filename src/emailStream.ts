// src/utils/EmailStreamManager.ts
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AddressObject } from "mailparser";
import { EmailRepo, EmailMsgRepo, UserRepo } from "./db/queries";

import { bot } from "./bot";
import { InlineKeyboard } from "grammy";

const RECENT_SCAN = 100; // сколько последних писем проверяем после рестартов

type StreamHandle = {
  client: ImapFlow;
  login: string;
  raw: string; // "email:apppass"
  attempts: number; // backoff
  stopped: boolean; // ручная остановка
  reconnectTimer?: ReturnType<typeof setTimeout>;

  // >>> добавлено:
  lastSeq: number; // последний ОБРАБОТАННЫЙ sequence number
  scanning: boolean; // защита от параллельных сканов
};

export class EmailStreamManager {
  private static streams = new Map<number, StreamHandle>();

  /* ===== helpers ===== */

  private static parse(raw: string) {
    const i = raw.indexOf(":");
    const login = raw.slice(0, i).trim();
    const pass = raw.slice(i + 1).trim();
    if (i <= 0 || !login || !pass)
      throw new Error(`❌ Некорректный формат email: ${raw}`);
    return { login, pass };
  }

  private static esc(s: string) {
    return (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  private static crop(s: string, n = 1500) {
    return s.length > n ? s.slice(0, n) + "…" : s;
  }
  private static backoffDelay(attempt: number) {
    const base = Math.min(60_000, 3_000 * 2 ** attempt);
    const jitter = 0.7 + Math.random() * 0.6;
    return Math.floor(base * jitter);
  }
  private static makeClient(login: string, pass: string) {
    const domain = login.split("@")[1]?.toLowerCase();
    let host: string;
    let port: number;
    let secure = true;

    switch (domain) {
      case "gmail.com":
        host = "imap.gmail.com";
        port = 993;
        break;

      case "yahoo.com":
        host = "imap.mail.yahoo.com";
        port = 993;
        break;

      case "outlook.com":
      case "hotmail.com":
      case "live.com":
        host = "outlook.office365.com";
        port = 993;
        break;

      case "icloud.com":
      case "me.com":
      case "mac.com":
        host = "imap.mail.me.com";
        port = 993;
        break;

      default:
        host = `imap.${domain}`;
        port = 993;
        break;
    }

    return new ImapFlow({
      host,
      port,
      secure,
      auth: { user: login, pass },
      logger: false,
      socketTimeout: 3_600_000, // 60 минут
      maxIdleTime: 25 * 60_000, // пере-IDLE каждые 25 минут
    });
  }

  /** точное время письма в мс: INTERNALDATE → Date header → 0 */
  private static msgTimeMs(msg: any, parsed: any): number {
    const t =
      (msg?.internalDate instanceof Date ? msg.internalDate.getTime() : 0) ||
      (parsed?.date instanceof Date ? parsed.date.getTime() : 0);
    return t || 0;
  }

  /** единая обработка одного письма с фильтром по createdAtMs */
  private static async handleFetchedMessage(
    telegramId: number,
    emailId: number,
    msg: any, // ImapFlow fetch item
    parsed: any, // simpleParser result
    createdAtMs: number
  ) {
    try {
      const msgId = parsed.messageId ?? "";
      const subject = parsed.subject ?? "";
      const ts = this.msgTimeMs(msg, parsed);
      const emailFrom = parsed.from.value[0].address;

      if (ts < createdAtMs) {
        await EmailMsgRepo.bulkMarkAllRead(emailId, [msgId]);
        return;
      }

    let toName: string = "—";
    const toObj: AddressObject | undefined =
      (Array.isArray(parsed.to) ? parsed.to[0] : parsed.to) || undefined;

    if (toObj && Array.isArray(toObj.value) && toObj.value.length > 0) {
      const name = toObj.value[0]?.name?.trim();
      if (name) toName = name;
    }

    const body = this.crop(parsed.text ?? "");

    if (
      await EmailMsgRepo.trueMarkNew(
        emailId,
        msgId,
        subject,
        body,
        toName,
        emailFrom
      )
    ) {
      const toTxt =
        (Array.isArray(parsed.to) ? parsed.to[0] : parsed.to)?.text ?? "—";
      const fromTxt = parsed.from?.text ?? "—";
      const subj = parsed.subject ?? "—";
      const inReplyTo = parsed.inReplyTo ?? "";

      const id = await EmailMsgRepo.getIdByMsgId(msgId);

      const inlineKeyboard = new InlineKeyboard()
        .text("🈶 Перевести", `translate-message:${id}`)
        .row()
        .text("📬 Написать еще", `write-message:${id}`)
        .row()
        .text("🔗 Создать ссылку", `generate-link:${id}`);

      const html =
        `<b>⚡ Получено сообщение на</b> <code>${this.esc(toTxt)}</code> ` +
        `<b>от</b> <code>${this.esc(fromTxt)}</code>\n\n` +
        `<b>Тема:</b>\n<code>${this.esc(subj)}</code>\n\n` +
        `<b>Текст:</b>\n<blockquote expandable><code>${this.esc(
          body
        )}</code></blockquote>`;

      const { tgMsgId, advertId } = await EmailMsgRepo.getMessageMeta(
        emailId,
        inReplyTo
      );

      try {
        const sent = await bot.api.sendMessage(telegramId, html, {
          parse_mode: "HTML",
          reply_markup: inlineKeyboard,
          reply_parameters: {
            message_id: tgMsgId,
            allow_sending_without_reply: true,
          },
        });

        if (!sent) {
          console.warn("❌ Сообщение не удалось отправить вообще");
          return;
        }

        await EmailMsgRepo.setMessageMeta(
          emailId,
          msgId,
          sent.message_id,
          advertId ?? null
        );

        await sent.pin();

        const flags = await UserRepo.getFlags(telegramId);
        if (!flags.lockMode) return;
        // === АВТО-ПРОВЕРКИ ПО ПИСЬМАМ ОТЛЁТА ПОЧТ ===
        const isGoogleDisabled =
          subject.includes("Your Google Account has been disabled") &&
          emailFrom === "no-reply@accounts.google.com";

        const isDeliveryFailed =
          subject.includes("Delivery Status Notification") &&
          emailFrom === "mailer-daemon@googlemail.com";

        if (isGoogleDisabled || isDeliveryFailed) {
          await bot.api.sendMessage(
            telegramId,
            `⚠️ Почта отлетела, удаляю её...\n📩 ${emailFrom}`,
            {
              reply_parameters: {
                message_id: sent.message_id,
                allow_sending_without_reply: true,
              },
            }
          );

          await EmailRepo.remove(telegramId, emailId).catch(() => {});
          await this.stop(emailId);
        }
      } catch (err) {
        console.warn("⚠️ Не удалось отправить/закрепить сообщение:", err);
      }
    }
    } catch (err) {
      console.warn("⚠️ Ошибка при обработке письма:", err);
    }
  }

  /** общий скан по произвольной выборке (seq) */
  private static async scan(
    telegramId: number,
    emailId: number,
    client: ImapFlow,
    createdAtMs: number,
    seq: string | number[],
    byUid = false
  ) {
    try {
      for await (const msg of client.fetch(seq, { uid: byUid, source: true })) {
        const parsed = await simpleParser(msg.source!);
        await this.handleFetchedMessage(
          telegramId,
          emailId,
          msg,
          parsed,
          createdAtMs
        );
      }
    } catch (err: any) {
      // Игнорируем ошибки при закрытом соединении
      if (err?.code !== 'NoConnection') {
        console.log(`⚠️ IMAP scan error: ${err?.message || err}`);
      }
    }
  }

  /** auth fail → удалить email из БД, остановить поток */
  private static async onAuthFailure(
    telegramId: number,
    emailId: number,
    login: string,
    pass: string
  ) {
    await bot.api
      .sendMessage(
        telegramId,
        `❌ Неверные данные входа для <b>${this.esc(login)}:${this.esc(
          pass
        )}</b>`,
        { parse_mode: "HTML" }
      )
      .catch(() => {});
    await EmailRepo.remove(telegramId, emailId).catch(() => {});
    await this.stop(emailId);
  }

  /** единый коннект/ре-коннект + начальные действия + live-слушатель */
  private static async connectAndListen(
    telegramId: number,
    emailId: number,
    handle: StreamHandle
  ) {
    console.log(`🔌 [connectAndListen] Starting for email ID ${emailId}`);
    try {
      if (handle.stopped) {
        console.log(`⏹️ [connectAndListen] Email ID ${emailId} already stopped, exiting`);
        return;
      }
      const { login, pass } = this.parse(handle.raw);
      console.log(`📧 [connectAndListen] Login: ${login.substring(0, 10)}...`);

      console.log(`🔌 [connectAndListen] Logging out old client for email ID ${emailId}...`);
      try {
        await handle.client.logout().catch(() => {});
      } catch (err) {
        // Игнорируем ошибки logout
      }
      console.log(`🆕 [connectAndListen] Creating new client for email ID ${emailId}...`);
      handle.client = this.makeClient(login, pass);
      const { client } = handle;

    try {
      console.log(`🔌 [connectAndListen] Connecting to IMAP for email ID ${emailId}...`);
      await client.connect();
      console.log(`✅ [connectAndListen] Connected! Opening INBOX for email ID ${emailId}...`);
      await client.mailboxOpen("INBOX");
      handle.attempts = 0;
      await EmailRepo.setValid(telegramId, emailId, true).catch(() => {});

      const createdAtSec = await EmailRepo.getEmailCreatedAt(emailId);
      const createdAtMs = (Number(createdAtSec) || 0) * 1000;

      const hasAny = await EmailMsgRepo.anyForEmail(emailId);
      if (!client.mailbox) return;
      const totalSeq = client.mailbox.exists || 0;

      // --- ИНИЦИАЛЬНЫЙ СКАН: по SEQUENCE ---
      if (totalSeq > 0) {
        const startSeq = Math.max(1, hasAny ? totalSeq - RECENT_SCAN + 1 : 1);
        await this.scan(
          telegramId,
          emailId,
          client,
          createdAtMs,
          `${startSeq}:*`,
          /*byUid*/ false
        );
      }

      // после инициализации считаем, что всё до текущего exists обработано
      handle.lastSeq = client.mailbox?.exists || 0;

      // --- LIVE-ДРЕН: выгребаем всё, что появилось после lastSeq ---
      const drain = async () => {
        if (handle.stopped) return;
        if (handle.scanning) return;
        handle.scanning = true;
        try {
          if (!client.mailbox) return;
          // на случай EXPUNGE/переподключений
          const existsNow = client.mailbox.exists || 0;
          if (handle.lastSeq > existsNow) {
            handle.lastSeq = existsNow;
          }
          const start = handle.lastSeq + 1;
          if (start <= existsNow) {
            await this.scan(
              telegramId,
              emailId,
              client,
              createdAtMs,
              `${start}:${existsNow}`,
              /*byUid*/ false // ВАЖНО: это sequence-диапазон
            );
            handle.lastSeq = existsNow;
          }
        } finally {
          handle.scanning = false;
        }
      };

      // live: как только "exists" вырос — добираем ВСЁ между lastSeq и текущим exists
      client.on("exists", () => {
        drain().catch(() => {}); // Безопасный вызов
      });

      // подстраховка: вдруг письма успели прийти между сканом и IDLE
      await drain().catch(() => {});

      // автопереподключение с backoff
      const schedule = () => {
        if (handle.stopped || handle.reconnectTimer) return;
        const delay = this.backoffDelay(++handle.attempts);
        console.log(`🔄 Планирую переподключение через ${delay}ms...`);
        handle.reconnectTimer = setTimeout(() => {
          handle.reconnectTimer = undefined;
          this.connectAndListen(telegramId, emailId, handle).catch(() => {});
        }, delay);
      };
      client.on("close", schedule);
      client.on("error", schedule);

      try {
        await client.idle();
      } catch (err: any) {
        if (err?.code !== 'NoConnection') {
          console.log(`⚠️ IMAP idle() error: ${err?.message || err}`);
        }
      }
    } catch (err: any) {
      if (err?.authenticationFailed) {
        await this.onAuthFailure(telegramId, emailId, login, pass);
        return;
      }
      if (!handle.stopped && !handle.reconnectTimer) {
        const delay = this.backoffDelay(++handle.attempts);
        handle.reconnectTimer = setTimeout(() => {
          handle.reconnectTimer = undefined;
          this.connectAndListen(telegramId, emailId, handle).catch(() => {});
        }, delay);
      }
    }
    } catch (err) {
      console.error(`💥 CRITICAL connectAndListen ERROR (emailId=${emailId}):`, err);
      // Критическая ошибка — планируем переподключение
      if (!handle.stopped && !handle.reconnectTimer) {
        const delay = this.backoffDelay(++handle.attempts);
        handle.reconnectTimer = setTimeout(() => {
          handle.reconnectTimer = undefined;
          this.connectAndListen(telegramId, emailId, handle).catch(() => {});
        }, delay);
      }
    }
  }

  /* ===== public (без изменений интерфейса) ===== */

  static async startStream(telegramId: number, emailId: number, raw: string) {
    console.log(`▶️ [startStream] Starting stream for email ID ${emailId}, user ${telegramId}`);
    
    const existing = this.streams.get(emailId);
    if (existing && !existing.stopped) {
      console.log(`ℹ️ [startStream] Stream ${emailId} already running, skipping`);
      return;
    }

    console.log(`🔐 [startStream] Parsing credentials for email ID ${emailId}`);
    const { login, pass } = this.parse(raw);
    console.log(`📧 [startStream] Login: ${login.substring(0, 10)}...`);
    
    const handle: StreamHandle = {
      client: this.makeClient(login, pass),
      login,
      raw,
      attempts: 0,
      stopped: false,
      lastSeq: 0,
      scanning: false,
    };
    this.streams.set(emailId, handle);
    console.log(`✅ [startStream] Stream handle created for email ID ${emailId}`);

    console.log(`🔌 [startStream] Launching connectAndListen in background for email ID ${emailId}...`);
    // ВАЖНО: запускаем в фоне, не ждем завершения (IMAP может подключаться долго)
    this.connectAndListen(telegramId, emailId, handle).catch((err) => {
      console.error(`❌ [startStream] connectAndListen failed for email ID ${emailId}:`, err);
    });
    console.log(`✅ [startStream] Stream ${emailId} launched (connecting in background)`);
  }

  private static async launch(
    telegramId: number,
    emails: { id: number; email: string }[]
  ) {
    await Promise.allSettled(
      emails.map((e) => this.startStream(telegramId, e.id, e.email))
    );
    // const running = await this.listRunningForUser(telegramId);
    // await bot.api
    //   .sendMessage(
    //     telegramId,
    //     running.length
    //       ? `📡 Активные потоки: ${running.length}`
    //       : "📡 Нет активных потоков",
    //     { parse_mode: "HTML" }
    //   )
    //   .catch(() => {});
  }

  static async startAll(telegramId: number) {
    const list = await EmailRepo.list(telegramId);
    await this.launch(telegramId, list);
  }

  static async startSelected(telegramId: number, emailIds: number[]) {
    const all = await EmailRepo.list(telegramId);
    await this.launch(
      telegramId,
      all.filter((e) => emailIds.includes(e.id))
    );
  }

  static async syncWithDb(telegramId: number) {
    console.log(`🔄 [syncWithDb] Starting sync for user ${telegramId}`);
    
    const list = await EmailRepo.list(telegramId); // почты юзера из БД
    console.log(`📊 [syncWithDb] Found ${list.length} emails in DB for user ${telegramId}`);
    
    const currentIds = new Set(await this.listRunningForUser(telegramId)); // только его активные
    console.log(`📊 [syncWithDb] Currently running: ${currentIds.size} streams`);
    
    const dbIds = new Set(list.map((e) => e.id));

    const toStart = list.filter((e) => !currentIds.has(e.id));
    const toStop = [...currentIds].filter((id) => !dbIds.has(id));

    console.log(`📊 [syncWithDb] To start: ${toStart.length}, to stop: ${toStop.length}`);

    console.log(`⏳ [syncWithDb] Starting/stopping streams...`);
    const results = await Promise.allSettled([
      ...toStart.map((e) => {
        console.log(`▶️ [syncWithDb] Starting stream for email ID ${e.id}`);
        return this.startStream(telegramId, e.id, e.email);
      }),
      ...toStop.map((id) => {
        console.log(`⏹️ [syncWithDb] Stopping stream ID ${id}`);
        return this.stop(id);
      }),
    ]);

    console.log(`✅ [syncWithDb] All operations completed`);
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        console.error(`❌ [syncWithDb] Operation ${idx} failed:`, result.reason);
      }
    });

    const running = await this.listRunningForUser(telegramId);
    console.log(`📊 [syncWithDb] Final running count: ${running.length}`);
    
    await bot.api
      .sendMessage(
        telegramId,
        running.length
          ? `🔁 Синхронизация завершена. Активные: ${running.length}`
          : "🔁 Синхронизация завершена. Активных потоков нет.",
        { parse_mode: "HTML" }
      )
      .catch((err) => {
        console.error(`❌ [syncWithDb] Failed to send completion message:`, err);
      });
    
    console.log(`✅ [syncWithDb] Sync completed for user ${telegramId}`);
  }

  static async stop(emailId: number) {
    const h = this.streams.get(emailId);
    if (!h) return;
    h.stopped = true;
    if (h.reconnectTimer) {
      clearTimeout(h.reconnectTimer);
      h.reconnectTimer = undefined;
    }
    try {
      await h.client.logout().catch(() => {});
    } catch (err) {
      // Игнорируем все ошибки при остановке
    }
    this.streams.delete(emailId);
  }

  static async listRunningForUser(telegramId: number): Promise<number[]> {
    const userEmails = await EmailRepo.list(telegramId); // [{id, ...}]
    const ids = userEmails.map((e) => e.id);
    return ids.filter((id) => {
      const h = this.streams.get(id);
      return !!(h && !h.stopped);
    });
  }

  /** Остановить ВСЕ потоки конкретного пользователя. Ничего не пишет в чат. */
  static async stopAllForUser(telegramId: number): Promise<number[]> {
    const ids = await this.listRunningForUser(telegramId);
    if (ids.length === 0) return [];
    await Promise.allSettled(ids.map((id) => this.stop(id)));
    return ids;
  }

  static async status(telegramId: number): Promise<string> {
    const list = await EmailRepo.list(telegramId);
    if (list.length === 0) return "📭 У вас нет добавленных почт.";

    let active = 0;
    const rows = list.map((e) => {
      const on = this.streams.has(e.id) && !this.streams.get(e.id)!.stopped;
      if (on) active++;
      const { login } = this.parse(e.email);
      return `${on ? "✅" : "⏸️"} ${login}`;
    });
    return [`📡 Активно: ${active} из ${list.length}`, ...rows].join("\n");
  }

  static isRunning(emailId: number) {
    return this.streams.has(emailId) && !this.streams.get(emailId)!.stopped;
  }

  static listRunningAll(): number[] {
    return Array.from(this.streams.entries())
      .filter(([, h]) => !h.stopped)
      .map(([id]) => id);
  }

  static async startAllForEveryone() {
    console.log("📧 Запуск IMAP потоков для всех пользователей...");
    
    try {
      const rows = await UserRepo.listForEmails();
      console.log(`📋 Найдено пользователей с email: ${rows.length}`);
      
      if (rows.length === 0) {
        console.log("ℹ️ Нет пользователей с почтами для запуска");
        return;
      }

      // Запускаем с таймаутом для каждого пользователя
      const promises = rows.map(async (row) => {
        const timeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout")), 10000)
        );
        
        try {
          await Promise.race([
            EmailStreamManager.startAll(row.telegramId),
            timeout
          ]);
          console.log(`✅ Потоки запущены для user ${row.telegramId}`);
        } catch (err: any) {
          if (err?.message === "Timeout") {
            console.warn(`⏱ Таймаут при запуске потоков для ${row.telegramId}`);
          } else {
            console.error(`❌ Ошибка при запуске потоков для ${row.telegramId}:`, err);
          }
        }
      });

      await Promise.allSettled(promises);
      console.log(`✅ Старт потоков завершён для ${rows.length} пользователей`);
    } catch (err) {
      console.error("❌ Критическая ошибка при запуске IMAP потоков:", err);
    }
  }

  static async stopAllForEveryone() {
    const rows = await await UserRepo.listForEmails();
    await Promise.allSettled(
      rows.map(async (row) => {
        try {
          await EmailStreamManager.stopAllForUser(row.telegramId);
        } catch (err) {
          console.error(
            `❌ Ошибка при остановке потока для ${row.telegramId}:`,
            err
          );
        }
      })
    );

    console.log(`✅ Все потоки завершены для ${rows.length} пользователей`);
  }
}
