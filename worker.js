/**
 * DOXACHKAA UC
 * ЭТАП 2 — АВТОРИЗАЦИЯ АДМИНИСТРАТОРОВ
 *
 * Cloudflare Workers + Telegram Bot API + D1
 *
 * Secret:
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
const ADMIN_ROLE = "admin";

const LOGIN_MIN_LENGTH = 4;
const LOGIN_MAX_LENGTH = 32;

const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 32;

export default {
  async fetch(request, env) {
    try {
      if (request.method !== "POST") {
        return new Response("DOXACHKAA UC Worker OK", {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
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

  if (text === "/alogin") {
    await startAdminLogin(chatId, user, env);
    return;
  }

  if (text === "/hlogin") {
    await startModeratorLogin(chatId, user, env);
    return;
  }

  if (await handlePanelInput(message, user, env)) {
    return;
  }

  if (text === "/alogout") {
    await logoutPanel(chatId, user, env);
    return;
  }

  if (text === "/start") {
    await commandStart(chatId, user, env);
    return;
  }

  if (text === "/me") {
    await commandMe(chatId, user, env);
    return;
  }

  if (text === "/panel") {
    if (await isPanelLoggedIn(user, env)) {
      await showAdminPanel(chatId, user, env);
      return;
    }

    await sendMessage(
      chatId,
      "⛔ Вы не авторизованы в панели.\n\nИспользуйте /alogin.",
      env
    );

    return;
  }

  await sendMessage(
    chatId,
    [
      "❓ <b>Неизвестная команда</b>",
      "",
      "Доступные команды:",
      "/start",
      "/me",
      "/alogin",
    ].join("\n"),
    env
  );
}

/* =========================================================
   LOGIN
========================================================= */

async function startAdminLogin(chatId, user, env) {
  if (!isAdmin(user)) {
    await sendMessage(
      chatId,
      "⛔ <b>Доступ запрещён.</b>\n\nУ вас нет доступа к админ-панели.",
      env
    );

    return;
  }

  await setPanelState(
    user.telegram_id,
    "login",
    env
  );

  await savePanelTempLogin(
    user.telegram_id,
    null,
    env
  );

  await sendMessage(
    chatId,
    [
      "🔐 <b>Вход в админ-панель</b>",
      "",
      "Введите ваш логин.",
      "",
      "Логин должен содержать только латинские буквы и цифры.",
    ].join("\n"),
    env
  );
}

async function startModeratorLogin(chatId, user, env) {
  if (!isModerator(user)) {
    await sendMessage(
      chatId,
      "⛔ <b>Доступ запрещён.</b>\n\nУ вас нет доступа к панели модератора.",
      env
    );

    return;
  }

  await setPanelState(
    user.telegram_id,
    "moderator_login",
    env
  );

  await sendMessage(
    chatId,
    [
      "🛡️ <b>Вход в панель модератора</b>",
      "",
      "Введите логин.",
    ].join("\n"),
    env
  );
}

/* =========================================================
   PANEL INPUT
========================================================= */

