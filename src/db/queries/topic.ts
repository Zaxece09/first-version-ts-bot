import { db } from "../index";
import { users, topics } from "../schema";
import { eq, and } from "drizzle-orm";

export class TopicRepo {
  /** 🔒 Приватный метод: достать user.id по telegramId */
  private static async _getUserId(telegramId: number): Promise<number> {
    const row = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .get();

    if (!row) throw new Error(`User with telegramId=${telegramId} not found`);
    return row.id;
  }

  /** ➕ Добавить тему */
  static async add(telegramId: number, title: string) {
    const userId = await this._getUserId(telegramId);
    await db.insert(topics).values({ userId, title }).run();
  }

  /** ✏️ Обновить тему */
  static async update(telegramId: number, topicId: number, title: string) {
    const userId = await this._getUserId(telegramId);
    await db
      .update(topics)
      .set({ title })
      .where(and(eq(topics.id, topicId), eq(topics.userId, userId)))
      .run();
  }

  static async remove(telegramId: number, topicId: number) {
    const userId = await this._getUserId(telegramId);
    await db
      .delete(topics)
      .where(and(eq(topics.id, topicId), eq(topics.userId, userId)))
      .run();
  }

  /** 🧹 Очистить все темы */
  static async clear(telegramId: number) {
    const userId = await this._getUserId(telegramId);
    await db.delete(topics).where(eq(topics.userId, userId)).run();
  }

  /** 📃 Получить список тем */
  static async list(telegramId: number) {
    const userId = await this._getUserId(telegramId);
    return db
      .select({
        id: topics.id,
        title: topics.title,
      })
      .from(topics)
      .where(eq(topics.userId, userId))
      .all();
  }
}
