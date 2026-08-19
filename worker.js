/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 1/4
   Cloudflare Worker + Telegram Bot API + D1
   ============================================================ */

const RANKS = {
  0: {
    name: "Обычный игрок",
    color: "#FFFFFF",
    admin: false
  },
  1: {
    name: "Администратор",
    color: "#008CFF",
    admin: true
  },
  2: {
    name: "Администратор",
    color: "#00FF55",
    admin: true
  },
  3: {
    name: "Следящий администратор",
    color: "#FF7A00",
    admin: true
  },
  4: {
    name: "Куратор",
    color: "#B000FF",
    admin: true
  },
  5: {
    name: "Заместитель Главного Администратора",
    color: "#FF003C",
    admin: true
  },
  6: {
    name: "Главный Администратор",
    color: "#FF003C",
    admin: true
  }
};

const MODERATOR = {
  name: "Модератор",
  color: "#FFFF00"
};

const CONFIG = {
  pointsPerAction: 15,
  dailyActivityBonus: 100,
  requiredActivityMinutes: 240,
  moscowTimezone: "Europe/Moscow",
  minWithdrawUC: 3000
};

const SECRET_RANK_MIN = 5;

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method !== "POST") {
        return new Response("DOXACHKAA UC Worker OK", {
          status: 200
        });
      }

      const update = await request.json();

      ctx.waitUntil(handleUpdate(update, env));

      return new Response("OK", {
        status: 200
      });
    } catch (error) {
      console.error("WORKER ERROR:", error);

      return new Response("OK", {
        status: 200
      });
    }
  }
};

/* ============================================================
   TELEGRAM
   ============================================================ */

async function telegram(method, data, env) {
  const url =
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(data)
  });

  return response.json();
}

async function sendMessage(chatId, text, env, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  }, env);
}

async function editMessage(chatId, messageId, text, env, extra = {}) {
  return telegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra
  }, env);
}

async function answerCallback(callbackId, env, text = "") {
  return telegram("answerCallbackQuery", {
    callback_query_id: callbackId,
    text
  }, env);
}

/* ============================================================
   DATABASE HELPERS
   ============================================================ */

async function dbGet(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}

async function dbAll(env, sql, ...params) {
  const result = await env.DB
    .prepare(sql)
    .bind(...params)
    .all();

  return result.results || [];
}

async function dbRun(env, sql, ...params) {
  return env.DB
    .prepare(sql)
    .bind(...params)
    .run();
}

/* ============================================================
   UPDATE HANDLER
   ============================================================ */

async function handleUpdate(update, env) {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  if (update.message) {
    await handleMessage(update.message, env);
  }
}

/* ============================================================
   MESSAGE HANDLER
   ============================================================ */

async function handleMessage(message, env) {
  if (!message.from) return;

  const telegramId = String(message.from.id);
  const chatId = message.chat.id;
  const text = String(message.text || "").trim();

  await ensurePlayer(env, telegramId, message.from);

  if (!text) return;

  if (text.startsWith("/")) {
    await handleCommand(message, env);
    return;
  }

  /*
   * Глобальный чат.
   * Здесь можно дополнительно добавить фильтр,
   * мут и другие проверки.
   */
  await handleGlobalChat(message, env);
}

/* ============================================================
   PLAYER
   ============================================================ */

async function ensurePlayer(env, telegramId, tgUser) {
  const existing = await dbGet(
    env,
    `SELECT * FROM players WHERE telegram_id = ?`,
    telegramId
  );

  if (existing) return existing;

  await dbRun(
    env,
    `INSERT INTO players
     (
       telegram_id,
       username,
       first_name,
       balance_rub,
       uc,
       created_at
     )
     VALUES (?, ?, ?, 0, 0, datetime('now'))`,
    telegramId,
    tgUser.username || "",
    tgUser.first_name || ""
  );

  return dbGet(
    env,
    `SELECT * FROM players WHERE telegram_id = ?`,
    telegramId
  );
}

/* ============================================================
   EMPLOYEE
   ============================================================ */

async function getEmployee(env, telegramId) {
  return dbGet(
    env,
    `SELECT * FROM employees
     WHERE telegram_id = ?
     AND enabled = 1`,
    String(telegramId)
  );
}

async function getEmployeeById(env, id) {
  return dbGet(
    env,
    `SELECT * FROM employees
     WHERE id = ?`,
    id
  );
}

function isAdminRank(rank) {
  return Number(rank) >= 1 && Number(rank) <= 6;
}

function isSecretRank(rank) {
  return Number(rank) >= SECRET_RANK_MIN;
}

function hasRank(employee, requiredRank) {
  if (!employee) return false;

  return Number(employee.rank) >= Number(requiredRank);
}

/* ============================================================
   SESSION
   ============================================================ */

async function getPanelSession(env, telegramId) {
  return dbGet(
    env,
    `SELECT *
     FROM panel_sessions
     WHERE telegram_id = ?
     AND active = 1
     ORDER BY id DESC
     LIMIT 1`,
    String(telegramId)
  );
}

async function createPanelSession(env, employee, type) {
  const now = new Date().toISOString();

  await dbRun(
    env,
    `UPDATE panel_sessions
     SET active = 0,
         logout_at = ?
     WHERE telegram_id = ?
     AND active = 1`,
    now,
    employee.telegram_id
  );

  await dbRun(
    env,
    `INSERT INTO panel_sessions
     (
       telegram_id,
       employee_id,
       panel_type,
       active,
       login_at
     )
     VALUES (?, ?, ?, 1, ?)`,
    employee.telegram_id,
    employee.id,
    type,
    now
  );
}

async function closePanelSession(env, telegramId) {
  const now = new Date().toISOString();

  await dbRun(
    env,
    `UPDATE panel_sessions
     SET active = 0,
         logout_at = ?
     WHERE telegram_id = ?
     AND active = 1`,
    now,
    String(telegramId)
  );
}

/* ============================================================
   PASSWORD / LOGIN
   ============================================================ */

async function checkCredentials(env, employee, login, password) {
  if (!employee) return false;

  return (
    employee.login === login &&
    employee.password === password
  );
}

/*
 * Для production рекомендуется хранить пароль
 * не в открытом виде, а в виде hash.
 * Эта функция оставлена отдельной, чтобы позже
 * заменить механизм без переписывания панели.
 */

/* ============================================================
   POINTS
   ============================================================ */

async function addPoints(
  env,
  employeeId,
  amount,
  action,
  targetId = null
) {
  await dbRun(
    env,
    `UPDATE employees
     SET total_points = total_points + ?,
         today_points = today_points + ?
     WHERE id = ?`,
    amount,
    amount,
    employeeId
  );

  await dbRun(
    env,
    `INSERT INTO employee_actions
     (
       employee_id,
       action_type,
       target_id,
       points,
       created_at
     )
     VALUES (?, ?, ?, ?, datetime('now'))`,
    employeeId,
    action,
    targetId,
    amount
  );
}

async function registerAdminAction(
  env,
  employee,
  action,
  targetId = null,
  pointsEnabled = true
) {
  await dbRun(
    env,
    `INSERT INTO admin_logs
     (
       employee_id,
       action_type,
       target_id,
       secret,
       created_at
     )
     VALUES (?, ?, ?, ?, datetime('now'))`,
    employee.id,
    action,
    targetId,
    isSecretRank(employee.rank) ? 1 : 0
  );

  const session = await getPanelSession(
    env,
    employee.telegram_id
  );

  /*
   * Баллы только при активной панели.
   */
  if (pointsEnabled && session && session.active) {
    await addPoints(
      env,
      employee.id,
      CONFIG.pointsPerAction,
      action,
      targetId
    );
  }
}

/* ============================================================
   COMMAND ROUTER
   ============================================================ */