async function handlePanelInput(message, user, env) {
  if (!message.text) {
    return false;
  }

  const state = await getPanelState(
    user.telegram_id,
    env
  );

  if (!state) {
    return false;
  }

  const text = message.text.trim();

  if (state === "login") {
    if (!isValidLogin(text)) {
      await sendMessage(
        message.chat.id,
        [
          "❌ <b>Неверный формат логина.</b>",
          "",
          "Используйте только латинские буквы и цифры.",
          `Длина: ${LOGIN_MIN_LENGTH}-${LOGIN_MAX_LENGTH} символов.`,
        ].join("\n"),
        env
      );

      return true;
    }

    await savePanelTempLogin(
      user.telegram_id,
      text,
      env
    );

    await setPanelState(
      user.telegram_id,
      "password",
      env
    );

    await sendMessage(
      message.chat.id,
      [
        "🔒 <b>Введите пароль</b>",
        "",
        "Пароль должен содержать только цифры.",
      ].join("\n"),
      env
    );

    return true;
  }

  if (state === "password") {
    if (!isValidPassword(text)) {
      await sendMessage(
        message.chat.id,
        [
          "❌ <b>Неверный формат пароля.</b>",
          "",
          "Используйте только цифры.",
          `Длина: ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} цифр.`,
        ].join("\n"),
        env
      );

      return true;
    }

    const login = await getPanelTempLogin(
      user.telegram_id,
      env
    );

    if (!login) {
      await clearPanelState(
        user.telegram_id,
        env
      );

      await sendMessage(
        message.chat.id,
        "❌ Сессия входа устарела. Введите /alogin ещё раз.",
        env
      );

      return true;
    }

    const passwordHash = await hashPassword(text);

    const employee = await env.DB
      .prepare(
        `
        SELECT *
        FROM users
        WHERE admin_login = ?
        LIMIT 1
        `
      )
      .bind(login)
      .first();

    if (
      !employee ||
      employee.role !== ADMIN_ROLE ||
      employee.admin_password_hash !== passwordHash
    ) {
      await clearPanelState(
        user.telegram_id,
        env
      );

      await savePanelTempLogin(
        user.telegram_id,
        null,
        env
      );

      await sendMessage(
        message.chat.id,
        "❌ <b>Неверный логин или пароль.</b>",
        env
      );

      return true;
    }

    if (
      String(employee.telegram_id) !==
      String(user.telegram_id)
    ) {
      await clearPanelState(
        user.telegram_id,
        env
      );

      await savePanelTempLogin(
        user.telegram_id,
        null,
        env
      );

      await sendMessage(
        message.chat.id,
        "⛔ Этот логин привязан к другому Telegram-аккаунту.",
        env
      );

      return true;
    }

    await env.DB
      .prepare(
        `
        UPDATE users
        SET
          panel_session = 1,
          panel_status = 'online',
          last_login_at = ?,
          panel_last_activity = ?,
          updated_at = ?
        WHERE telegram_id = ?
        `
      )
      .bind(
        now(),
        now(),
        now(),
        user.telegram_id
      )
      .run();

    await clearPanelState(
      user.telegram_id,
      env
    );

    await savePanelTempLogin(
      user.telegram_id,
      null,
      env
    );

    const freshUser = await getUser(
      user.telegram_id,
      env
    );

    await showAdminPanel(
      message.chat.id,
      freshUser,
      env
    );

    return true;
  }

  if (state === "moderator_login") {
    await sendMessage(
      message.chat.id,
      "🛡️ Авторизация модераторов будет подключена следующим этапом.",
      env
    );

    await clearPanelState(
      user.telegram_id,
      env
    );

    return true;
  }

  return false;
}

/* =========================================================
   ADMIN PANEL
========================================================= */

