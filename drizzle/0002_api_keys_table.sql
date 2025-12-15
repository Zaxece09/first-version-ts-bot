-- Таблица для хранения API ключей
CREATE TABLE IF NOT EXISTS "keys" (
	"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	"key_value" text NOT NULL,
	"rps" integer DEFAULT 5 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" integer DEFAULT (unixepoch()) NOT NULL,
	"updated_at" integer DEFAULT (unixepoch()) NOT NULL
);

-- Индекс для быстрого поиска активных ключей
CREATE INDEX IF NOT EXISTS "keys_enabled_idx" ON "keys" ("enabled");