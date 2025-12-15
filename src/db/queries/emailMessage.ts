import { db } from "../index";
import { users, emails, emailMessages } from "../schema";
import { and, eq, inArray } from "drizzle-orm";

// ---- существующий EmailRepo тут остаётся без изменений ----
// (как у тебя в файле)

export class EmailMsgRepo {
  /** есть ли запись об этом письме? */
  static async has(emailId: number, msgId: string): Promise<boolean> {
    const row = await db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(
        and(eq(emailMessages.emailId, emailId), eq(emailMessages.msgId, msgId))
      )
      .limit(1)
      .get();
    return !!row;
  }

  static async logSent(
    emailId: number,
    msgId: string,
    subject: string,
    text: string,
    senderName: string,
    emailFrom: string,
    tgMsgId: number | null,
    advertId: number | null
  ): Promise<void> {
    await db
      .insert(emailMessages)
      .values({
        emailId,
        msgId,
        subject: subject ?? "",
        text: text ?? "",
        senderName: senderName ?? "",
        emailFrom: emailFrom ?? "",
        tgMsgId: tgMsgId ?? null,
        advertId: advertId ?? null,
      })
      .run();
  }

  static async getFullMessage(msgId: number) {
    const row = db
      .select({
        id: emailMessages.id,
        emailId: emailMessages.emailId,
        msgId: emailMessages.msgId,
        subject: emailMessages.subject,
        text: emailMessages.text,
        senderName: emailMessages.senderName,
        emailFrom: emailMessages.emailFrom,
        tgMsgId: emailMessages.tgMsgId,
        advertId: emailMessages.advertId,

        // из таблицы emails
        name: emails.name,
        email: emails.email,
        isSpam: emails.isSpam,
      })
      .from(emailMessages)
      .innerJoin(emails, eq(emailMessages.emailId, emails.id))
      .where(eq(emailMessages.id, msgId))
      .get();

    if (!row) return null;

    return {
      ...row,
      tgMsgId: row.tgMsgId ?? 0, // ← твой кейс: null/undefined → 0
    };
  }

  static async getIdByMsgId(msgId: string): Promise<number | null> {
    const row = await db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.msgId, msgId))
      .limit(1)
      .get();

    return row ? row.id : null;
  }

  // ✅ Получение обоих ID
  static async getMessageMeta(emailId: number, msgId: string) {
    const row = await db
      .select({
        tgMsgId: emailMessages.tgMsgId,
        advertId: emailMessages.advertId,
      })
      .from(emailMessages)
      .where(
        and(eq(emailMessages.emailId, emailId), eq(emailMessages.msgId, msgId))
      )
      .get();

    return {
      tgMsgId: row?.tgMsgId ?? 0, // тут оставляем null (телега msg может быть)
      advertId: row?.advertId ?? null, // тут именно undefined, чтобы совпадало с сигнатурой
    };
  }

  // ✅ Установка tgMsgId + advertId (если передан, иначе =0)
  static async setMessageMeta(
    emailId: number,
    msgId: string,
    tgMsgId: number,
    advertId?: number | null
  ) {
    await db
      .update(emailMessages)
      .set({
        tgMsgId,
        advertId: advertId ?? null,
      })
      .where(
        and(eq(emailMessages.emailId, emailId), eq(emailMessages.msgId, msgId))
      );
  }

  /**
   * trueMarkNew: отметить письмо как новое (идемпотентно).
   * Возвращает true — если вставили новую запись, false — если уже было.
   */
  static async trueMarkNew(
    emailId: number,
    msgId: string,
    subject: string,
    text: string,
    senderName: string,
    emailFrom: string
  ): Promise<boolean> {
    // быстрый чек
    const exists = await this.has(emailId, msgId);
    if (exists) return false;

    // вставка; если параллельно появился дубль — упадёт по UNIQUE → считаем как уже было
    try {
      await db
        .insert(emailMessages)
        .values({ emailId, msgId, subject, text, senderName, emailFrom })
        .run();
      return true;
    } catch {
      return false;
    }
  }

  /** есть ли хоть что-то для этого ящика (быстрый чек наличия) */
  static async anyForEmail(emailId: number): Promise<boolean> {
    const row = await db
      .select({ id: emailMessages.id })
      .from(emailMessages)
      .where(eq(emailMessages.emailId, emailId))
      .limit(1)
      .get();
    return !!row;
  }

  /**
   * bulkMarkAllRead: массово пометить список писем прочитанными
   * (вставляем, игнорируя дубликаты).
   */
  static async bulkMarkAllRead(
    emailId: number,
    msgIds: string[]
  ): Promise<void> {
    if (msgIds.length === 0) return;

    await db
      .insert(emailMessages)
      .values(
        msgIds.map((msgId) => ({
          emailId,
          msgId,
          subject: "",
          text: "",
          senderName: "",
          emailFrom: "",
        }))
      )
      .onConflictDoNothing(); // дубликаты игнорируются
  }

  static async hasAdvert(mailId: number): Promise<boolean> {
    const row = await db
      .select({ advertId: emailMessages.advertId })
      .from(emailMessages)
      .where(eq(emailMessages.id, mailId))
      .get();

    return !!row?.advertId;
  }
}
