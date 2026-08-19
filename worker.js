/**
 * DOXACHKAA UC
 * ЭТАП 3 — АДМИН-ПАНЕЛЬ
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

const ADMIN_ROLE = "admin";
const MODERATOR_ROLE = "moderator";

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

      console.log("TELEGRAM UPDATE:", JSON.stringify(update));

      if (update.message) {
        await handleMessage(update.message, env);
      }

      if (update.callback_query) {
        await handleCallback(update.callback_query, env);
      }

      return new Response("OK");
    } catch (error) {
      console.error("WORKER ERROR:", error);

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

  console.log("TELEGRAM API:", method, result);

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

  console.log("TELEGRAM MESSAGE:", {
    chatId,
    telegramId: message.from.id,
    text,
  });

  const user = await getOrCreateUser(
    message.from,
    env
  );

  console.log("USER:", {
    telegramId: user.telegram_id,
    role: user.role,
    rank: user.rank,
    admin_login: user.admin_login,
  });

  /*
   * Первичная установка пароля для Главного Администратора.
   */
  if (text === "/setadminpassword") {
    await startSetAdminPassword(
      chatId,
      user,
      env
    );
    return;
  }

  /*
   * Вход в админ-панель.
   */
  if (text === "/alogin") {
    await startAdminLogin(
      chatId,
      user,
      env
    );
    return;
  }

  /*
   * Выход.
   */
  if (text === "/alogout") {
    await logoutPanel(
      chatId,
      user,
      env
    );
    return;
  }

  /*
   * Панель.
   */
  if (text === "/panel") {
    if (await isPanelLoggedIn(user, env)) {
      await showAdminPanel(
        chatId,
        user,
        env
      );
    } else {
      await sendMessage(
        chatId,
        "⛔ Вы не авторизованы.\n\nИспользуйте /alogin.",
        env
      );
    }

    return;
  }

  /*
   * Сначала обрабатываем временное состояние.
   */
  if (
    await handlePanelInput(
      message,
      user,
      env
    )
  ) {
    return;
  }

  if (text === "/start") {
    await commandStart(
      chatId,
      user,
      env
    );
    return;
  }

  if (text === "/me") {
    await commandMe(
      chatId,
      user,
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
      "/panel",
      "/alogout",
    ].join("\n"),
    env
  );
}

/* =========================================================
   ADMIN LOGIN
========================================================= */

async function startAdminLogin(
  chatId,
  user,
  env
) {
  if (!isAdmin(user)) {
    await sendMessage(
      chatId,
      "⛔ <b>Доступ запрещён.</b>\n\nУ вас нет доступа к админ-панели.",
      env
    );

    return;
  }

  if (!user.admin_login) {
    await sendMessage(
      chatId,
      "❌ Для вашего аккаунта не установлен админ-логин.",
      env
    );

    return;
  }

  if (!user.admin_password_hash) {
    await sendMessage(
      chatId,
      [
        "⚠️ <b>Пароль ещё не установлен.</b>",
        "",
        "Используйте:",
        "<code>/setadminpassword</code>",
      ].join("\n"),
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
      "Логин:",
      "• только латинские буквы и цифры",
      `• ${LOGIN_MIN_LENGTH}-${LOGIN_MAX_LENGTH} символов`,
    ].join("\n"),
    env
  );
}

/* =========================================================
   SET ADMIN PASSWORD
========================================================= */

async function startSetAdminPassword(
  chatId,
  user,
  env
) {
  /*
   * На данном этапе пароль может установить
   * только Главный Администратор 6 ранга.
   */
  if (
    !isAdmin(user) ||
    Number(user.rank) !== 6
  ) {
    await sendMessage(
      chatId,
      "⛔ Только Главный Администратор 6 ранга может установить пароль.",
      env
    );

    return;
  }

  if (!user.admin_login) {
    await sendMessage(
      chatId,
      "❌ У вашего аккаунта отсутствует admin_login.",
      env
    );

    return;
  }

  await setPanelState(
    user.telegram_id,
    "set_password",
    env
  );

  await sendMessage(
    chatId,
    [
      "🔑 <b>Установка пароля</b>",
      "",
      `Логин: <code>${escapeHtml(
        user.admin_login
      )}</code>`,
      "",
      "Введите новый пароль.",
      "",
      "Требования:",
      "• только цифры",
      `• ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} цифр`,
    ].join("\n"),
    env
  );
}