async function showAdminPanel(chatId, user, env) {
  await updatePanelActivity(
    user.telegram_id,
    env
  );

  const buttons = [
    [
      {
        text: "👥 Управление сотрудниками",
        callback_data: "employees",
      },
    ],
    [
      {
        text: "📊 Таблица активности",
        callback_data: "activity",
      },
    ],
    [
      {
        text: "🔎 Поиск игрока",
        callback_data: "search_player",
      },
    ],
    [
      {
        text: "💰 Заявки на пополнение",
        callback_data: "payments",
      },
    ],
    [
      {
        text: "💎 Управление UC",
        callback_data: "uc",
      },
    ],
    [
      {
        text: "🛠️ Технические работы",
        callback_data: "maintenance",
      },
    ],
    [
      {
        text: "🚪 Выйти из панели",
        callback_data: "logout",
      },
    ],
  ];

  await sendMessage(
    chatId,
    [
      "🔐 <b>Админ-панель DOXACHKAA UC</b>",
      "",
      `👤 ${escapeHtml(
        user.first_name ||
        user.username ||
        "Сотрудник"
      )}`,
      `⭐ Ранг: <b>${Number(user.rank)}</b> — ${escapeHtml(
        getRoleName(user)
      )}`,
      "🟢 Статус: <b>Онлайн</b>",
      `🕐 МСК: <b>${escapeHtml(
        moscowTime()
      )}</b>`,
      "",
      "Выберите раздел:",
    ].join("\n"),
    env,
    {
      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  );
}

/* =========================================================
   CALLBACK HANDLER
========================================================= */

async function handleCallback(callback, env) {
  if (!callback || !callback.from) {
    return;
  }

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callback.id,
    },
    env
  );

  const telegramId = String(
    callback.from.id
  );

  const user = await getUser(
    telegramId,
    env
  );

  if (!user) {
    return;
  }

  const data = callback.data || "";

  if (!await isPanelLoggedIn(user, env)) {
    await sendMessage(
      callback.message.chat.id,
      "⛔ Сессия панели закончилась.\n\nВведите /alogin.",
      env
    );

    return;
  }

  await updatePanelActivity(
    user.telegram_id,
    env
  );

  if (data === "logout") {
    await logoutPanel(
      callback.message.chat.id,
      user,
      env
    );

    return;
  }

  if (data === "employees") {
    await showEmployeesMenu(
      callback.message.chat.id,
      user,
      env
    );

    return;
  }

  if (data === "create_employee") {
    await startCreateEmployee(
      callback.message.chat.id,
      user,
      env
    );

    return;
  }

  if (data === "activity") {
    await showActivity(
      callback.message.chat.id,
      user,
      env
    );

    return;
  }

  if (data === "back_panel") {
    await showAdminPanel(
      callback.message.chat.id,
      user,
      env
    );

    return;
  }

  if (
    data === "search_player" ||
    data === "payments" ||
    data === "uc" ||
    data === "maintenance"
  ) {
    await sendMessage(
      callback.message.chat.id,
      "🛠️ Этот раздел будет добавлен следующим этапом.",
      env
    );

    return;
  }
}

/* =========================================================
   EMPLOYEES
========================================================= */

async function showEmployeesMenu(chatId, user, env) {
  if (!canManageEmployees(user)) {
    await sendMessage(
      chatId,
      "⛔ У вас нет доступа к управлению сотрудниками.",
      env
    );

    return;
  }

  await sendMessage(
    chatId,
    [
      "👥 <b>Управление сотрудниками</b>",
      "",
      `Ваш ранг: <b>${Number(user.rank)}</b>`,
      "",
      Number(user.rank) === 6
        ? "✅ Вы можете создавать сотрудников рангов 0–6."
        : "✅ Вы можете создавать сотрудников рангов 0–5.",
      "",
      "Выберите действие:",
    ].join("\n"),
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "➕ Создать сотрудника",
              callback_data: "create_employee",
            },
          ],
          [
            {
              text: "📋 Список сотрудников",
              callback_data: "employee_list",
            },
          ],
          [
            {
              text: "⬅️ Назад",
              callback_data: "back_panel",
            },
          ],
        ],
      },
    }
  );
}

async function startCreateEmployee(chatId, user, env) {
  if (!canManageEmployees(user)) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён.",
      env
    );

    return;
  }

  await setPanelState(
    user.telegram_id,
    "create_type",
    env
  );

  await sendMessage(
    chatId,
    [
      "➕ <b>Создание сотрудника</b>",
      "",
      "Выберите тип:",
      "",
      "Напишите:",
      "<code>admin</code> — администратор",
      "<code>moderator</code> — модератор",
    ].join("\n"),
    env
  );
}

/* =========================================================
   ACTIVITY
========================================================= */