async function handleCommand(message, env) {
  const telegramId = String(message.from.id);
  const chatId = message.chat.id;

  const parts = String(message.text || "")
    .trim()
    .split(/\s+/);

  const command = parts[0]
    .split("@")[0]
    .toLowerCase();

  const args = parts.slice(1);

  switch (command) {
    case "/start":
      await cmdStart(chatId, env);
      break;

    case "/alogin":
      await cmdALogin(chatId, telegramId, env);
      break;

    case "/hlogin":
      await cmdHLogin(chatId, telegramId, env);
      break;

    case "/admins":
      await cmdAdmins(chatId, telegramId, env);
      break;

    case "/moder":
      await cmdModer(chatId, env);
      break;

    case "/rank":
      await cmdRank(chatId, telegramId, args, env);
      break;

    case "/unrank":
      await cmdUnrank(chatId, telegramId, args, env);
      break;

    case "/admin":
    case "/panel":
      await cmdPanel(chatId, telegramId, env);
      break;

    case "/logout":
      await closePanelSession(env, telegramId);

      await sendMessage(
        chatId,
        "🔒 Сессия панели закрыта.",
        env
      );
      break;

    default:
      /*
       * Секретные команды 5-6 можно будет хранить
       * в таблице secret_commands и менять через панель.
       */
      await handleDynamicCommand(
        command,
        args,
        message,
        env
      );
      break;
  }
}

/* ============================================================
   START
   ============================================================ */

async function cmdStart(chatId, env) {
  await sendMessage(
    chatId,
    `<b>DOXACHKAA UC</b>

Добро пожаловать.

Используйте доступные игровые функции проекта.

Для сотрудников:
<code>/alogin</code> — админ-панель
<code>/hlogin</code> — панель модератора`,
    env
  );
}

/* ============================================================
   /ALOGIN
   ============================================================ */

async function cmdALogin(chatId, telegramId, env) {
  const employee = await getEmployee(
    env,
    telegramId
  );

  if (!employee || !isAdminRank(employee.rank)) {
    await sendMessage(
      chatId,
      "❌ У вас нет доступа к админ-панели.",
      env
    );

    return;
  }

  const session = await getPanelSession(
    env,
    telegramId
  );

  if (session && session.active) {
    await sendMessage(
      chatId,
      "🔐 Вы уже авторизованы в админ-панели.\n\nНажмите кнопку ниже для выхода.",
      env,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚪 ВЫЙТИ ИЗ ПАНЕЛИ",
                callback_data: "panel_logout"
              }
            ],
            [
              {
                text: "🛠 ОТКРЫТЬ ПАНЕЛЬ",
                callback_data: "admin_panel"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>🔐 АДМИН-ПАНЕЛЬ</b>

Введите логин и пароль одним сообщением:

<code>логин пароль</code>

Данные видны только вам.`,
    env
  );

  await dbRun(
    env,
    `INSERT OR REPLACE INTO auth_attempts
     (
       telegram_id,
       auth_type,
       step,
       created_at
     )
     VALUES (?, 'admin', 'credentials', datetime('now'))`,
    telegramId
  );
}

/* ============================================================
   /HLOGIN
   ============================================================ */

async function cmdHLogin(chatId, telegramId, env) {
  const employee = await getEmployee(
    env,
    telegramId
  );

  if (
    !employee ||
    employee.role !== "moderator"
  ) {
    await sendMessage(
      chatId,
      "❌ У вас нет доступа к панели модератора.",
      env
    );

    return;
  }

  const session = await getPanelSession(
    env,
    telegramId
  );

  if (session && session.active) {
    await sendMessage(
      chatId,
      "🔐 Вы уже авторизованы в панели модератора.",
      env,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🚪 ВЫЙТИ",
                callback_data: "panel_logout"
              }
            ],
            [
              {
                text: "🛡 ОТКРЫТЬ ПАНЕЛЬ",
                callback_data: "moder_panel"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  await sendMessage(
    chatId,
    `<b>🛡 ПАНЕЛЬ МОДЕРАТОРА</b>

Введите:

<code>логин пароль</code>`,
    env
  );

  await dbRun(
    env,
    `INSERT OR REPLACE INTO auth_attempts
     (
       telegram_id,
       auth_type,
       step,
       created_at
     )
     VALUES (?, 'moderator', 'credentials', datetime('now'))`,
    telegramId
  );
}

/* ============================================================
   AUTH INPUT
   ============================================================ */

async function processAuthInput(message, env) {
  const telegramId = String(message.from.id);

  const attempt = await dbGet(
    env,
    `SELECT *
     FROM auth_attempts
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    telegramId
  );

  if (!attempt) return false;

  const values = String(message.text || "")
    .trim()
    .split(/\s+/);

  if (values.length < 2) {
    await sendMessage(
      message.chat.id,
      "❌ Формат:\n<code>логин пароль</code>",
      env
    );

    return true;
  }

  const login = values[0];
  const password = values[1];

  const employee = await dbGet(
    env,
    `SELECT *
     FROM employees
     WHERE login = ?
     AND enabled = 1
     LIMIT 1`,
    login
  );

  if (
    !employee ||
    !await checkCredentials(
      env,
      employee,
      login,
      password
    ) ||
    String(employee.telegram_id) !== telegramId
  ) {
    await sendMessage(
      message.chat.id,
      "❌ Неверный логин или пароль.",
      env
    );

    return true;
  }

  if (
    attempt.auth_type === "admin" &&
    !isAdminRank(employee.rank)
  ) {
    await sendMessage(
      message.chat.id,
      "❌ Этот аккаунт не является администратором.",
      env
    );

    return true;
  }

  if (
    attempt.auth_type === "moderator" &&
    employee.role !== "moderator"
  ) {
    await sendMessage(
      message.chat.id,
      "❌ Этот аккаунт не является модератором.",
      env
    );

    return true;
  }

  await createPanelSession(
    env,
    employee,
    attempt.auth_type
  );

  await dbRun(
    env,
    `DELETE FROM auth_attempts
     WHERE telegram_id = ?`,
    telegramId
  );

  await dbRun(
    env,
    `UPDATE employees
     SET last_activity = datetime('now'),
         status = 'online'
     WHERE id = ?`,
    employee.id
  );

  if (attempt.auth_type === "admin") {
    await sendAdminPanel(
      message.chat.id,
      employee,
      env
    );
  } else {
    await sendModeratorPanel(
      message.chat.id,
      employee,
      env
    );
  }

  return true;
}

/* ============================================================
   PANEL
   ============================================================ */

async function cmdPanel(chatId, telegramId, env) {
  const employee = await getEmployee(
    env,
    telegramId
  );

  if (!employee) {
    await sendMessage(
      chatId,
      "❌ Доступ запрещён.",
      env
    );

    return;
  }

  const session = await getPanelSession(
    env,
    telegramId
  );

  if (!session || !session.active) {
    await sendMessage(
      chatId,
      "❌ Сначала авторизуйтесь.",
      env
    );

    return;
  }

  if (session.panel_type === "moderator") {
    await sendModeratorPanel(
      chatId,
      employee,
      env
    );
  } else {
    await sendAdminPanel(
      chatId,
      employee,
      env
    );
  }
}
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 2/4
   ============================================================ */

/* ============================================================
   /ADMINS
   ============================================================ */

async function cmdAdmins(chatId, requesterTelegramId, env) {
  const requester = await getEmployee(
    env,
    requesterTelegramId
  );

  const employees = await dbAll(
    env,
    `SELECT *
     FROM employees
     WHERE enabled = 1
     AND role = 'admin'
     ORDER BY rank DESC`
  );

  const visible = [];

  for (const employee of employees) {
    /*
     * Ранги 5-6 полностью скрыты,
     * пока не вошли в панель.
     */
    if (isSecretRank(employee.rank)) {
      const session = await getPanelSession(
        env,
        employee.telegram_id
      );

      if (!session || !session.active) {
        continue;
      }

      /*
       * Младшие сотрудники не должны видеть
       * секретные действия 5-6.
       */
      if (
        requester &&
        Number(requester.rank) < 5
      ) {
        continue;
      }
    }

    visible.push(employee);
  }

  if (!visible.length) {
    await sendMessage(
      chatId,
      "👮 Сейчас нет видимых администраторов онлайн.",
      env
    );

    return;
  }

  let text = "<b>👮 АДМИНИСТРАТОРЫ ОНЛАЙН</b>\n\n";

  for (const employee of visible) {
    const status = await getEmployeeStatus(
      env,
      employee
    );

    text +=
      `${status.icon} <b>${escapeHtml(
        employee.display_name ||
        employee.login
      )}</b>\n` +
      `└ ${RANKS[employee.rank]?.name || "Администратор"}\n\n`;
  }

  await sendMessage(chatId, text, env);
}

/* ============================================================
   /MODER
   ============================================================ */

async function cmdModer(chatId, env) {
  const moderators = await dbAll(
    env,
    `SELECT *
     FROM employees
     WHERE enabled = 1
     AND role = 'moderator'
     ORDER BY last_activity DESC`
  );

  if (!moderators.length) {
    await sendMessage(
      chatId,
      "🛡 Модераторов онлайн нет.",
      env
    );

    return;
  }

  let text = "<b>🛡 МОДЕРАТОРЫ</b>\n\n";

  for (const moderator of moderators) {
    const status = await getEmployeeStatus(
      env,
      moderator
    );

    text +=
      `${status.icon} <b>${escapeHtml(
        moderator.display_name ||
        moderator.login
      )}</b>\n` +
      `└ Модератор\n\n`;
  }

  await sendMessage(chatId, text, env);
}

/* ============================================================
   STATUS
   ============================================================ */

async function getEmployeeStatus(env, employee) {
  const session = await getPanelSession(
    env,
    employee.telegram_id
  );

  /*
   * 5-6 скрыты полностью без панели.
   */
  if (
    isSecretRank(employee.rank) &&
    (!session || !session.active)
  ) {
    return {
      hidden: true,
      icon: "⚫"
    };
  }

  if (!employee.last_activity) {
    return {
      icon: "⚫",
      text: "Оффлайн"
    };
  }

  const last = new Date(employee.last_activity);
  const diff = Date.now() - last.getTime();

  if (diff <= 5 * 60 * 1000) {
    return {
      icon: "🟢",
      text: "Онлайн"
    };
  }

  if (diff <= 30 * 60 * 1000) {
    return {
      icon: "🟡",
      text: "Отошёл"
    };
  }

  return {
    icon: "🔴",
    text: "Неактивен"
  };
}

/* ============================================================
   ADMIN PANEL
   ============================================================ */

async function sendAdminPanel(chatId, employee, env) {
  const rank = Number(employee.rank);

  const keyboard = [
    [
      {
        text: "📊 Активность",
        callback_data: "activity"
      },
      {
        text: "👥 Сотрудники",
        callback_data: "employees"
      }
    ],
    [
      {
        text: "🔎 Поиск игрока",
        callback_data: "player_search"
      },
      {
        text: "📨 Жалобы",
        callback_data: "complaints"
      }
    ],
    [
      {
        text: "📋 Заявки",
        callback_data: "requests"
      },
      {
        text: "🔔 Уведомления",
        callback_data: "notifications"
      }
    ],
    [
      {
        text: "🎡 Колесо",
        callback_data: "wheel"
      },
      {
        text: "📜 Логи",
        callback_data: "logs"
      }
    ]
  ];

  /*
   * 4-6 имеют поиск игрока.
   */
  if (rank < 4) {
    keyboard[1] = [
      {
        text: "📨 Жалобы",
        callback_data: "complaints"
      },
      {
        text: "📊 Активность",
        callback_data: "activity"
      }
    ];
  }

  /*
   * 5-6: финансовые функции.
   */
  if (rank >= 5) {
    keyboard.push([
      {
        text: "💰 Пополнения",
        callback_data: "deposits"
      },
      {
        text: "💎 Выводы UC",
        callback_data: "withdrawals"
      }
    ]);

    keyboard.push([
      {
        text: "🚨 Аварийный режим",
        callback_data: "emergency"
      },
      {
        text: "🔧 Тех. работы",
        callback_data: "maintenance"
      }
    ]);

    keyboard.push([
      {
        text: "⚙️ Настройки",
        callback_data: "settings"
      }
    ]);
  }

  /*
   * 5-6 могут управлять сотрудниками.
   */
  if (rank >= 5) {
    keyboard.push([
      {
        text: "➕ Создать сотрудника",
        callback_data: "employee_create"
      }
    ]);
  }

  /*
   * Только 6 полный контроль.
   */
  if (rank === 6) {
    keyboard.push([
      {
        text: "👑 Главный контроль",
        callback_data: "super_admin"
      }
    ]);
  }

  keyboard.push([
    {
      text: "🚪 Выйти",
      callback_data: "panel_logout"
    }
  ]);

  await sendMessage(
    chatId,
    `<b>🛠 DOXACHKAA UC — АДМИН-ПАНЕЛЬ</b>

👤 ${escapeHtml(
      employee.display_name ||
      employee.login
    )}

🎖 Ранг: <b>${RANKS[rank]?.name}</b>
💰 Баллы: <b>${employee.total_points || 0}</b>

Выберите раздел:`,
    env,
    {
      reply_markup: {
        inline_keyboard: keyboard
      }
    }
  );
}

/* ============================================================
   MODERATOR PANEL
   ============================================================ */

async function sendModeratorPanel(
  chatId,
  employee,
  env
) {
  await sendMessage(
    chatId,
    `<b>🛡 ПАНЕЛЬ МОДЕРАТОРА</b>

👤 ${escapeHtml(
      employee.display_name ||
      employee.login
    )}

⭐ Баллы: <b>${employee.total_points || 0}</b>

Выберите действие:`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📨 Жалобы",
              callback_data: "moder_complaints"
            }
          ],
          [
            {
              text: "👥 Модераторы",
              callback_data: "moder_list"
            }
          ],
          [
            {
              text: "📊 Моя активность",
              callback_data: "my_activity"
            }
          ],
          [
            {
              text: "🚪 Выйти",
              callback_data: "panel_logout"
            }
          ]
        ]
      }
    }
  );
}