/* =========================================================
   PANEL INPUT
========================================================= */

async function handlePanelInput(
  message,
  user,
  env
) {
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

  console.log("PANEL INPUT:", {
    telegramId: user.telegram_id,
    state,
  });

  /*
   * Установка нового пароля.
   */
  if (state === "set_password") {
    if (!isValidPassword(text)) {
      await sendMessage(
        message.chat.id,
        [
          "❌ <b>Неверный пароль.</b>",
          "",
          "Используйте только цифры.",
          `Длина: ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} цифр.`,
        ].join("\n"),
        env
      );

      return true;
    }

    const passwordHash =
      await hashPassword(text);

    await env.DB
      .prepare(
        `
        UPDATE users
        SET
          admin_password_hash = ?,
          updated_at = ?
        WHERE telegram_id = ?
        `
      )
      .bind(
        passwordHash,
        now(),
        user.telegram_id
      )
      .run();

    await clearPanelState(
      user.telegram_id,
      env
    );

    await sendMessage(
      message.chat.id,
      [
        "✅ <b>Пароль успешно установлен.</b>",
        "",
        `Логин: <code>${escapeHtml(
          user.admin_login
        )}</code>`,
        "",
        "Теперь используйте /alogin для входа.",
      ].join("\n"),
      env
    );

    console.log(
      "ADMIN PASSWORD SET:",
      user.telegram_id
    );

    return true;
  }

  /*
   * Ввод логина.
   */
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
        "Используйте только цифры.",
      ].join("\n"),
      env
    );

    return true;
  }

  /*
   * Ввод пароля.
   */
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

    const login =
      await getPanelTempLogin(
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

    const passwordHash =
      await hashPassword(text);

    const employee =
      await env.DB
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

      console.log(
        "LOGIN FAILED:",
        user.telegram_id,
        login
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

    const freshUser =
      await getUser(
        user.telegram_id,
        env
      );

    console.log(
      "LOGIN SUCCESS:",
      user.telegram_id
    );

    await showAdminPanel(
      message.chat.id,
      freshUser,
      env
    );

    return true;
  }

  return false;
}

/* =========================================================
   ADMIN PANEL
========================================================= */

