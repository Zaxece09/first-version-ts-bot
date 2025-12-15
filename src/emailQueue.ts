import axios from "axios";
import type { CustomContext } from "./types";
import { join } from "path";
import { mkdir } from "fs/promises";
import { AdvertsRepo } from "./db/queries/adverts";

/** ====== ЗАГЛУШКИ ДЛЯ БД (замени на реальные) ====== */
type KeysConfig = {
  keys: Array<{ key: string; rps?: number; enabled?: boolean }>;
};

// Брать ключи ИЗ БД: каждый вызов возвращает актуальный список (только enabled)
async function getKeys(): Promise<KeysConfig> {
  try {
    const { KeysRepo } = await import("./db/queries");
    const keys = await KeysRepo.getEnabled();
    
    return {
      keys: keys.map(k => ({
        key: k.keyValue,
        rps: k.rps,
        enabled: k.enabled
      }))
    };
  } catch (error) {
    console.error("Error loading keys from database:", error);
    return { keys: [] };
  }
}

// Отключить ключ В БД (без локального «понижения скорости»)
async function disableKey(key: string, reason: string) {
  try {
    const { KeysRepo } = await import("./db/queries");
    const success = await KeysRepo.disableByValue(key, reason);
    if (success) {
      console.warn(`💾 DB: disable key ${maskKey(key)} reason="${reason}"`);
    } else {
      console.warn(`💾 DB: key ${maskKey(key)} not found or already disabled`);
    }
  } catch (error) {
    console.error("Error disabling key in database:", error);
  }
}

// Домены для пользователя — из БД
async function getDomains(userId: number): Promise<string[]> {
  // TODO: SELECT domains FROM users WHERE id=?
  if (userId == 8490972754) return ["gmx.net"];
  return ["gmx.net", "gmail.com", "gmx.de", "web.de", "freenet.de"];
}

/** ====== КОНСТАНТЫ ====== */
const TOKEN_LIFETIME = 6 * 60 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const STATUS_UPDATE_EVERY_MS = 1500;
const TOKEN_DIR = "./ninja_tokens";
const DEFAULT_RPS = 1; // Mail Tester Ninja: 35 requests per 30 seconds = ~1.17/sec

const DISABLE_AFTER_429 = 1000;
const DISABLE_AFTER_TIMEOUT = 1000;
const AXIOS_TIMEOUT_MS = 8000;

// Планировщик и параллелизм
const SCHED_TICK_MS = 80;            // частота батч-планирования
const KEY_MAX_CONCURRENCY = 10;      // защитный предел одновременных запросов на ключ (снижено)
const KEY_COOLDOWN_MS = 30000;       // «остывание» ключа после 429 - 30 секунд (по документации)
const PER_USER_SOFT_CAP = 128;       // защитный предел одновременных задач на пользователя

/** ====== УТИЛИТЫ ====== */
const nowMs = () => Date.now();
const maskKey = (k: string) => (k.length > 8 ? `…${k.slice(-8)}` : k);