/* ============================================================
   RANK
   ============================================================ */

async function cmdRank(
  chatId,
  telegramId,
  args,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (!actor || Number(actor.rank) < 5) {
    await sendMessage(
      chatId,
      "❌ Команда доступна только 5-6 рангу.",
      env
    );

    return;
  }

  if (args.length < 2) {
    await sendMessage(
      chatId,
      "Использование:\n<code>/rank ID РАНГ</code>",
      env
    );

    return;
  }

  const targetId = args[0];
  const newRank = Number(args[1]);

  if (
    !Number.isInteger(newRank) ||
    newRank < 0 ||
    newRank > 6
  ) {
    await sendMessage(
      chatId,
      "❌ Ранг должен быть от 0 до 6.",
      env
    );

    return;
  }

  /*
   * 5 ранг не может назначать 6.
   */
  if (
    Number(actor.rank) === 5 &&
    newRank === 6
  ) {
    await sendMessage(
      chatId,
      "❌ 5 ранг не может назначить 6 ранг.",
      env
    );

    return;
  }

  const target = await getEmployeeById(
    env,
    targetId
  );

  if (!target) {
    await sendMessage(
      chatId,
      "❌ Сотрудник не найден.",
      env
    );

    return;
  }

  /*
   * 5 не может менять 6.
   */
  if (
    Number(actor.rank) === 5 &&
    Number(target.rank) === 6
  ) {
    await sendMessage(
      chatId,
      "❌ Нельзя изменить сотрудника 6 ранга.",
      env
    );

    return;
  }

  /*
   * Нельзя повысить другого до ранга выше себя.
   */
  if (
    Number(actor.rank) < 6 &&
    newRank > Number(actor.rank)
  ) {
    await sendMessage(
      chatId,
      "❌ Нельзя выдать ранг выше своего.",
      env
    );

    return;
  }

  const oldRank = Number(target.rank);

  await dbRun(
    env,
    `UPDATE employees
     SET rank = ?,
         role = CASE
           WHEN ? = 'moderator' THEN 'moderator'
           ELSE 'admin'
         END
     WHERE id = ?`,
    newRank,
    newRank === 0 ? "player" : "admin",
    target.id
  );

  await dbRun(
    env,
    `INSERT INTO rank_logs
     (
       actor_id,
       target_id,
       old_rank,
       new_rank,
       created_at
     )
     VALUES (?, ?, ?, ?, datetime('now'))`,
    actor.id,
    target.id,
    oldRank,
    newRank
  );

  await registerAdminAction(
    env,
    actor,
    "rank_change",
    target.id,
    false
  );

  await sendMessage(
    chatId,
    `✅ Ранг изменён.

Сотрудник: <b>${escapeHtml(
      target.display_name || target.login
    )}</b>
Было: <b>${oldRank}</b>
Стало: <b>${newRank}</b>`,
    env
  );
}

