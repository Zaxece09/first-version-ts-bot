import { db } from "../index";
import { adverts, users, emailMessages } from "../schema";
import { eq, and, asc } from "drizzle-orm";

import type { Adv } from "../../utils/nickify";

export class AdvertsRepo {
  private static async _getUserId(telegramId: number): Promise<number> {
    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .get();

    if (!row) throw new Error(`User with telegramId=${telegramId} not found`);
    return row.id;
  }
  /** Добавить объявление (игнорирует дубликаты по personDotName). */
  static async add(params: {
    userId: number;
    title: string;
    price: string;
    photo: string;
    link: string;
    personDotName: string;
  }): Promise<boolean> {
    const { userId, title, price, photo, link, personDotName } = params;

    // Пытаемся вставить, просим вернуть id
    const inserted = await db
      .insert(adverts)
      .values({
        userId,
        title,
        price,
        photo,
        link,
        personDotName,
        status: 0,
      })
      .onConflictDoNothing({ target: [adverts.userId, adverts.personDotName] })
      .returning({ id: adverts.id });

    if (inserted.length > 0) {
      return true;
    }

    return false;
  }

  static async bulkAdd(userId: number, candidates: Adv[]): Promise<number> {
    if (!candidates.length) return 0;

    // готовим значения
    const values = candidates.map((c) => ({
      userId,
      title: c.title,
      price: c.price,
      photo: c.photo,
      link: c.link,
      personDotName: c.personDotName,
      status: 0 as 0,
    }));

    const inserted = await db
      .insert(adverts)
      .values(values)
      .onConflictDoNothing({ target: [adverts.userId, adverts.personDotName] })
      .returning({ id: adverts.id });

    // inserted.length — это кол-во реально вставленных строк
    return inserted.length;
  }

  static async bulkAddByTelegramId(
    telegramId: number,
    candidates: Adv[]
  ): Promise<number> {
    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .get();
    if (!row) throw new Error(`User with telegramId=${telegramId} not found`);
    return this.bulkAdd(row.id, candidates);
  }

  static async setReady(advertId: number, email: string) {
    const updated = await db
      .update(adverts)
      .set({ email, status: 2 })
      .where(eq(adverts.id, advertId))
      .returning({ id: adverts.id });
    return updated.length > 0;
  }

  /** Поставить status=1 (почта не найдена) */
  static async setNotFound(advertId: number) {
    const updated = await db
      .update(adverts)
      .set({ status: 1 })
      .where(eq(adverts.id, advertId))
      .returning({ id: adverts.id });
    return updated.length > 0;
  }

  static async listPendingByTelegramId(telegramId: number, limit = 5000) {
    const userId = await this._getUserId(telegramId);
    return db
      .select({
        id: adverts.id,
        personDotName: adverts.personDotName,
      })
      .from(adverts)
      .where(and(eq(adverts.userId, userId), eq(adverts.status, 0)))
      .limit(limit)
      .all();
  }

  /** Установить fakeLink */
  static async setFakeLink(advertId: number, fakeLink: string) {
    const updated = await db
      .update(adverts)
      .set({ fakeLink })
      .where(eq(adverts.id, advertId))
      .returning({ id: adverts.id });

    return updated.length > 0;
  }

  /** Установить/обновить цену объявления */
  static async setPrice(advertId: number, price: string) {
    const updated = await db
      .update(adverts)
      .set({ price })
      .where(eq(adverts.id, advertId))
      .returning({ id: adverts.id });

    return updated.length > 0;
  }

  /** Установить email */
  static async setEmail(advertId: number, email: string | null) {
    const updated = await db
      .update(adverts)
      .set({ email })
      .where(eq(adverts.id, advertId))
      .returning({ id: adverts.id });

    return updated.length > 0;
  }

  /** Изменить статус */
  static async setStatus(advertId: number, status: 0 | 1 | 2 | 3) {
    const updated = await db
      .update(adverts)
      .set({ status })
      .where(eq(adverts.id, advertId))
      .returning({ id: adverts.id });

    return updated.length > 0;
  }

  /** Готовые к отправке объявления (status=2, email не null) для юзера */
  static async listReadyByTelegramId(telegramId: number) {
    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .get();
    if (!row) throw new Error(`User with telegramId=${telegramId} not found`);
    const userId = row.id;

    return db
      .select({
        id: adverts.id,
        title: adverts.title,
        email: adverts.email,
      })
      .from(adverts)
      .where(and(eq(adverts.userId, userId), eq(adverts.status, 2)))
      .orderBy(asc(adverts.id))
      .all();
  }

  static async getAdvertByMailId(mailId: number) {
    const row = await db
      .select({
        advertId: emailMessages.advertId,
        link: adverts.link,
      })
      .from(emailMessages)
      .leftJoin(adverts, eq(emailMessages.advertId, adverts.id))
      .where(eq(emailMessages.id, mailId))
      .get();

    return {
      advertId: row?.advertId ?? null,
      link: row?.link ?? null,
    };
  }

  static async getTextByMailId(mailId: number) {
    const row = await db
      .select({
        text: emailMessages.text,
      })
      .from(emailMessages)
      .where(eq(emailMessages.id, mailId))
      .get();

    return row?.text ?? null;
  }

  static async getFakeLink(mailId: number): Promise<string | null> {
    const row = await db
      .select({ fakeLink: adverts.fakeLink })
      .from(emailMessages)
      .leftJoin(adverts, eq(emailMessages.advertId, adverts.id))
      .where(eq(emailMessages.id, mailId))
      .get();

    return row?.fakeLink ?? null;
  }
}