async function showActivity(chatId, user, env) {
  const employees = await env.DB
    .prepare(
      `
      SELECT
        telegram_id,
        username,
        first_name,
        last_name,
        role,
        rank,
        panel_status,
        panel_last_activity,
        last_login_at
      FROM users
      WHERE role = 'admin'
         OR role = 'moderator'
      ORDER BY rank DESC
      `
    )
    .all();

  const rows = employees.results || [];

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "📊 Сотрудников пока нет.",
      env
    );

    return;
  }

  const lines = [
    "📊 <b>Таблица активности</b>",
    "",
  ];

  for (const employee of rows) {
    lines.push(
      `${getStatusEmoji(
        employee.panel_status
      )} <b>${escapeHtml(
        employee.first_name ||
        employee.username ||
        "Сотрудник"
      )}</b>`,
      `⭐ Ранг: ${Number(employee.rank)}`,
      `📌 Статус: ${escapeHtml(
        getStatusName(
          employee.panel_status
        )
      )}`,
      `🕐 Последняя активность: ${escapeHtml(
        employee.panel_last_activity ||
        "—"
      )}`,
      ""
    );
  }

  await sendMessage(
    chatId,
    lines.join("\n"),
    env
  );
          }
/* =========================================================
   USER / DATABASE
========================================================= */

async function getUser(telegramId, env) {
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
  const telegramId = String(from.id);

  let user = await getUser(
    telegramId,
    env
  );

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

    return await getUser(
      telegramId,
      env
    );
  }

  /*
    Если старые колонки для панели уже существуют,
    создаём обычного пользователя.
  */

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

  return await getUser(
    telegramId,
    env
  );
}

/* =========================================================
   START
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
      `👤 Роль: <b>${escapeHtml(
        getRoleName(user)
      )}</b>`,
      `⭐ Ранг: <b>${Number(user.rank)}</b>`,
      "",
      "Используйте /me для просмотра своего профиля.",
    ].join("\n"),
    env
  );
}

/* =========================================================
   ME
========================================================= */

async function commandMe(chatId, user, env) {
  await sendMessage(
    chatId,
    [
      "👤 <b>Ваш профиль</b>",
      "",
      `🆔 Telegram ID: <code>${escapeHtml(
        user.telegram_id
      )}</code>`,
      `👤 Роль: <b>${escapeHtml(
        getRoleName(user)
      )}</b>`,
      `⭐ Ранг: <b>${Number(user.rank)}</b>`,
      `💰 Баланс: <b>${formatMoney(
        user.balance
      )} ₽</b>`,
      `💎 UC: <b>${Number(
        user.uc || 0
      )}</b>`,
    ].join("\n"),
    env
  );
}

/* =========================================================
   LOGOUT
========================================================= */

async function logoutPanel(chatId, user, env) {
  await env.DB
    .prepare(
      `
      UPDATE users
      SET
        panel_session = 0,
        panel_status = 'offline',
        panel_last_activity = ?,
        updated_at = ?
      WHERE telegram_id = ?
      `
    )
    .bind(
      now(),
      now(),
      user.telegram_id
    )
    .run();

  await clearPanelState(
    user.telegram_id,
    env
  );

  await savePanelTempLogin(
    user.telegram_id,
    null,
    env
  );

  await sendMessage(
    chatId,
    [
      "🚪 <b>Вы вышли из панели.</b>",
      "",
      "Для повторного входа используйте /alogin.",
    ].join("\n"),
    env
  );
}

/* =========================================================
   PANEL SESSION
========================================================= */

async function isPanelLoggedIn(user, env) {
  const freshUser = await getUser(
    user.telegram_id,
    env
  );

  if (!freshUser) {
    return false;
  }

  return (
    Number(freshUser.panel_session || 0) === 1
  );
}

async function updatePanelActivity(
  telegramId,
  env
) {
  await env.DB
    .prepare(
      `
      UPDATE users
      SET
        panel_status = 'online',
        panel_last_activity = ?,
        updated_at = ?
      WHERE telegram_id = ?
        AND panel_session = 1
      `
    )
    .bind(
      now(),
      now(),
      telegramId
    )
    .run();
}

/* =========================================================
   PANEL STATE
========================================================= */

async function getPanelState(
  telegramId,
  env
) {
  const user = await getUser(
    telegramId,
    env
  );

  if (!user) {
    return null;
  }

  return user.panel_temp_state || null;
}

