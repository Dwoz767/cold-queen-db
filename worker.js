/**
 * DOXACHKAA UC
 * ЭТАП 1 — ОСНОВА
 *
 * Cloudflare Workers + Telegram Bot API + D1
 *
 * Секрет:
 *   BOT_TOKEN
 *
 * D1 binding:
 *   DB
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
      if (request.method !== "POST") {
        return new Response("DOXACHKAA UC Worker OK", {
          status: 200,
        });
      }

      const update = await request.json();

      if (update.message) {
        await handleMessage(update.message, env);
      }

      if (update.callback_query) {
        await handleCallback(update.callback_query, env);
      }

      return new Response("OK");
    } catch (error) {
      console.error("Worker error:", error);

      return new Response("Internal error", {
        status: 500,
      });
    }
  },
};

/* =========================================================
   TELEGRAM
========================================================= */

async function telegram(method, data, env) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  return response.json();
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
  if (!message.from) return;

  const telegramId = String(message.from.id);
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

  // Следующие команды будут добавлены на следующих этапах.
  await sendMessage(
    chatId,
    "❓ Неизвестная команда.\n\nИспользуйте /start или /me.",
    env
  );
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallback(callback, env) {
  if (!callback.from || !callback.message) return;

  const telegramId = String(callback.from.id);
  const data = callback.data || "";

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callback.id,
    },
    env
  );

  const user = await getUser(telegramId, env);

  if (!user) return;

  // Здесь позже будут кнопки админ-панели,
  // модераторской панели и управления системой.

  if (data === "noop") {
    return;
  }
}

/* =========================================================
   USERS
========================================================= */

async function getUser(telegramId, env) {
  return env.DB.prepare(
    `
    SELECT *
    FROM users
    WHERE telegram_id = ?
    LIMIT 1
    `
  )
    .bind(telegramId)
    .first();
}

async function getOrCreateUser(from, env) {
  const telegramId = String(from.id);

  let user = await getUser(telegramId, env);

  if (user) {
    await env.DB.prepare(
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

    return {
      ...user,
      username: from.username || null,
      first_name: from.first_name || null,
      last_name: from.last_name || null,
    };
  }

  await env.DB.prepare(
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

  user = await getUser(telegramId, env);

  return user;
}

/* =========================================================
   /START
========================================================= */

async function commandStart(chatId, user, env) {
  const name =
    user.first_name ||
    user.username ||
    "Игрок";

  await sendMessage(
    chatId,
    [
      `👋 Привет, <b>${escapeHtml(name)}</b>!`,
      "",
      "🎰 Добро пожаловать в <b>DOXACHKAA UC</b>.",
      "",
      `👤 Роль: <b>${getRoleName(user)}</b>`,
      `⭐ Ранг: <b>${user.rank}</b>`,
      "",
      "Используйте /me для просмотра своего профиля.",
    ].join("\n"),
    env
  );
}

/* =========================================================
   /ME
========================================================= */

async function commandMe(chatId, user, env) {
  await sendMessage(
    chatId,
    [
      "👤 <b>Ваш профиль</b>",
      "",
      `🆔 Telegram ID: <code>${user.telegram_id}</code>`,
      `👤 Роль: <b>${getRoleName(user)}</b>`,
      `⭐ Ранг: <b>${user.rank}</b>`,
      `💰 Баланс: <b>${formatMoney(user.balance)} ₽</b>`,
      `💎 UC: <b>${Number(user.uc || 0)}</b>`,
    ].join("\n"),
    env
  );
}

/* =========================================================
   ROLES / PERMISSIONS
========================================================= */

function getRoleName(user) {
  if (user.role === MODERATOR_ROLE) {
    return "Модератор";
  }

  return RANKS[user.rank] || "Игрок";
}

function isAdmin(user) {
  return user.role === "admin" && Number(user.rank) >= 1;
}

function isModerator(user) {
  return user.role === MODERATOR_ROLE;
}

function isAdminOrModerator(user) {
  return isAdmin(user) || isModerator(user);
}

function isRankAtLeast(user, rank) {
  return isAdmin(user) && Number(user.rank) >= rank;
}

function isRankBetween(user, min, max) {
  if (!isAdmin(user)) return false;

  const rank = Number(user.rank);

  return rank >= min && rank <= max;
}

/*
  Будущая система прав:

  6 — полный доступ
  5 — почти полный доступ, но без управления 6
  4 — права куратора
  3 — права 3 ранга
  2 — права 2 ранга
  1 — права 1 ранга
  moderator — отдельные права модератора
*/

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
   SECURITY / HTML
========================================================= */

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
    }