const formatTime = (ms: number) => {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} мин ${s % 60} сек` : `${s} сек`;
};

const createProgressBar = (done: number, total: number, size = 20) => {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const filled = Math.round((pct / 100) * size);
  return `[${"■".repeat(filled)}${"□".repeat(size - filled)}] ${pct}%`;
};

/** ====== ТИПЫ ====== */
type Job = { name: string; advertId: number };

type UserQueue = {
  userId: number;
  ctx: CustomContext;

  names: Job[];
  results: (string | undefined)[];    // `${email} | ✅ ${domain}`
  domains: string[];

  domainIdx: number;                  // текущий раунд
  queues: number[][];                 // per-domain FIFO с индексами names
  domainInflight: number[];           // сколько задач в полёте на домене
  inflight: Set<number>;              // индексы names, сейчас в работе
  roundsFinalized: number[];          // сколько доменов «закрыто» по имени (без 429/timeout повторов)

  found: number;

  startTime: number;
  lastStatusAt: number;
  statusMsgId: number | null;
  isRunning: boolean;
  finalized: boolean;
  deadNotified?: boolean;
};

const userQueues = new Map<number, UserQueue>();

/** ====== ПРОГРЕСС ====== */
function computeTotals(q: UserQueue) {
  const R = q.domains.length;
  const domIndex = new Map(q.domains.map((d, i) => [d, i]));
  let total = 0;

  for (let i = 0; i < q.names.length; i++) {
    const r = q.results[i];
    if (!r) {
      total += R;
    } else {
      const email = r.split(" | ")[0] || "";
      const dom = email.slice(email.lastIndexOf("@") + 1);
      const j = domIndex.get(dom) ?? (R - 1);
      total += j + 1;
    }
  }

  const done = q.roundsFinalized.reduce((a, b) => a + Math.min(b, R), 0);
  const remain = Math.max(0, total - done);
  return { total, done, remain };
}

const getETAms = (q: UserQueue) => {
  const elapsed = nowMs() - q.startTime;
  const { done, remain } = computeTotals(q);
  const avgPerCheck = done > 0 ? elapsed / done : 0;
  return avgPerCheck * remain;
};

/** ====== КЛЮЧИ (глобальные, общий RPS и параллелизм) ====== */
class KeyWorker {
  key: string;
  id: string;
  rps: number;

  tokens = 0;
  lastRefill = 0;

  inflight = 0;

  disabled = false;
  coolUntil = 0;

  consec429 = 0;
  consecTimeout = 0;

  constructor(key: string, rps: number) {
    this.key = key;
    this.id = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
    this.rps = Math.max(1, rps);
    this.tokens = this.rps;
    this.lastRefill = nowMs();
  }

  refill(now = nowMs()) {
    if (this.disabled) return;
    const dt = now - this.lastRefill;
    if (dt <= 0) return;
    const add = Math.floor((dt / 1000) * this.rps);
    if (add > 0) {
      this.tokens = Math.min(this.rps, this.tokens + add);
      this.lastRefill = now;
    }
  }

  available(now = nowMs()): number {
    if (this.disabled) return 0;
    if (now < this.coolUntil) return 0;
    this.refill(now);
    const room = Math.max(0, KEY_MAX_CONCURRENCY - this.inflight);
    return Math.max(0, Math.min(this.tokens, room));
  }

  takeOne(now = nowMs()): boolean {
    if (this.available(now) <= 0) return false;
    this.tokens--;
    this.inflight++;
    return true;
  }

  release() {
    if (this.inflight > 0) this.inflight--;
  }



  markBadLocal(reason: string) {
    if (!this.disabled) {
      this.disabled = true;
      console.warn(`🧯 local disable ${this.id}: ${reason}`);
      // Вызываем disableKey только один раз при первом отключении
      disableKey(this.key, reason).catch((err) => {
        console.error(`Failed to disable key ${this.id} in DB:`, err);
      });
    } else {
      console.warn(`🔒 key ${this.id} already disabled locally`);
    }
  }

  cooldown429() {
    this.consec429++;
    this.coolUntil = Math.max(this.coolUntil, nowMs() + KEY_COOLDOWN_MS);
  }

  penalizeTimeout() {
    this.consecTimeout++;
    // таймауты тоже чуть остужаем, но короче
    const wait = Math.min(5000, 1000 + 250 * (this.consecTimeout - 1));
    this.coolUntil = Math.max(this.coolUntil, nowMs() + wait);
  }

  resetErrors() {
    this.consec429 = 0;
    this.consecTimeout = 0;
  }

  shouldHardDisableByCounters(): string | null {
    if (this.consec429 >= DISABLE_AFTER_429) return `TOO_MANY_429_${this.consec429}`;
    if (this.consecTimeout >= DISABLE_AFTER_TIMEOUT) return `TOO_MANY_TIMEOUTS_${this.consecTimeout}`;
    return null;
  }
}

class GlobalKeyFleet {
  keys: KeyWorker[] = [];
  rr = 0;
  lastReload = 0;
  reloading: Promise<void> | null = null;

  async init() {
    await mkdir(TOKEN_DIR, { recursive: true }).catch(() => {});
    await this.reload();
  }

  async reload() {
    if (this.reloading) return this.reloading;
    this.reloading = (async () => {
      const cfg = await getKeys();
      const enabled = cfg.keys.filter((k) => k.enabled !== false);
      const byKey = new Map(this.keys.map((k) => [k.key, k]));
      const next: KeyWorker[] = [];
      for (const { key, rps } of enabled) {
        const rate = rps ?? DEFAULT_RPS;
        const ex = byKey.get(key);
        if (ex) {
          ex.rps = Math.max(1, rate);
          next.push(ex);
          byKey.delete(key);
        } else {
          next.push(new KeyWorker(key, rate));
        }
      }
      this.keys = next;
      this.lastReload = nowMs();
    })();
    await this.reloading;
    this.reloading = null;
  }

  async maybeReload() {
    if (nowMs() - this.lastReload > 30_000) {
      await this.reload().catch(() => {});
    }
  }

  usableCount(): number {
    return this.keys.filter((k) => !k.disabled).length;
  }

  totalRps(): number {
    return this.keys.filter((k) => !k.disabled).reduce((s, w) => s + w.rps, 0);
  }
}

const FLEET = new GlobalKeyFleet();

/** ====== СТАТУС ====== */
const updateUserStatus = async (q: UserQueue) => {
  const now = nowMs();
  if (now - q.lastStatusAt < STATUS_UPDATE_EVERY_MS) return;
  q.lastStatusAt = now;

  const totalUsers = [...userQueues.values()].filter(u => u.isRunning).length || 1;
  const userIndex = [...userQueues.keys()].indexOf(q.userId) + 1;
  const { total, done } = computeTotals(q);

  const text =
    `🔄 Подбор почт по именам (раунды)\n\n${createProgressBar(done, total)}\n\n` +
    `📧 Найдено: ${q.found} / ${q.names.length}\n` +
    `⏳ ETA: ~ ${formatTime(getETAms(q))}\n\n` +
    `🔑 Активных ключей: ${FLEET.usableCount()} / ${FLEET.keys.length}\n` +
    `📌 Вы №${userIndex} из ${totalUsers}`;
  try {
    q.statusMsgId
      ? await q.ctx.api.editMessageText(q.ctx.chat!.id, q.statusMsgId, text)
      : (q.statusMsgId = (await q.ctx.reply(text)).message_id);
  } catch {}
};

const notifyAllKeysDead = async (q: UserQueue) => {
  if (q.deadNotified) return;
  q.deadNotified = true;
  await q.ctx
    .reply(`❌ Все API-ключи недоступны. Проверь токены/лимиты и запусти снова.`)
    .catch(() => {});
};

/** ====== ФИНАЛИЗАЦИЯ ====== */
const finalizeUser = async (q: UserQueue) => {
  const totalTime = nowMs() - q.startTime;

  const notFoundIds: number[] = [];
  for (let i = 0; i < q.names.length; i++) {
    if (!q.results[i]) notFoundIds.push(q.names[i]!.advertId);
  }
  if (notFoundIds.length) {
    await Promise.all(
      notFoundIds.map((id) => AdvertsRepo.setNotFound(id).catch(() => false))
    );
  }

  if (q.statusMsgId) {
    await q.ctx.api.deleteMessage(q.ctx.chat!.id, q.statusMsgId).catch(() => {});
  }
  await q.ctx
    .reply(
      `✅ Подбор завершён!\n\n📧 Найдено: ${q.found} / ${q.names.length}\n⏱ Время: ${formatTime(totalTime)}`
    )
    .catch(() => {});

  q.isRunning = false;
  userQueues.delete(q.userId);
};

/** ====== ПОДГОТОВКА ОЧЕРЕДЕЙ РАУНДА ====== */
function initRoundQueue(q: UserQueue, d: number) {
  const R = q.domains.length;
  if (d >= R) return;
  if (!q.queues[d]) {
    const arr: number[] = [];
    for (let i = 0; i < q.names.length; i++) {
      if (!q.results[i]) arr.push(i);
    }
    q.queues[d] = arr;
    q.domainInflight[d] = 0;
  }
}

function domainComplete(q: UserQueue, d: number): boolean {
  if (!q.queues[d]) return true;
  if (q.domainInflight[d] > 0) return false;
  // домен завершён, если очередь пуста (все либо найдены, либо получен финальный ответ)
  return q.queues[d]!.length === 0;
}

async function maybeAdvanceAndFinalize(q: UserQueue) {
  const R = q.domains.length;
  while (q.domainIdx < R && domainComplete(q, q.domainIdx)) {
    q.domainIdx++;
    if (q.domainIdx < R) initRoundQueue(q, q.domainIdx);
  }
  if (q.domainIdx >= R && q.inflight.size === 0 && !q.finalized) {
    q.finalized = true;
    await finalizeUser(q);
  }
}

/** ====== ВЫБОР КАНДИДАТА ИЗ ОЧЕРЕДИ РАУНДА ====== */
function perUserLimit(): number {
  const users = Math.max(1, [...userQueues.values()].filter(u => u.isRunning).length);
  const total = Math.max(1, FLEET.totalRps());
  const fair = Math.max(1, Math.floor(total / users));
  // чуть больше, чтобы скрыть сетевые задержки
  return Math.min(PER_USER_SOFT_CAP, fair * 2);
}

function popNextIndex(q: UserQueue): number | null {
  const d = q.domainIdx;
  if (d >= q.domains.length) return null;
  const queue = q.queues[d];
  if (!queue || queue.length === 0) return null;

  // ограничиваем общий inflight на пользователя
  if (q.inflight.size >= perUserLimit()) return null;

  // снимаем из головы очереди до тех пор, пока не найдём валидный индекс
  while (queue.length > 0) {
    const idx = queue.shift()!;
    if (q.results[idx]) continue;       // уже найдено на раннем домене
    if (q.inflight.has(idx)) continue;  // уже в работе
    return idx;
  }
  return null;
}

/** ====== ОДНА ПРОВЕРКА ====== */
async function checkEmailOnKey(
  w: KeyWorker,
  email: string
): Promise<{ valid: boolean; message: string; keyDisabled?: boolean }> {
  if (w.disabled) {
    return { valid: false, message: "KEY_DISABLED", keyDisabled: true };
  }

  try {
    const url = `https://happy.mailtester.ninja/ninja?email=${email}&key=${w.key}`;
    console.log(`📤 API REQUEST: ${url}`);
    
    const { data, status, headers } = await axios.get(url, { 
      family: 4, 
      timeout: AXIOS_TIMEOUT_MS 
    });
    
    console.log(`📥 API RESPONSE [${status}]:`, JSON.stringify({
      status,
      headers: headers,
      data: data
    }, null, 2));

    w.resetErrors();
    console.log(`✅ Check result: valid=${data.code === "ok"}, message="${data.message}"`);
    return { valid: data.code === "ok", message: data.message || "Нет данных" };
  } catch (e: any) {
    console.log(`💥 API ERROR:`, JSON.stringify({
      message: e?.message,
      status: e?.response?.status,
      statusText: e?.response?.statusText,
      data: e?.response?.data,
      code: e?.code
    }, null, 2));
    
    const s = e?.response?.status;
    if (s === 401 || s === 403) {
      console.log(`❌ AUTH_${s} - invalid key`);
      w.markBadLocal(`AUTH_${s}`);
      return { valid: false, message: `AUTH_${s}`, keyDisabled: true };
    }
    throw e;
  }
}