/* ============================================================
   UNRANK
   ============================================================ */

async function cmdUnrank(
  chatId,
  telegramId,
  args,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (!actor || Number(actor.rank) < 5) {
    await sendMessage(
      chatId,
      "❌ Команда доступна только 5-6 рангу.",
      env
    );

    return;
  }

  if (!args[0]) {
    await sendMessage(
      chatId,
      "Использование:\n<code>/unrank ID</code>",
      env
    );

    return;
  }

  const target = await getEmployeeById(
    env,
    args[0]
  );

  if (!target) {
    await sendMessage(
      chatId,
      "❌ Сотрудник не найден.",
      env
    );

    return;
  }

  if (
    Number(actor.rank) === 5 &&
    Number(target.rank) === 6
  ) {
    await sendMessage(
      chatId,
      "❌ 5 ранг не может изменить 6 ранг.",
      env
    );

    return;
  }

  const oldRank = Number(target.rank);

  await dbRun(
    env,
    `UPDATE employees
     SET rank = 0,
         role = 'player'
     WHERE id = ?`,
    target.id
  );

  await dbRun(
    env,
    `INSERT INTO rank_logs
     (
       actor_id,
       target_id,
       old_rank,
       new_rank,
       created_at
     )
     VALUES (?, ?, ?, 0, datetime('now'))`,
    actor.id,
    target.id,
    oldRank
  );

  await registerAdminAction(
    env,
    actor,
    "unrank",
    target.id,
    false
  );

  await sendMessage(
    chatId,
    `✅ Сотрудник снят с должности.

ID: <b>${target.id}</b>
Предыдущий ранг: <b>${oldRank}</b>
Новый ранг: <b>0</b>`,
    env
  );
}

/* ============================================================
   DYNAMIC COMMANDS
   ============================================================ */

async function handleDynamicCommand(
  command,
  args,
  message,
  env
) {
  const row = await dbGet(
    env,
    `SELECT *
     FROM secret_commands
     WHERE command = ?
     AND enabled = 1`,
    command
  );

  if (!row) return;

  const employee = await getEmployee(
    env,
    message.from.id
  );

  if (
    !employee ||
    Number(employee.rank) < Number(row.min_rank)
  ) {
    return;
  }

  /*
   * Команда выполняется только после
   * серверной проверки прав.
   *
   * Конкретные actions можно расширять
   * через executeDynamicAction().
   */
  await executeDynamicAction(
    row,
    args,
    message,
    employee,
    env
  );
}

async function executeDynamicAction(
  command,
  args,
  message,
  employee,
  env
) {
  switch (command.action) {
    case "maintenance":
      await setMaintenance(
        env,
        args,
        employee,
        message.chat.id
      );
      break;

    default:
      await sendMessage(
        message.chat.id,
        "⚙️ Команда зарегистрирована, но действие ещё не настроено.",
        env
      );
  }
}

/* ============================================================
   MAINTENANCE
   ============================================================ */

