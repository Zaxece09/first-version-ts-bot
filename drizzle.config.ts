import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";
import { resolve } from "path";

// Читаем конфиг для drizzle CLI
function loadConfigForDrizzle(): string {
  try {
    const configPath = resolve(process.cwd(), "config.ini");
    const configContent = readFileSync(configPath, "utf-8");
    
    for (const line of configContent.split('\n')) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('DB_FILE_NAME=')) {
        return trimmedLine.split('=')[1].trim();
      }
    }
    
    return "db.sqlite"; // fallback
  } catch (error) {
    console.error("❌ Не удалось загрузить config.ini для drizzle:", error);
    return "db.sqlite"; // fallback
  }
}

const dbFileName = loadConfigForDrizzle();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbFileName,
  },
});
