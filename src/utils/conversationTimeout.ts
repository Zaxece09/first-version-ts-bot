// Утилита для предотвращения зависания conversations
import type { Conversation } from "@grammyjs/conversations";
import type { CustomContext } from "../types";

// Трекер активных conversations с таймаутами
const activeConversations = new Map<number, { startTime: number; name: string }>();

export function trackConversation(userId: number, name: string) {
  activeConversations.set(userId, {
    startTime: Date.now(),
    name,
  });
}

export function untrackConversation(userId: number) {
  activeConversations.delete(userId);
}

// Wrapper для conversations с автоматическим таймаутом
export function withTimeout<T>(
  conversationFn: (conversation: Conversation<CustomContext>, ctx: CustomContext) => Promise<T>,
  timeoutMs = 300000 // 5 минут по умолчанию
) {
  return async (conversation: Conversation<CustomContext>, ctx: CustomContext): Promise<T | undefined> => {
    const userId = ctx.from?.id;
    if (!userId) return conversationFn(conversation, ctx);

    trackConversation(userId, conversationFn.name || "unknown");

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Conversation timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        conversationFn(conversation, ctx),
        timeoutPromise,
      ]);
      untrackConversation(userId);
      return result;
    } catch (err: any) {
      untrackConversation(userId);
      if (err?.message?.includes("timeout")) {
        console.error(`⏱ Conversation timeout for user ${userId}`);
        await ctx.reply("⏱ Операция заняла слишком много времени. Начните заново.").catch(() => {});
        await conversation.halt();
      }
      throw err;
    }
  };
}

// Мониторинг зависших conversations
export function startConversationMonitor() {
  setInterval(() => {
    const now = Date.now();
    for (const [userId, info] of activeConversations.entries()) {
      const elapsed = now - info.startTime;
      if (elapsed > 600000) { // 10 минут
        console.warn(`⚠️ User ${userId} stuck in conversation "${info.name}" for ${Math.round(elapsed / 1000)}s`);
      }
    }
  }, 60000); // Проверка каждую минуту
}