async function setMaintenance(
  env,
  args,
  employee,
  chatId
) {
  if (Number(employee.rank) < 5) {
    await sendMessage(
      chatId,
      "❌ Недостаточно прав.",
      env
    );

    return;
  }

  const enabled = args[0] === "on";

  await dbRun(
    env,
    `INSERT INTO system_settings
     (key, value, updated_at)
     VALUES
     ('maintenance', ?, datetime('now'))
     ON CONFLICT(key)
     DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    enabled ? "1" : "0"
  );

  await registerAdminAction(
    env,
    employee,
    "maintenance_change",
    null,
    false
  );

  await sendMessage(
    chatId,
    enabled
      ? "🔧 Технические работы включены."
      : "✅ Технические работы выключены.",
    env
  );
}

/* ============================================================
   CALLBACKS
   ============================================================ */

async function handleCallback(callback, env) {
  const data = String(
    callback.data || ""
  );

  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const telegramId = String(
    callback.from.id
  );

  await answerCallback(
    callback.id,
    env
  );

  switch (data) {
    case "panel_logout":
      await closePanelSession(
        env,
        telegramId
      );

      await editMessage(
        chatId,
        messageId,
        "🔒 Панель закрыта.\n\nСессия полностью завершена.",
        env
      );
      break;

    case "admin_panel": {
      const employee = await getEmployee(
        env,
        telegramId
      );

      const session = await getPanelSession(
        env,
        telegramId
      );

      if (
        employee &&
        session &&
        session.active &&
        session.panel_type === "admin"
      ) {
        await sendAdminPanel(
          chatId,
          employee,
          env
        );
      }

      break;
    }

    case "moder_panel": {
      const employee = await getEmployee(
        env,
        telegramId
      );

      const session = await getPanelSession(
        env,
        telegramId
      );

      if (
        employee &&
        session &&
        session.active
      ) {
        await sendModeratorPanel(
          chatId,
          employee,
          env
        );
      }

      break;
    }

    case "activity":
      await showActivity(
        chatId,
        telegramId,
        env
      );
      break;

    case "employees":
      await showEmployees(
        chatId,
        telegramId,
        env
      );
      break;

    case "complaints":
      await showComplaints(
        chatId,
        telegramId,
        env
      );
      break;

    case "logs":
      await showLogs(
        chatId,
        telegramId,
        env
      );
      break;

    case "wheel":
      await showWheel(
        chatId,
        telegramId,
        env
      );
      break;

    case "deposits":
      await showDeposits(
        chatId,
        telegramId,
        env
      );
      break;

    case "withdrawals":
      await showWithdrawals(
        chatId,
        telegramId,
        env
      );
      break;

    case "emergency":
      await showEmergency(
        chatId,
        telegramId,
        env
      );
      break;

    case "maintenance":
      await showMaintenance(
        chatId,
        telegramId,
        env
      );
      break;

    case "settings":
      await showSettings(
        chatId,
        telegramId,
        env
      );
      break;

    case "employee_create":
      await showCreateEmployee(
        chatId,
        telegramId,
        env
      );
      break;

    case "player_search":
      await sendMessage(
        chatId,
        "🔎 Отправьте ID игрока.",
        env
      );
      break;

    default:
      await handlePanelCallback(
        data,
        chatId,
        telegramId,
        env
      );
  }
      }
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 3/4
   ============================================================ */

/* ============================================================
   ACTIVITY
   ============================================================ */

async function showActivity(
  chatId,
  telegramId,
  env
) {
  const employee = await getEmployee(
    env,
    telegramId
  );

  if (!employee) {
    return;
  }

  const rows = await dbAll(
    env,
    `SELECT
       e.id,
       e.display_name,
       e.login,
       e.rank,
       e.status,
       e.total_points,
       e.today_points,
       e.last_activity,
       COALESCE(
         SUM(ea.points),
         0
       ) AS action_points,
       COUNT(ea.id) AS actions
     FROM employees e
     LEFT JOIN employee_actions ea
       ON ea.employee_id = e.id
       AND date(ea.created_at, 'localtime')
       = date('now', 'localtime')
     WHERE e.enabled = 1
     GROUP BY e.id
     ORDER BY today_points DESC`
  );

  let text =
    "<b>📊 ТАБЛИЦА АКТИВНОСТИ</b>\n\n";

  for (const row of rows) {
    if (
      isSecretRank(row.rank) &&
      Number(employee.rank) < 5
    ) {
      continue;
    }

    const status = await getEmployeeStatus(
      env,
      row
    );

    text +=
      `${status.icon} <b>${escapeHtml(
        row.display_name || row.login
      )}</b>\n` +
      `🎖 Ранг: ${row.rank}\n` +
      `⏱ Активность: ${formatMinutes(
        await getDailyActivityMinutes(
          env,
          row.id
        )
      )}\n` +
      `⚡ Действий: ${row.actions || 0}\n` +
      `⭐ За день: +${row.today_points || 0}\n` +
      `🏆 Всего: ${row.total_points || 0}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   DAILY ACTIVITY
   ============================================================ */

async function getDailyActivityMinutes(
  env,
  employeeId
) {
  const row = await dbGet(
    env,
    `SELECT
       COALESCE(
         SUM(
           CASE
             WHEN logout_at IS NULL
             THEN
               (julianday('now') -
                julianday(login_at)) * 1440
             ELSE
               (julianday(logout_at) -
                julianday(login_at)) * 1440
           END
         ),
         0
       ) AS minutes
     FROM panel_sessions
     WHERE employee_id = ?
     AND date(login_at) = date('now')`,
    employeeId
  );

  return Math.floor(
    Number(row?.minutes || 0)
  );
}

async function processDailyBonus(
  env,
  employeeId
) {
  const minutes =
    await getDailyActivityMinutes(
      env,
      employeeId
    );

  if (
    minutes <
    CONFIG.requiredActivityMinutes
  ) {
    return false;
  }

  const today = getMoscowDate();

  const exists = await dbGet(
    env,
    `SELECT id
     FROM daily_activity_bonus
     WHERE employee_id = ?
     AND activity_date = ?`,
    employeeId,
    today
  );

  if (exists) {
    return false;
  }

  await dbRun(
    env,
    `INSERT INTO daily_activity_bonus
     (
       employee_id,
       activity_date,
       points
     )
     VALUES (?, ?, ?)`,
    employeeId,
    today,
    CONFIG.dailyActivityBonus
  );

  await dbRun(
    env,
    `UPDATE employees
     SET total_points =
       total_points + ?,
       today_points =
       today_points + ?
     WHERE id = ?`,
    CONFIG.dailyActivityBonus,
    CONFIG.dailyActivityBonus,
    employeeId
  );

  return true;
}

/* ============================================================
   EMPLOYEES
   ============================================================ */

async function showEmployees(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    await sendMessage(
      chatId,
      "❌ Недостаточно прав.",
      env
    );

    return;
  }

  const employees = await dbAll(
    env,
    `SELECT *
     FROM employees
     WHERE enabled = 1
     ORDER BY rank DESC, id ASC`
  );

  let text =
    "<b>👥 СОТРУДНИКИ</b>\n\n";

  for (const employee of employees) {
    if (
      Number(actor.rank) === 5 &&
      Number(employee.rank) === 6
    ) {
      continue;
    }

    const status =
      await getEmployeeStatus(
        env,
        employee
      );

    text +=
      `${status.icon} <b>${escapeHtml(
        employee.display_name ||
        employee.login
      )}</b>\n` +
      `ID: <code>${employee.id}</code>\n` +
      `Ранг: ${employee.rank}\n` +
      `Роль: ${employee.role}\n` +
      `Баллы: ${employee.total_points || 0}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   CREATE EMPLOYEE
   ============================================================ */

async function showCreateEmployee(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    await sendMessage(
      chatId,
      "❌ Недостаточно прав.",
      env
    );

    return;
  }

  await dbRun(
    env,
    `INSERT OR REPLACE INTO panel_states
     (
       telegram_id,
       state,
       data
     )
     VALUES (?, 'create_employee', '{}')`,
    telegramId
  );

  await sendMessage(
    chatId,
    `<b>➕ СОЗДАНИЕ СОТРУДНИКА</b>

Отправьте:

<code>TelegramID Логин Пароль Ранг Роль</code>

Пример:

<code>123456789 AdminDoxa777 7391846205 5 admin</code>

Роль:
<code>admin</code>
или
<code>moderator</code>`,
    env
  );
}

/* ============================================================
   COMPLAINTS
   ============================================================ */

async function showComplaints(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (!actor) return;

  const rank = Number(actor.rank);

  const complaints = await dbAll(
    env,
    `SELECT *
     FROM complaints
     WHERE status = 'open'
     ORDER BY id DESC
     LIMIT 20`
  );

  let text =
    "<b>📨 ЖАЛОБЫ</b>\n\n";

  if (!complaints.length) {
    text += "Открытых жалоб нет.";
  }

  for (const complaint of complaints) {
    let allowed = false;

    if (
      complaint.type === "moderator" &&
      rank >= 4
    ) {
      allowed = true;
    }

    if (
      complaint.type === "admin" &&
      rank >= 5
    ) {
      allowed = true;
    }

    if (
      complaint.type === "curator" &&
      rank >= 6
    ) {
      allowed = true;
    }

    if (!allowed) continue;

    text +=
      `#${complaint.id}\n` +
      `Тип: ${escapeHtml(
        complaint.type
      )}\n` +
      `Игрок: ${escapeHtml(
        complaint.player_id
      )}\n` +
      `Описание: ${escapeHtml(
        complaint.text || ""
      )}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   LOGS
   ============================================================ */

async function showLogs(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 4
  ) {
    await sendMessage(
      chatId,
      "❌ Недостаточно прав.",
      env
    );

    return;
  }

  const logs = await dbAll(
    env,
    `SELECT
       l.*,
       e.display_name,
       e.login
     FROM admin_logs l
     LEFT JOIN employees e
       ON e.id = l.employee_id
     WHERE
       l.secret = 0
       OR ? >= 4
     ORDER BY l.id DESC
     LIMIT 50`,
    actor.rank
  );

  let text =
    "<b>📜 ЛЕНТА ДЕЙСТВИЙ</b>\n\n";

  for (const log of logs) {
    text +=
      `🕐 ${formatTime(log.created_at)} — ` +
      `<b>${escapeHtml(
        log.display_name ||
        log.login ||
        "Unknown"
      )}</b>\n` +
      `${escapeHtml(
        log.action_type
      )}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   WHEEL
   ============================================================ */

async function showWheel(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    await sendMessage(
      chatId,
      "❌ Управление колесом доступно только 5-6 рангу.",
      env
    );

    return;
  }

  const settings =
    await getWheelSettings(env);

  await sendMessage(
    chatId,
    `<b>🎡 УПРАВЛЕНИЕ КОЛЕСОМ</b>

💰 Цена: <b>${settings.price}</b> ₽
💎 Шанс UC: <b>${settings.uc_chance}%</b>
🎁 Награды: <b>${settings.rewards_count}</b>
🧪 Тестовый режим:
<b>${settings.test_mode ? "ВКЛ" : "ВЫКЛ"}</b>`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💰 Изменить цену",
              callback_data: "wheel_price"
            }
          ],
          [
            {
              text: "🎯 Изменить шанс UC",
              callback_data: "wheel_chance"
            }
          ],
          [
            {
              text: "🎁 Награды",
              callback_data: "wheel_rewards"
            }
          ],
          [
            {
              text: "🧪 Тестовый режим",
              callback_data: "wheel_test"
            }
          ],
          [
            {
              text: "📜 История",
              callback_data: "wheel_history"
            }
          ]
        ]
      }
    }
  );
}

async function getWheelSettings(env) {
  const rows = await dbAll(
    env,
    `SELECT key, value
     FROM wheel_settings`
  );

  const settings = {
    price: 0,
    uc_chance: 0,
    rewards_count: 0,
    test_mode: false
  };

  for (const row of rows) {
    if (row.key === "price") {
      settings.price =
        Number(row.value);
    }

    if (row.key === "uc_chance") {
      settings.uc_chance =
        Number(row.value);
    }

    if (row.key === "rewards_count") {
      settings.rewards_count =
        Number(row.value);
    }

    if (row.key === "test_mode") {
      settings.test_mode =
        row.value === "1";
    }
  }

  return settings;
}

/* ============================================================
   DEPOSITS
   ============================================================ */