/** ====== БАТЧ-ПЛАНИРОВАНИЕ ПО КЛЮЧАМ ====== */
let schedulerStarted = false;
let USERS_RR = 0;

type Task = {
  q: UserQueue;
  idx: number;
  domainIdx: number;
  email: string;
};

function activeUsers(): UserQueue[] {
  return [...userQueues.values()].filter((q) => q.isRunning && q.domainIdx < q.domains.length);
}

function collectBatchForKey(k: KeyWorker): Task[] {
  const tasks: Task[] = [];
  const users = activeUsers();
  if (users.length === 0) return tasks;

  // подготовим очереди текущих доменов
  for (const q of users) initRoundQueue(q, q.domainIdx);

  let start = USERS_RR % users.length;
  let guard = users.length * 4; // на всякий случай не крутимся бесконечно

  while (k.available() > 0 && guard-- > 0) {
    let assigned = false;

    for (let pass = 0; pass < users.length; pass++) {
      const q = users[(start + pass) % users.length]!;
      const d = q.domainIdx;
      if (d >= q.domains.length) continue;

      // пока есть незавершённые задачи с этого домена — не перескакиваем на следующий
      if (q.domainInflight[d] > 0 && (!q.queues[d] || q.queues[d]!.length === 0)) continue;

      const idx = popNextIndex(q);
      if (idx == null) continue;

      if (!k.takeOne()) return tasks;

      const domain = q.domains[d]!;
      const { name } = q.names[idx]!;
      const email = `${name}@${domain}`;

      q.inflight.add(idx);
      q.domainInflight[d]++;

      tasks.push({ q, idx, domainIdx: d, email });
      assigned = true;

      if (k.available() <= 0) break;
    }

    if (!assigned) break;
    start = (start + 1) % users.length;
  }

  USERS_RR = (USERS_RR + 1) >>> 0;
  return tasks;
}

