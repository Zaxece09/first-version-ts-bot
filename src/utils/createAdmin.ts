// Утилита для создания первого администратора
// Запустите этот файл после того, как пользователь напишет /start боту

import { UserRepo } from "../db/queries";

export async function createFirstAdmin(telegramId: number) {
  try {
    // Проверяем существует ли пользователь
    const userExists = await UserRepo.exists(telegramId);
    
    if (!userExists) {
      console.log(`❌ Пользователь с ID ${telegramId} не найден. Сначала пользователь должен написать /start боту.`);
      return false;
    }

    // Делаем пользователя админом
    await UserRepo.setRole(telegramId, "admin");
    console.log(`✅ Пользователь ${telegramId} успешно назначен администратором!`);
    return true;

  } catch (error) {
    console.error("Ошибка при создании администратора:", error);
    return false;
  }
}

// Пример использования:
// Замените YOUR_TELEGRAM_ID на ваш реальный Telegram ID
// createFirstAdmin(YOUR_TELEGRAM_ID);

export async function makeAdmin(telegramId: number) {
  return await createFirstAdmin(telegramId);
}