async function showDeposits(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    await sendMessage(
      chatId,
      "❌ Пополнения доступны только 5-6 рангу.",
      env
    );

    return;
  }

  const requests = await dbAll(
    env,
    `SELECT *
     FROM deposit_requests
     WHERE status IN ('pending', 'checking')
     ORDER BY id DESC
     LIMIT 30`
  );

  let text =
    "<b>💰 ПОПОЛНЕНИЯ</b>\n\n";

  if (!requests.length) {
    text += "Активных заявок нет.";
  }

  for (const req of requests) {
    text +=
      `#${req.id}\n` +
      `Игрок: <code>${escapeHtml(
        req.player_id
      )}</code>\n` +
      `Сумма: <b>${req.amount_rub} ₽</b>\n` +
      `UC: <b>${req.uc_amount || 0}</b>\n` +
      `Статус: ${req.status}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   WITHDRAWALS
   ============================================================ */

async function showWithdrawals(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    await sendMessage(
      chatId,
      "❌ Выводы доступны только 5-6 рангу.",
      env
    );

    return;
  }

  const rows = await dbAll(
    env,
    `SELECT *
     FROM withdrawals
     WHERE status = 'pending'
     ORDER BY id DESC
     LIMIT 30`
  );

  let text =
    `<b>💎 ВЫВОДЫ UC</b>\n\n` +
    `Минимум: <b>${CONFIG.minWithdrawUC} UC</b>\n\n`;

  if (!rows.length) {
    text += "Заявок на вывод нет.";
  }

  for (const row of rows) {
    text +=
      `#${row.id}\n` +
      `Игрок: <code>${escapeHtml(
        row.player_id
      )}</code>\n` +
      `UC: <b>${row.uc_amount}</b>\n` +
      `Статус: ${row.status}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   EMERGENCY
   ============================================================ */

async function showEmergency(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    return;
  }

  await sendMessage(
    chatId,
    `<b>🚨 АВАРИЙНЫЙ РЕЖИМ</b>

Можно временно отключить:

🎡 Колесо
💰 Пополнение
💎 Вывод
🎟 Промокоды`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🎡 Колесо",
              callback_data: "emergency_wheel"
            }
          ],
          [
            {
              text: "💰 Пополнение",
              callback_data: "emergency_deposit"
            }
          ],
          [
            {
              text: "💎 Вывод",
              callback_data: "emergency_withdraw"
            }
          ],
          [
            {
              text: "🎟 Промокоды",
              callback_data: "emergency_promos"
            }
          ]
        ]
      }
    }
  );
}

/* ============================================================
   MAINTENANCE PANEL
   ============================================================ */

async function showMaintenance(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    return;
  }

  const setting = await dbGet(
    env,
    `SELECT value
     FROM system_settings
     WHERE key = 'maintenance'`
  );

  await sendMessage(
    chatId,
    `<b>🔧 ТЕХНИЧЕСКИЕ РАБОТЫ</b>

Статус:
<b>${
      setting?.value === "1"
        ? "ВКЛЮЧЕНЫ"
        : "ВЫКЛЮЧЕНЫ"
    }</b>`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔧 Включить",
              callback_data: "maintenance_on"
            },
            {
              text: "✅ Выключить",
              callback_data: "maintenance_off"
            }
          ]
        ]
      }
    }
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */

async function showSettings(
  chatId,
  telegramId,
  env
) {
  const actor = await getEmployee(
    env,
    telegramId
  );

  if (
    !actor ||
    Number(actor.rank) < 5
  ) {
    return;
  }

  await sendMessage(
    chatId,
    `<b>⚙️ НАСТРОЙКИ СИСТЕМЫ</b>

Доступные настройки:

• колесо
• промокоды
• ежедневный бонус
• технические работы
• аварийный режим
• команды
• уведомления
• лимиты`,
    env
  );
}
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 4/4
   ============================================================ */

/* ============================================================
   PANEL CALLBACKS
   ============================================================ */

async function handlePanelCallback(
  data,
  chatId,
  telegramId,
  env
) {
  const employee = await getEmployee(
    env,
    telegramId
  );

  if (!employee) return;

  const session = await getPanelSession(
    env,
    telegramId
  );

  if (!session || !session.active) {
    await sendMessage(
      chatId,
      "❌ Сессия панели завершена.",
      env
    );

    return;
  }

  if (data === "maintenance_on") {
    if (Number(employee.rank) < 5) return;

    await setMaintenance(
      env,
      ["on"],
      employee,
      chatId
    );

    return;
  }

  if (data === "maintenance_off") {
    if (Number(employee.rank) < 5) return;

    await setMaintenance(
      env,
      ["off"],
      employee,
      chatId
    );

    return;
  }

  if (data === "my_activity") {
    const minutes =
      await getDailyActivityMinutes(
        env,
        employee.id
      );

    await sendMessage(
      chatId,
      `<b>📊 МОЯ АКТИВНОСТЬ</b>

Сегодня:
⏱ ${formatMinutes(minutes)}
⚡ Действий: ${
        await getDailyActionCount(
          env,
          employee.id
        )
      }
⭐ Баллов: ${
        employee.today_points || 0
      }`,
      env
    );

    return;
  }

  if (data === "moder_list") {
    await cmdModer(
      chatId,
      env
    );

    return;
  }

  if (
    data === "moder_complaints"
  ) {
    await showComplaints(
      chatId,
      telegramId,
      env
    );

    return;
  }

  if (data === "wheel_price") {
    if (Number(employee.rank) < 5) return;

    await requestPanelInput(
      env,
      telegramId,
      "wheel_price",
      chatId,
      "Введите новую цену вращения в ₽."
    );

    return;
  }

  if (data === "wheel_chance") {
    if (Number(employee.rank) < 5) return;

    await requestPanelInput(
      env,
      telegramId,
      "wheel_chance",
      chatId,
      "Введите шанс UC от 0 до 100."
    );

    return;
  }

  if (data === "wheel_test") {
    if (Number(employee.rank) < 5) return;

    await toggleWheelTestMode(
      env,
      employee,
      chatId
    );

    return;
  }

  if (data === "wheel_history") {
    if (Number(employee.rank) < 5) return;

    const rows = await dbAll(
      env,
      `SELECT *
       FROM wheel_logs
       ORDER BY id DESC
       LIMIT 20`
    );

    let text =
      "<b>📜 ИСТОРИЯ КОЛЕСА</b>\n\n";

    for (const row of rows) {
      text +=
        `${formatTime(
          row.created_at
        )} — ${escapeHtml(
          row.action
        )}\n`;
    }

    await sendMessage(
      chatId,
      text,
      env
    );

    return;
  }

  if (data === "wheel_rewards") {
    await sendMessage(
      chatId,
      "<b>🎁 НАГРАДЫ КОЛЕСА</b>\n\nУправление наградами можно расширить через таблицу wheel_rewards.",
      env
    );

    return;
  }

  if (data === "employee_create") {
    await showCreateEmployee(
      chatId,
      telegramId,
      env
    );

    return;
  }

  if (data.startsWith("emergency_")) {
    await emergencyToggle(
      data,
      employee,
      chatId,
      env
    );

    return;
  }
}

/* ============================================================
   PANEL INPUT
   ============================================================ */

async function requestPanelInput(
  env,
  telegramId,
  state,
  chatId,
  message
) {
  await dbRun(
    env,
    `INSERT OR REPLACE INTO panel_states
     (
       telegram_id,
       state,
       data
     )
     VALUES (?, ?, '{}')`,
    telegramId,
    state
  );

  await sendMessage(
    chatId,
    message,
    env
  );
}

/* ============================================================
   INPUT HANDLER
   ============================================================ */

async function handleTextState(
  message,
  env
) {
  const telegramId =
    String(message.from.id);

  const state = await dbGet(
    env,
    `SELECT *
     FROM panel_states
     WHERE telegram_id = ?
     LIMIT 1`,
    telegramId
  );

  if (!state) {
    return false;
  }

  const employee =
    await getEmployee(
      env,
      telegramId
    );

  if (!employee) return true;

  const value =
    String(message.text || "")
      .trim();

  switch (state.state) {
    case "wheel_price": {
      const price = Number(value);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        await sendMessage(
          message.chat.id,
          "❌ Некорректная цена.",
          env
        );

        return true;
      }

      await setWheelSetting(
        env,
        "price",
        price
      );

      await createWheelLog(
        env,
        employee,
        `Изменена цена: ${price} ₽`
      );

      await clearPanelState(
        env,
        telegramId
      );

      await sendMessage(
        message.chat.id,
        `✅ Цена вращения изменена: <b>${price} ₽</b>`,
        env
      );

      return true;
    }

    case "wheel_chance": {
      const chance = Number(value);

      if (
        !Number.isFinite(chance) ||
        chance < 0 ||
        chance > 100
      ) {
        await sendMessage(
          message.chat.id,
          "❌ Шанс должен быть от 0 до 100%.",
          env
        );

        return true;
      }

      await setWheelSetting(
        env,
        "uc_chance",
        chance
      );

      await createWheelLog(
        env,
        employee,
        `Изменён шанс UC: ${chance}%`
      );

      await clearPanelState(
        env,
        telegramId
      );

      await sendMessage(
        message.chat.id,
        `✅ Шанс UC изменён: <b>${chance}%</b>`,
        env
      );

      return true;
    }

    case "create_employee": {
      const parts =
        value.split(/\s+/);

      if (parts.length < 5) {
        await sendMessage(
          message.chat.id,
          "❌ Формат:\n<code>TelegramID Логин Пароль Ранг Роль</code>",
          env
        );

        return true;
      }

      const tgId = parts[0];
      const login = parts[1];
      const password = parts[2];
      const rank = Number(parts[3]);
      const role = parts[4];

      if (
        Number(employee.rank) === 5 &&
        rank > 5
      ) {
        await sendMessage(
          message.chat.id,
          "❌ 5 ранг не может создать 6 ранг.",
          env
        );

        return true;
      }

      if (
        rank < 0 ||
        rank > Number(employee.rank)
      ) {
        await sendMessage(
          message.chat.id,
          "❌ Нельзя выдать ранг выше своего.",
          env
        );

        return true;
      }

      if (
        !["admin", "moderator"].includes(role)
      ) {
        await sendMessage(
          message.chat.id,
          "❌ Роль должна быть admin или moderator.",
          env
        );

        return true;
      }

      await dbRun(
        env,
        `INSERT INTO employees
         (
           telegram_id,
           login,
           password,
           display_name,
           rank,
           role,
           enabled,
           status,
           total_points,
           today_points
         )
         VALUES (?, ?, ?, ?, ?, ?, 1, 'offline', 0, 0)`,
        tgId,
        login,
        password,
        login,
        role === "moderator" ? 0 : rank,
        role
      );

      await clearPanelState(
        env,
        telegramId
      );

      await sendMessage(
        message.chat.id,
        `✅ Сотрудник создан.

Логин: <code>${escapeHtml(
          login
        )}</code>
Пароль: <code>${escapeHtml(
          password
        )}</code>
Ранг: <b>${role === "moderator" ? "Модератор" : rank}</b>`,
        env
      );

      return true;
    }

    default:
      return false;
  }
}

/* ============================================================
   GLOBAL CHAT
   ============================================================ */

async function handleGlobalChat(
  message,
  env
) {
  const telegramId =
    String(message.from.id);

  /*
   * Сначала проверяем состояние панели.
   */
  if (
    await handleTextState(
      message,
      env
    )
  ) {
    return;
  }

  /*
   * Затем проверяем авторизацию.
   */
  if (
    await processAuthInput(
      message,
      env
    )
  ) {
    return;
  }

  const player =
    await dbGet(
      env,
      `SELECT *
       FROM players
       WHERE telegram_id = ?`,
      telegramId
    );

  if (!player) return;

  const muted = await dbGet(
    env,
    `SELECT *
     FROM mutes
     WHERE player_id = ?
     AND active = 1
     AND (
       expires_at IS NULL
       OR expires_at > datetime('now')
     )
     LIMIT 1`,
    player.id
  );

  if (muted) {
    await sendMessage(
      message.chat.id,
      `🔇 Вы не можете отправлять сообщения.

Причина:
${escapeHtml(
        muted.reason || "Без причины"
      )}`,
      env
    );

    return;
  }

  /*
   * Здесь можно подключить полноценный
   * глобальный чат с отдельной группой/каналом.
   *
   * Сам Worker не должен бесконтрольно
   * пересылать сообщения всем пользователям.
   */
}

/* ============================================================
   BAN
   ============================================================ */

async function banPlayer(
  env,
  employee,
  playerId,
  reason,
  silent = false
) {
  if (
    !employee ||
    Number(employee.rank) < 1
  ) {
    return false;
  }

  if (!reason) {
    return false;
  }

  await dbRun(
    env,
    `INSERT INTO bans
     (
       player_id,
       employee_id,
       reason,
       silent,
       active,
       created_at
     )
     VALUES (?, ?, ?, ?, 1, datetime('now'))`,
    playerId,
    employee.id,
    reason,
    silent ? 1 : 0
  );

  await registerAdminAction(
    env,
    employee,
    silent
      ? "silent_ban"
      : "ban",
    playerId
  );

  return true;
}

/* ============================================================
   MUTE
   ============================================================ */

async function mutePlayer(
  env,
  employee,
  playerId,
  reason,
  expiresAt = null
) {
  if (
    !employee ||
    Number(employee.rank) < 1
  ) {
    return false;
  }

  if (!reason) {
    return false;
  }

  await dbRun(
    env,
    `INSERT INTO mutes
     (
       player_id,
       employee_id,
       reason,
       expires_at,
       active,
       created_at
     )
     VALUES (?, ?, ?, ?, 1, datetime('now'))`,
    playerId,
    employee.id,
    reason,
    expiresAt
  );

  await registerAdminAction(
    env,
    employee,
    "mute",
    playerId
  );

  return true;
}

/* ============================================================
   BALANCE
   ============================================================ */

async function addBalance(
  env,
  employee,
  playerId,
  amount
) {
  if (
    !employee ||
    Number(employee.rank) < 5
  ) {
    return false;
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return false;
  }

  await dbRun(
    env,
    `UPDATE players
     SET balance_rub =
       balance_rub + ?
     WHERE id = ?`,
    amount,
    playerId
  );

  await dbRun(
    env,
    `INSERT INTO balance_history
     (
       player_id,
       employee_id,
       amount,
       type,
       created_at
     )
     VALUES (?, ?, ?, 'manual_add', datetime('now'))`,
    playerId,
    employee.id,
    amount
  );

  await registerAdminAction(
    env,
    employee,
    "balance_add",
    playerId,
    false
  );

  return true;
}

/* ============================================================
   UC
   ============================================================ */

async function addUC(
  env,
  employee,
  playerId,
  amount
) {
  if (
    !employee ||
    Number(employee.rank) < 5
  ) {
    return false;
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return false;
  }

  await dbRun(
    env,
    `UPDATE players
     SET uc = uc + ?
     WHERE id = ?`,
    amount,
    playerId
  );

  await dbRun(
    env,
    `INSERT INTO uc_history
     (
       player_id,
       employee_id,
       amount,
       type,
       created_at
     )
     VALUES (?, ?, ?, 'manual_add', datetime('now'))`,
    playerId,
    employee.id,
    amount
  );

  await registerAdminAction(
    env,
    employee,
    "uc_add",
    playerId,
    false
  );

  return true;
}

/* ============================================================
   WHEEL
   ============================================================ */

async function toggleWheelTestMode(
  env,
  employee,
  chatId
) {
  if (
    Number(employee.rank) < 5
  ) {
    return;
  }

  const settings =
    await getWheelSettings(env);

  const next =
    !settings.test_mode;

  await setWheelSetting(
    env,
    "test_mode",
    next ? 1 : 0
  );

  await createWheelLog(
    env,
    employee,
    next
      ? "Включён тестовый режим"
      : "Выключен тестовый режим"
  );

  await sendMessage(
    chatId,
    next
      ? "🧪 Тестовый режим колеса <b>ВКЛЮЧЕН</b>."
      : "🧪 Тестовый режим колеса <b>ВЫКЛЮЧЕН</b>.",
    env
  );
}

async function setWheelSetting(
  env,
  key,
  value
) {
  await dbRun(
    env,
    `INSERT INTO wheel_settings
     (key, value)
     VALUES (?, ?)
     ON CONFLICT(key)
     DO UPDATE SET
       value = excluded.value`,
    key,
    String(value)
  );
}

async function createWheelLog(
  env,
  employee,
  action
) {
  await dbRun(
    env,
    `INSERT INTO wheel_logs
     (
       employee_id,
       action,
       created_at
     )
     VALUES (?, ?, datetime('now'))`,
    employee.id,
    action
  );

  await registerAdminAction(
    env,
    employee,
    "wheel_change",
    null,
    false
  );
}

/* ============================================================
   EMERGENCY
   ============================================================ */

async function emergencyToggle(
  data,
  employee,
  chatId,
  env
) {
  if (
    Number(employee.rank) < 5
  ) {
    return;
  }

  const map = {
    emergency_wheel: "wheel",
    emergency_deposit: "deposit",
    emergency_withdraw: "withdraw",
    emergency_promos: "promos"
  };

  const key = map[data];

  if (!key) return;

  const current =
    await dbGet(
      env,
      `SELECT value
       FROM emergency_settings
       WHERE key = ?`,
      key
    );

  const next =
    current?.value === "1"
      ? "0"
      : "1";

  await dbRun(
    env,
    `INSERT INTO emergency_settings
     (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key)
     DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    key,
    next
  );

  await registerAdminAction(
    env,
    employee,
    `emergency_${key}`,
    null,
    false
  );

  await sendMessage(
    chatId,
    `${next === "1" ? "🚨" : "✅"} ${
      key
    }: ${
      next === "1"
        ? "отключено"
        : "включено"
    }.`,
    env
  );
}