function launchBatch(k: KeyWorker, batch: Task[]) {
  const promises = batch.map(({ q, idx, domainIdx, email }) =>
    (async () => {
      try {
        const res = await checkEmailOnKey(k, email);

        if (res.keyDisabled) {
          const reason = (k.shouldHardDisableByCounters() ?? res.message) || "KEY_DISABLED";
          k.markBadLocal(reason); // markBadLocal уже вызовет disableKey
        }

        if (res.valid) {
          const ok = await AdvertsRepo.setReady(q.names[idx]!.advertId, email).catch(() => false);
          if (ok) {
            q.results[idx] = `${email} | ✅ ${q.domains[domainIdx]}`;
            q.found++;
          }
          // финализируем текущий домен по этому имени
          q.roundsFinalized[idx] = Math.min(q.roundsFinalized[idx] + 1, q.domains.length);
        } else {
          // невалид/не ок — финализируем домен (без ре-очереди)
          q.roundsFinalized[idx] = Math.min(q.roundsFinalized[idx] + 1, q.domains.length);
        }
      } catch (e: any) {
        const s = e?.response?.status;

        if (s === 429) {
          // глобальный key-cooldown и REQUEUE В ХВОСТ текущего домена
          k.cooldown429();
          q.queues[domainIdx]!.push(idx); // вернуть в хвост
          // НЕ увеличиваем roundsFinalized: домен для этого имени ещё не завершён
          console.log(`⏱ 429 (${k.id}) cooldown ${KEY_COOLDOWN_MS}ms → ${email}`);
        } else {
          const isTimeout =
            e?.code === "ECONNABORTED" ||
            e?.message?.toLowerCase?.().includes("timeout") ||
            (!e?.response && e?.request);

          if (isTimeout) {
            // лёгкий cooldown и тоже REQUEUE В ХВОСТ домена
            k.penalizeTimeout();
            q.queues[domainIdx]!.push(idx);
            console.log(`⏱ timeout (${k.id}) → requeue → ${email}`);
          } else {
            // прочая HTTP-ошибка — считаем попытку финальной для домена
            q.roundsFinalized[idx] = Math.min(q.roundsFinalized[idx] + 1, q.domains.length);
            console.log(`⚠️ http ${s ?? "?"} (${k.id}) → ${email}`);
          }
        }
      } finally {
        k.release();
        q.inflight.delete(idx);
        q.domainInflight[domainIdx] = Math.max(0, q.domainInflight[domainIdx] - 1);

        await updateUserStatus(q);
        if (FLEET.usableCount() === 0) await notifyAllKeysDead(q);

        await maybeAdvanceAndFinalize(q);
      }
    })()
  );

  // фоном
  Promise.allSettled(promises).catch(() => {});
}

