import { run } from "@grammyjs/runner";
import { bot } from "./bot";
import { EmailStreamManager } from "./emailStream";
import { stopAllSends } from "./emailSender";

// Встроенный мониторинг conversations
const activeConversations = new Map<number, { startTime: number; name: string }>();

function startConversationMonitor() {
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

// Отключаем блокировку stdin (предотвращение зависаний при вводе в консоль)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(false);
  process.stdin.pause();
}

// Глобальный обработчик необработанных промисов (для IMAP)
process.on("unhandledRejection", (reason: any) => {
  // Игнорируем известные IMAP ошибки при закрытии соединения
  if (reason?.code === "NoConnection" || reason?.message?.includes("Connection not available")) {
    // Это нормально при закрытии IMAP - не логируем
    return;
  }
  // Логируем остальные необработанные промисы
  console.error("💥 Необработанное отклонение промиса:", reason);
  console.log("   Бот продолжает работу...");
});

console.log("🚀 Бот инициализируется...");

const runner = run(bot, {
  runner: {
    // Увеличиваем лимиты для предотвращения блокировок
    fetch: {
      allowed_updates: ["message", "callback_query", "inline_query"],
    },
  },
});

console.log("✅ Cris Mailer бот запущен!");
startConversationMonitor(); // Запуск мониторинга зависших conversations

// Запускаем IMAP потоки в фоне (не блокируем старт бота)
EmailStreamManager.startAllForEveryone()
  .then(() => console.log("📧 IMAP потоки запущены"))
  .catch((err) => console.error("❌ Ошибка при запуске IMAP:", err));

// Keep-alive: имитируем активность чтобы предотвратить зависания
setInterval(() => {
  // Просто пустая операция для предотвращения блокировки event loop
  Promise.resolve().then(() => {}).catch(() => {});
}, 5000); // Каждые 5 секунд

// Мониторинг здоровья бота каждые 30 секунд
setInterval(() => {
  const now = new Date().toISOString();
  console.log(`💓 [${now}] Бот работает. Runner: ${runner.isRunning() ? "✅" : "❌"}`);
}, 30000);

// Watchdog: перезапуск runner если он остановился
setInterval(() => {
  if (!runner.isRunning()) {
    console.error("⚠️ Runner остановлен! Пытаюсь перезапустить...");
    try {
      runner.start();
      console.log("✅ Runner перезапущен");
    } catch (err) {
      console.error("❌ Не удалось перезапустить runner:", err);
    }
  }
}, 10000); // Проверка каждые 10 секунд

const stopRunner = async () => {
  if (runner.isRunning()) {
    console.log("\n⛔ Остановка Cris Mailer...");
    await stopAllSends();
    await EmailStreamManager.stopAllForEveryone();
    await runner.stop();
    console.log("🛑 Cris Mailer бот остановлен!");
  }
};

process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);