/* ============================================================
   DAILY BONUS
   ============================================================ */

async function claimDailyBonus(
  env,
  playerId
) {
  const today =
    getMoscowDate();

  const already =
    await dbGet(
      env,
      `SELECT id
       FROM daily_bonuses
       WHERE player_id = ?
       AND bonus_date = ?`,
      playerId,
      today
    );

  if (already) {
    return {
      ok: false,
      message:
        "❌ Ежедневный бонус уже получен сегодня."
    };
  }

  const amount = 1;

  await dbRun(
    env,
    `INSERT INTO daily_bonuses
     (
       player_id,
       bonus_date,
       reward_uc
     )
     VALUES (?, ?, ?)`,
    playerId,
    today,
    amount
  );

  await dbRun(
    env,
    `UPDATE players
     SET uc = uc + ?
     WHERE id = ?`,
    amount,
    playerId
  );

  return {
    ok: true,
    reward: amount
  };
}

/* ============================================================
   PROMOCODE
   ============================================================ */

async function usePromoCode(
  env,
  playerId,
  code
) {
  const promo =
    await dbGet(
      env,
      `SELECT *
       FROM promo_codes
       WHERE code = ?
       AND enabled = 1
       LIMIT 1`,
      String(code).toUpperCase()
    );

  if (!promo) {
    return {
      ok: false,
      message: "❌ Промокод не найден."
    };
  }

  const used =
    await dbGet(
      env,
      `SELECT id
       FROM promo_uses
       WHERE promo_id = ?
       AND player_id = ?
       LIMIT 1`,
      promo.id,
      playerId
    );

  if (used) {
    return {
      ok: false,
      message:
        "❌ Вы уже использовали этот промокод."
    };
  }

  await dbRun(
    env,
    `INSERT INTO promo_uses
     (
       promo_id,
       player_id,
       created_at
     )
     VALUES (?, ?, datetime('now'))`,
    promo.id,
    playerId
  );

  /*
   * Промокод даёт одно бесплатное вращение.
   */
  await dbRun(
    env,
    `UPDATE players
     SET free_spins = free_spins + 1
     WHERE id = ?`,
    playerId
  );

  return {
    ok: true,
    message:
      "🎁 Вам начислено 1 бесплатное вращение."
  };
}