function startSchedulerLoop() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const loop = async () => {
    try {
      await FLEET.maybeReload();

      // продвинем раунды, если где-то всё уже завершено
      for (const q of activeUsers()) {
        await maybeAdvanceAndFinalize(q);
      }

      for (const k of FLEET.keys) {
        const cap = k.available();
        if (cap <= 0) continue;

        const batch = collectBatchForKey(k);
        if (batch.length > 0) {
          launchBatch(k, batch);
        }
      }
    } catch (e) {
      console.error("Scheduler tick error:", e);
    } finally {
      setTimeout(loop, SCHED_TICK_MS);
    }
  };

  loop();
}

/** ====== ПУБЛИЧНОЕ API ====== */
export const isUserProcessing = (userId: number): boolean => {
  const q = userQueues.get(userId);
  return !!(q && q.isRunning);
};

export const startCheckFromDb = async (ctx: CustomContext, limit = 200) => {
  const userId = ctx.from!.id;

  if (!FLEET.keys.length) {
    await FLEET.init().catch(() => {});
  }
  
  // Проверяем наличие активных ключей
  const { KeysRepo } = await import("./db/queries");
  const hasKeys = await KeysRepo.hasActiveKeys();
  
  if (!hasKeys) {
    await ctx.reply(
      "❌ <b>Ключи отсутствуют</b>\n\n" +
      "Для работы парсера необходимо добавить API ключи.\n" +
      "Обратитесь к администратору для настройки ключей.",
      { parse_mode: "HTML" }
    ).catch(() => {});
    return;
  }
  
  startSchedulerLoop();

  if (isUserProcessing(userId)) {
    await ctx
      .reply("⏳ У вас уже идёт подбор. Новый запуск невозможен до завершения текущего.")
      .catch(() => {});
    return;
  }

  const pending = await AdvertsRepo.listPendingByTelegramId(userId, limit);
  if (!pending.length) {
    await ctx.reply("😐 Нет объявлений со статусом 0 для проверки.").catch(() => {});
    return;
  }

  const domains = (await getDomains(userId)).map((s) => s.trim()).filter(Boolean);

  const q: UserQueue = {
    userId,
    ctx,
    names: pending.map((p) => ({ name: p.personDotName, advertId: p.id })),
    results: Array(pending.length),
    domains,

    domainIdx: 0,
    queues: [],
    domainInflight: Array(domains.length).fill(0),
    inflight: new Set<number>(),
    roundsFinalized: Array(pending.length).fill(0),

    found: 0,

    startTime: nowMs(),
    lastStatusAt: 0,
    statusMsgId: null,
    isRunning: true,
    finalized: false,
  };
  userQueues.set(userId, q);

  // инициализируем очередь первого домена
  initRoundQueue(q, 0);

  await updateUserStatus(q);
};