async function showAdminPanel(
  chatId,
  user,
  env
) {
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
      `⭐ Ранг: <b>${Number(
        user.rank
      )}</b> — ${escapeHtml(
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

  console.log("CALLBACK:", {
    id: callback.id,
    from: callback.from.id,
    data: callback.data,
  });

  await telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callback.id,
    },
    env
  );

  const telegramId =
    String(callback.from.id);

  const user =
    await getUser(
      telegramId,
      env
    );

  if (!user) {
    return;
  }

  const data =
    callback.data || "";

  if (
    !await isPanelLoggedIn(
      user,
      env
    )
  ) {
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

  if (data === "employee_list") {
    await showEmployeeList(
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
   EMPLOYEES MENU
========================================================= */

async function showEmployeesMenu(
  chatId,
  user,
  env
) {
  if (!canManageEmployees(user)) {
    await sendMessage(
      chatId,
      "⛔ У вас нет доступа к управлению сотрудниками.",
      env
    );

    return;
  }

  const rank =
    Number(user.rank);

  await sendMessage(
    chatId,
    [
      "👥 <b>Управление сотрудниками</b>",
      "",
      `Ваш ранг: <b>${rank}</b>`,
      "",
      rank === 6
        ? "✅ Вы можете создавать сотрудников рангов 1–6."
        : "✅ Вы можете создавать сотрудников рангов 1–5.",
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
              callback_data:
                "create_employee",
            },
          ],
          [
            {
              text: "📋 Список сотрудников",
              callback_data:
                "employee_list",
            },
          ],
          [
            {
              text: "⬅️ Назад",
              callback_data:
                "back_panel",
            },
          ],
        ],
      },
    }
  );
}

/* =========================================================
   CREATE EMPLOYEE
========================================================= */

async function startCreateEmployee(
  chatId,
  user,
  env
) {
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
      "Введите тип сотрудника:",
      "",
      "<code>admin</code> — администратор",
      "<code>moderator</code> — модератор",
      "",
      "Для отмены: <code>/cancel</code>",
    ].join("\n"),
    env
  );
}

/* =========================================================
   EMPLOYEE LIST
========================================================= */

async function showEmployeeList(
  chatId,
  user,
  env
) {
  if (!canManageEmployees(user)) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён.",
      env
    );

    return;
  }

  const result =
    await env.DB
      .prepare(
        `
        SELECT
          id,
          telegram_id,
          username,
          first_name,
          last_name,
          role,
          rank,
          admin_login,
          panel_status,
          last_login_at
        FROM users
        WHERE role = 'admin'
           OR role = 'moderator'
        ORDER BY rank DESC, id ASC
        `
      )
      .all();

  const rows =
    result.results || [];

  if (rows.length === 0) {
    await sendMessage(
      chatId,
      "📋 Сотрудников пока нет.",
      env
    );

    return;
  }

  const lines = [
    "📋 <b>Список сотрудников</b>",
    "",
  ];

  for (const employee of rows) {
    const name =
      employee.first_name ||
      employee.username ||
      "Без имени";

    const role =
      employee.role === ADMIN_ROLE
        ? "Администратор"
        : "Модератор";

    lines.push(
      `${getStatusEmoji(
        employee.panel_status
      )} <b>${escapeHtml(
        name
      )}</b>`,
      `🆔 <code>${escapeHtml(
        employee.telegram_id
      )}</code>`,
      `👤 ${role}`,
      `⭐ Ранг: ${Number(
        employee.rank
      )}`,
      `🔑 Логин: ${
        employee.admin_login
          ? `<code>${escapeHtml(
              employee.admin_login
            )}</code>`
          : "—"
      }`,
      ""
    );
  }

  await sendMessage(
    chatId,
    lines.join("\n"),
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬅️ Назад",
              callback_data:
                "employees",
            },
          ],
        ],
      },
    }
  );
}

/* =========================================================
   ACTIVITY
========================================================= */

async function showActivity(
  chatId,
  user,
  env
) {
  const result =
    await env.DB
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

  const rows =
    result.results || [];

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
    const name =
      employee.first_name ||
      employee.username ||
      "Сотрудник";

    lines.push(
      `${getStatusEmoji(
        employee.panel_status
      )} <b>${escapeHtml(
        name
      )}</b>`,
      `⭐ Ранг: ${Number(
        employee.rank
      )}`,
      `📌 Статус: ${escapeHtml(
        getStatusName(
          employee.panel_status
        )
      )}`,
      `🕐 Последняя активность: ${escapeHtml(
        employee.panel_last_activity ||
        "—"
      )}`,
      `🔐 Последний вход: ${escapeHtml(
        employee.last_login_at ||
        "—"
      )}`,
      ""
    );
  }

  await sendMessage(
    chatId,
    lines.join("\n"),
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬅️ Назад",
              callback_data:
                "employees",
            },
          ],
        ],
      },
    }
  );
}

/* =========================================================
   CREATE EMPLOYEE INPUT
========================================================= */

async function handleEmployeeCreationInput(
  message,
  user,
  env
) {
  const state =
    await getPanelState(
      user.telegram_id,
      env
    );

  if (!state) {
    return false;
  }

  const text =
    (message.text || "").trim();

  /*
   * Отмена.
   */
  if (text === "/cancel") {
    await clearPanelState(
      user.telegram_id,
      env
    );

    await sendMessage(
      message.chat.id,
      "❌ Создание сотрудника отменено.",
      env
    );

    return true;
  }

  /*
   * Тип сотрудника.
   */
  if (state === "create_type") {
    const type =
      text.toLowerCase();

    if (
      type !== ADMIN_ROLE &&
      type !== MODERATOR_ROLE
    ) {
      await sendMessage(
        message.chat.id,
        [
          "❌ Неверный тип.",
          "",
          "Введите:",
          "<code>admin</code>",
          "или",
          "<code>moderator</code>",
        ].join("\n"),
        env
      );

      return true;
    }

    await setPanelState(
      user.telegram_id,
      type === ADMIN_ROLE
        ? "create_admin_telegram"
        : "create_moderator_telegram",
      env
    );

    await sendMessage(
      message.chat.id,
      [
        "🆔 <b>Telegram ID сотрудника</b>",
        "",
        "Введите Telegram ID.",
        "",
        "Пример:",
        "<code>123456789</code>",
      ].join("\n"),
      env
    );

    return true;
  }

  /*
   * Telegram ID администратора.
   */
  if (
    state === "create_admin_telegram"
  ) {
    if (!/^\d+$/.test(text)) {
      await sendMessage(
        message.chat.id,
        "❌ Telegram ID должен содержать только цифры.",
        env
      );

      return true;
    }

    const targetId =
      String(text);

    const existing =
      await getUser(
        targetId,
        env
      );

    if (existing) {
      await sendMessage(
        message.chat.id,
        "❌ Пользователь с таким Telegram ID уже существует.",
        env
      );

      await clearPanelState(
        user.telegram_id,
        env
      );

      return true;
    }

    await savePanelTempLogin(
      user.telegram_id,
      targetId,
      env
    );

    await setPanelState(
      user.telegram_id,
      "create_admin_rank",
      env
    );

    const maxRank =
      Number(user.rank) === 6
        ? 6
        : 5;

    await sendMessage(
      message.chat.id,
      [
        "⭐ <b>Ранг нового администратора</b>",
        "",
        `Введите ранг от 1 до ${maxRank}.`,
        "",
        "Например:",
        "<code>1</code>",
        "",
        Number(user.rank) === 6
          ? "👑 Вы можете создать Главного Администратора 6 ранга."
          : "⚠️ Ранг 6 для вас недоступен.",
      ].join("\n"),
      env
    );

    return true;
  }

  /*
   * Ранг нового администратора.
   */
  if (
    state === "create_admin_rank"
  ) {
    if (!/^\d+$/.test(text)) {
      await sendMessage(
        message.chat.id,
        "❌ Ранг должен быть числом.",
        env
      );

      return true;
    }

    const rank =
      Number(text);

    const maxRank =
      Number(user.rank) === 6
        ? 6
        : 5;

    if (
      rank < 1 ||
      rank > maxRank
    ) {
      await sendMessage(
        message.chat.id,
        `❌ Можно выбрать ранг от 1 до ${maxRank}.`,
        env
      );

      return true;
    }

    const targetId =
      await getPanelTempLogin(
        user.telegram_id,
        env
      );

    if (!targetId) {
      await clearPanelState(
        user.telegram_id,
        env
      );

      await sendMessage(
        message.chat.id,
        "❌ Сессия создания устарела. Начните заново.",
        env
      );

      return true;
    }

    await setPanelState(
      user.telegram_id,
      "create_admin_login",
      env
    );

    /*
     * Временно сохраняем:
     * target Telegram ID + rank
     */
    await savePanelTempLogin(
      user.telegram_id,
      `${targetId}|${rank}`,
      env
    );

    await sendMessage(
      message.chat.id,
      [
        "🔑 <b>Логин нового администратора</b>",
        "",
        "Введите логин.",
        "",
        "Только латинские буквы и цифры.",
        `Длина: ${LOGIN_MIN_LENGTH}-${LOGIN_MAX_LENGTH}.`,
      ].join("\n"),
      env
    );

    return true;
  }

  /*
   * Логин нового администратора.
   */
  if (
    state === "create_admin_login"
  ) {
    if (!isValidLogin(text)) {
      await sendMessage(
        message.chat.id,
        "❌ Неверный формат логина.",
        env
      );

      return true;
    }

    const temp =
      await getPanelTempLogin(
        user.telegram_id,
        env
      );

    if (!temp) {
      await clearPanelState(
        user.telegram_id,
        env
      );

      return true;
    }

    const parts =
      temp.split("|");

    const targetId =
      parts[0];

    const rank =
      Number(parts[1]);

    const existingLogin =
      await env.DB
        .prepare(
          `
          SELECT id
          FROM users
          WHERE admin_login = ?
          LIMIT 1
          `
        )
        .bind(text)
        .first();

    if (existingLogin) {
      await sendMessage(
        message.chat.id,
        "❌ Такой админ-логин уже занят.",
        env
      );

      return true;
    }

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
          updated_at,
          admin_login,
          admin_password_hash,
          panel_session,
          panel_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        targetId,
        null,
        null,
        null,
        ADMIN_ROLE,
        rank,
        0,
        0,
        now(),
        now(),
        text,
        null,
        0,
        "offline"
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
      message.chat.id,
      [
        "✅ <b>Администратор создан.</b>",
        "",
        `🆔 Telegram ID: <code>${escapeHtml(
          targetId
        )}</code>`,
        `⭐ Ранг: <b>${rank}</b>`,
        `🔑 Логин: <code>${escapeHtml(
          text
        )}</code>`,
        "",
        "⚠️ Пароль новый администратор должен установить отдельно.",
      ].join("\n"),
      env
    );

    return true;
  }

  return false;
}
/* =========================================================
   PANEL STATE
========================================================= */

async function getPanelState(telegramId, env) {
  const user = await getUser(telegramId, env);

  if (!user) {
    return null;
  }

  return user.panel_temp_state || null;
}

async function setPanelState(telegramId, state, env) {
  await env.DB
    .prepare(`
      UPDATE users
      SET
        panel_temp_state = ?,
        updated_at = ?
      WHERE telegram_id = ?
    `)
    .bind(
      state,
      now(),
      telegramId
    )
    .run();
}

async function clearPanelState(telegramId, env) {
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
    .prepare(`
      UPDATE users
      SET
        admin_login_temp = ?,
        updated_at = ?
      WHERE telegram_id = ?
    `)
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
   TEMPORARY ADMIN PASSWORD
   ТОЛЬКО ДЛЯ ПЕРВОНАЧАЛЬНОЙ НАСТРОЙКИ
========================================================= */

async function setAdminPassword(
  chatId,
  user,
  password,
  env
) {
  /*
    Временная команда доступна
    только Главному Администратору 6 ранга.
  */

  if (
    user.role !== ADMIN_ROLE ||
    Number(user.rank) !== 6
  ) {
    await sendMessage(
      chatId,
      "⛔ Доступ запрещён.",
      env
    );

    return;
  }

  if (!isValidPassword(password)) {
    await sendMessage(
      chatId,
      [
        "❌ <b>Неверный пароль.</b>",
        "",
        `Пароль должен содержать только цифры.`,
        `Длина: ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} цифр.`,
      ].join("\n"),
      env
    );

    return;
  }

  const passwordHash =
    await hashPassword(password);

  await env.DB
    .prepare(`
      UPDATE users
      SET
        admin_password_hash = ?,
        updated_at = ?
      WHERE telegram_id = ?
        AND role = 'admin'
        AND rank = 6
    `)
    .bind(
      passwordHash,
      now(),
      user.telegram_id
    )
    .run();

  await sendMessage(
    chatId,
    [
      "✅ <b>Пароль установлен.</b>",
      "",
      "Теперь используй /alogin.",
      "",
      "⚠️ После проверки временную команду установки пароля нужно удалить из кода.",
    ].join("\n"),
    env
  );
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
    .from(
      new Uint8Array(hash)
    )
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
  ).format(
    new Date()
  );
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