/* ============================================================
   DAILY ACTION COUNT
   ============================================================ */

async function getDailyActionCount(
  env,
  employeeId
) {
  const row =
    await dbGet(
      env,
      `SELECT COUNT(*) AS count
       FROM employee_actions
       WHERE employee_id = ?
       AND date(created_at) =
           date('now')`,
      employeeId
    );

  return Number(
    row?.count || 0
  );
}

/* ============================================================
   GLOBAL SEARCH
   ============================================================ */

async function globalSearch(
  env,
  query
) {
  const q =
    String(query || "")
      .trim();

  if (!q) return [];

  const players =
    await dbAll(
      env,
      `SELECT *
       FROM players
       WHERE telegram_id = ?
       OR id = ?
       LIMIT 20`,
      q,
      q
    );

  const employees =
    await dbAll(
      env,
      `SELECT *
       FROM employees
       WHERE login LIKE ?
       LIMIT 20`,
      `%${q}%`
    );

  const requests =
    await dbAll(
      env,
      `SELECT *
       FROM deposit_requests
       WHERE id = ?
       LIMIT 20`,
      q
    );

  return {
    players,
    employees,
    requests
  };
}

/* ============================================================
   PLAYER CARD
   ============================================================ */

async function getPlayerCard(
  env,
  playerId
) {
  const player =
    await dbGet(
      env,
      `SELECT *
       FROM players
       WHERE id = ?`,
      playerId
    );

  if (!player) return null;

  const spins =
    await dbAll(
      env,
      `SELECT *
       FROM wheel_spins
       WHERE player_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      playerId
    );

  const bans =
    await dbAll(
      env,
      `SELECT *
       FROM bans
       WHERE player_id = ?
       ORDER BY id DESC`,
      playerId
    );

  const mutes =
    await dbAll(
      env,
      `SELECT *
       FROM mutes
       WHERE player_id = ?
       ORDER BY id DESC`,
      playerId
    );

  const requests =
    await dbAll(
      env,
      `SELECT *
       FROM deposit_requests
       WHERE player_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      playerId
    );

  const actions =
    await dbAll(
      env,
      `SELECT *
       FROM admin_logs
       WHERE target_id = ?
       ORDER BY id DESC
       LIMIT 50`,
      playerId
    );

  return {
    player,
    spins,
    bans,
    mutes,
    requests,
    actions
  };
}

/* ============================================================
   BACKUP
   ============================================================ */

async function createBackup(
  env,
  employee
) {
  if (
    Number(employee.rank) < 5
  ) {
    return false;
  }

  const tables = [
    "players",
    "employees",
    "panel_sessions",
    "admin_logs",
    "rank_logs",
    "employee_actions",
    "complaints",
    "deposit_requests",
    "withdrawals",
    "wheel_settings",
    "wheel_rewards",
    "wheel_logs",
    "promo_codes",
    "promo_uses",
    "daily_bonuses",
    "system_settings",
    "emergency_settings"
  ];

  const backup = {};

  for (const table of tables) {
    try {
      backup[table] =
        await dbAll(
          env,
          `SELECT * FROM ${table}`
        );
    } catch {
      backup[table] = [];
    }
  }

  await dbRun(
    env,
    `INSERT INTO backups
     (
       employee_id,
       data,
       created_at
     )
     VALUES (?, ?, datetime('now'))`,
    employee.id,
    JSON.stringify(backup)
  );

  return true;
}

/* ============================================================
   MOSCOW TIME
   ============================================================ */

function getMoscowDate() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone:
        CONFIG.moscowTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());
}

function formatTime(value) {
  if (!value) return "--:--";

  try {
    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        timeZone:
          CONFIG.moscowTimezone,
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(new Date(value));
  } catch {
    return "--:--";
  }
}

function formatMinutes(minutes) {
  const m =
    Math.max(
      0,
      Number(minutes || 0)
    );

  const hours =
    Math.floor(m / 60);

  const mins =
    m % 60;

  return `${hours}ч ${mins}м`;
}

/* ============================================================
   HTML ESCAPE
   ============================================================ */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