async function setPanelState(
  telegramId,
  state,
  env
) {
  await env.DB
    .prepare(
      `
      UPDATE users
      SET
        panel_temp_state = ?,
        updated_at = ?
      WHERE telegram_id = ?
      `
    )
    .bind(
      state,
      now(),
      telegramId
    )
    .run();
}

async function clearPanelState(
  telegramId,
  env
) {
  await setPanelState(
    telegramId,
    null,
    env
  );
}

async function savePanelTempLogin(
  telegramId,
  login,
  env
) {
  await env.DB
    .prepare(
      `
      UPDATE users
      SET
        admin_login_temp = ?,
        updated_at = ?
      WHERE telegram_id = ?
      `
    )
    .bind(
      login,
      now(),
      telegramId
    )
    .run();
}

async function getPanelTempLogin(
  telegramId,
  env
) {
  const user = await getUser(
    telegramId,
    env
  );

  if (!user) {
    return null;
  }

  return user.admin_login_temp || null;
}

/* =========================================================
   ROLES
========================================================= */

function getRoleName(user) {
  if (user.role === MODERATOR_ROLE) {
    return "Модератор";
  }

  return (
    RANKS[Number(user.rank)] ||
    "Игрок"
  );
}

function isAdmin(user) {
  return (
    user.role === ADMIN_ROLE &&
    Number(user.rank) >= 1
  );
}

function isModerator(user) {
  return (
    user.role === MODERATOR_ROLE
  );
}

function isAdminOrModerator(user) {
  return (
    isAdmin(user) ||
    isModerator(user)
  );
}

function isRankAtLeast(user, rank) {
  return (
    isAdmin(user) &&
    Number(user.rank) >= rank
  );
}

function isRankBetween(
  user,
  min,
  max
) {
  if (!isAdmin(user)) {
    return false;
  }

  const rank = Number(user.rank);

  return (
    rank >= min &&
    rank <= max
  );
}

function canManageEmployees(user) {
  /*
    Ранг 6 имеет полный доступ
    к управлению сотрудниками.

    Ранг 5 может управлять сотрудниками,
    но не должен получать возможность
    менять самого Главного Администратора.
  */

  return (
    isAdmin(user) &&
    Number(user.rank) >= 5
  );
}

/* =========================================================
   LOGIN VALIDATION
========================================================= */

function isValidLogin(login) {
  if (
    typeof login !== "string"
  ) {
    return false;
  }

  if (
    login.length < LOGIN_MIN_LENGTH ||
    login.length > LOGIN_MAX_LENGTH
  ) {
    return false;
  }

  return /^[A-Za-z0-9]+$/.test(login);
}

function isValidPassword(password) {
  if (
    typeof password !== "string"
  ) {
    return false;
  }

  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return false;
  }

  return /^[0-9]+$/.test(password);
}

/* =========================================================
   PASSWORD HASH
========================================================= */

async function hashPassword(password) {
  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(password);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(new Uint8Array(hash))
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

/* =========================================================
   ACTIVITY STATUS
========================================================= */

function getStatusName(status) {
  switch (status) {
    case "online":
      return "Онлайн";

    case "away":
      return "Отошёл";

    case "inactive":
      return "Неактивен";

    case "offline":
    default:
      return "Оффлайн";
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case "online":
      return "🟢";

    case "away":
      return "🟡";

    case "inactive":
      return "🟠";

    case "offline":
    default:
      return "⚫";
  }
}

/* =========================================================
   TIME
========================================================= */

function now() {
  return new Date().toISOString();
}

function moscowTime() {
  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      timeZone: "Europe/Moscow",
      dateStyle: "short",
      timeStyle: "medium",
    }
  ).format(new Date());
}

/* =========================================================
   MONEY
========================================================= */

function formatMoney(value) {
  return Number(
    value || 0
  ).toFixed(2);
}

/* =========================================================
   HTML SECURITY
========================================================= */

function escapeHtml(value) {
  return String(
    value || ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}
