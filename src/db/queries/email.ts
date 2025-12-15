import { db } from "../index";
import { users, emails } from "../schema";
import { eq, and, count, asc, gt } from "drizzle-orm";

export class EmailRepo {
  /** 🔒 Получить user.id по telegramId */
  private static async _getUserId(telegramId: number): Promise<number> {
    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .get();

    if (!row) throw new Error(`User with telegramId=${telegramId} not found`);
    return row.id;
  }

  /** ➕ Добавить один или несколько email */
  static async add(
    telegramId: number,
    emailList: { name: string; email: string }[]
  ) {
    const userId = await this._getUserId(telegramId);

    // убираем дубликаты внутри списка
    const uniqueList = [
      ...new Map(emailList.map((e) => [e.email.trim(), e])).values(),
    ];

    // достаем существующие email у юзера
    const existing = await db
      .select({ email: emails.email })
      .from(emails)
      .where(eq(emails.userId, userId))
      .all();

    const existingSet = new Set(existing.map((e) => e.email));

    // оставляем только новые
    const toInsert = uniqueList.filter((e) => !existingSet.has(e.email));

    if (toInsert.length === 0) return 0;

    // вставляем пачкой
    await db
      .insert(emails)
      .values(
        toInsert.map((e) => ({
          userId,
          name: e.name.trim(),
          email: e.email.trim(),
          isValid: 1,
          isSpam: 0,
        }))
      )
      .run();

    return toInsert.length;
  }

  /** ✏️ Обновить email (имя/адрес) */
  static async update(
    telegramId: number,
    emailId: number,
    newName: string,
    newEmail: string,
    isValid: boolean,
    isSpam: boolean
  ) {
    const userId = await this._getUserId(telegramId);

    await db
      .update(emails)
      .set({
        name: newName.trim(),
        email: newEmail.trim(),
        isValid: isValid ? 1 : 0,
        isSpam: isSpam ? 1 : 0,
      })
      .where(and(eq(emails.id, emailId), eq(emails.userId, userId)))
      .run();
  }

  /** ✏️ Обновить статус валидации */
  static async setValid(telegramId: number, emailId: number, isValid: boolean) {
    const userId = await this._getUserId(telegramId);

    await db
      .update(emails)
      .set({ isValid: isValid ? 1 : 0 })
      .where(and(eq(emails.id, emailId), eq(emails.userId, userId)))
      .run();
  }

  /** ✏️ Пометить как спам / убрать */
  static async setSpam(telegramId: number, emailId: number, isSpam: boolean) {
    const userId = await this._getUserId(telegramId);

    await db
      .update(emails)
      .set({ isSpam: isSpam ? 1 : 0 })
      .where(and(eq(emails.id, emailId), eq(emails.userId, userId)))
      .run();
  }

  /** ❌ Удалить email */
  static async remove(telegramId: number, emailId: number) {
    const userId = await this._getUserId(telegramId);

    await db
      .delete(emails)
      .where(and(eq(emails.id, emailId), eq(emails.userId, userId)))
      .run();
  }

  /** 🧹 Очистить все email */
  static async clear(telegramId: number) {
    const userId = await this._getUserId(telegramId);

    await db.delete(emails).where(eq(emails.userId, userId)).run();
  }

  /** 📃 Получить список email */
  static async list(telegramId: number) {
    const userId = await this._getUserId(telegramId);

    return db
      .select({
        id: emails.id,
        name: emails.name,
        email: emails.email,
        isValid: emails.isValid,
        isSpam: emails.isSpam,
      })
      .from(emails)
      .where(eq(emails.userId, userId))
      .all();
  }

  /** 📃 Получить список email постранично */
  static async listPaginated(
    telegramId: number,
    limit: number,
    offset: number
  ) {
    const userId = await this._getUserId(telegramId);

    return db
      .select({
        id: emails.id,
        name: emails.name,
        email: emails.email,
        isValid: emails.isValid,
        isSpam: emails.isSpam,
      })
      .from(emails)
      .where(eq(emails.userId, userId))
      .limit(limit)
      .offset(offset)
      .all();
  }

  static async getTotalPages(
    telegramId: number,
    perPage = 20
  ): Promise<number> {
    const userId = await this._getUserId(telegramId);

    const row = await db
      .select({ count: count() })
      .from(emails)
      .where(eq(emails.userId, userId))
      .get();

    const total = row?.count ?? 0;
    return Math.max(Math.ceil(total / perPage), 1);
  }

  /** ✏️ Обновить только имя */
  static async updateName(
    telegramId: number,
    emailId: number,
    newName: string
  ) {
    const userId = await this._getUserId(telegramId);

    await db
      .update(emails)
      .set({ name: newName.trim() })
      .where(and(eq(emails.id, emailId), eq(emails.userId, userId)))
      .run();
  }

  static async getEmailCreatedAt(emailId: number): Promise<number> {
    const row = await db
      .select({ createdAt: emails.createdAt })
      .from(emails)
      .where(eq(emails.id, emailId))
      .get();
    // если почему-то нет — вернём «сейчас», чтобы ничего старого не слать
    return row?.createdAt ?? Math.floor(Date.now() / 1000);
  }

  static async nextValidEmail(
    telegramId: number
  ): Promise<{ id: number; name: string; email: string } | null> {
    const userId = await this._getUserId(telegramId);

    return db.transaction(async (tx) => {
      const cur = await tx
        .select({ cursor: users.emailCursorId })
        .from(users)
        .where(eq(users.id, userId))
        .get();

      const cursor = cur?.cursor ?? 0;

      // сначала ищем > cursor
      const next = await tx
        .select({ id: emails.id, name: emails.name, email: emails.email })
        .from(emails)
        .where(
          and(
            eq(emails.userId, userId),
            eq(emails.isValid, 1),
            eq(emails.isSpam, 0),
            gt(emails.id, cursor)
          )
        )
        .orderBy(asc(emails.id))
        .limit(1)
        .get();

      // если нет — берём минимальный подходящий (wrap)
      const chosen =
        next ??
        (await tx
          .select({ id: emails.id, name: emails.name, email: emails.email })
          .from(emails)
          .where(and(eq(emails.userId, userId), eq(emails.isValid, 1), eq(emails.isSpam, 0)))
          .orderBy(asc(emails.id))
          .limit(1)
          .get());

      if (!chosen) return null;

      await tx
        .update(users)
        .set({ emailCursorId: chosen.id })
        .where(eq(users.id, userId))
        .run();

      return chosen;
    });
  }

  /** 🔁 Сброс курсора вручную (как у прокси resetCursor) */
  static async resetEmailCursor(telegramId: number) {
    const userId = await this._getUserId(telegramId);
    await db
      .update(users)
      .set({ emailCursorId: null })
      .where(eq(users.id, userId))
      .run();
  }
}
