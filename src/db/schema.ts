import { int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: int("id").primaryKey({ autoIncrement: true }),
  telegramId: int("telegram_id").notNull().unique(),
  createdAt: text("created_at")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  lastOnline: text("last_online")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
  username: text("username"),
  role: text("role")
    .$type<"guest" | "user" | "admin">()
    .notNull()
    .default("guest"),
  spoofName: text("spoof_name").notNull().default("-"),

  team: text("team")
    .$type<"tsum" | "aqua">() // 0=tsum, 1=aqua
    .default("tsum")
    .notNull(),

  // флаги (0/1)
  giroMode: int("giro_mode").notNull().default(0),
  topicMode: int("topic_mode").notNull().default(0),
  smartMode: int("smart_mode").notNull().default(0),
  spoofMode: int("spoof_mode").notNull().default(0),
  htmlMailerMode: int("html_mailer_mode").notNull().default(0),
  shortMode: int("short_mode").notNull().default(0),
  paypalMode: int("paypal_mode").notNull().default(0),
  lockMode: int("lock_mode").notNull().default(0),

  // интервал в строке, по умолчанию [1,1]
  interval: text("interval").notNull().default("[1,1]"),
  apiKeyTsum: text("api_key_tsum").notNull().default("-"),
  profileIdTsum: text("profile_id_tsum").notNull().default("-"),
  apiKeyAqua: text("api_key_aqua").notNull().default("-"),
  profileIdAqua: text("profile_id_aqua").notNull().default("-"),

  emailCursorId: int("email_cursor_id"),
  proxyCursorId: int("proxy_cursor_id"),
  smartPresetCursorId: int("smart_preset_cursor_id"),
});

export const presets = sqliteTable("presets", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  text: text("text").notNull(),
});

// Прокси
export const proxies = sqliteTable("proxies", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  proxy: text("proxy").notNull().unique(),
  isValid: int("is_valid").notNull().default(1), // 1 = валид, 0 = невалид
});

// Умные пресеты
export const smartPresets = sqliteTable("smart_presets", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
});

// Топики/Темы
export const topics = sqliteTable("topics", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
});

// Emails
export const emails = sqliteTable("emails", {
  id: int("id").primaryKey({ autoIncrement: true }),
  userId: int("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  isValid: int("is_valid").notNull().default(1), // 1 = валид, 0 = невалид
  isSpam: int("is_spam").notNull().default(0), // 1 = спам, 0 = норм
  createdAt: int("created_at")
    .notNull()
    .default(Math.floor(Date.now() / 1000)),
});

export const emailMessages = sqliteTable("email_messages", {
  id: int("id").primaryKey({ autoIncrement: true }),
  emailId: int("email_id")
    .notNull()
    .references(() => emails.id, { onDelete: "cascade" }),
  msgId: text("msg_id").notNull().unique(),
  subject: text("subject").notNull(),
  text: text("text").notNull(),
  senderName: text("sender_name").notNull(),
  emailFrom: text("email_from").notNull(),
  tgMsgId: int("tg_msg_id"),
  advertId: int("advert_id").references(() => adverts.id, {
    onDelete: "cascade",
  }),
});

export const adverts = sqliteTable(
  "adverts",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    price: text("price").notNull(),
    photo: text("photo").notNull(),
    link: text("link").notNull(),
    fakeLink: text("fake_link"),
    personDotName: text("person_dot_name").notNull(),
    email: text("email"),
    status: int("status")
      .$type<0 | 1 | 2 | 3>() // 0=создан, 1=почта не найдена, 2=готов к отправке, 3=отправлен
      .default(0)
      .notNull(),
  },
  (table) => ({
    userPersonUnique: unique().on(table.userId, table.personDotName),
  })
);

export const keys = sqliteTable("keys", {
  id: int("id").primaryKey({ autoIncrement: true }),
  keyValue: text("key_value").notNull(),
  rps: int("rps").notNull().default(5),
  enabled: int("enabled").notNull().default(1), // 1=enabled, 0=disabled  
  errorMessage: text("error_message"),
  createdAt: int("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: int("updated_at").notNull().default(sql`(unixepoch())`),
});

//bunx drizzle-kit push
//bunx drizzle-kit generate
//bunx drizzle-kit migrate
//bunx drizzle-kit drop
//bunx drizzle-kit studio