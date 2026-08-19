/**
 * DOXACHKAA UC
 * ЭТАП 1 — ОСНОВА
 *
 * Cloudflare Workers + Telegram Bot API + D1
 *
 * Cloudflare:
 *   Secret: BOT_TOKEN
 *   D1 Binding: DB
 */

const RANKS = {
  0: "Игрок",
  1: "Администратор 1",
  2: "Администратор 2",
  3: "Следящий администратор",
  4: "Куратор",
  5: "Заместитель Главного Администратора",
  6: "Главный Администратор",
};

const MODERATOR_ROLE = "moderator";

export default {
  async fetch(request, env) {
    try {
      // Проверка Worker через браузер
      if (request.method !== "POST") {
        return new Response("DOXACHKAA UC Worker OK", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        });
      }

      const update = await request.json();

      // Обычные сообщения Telegram
      if (update.message) {
        await handleMessage(update.message, env);
      }

      // Нажатия inline-кнопок
      if (update.callback_query) {
        await handleCallback(update.callback_query, env);
      }

      return new Response("OK", {
        status: 200,
      });
    } catch (error) {
      console.error("Worker error:", error);

      return new Response("Internal error", {
        status: 500,
      });
    }
  },
};

/* =========================================================
   TELEGRAM API
========================================================= */

async function telegram(method, data, env) {
  if (!env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not configured");
  }

  const url =
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!result.ok) {
    console.error("Telegram API error:", result);
  }

  return result;
}

async function sendMessage(chatId, text, env, options = {}) {
  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...options,
    },
    env
  );
}

/* =========================================================
   MESSAGE HANDLER
========================================================= */

async function handleMessage(message, env) {
  if (!message || !message.from) {
    return;
  }

  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  const user = await getOrCreateUser(message.from, env);

  if (text === "/start") {
    await commandStart(chatId, user, env);
    return;
  }

  if (text === "/me") {
    await commandMe(chatId, user, env);
    return;
  }

  await sendMessage(
    chatId,
    [
      "❓ <b>Неизвестная команда</b>",
      "",
      "Используйте:",
      "/start — начать",
      "/me — мой профиль",
    ].join("\n"),
    env
  );
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallback(callback, env) {
  if (!callback || !callback.from || !callback.message) {
    return;
  }

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callback.id,
    },
    env
  );

  // Кнопки будут добавлены на следующих этапах.
}

/* =========================================================
   DATABASE — USERS
========================================================= */

async function getUser(telegramId, env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }

  return env.DB
    .prepare(
      `
      SELECT *
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
      `
    )
    .bind(String(telegramId))
    .first();
}

async function getOrCreateUser(from, env) {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }

  const telegramId = String(from.id);

  let user = await getUser(telegramId, env);

  // Пользователь уже существует
  if (user) {
    await env.DB
      .prepare(
        `
        UPDATE users
        SET
          username = ?,
          first_name = ?,
          last_name = ?,
          updated_at = ?
        WHERE telegram_id = ?
        `
      )
      .bind(
        from.username || null,
        from.first_name || null,
        from.last_name || null,
        now(),
        telegramId
      )
      .run();

    return await getUser(telegramId, env);
  }

  // Новый пользователь
  await env.DB
    .prepare(
      `
      INSERT INTO users (
        telegram_id,
        username,
        first_name,
        last_name,
        role,
        rank,
        balance,
        uc,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      telegramId,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      "player",
      0,
      0,
      0,
      now(),
      now()
    )
    .run();

  return await getUser(telegramId, env);
}

/* =========================================================
   /START
========================================================= */

async function commandStart(chatId, user, env) {
  const name =
    user.first_name ||
    user.username ||
    "Игрок";

  const text = [
    `👋 Привет, <b>${escapeHtml(name)}</b>!`,
    "",
    "🎰 Добро пожаловать в <b>DOXACHKAA UC</b>.",
    "",
    `👤 Роль: <b>${escapeHtml(getRoleName(user))}</b>`,
    `⭐ Ранг: <b>${Number(user.rank)}</b>`,
    "",
    "Используйте /me для просмотра своего профиля.",
  ].join("\n");

  await sendMessage(chatId, text, env);
}

/* =========================================================
   /ME
========================================================= */

async function commandMe(chatId, user, env) {
  const text = [
    "👤 <b>Ваш профиль</b>",
    "",
    `🆔 Telegram ID: <code>${escapeHtml(user.telegram_id)}</code>`,
    `👤 Роль: <b>${escapeHtml(getRoleName(user))}</b>`,
    `⭐ Ранг: <b>${Number(user.rank)}</b>`,
    `💰 Баланс: <b>${formatMoney(user.balance)} ₽</b>`,
    `💎 UC: <b>${Number(user.uc || 0)}</b>`,
  ].join("\n");

  await sendMessage(chatId, text, env);
}

/* =========================================================
   ROLES
========================================================= */

function getRoleName(user) {
  if (user.role === MODERATOR_ROLE) {
    return "Модератор";
  }

  return RANKS[Number(user.rank)] || "Игрок";
}

function isAdmin(user) {
  return (
    user &&
    user.role === "admin" &&
    Number(user.rank) >= 1
  );
}

function isModerator(user) {
  return (
    user &&
    user.role === MODERATOR_ROLE
  );
}

function isAdminOrModerator(user) {
  return isAdmin(user) || isModerator(user);
}

function isRankAtLeast(user, rank) {
  return (
    isAdmin(user) &&
    Number(user.rank) >= Number(rank)
  );
}

function isRankBetween(user, min, max) {
  if (!isAdmin(user)) {
    return false;
  }

  const rank = Number(user.rank);

  return (
    rank >= Number(min) &&
    rank <= Number(max)
  );
}

/* =========================================================
   TIME
========================================================= */

function now() {
  return new Date().toISOString();
}

function moscowTime() {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
}

/* =========================================================
   MONEY
========================================================= */

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

/* =========================================================
   HTML SECURITY
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
