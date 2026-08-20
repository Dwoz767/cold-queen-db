/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 1/5
   Cloudflare Worker + Telegram Bot API + D1
   Версия под фактическую схему D1
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
  botName: "DOXACHKAA UC",
  moscowTimezone: "Europe/Moscow",
  pointsPerAction: 15,
  dailyActivityBonus: 100,
  requiredActivityMinutes: 240,
  minWithdrawUC: 3000
};

const SECRET_RANK_MIN = 5;

/* ============================================================
   WORKER ENTRY
   ============================================================ */

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method !== "POST") {
        return new Response(
          "DOXACHKAA UC Worker OK",
          { status: 200 }
        );
      }

      const update = await request.json();

      ctx.waitUntil(
        handleUpdate(update, env)
          .catch(error => {
            console.error(
              "HANDLE UPDATE ERROR:",
              error
            );
          })
      );

      return new Response("OK", {
        status: 200
      });
    } catch (error) {
      console.error(
        "WORKER ERROR:",
        error
      );

      return new Response("OK", {
        status: 200
      });
    }
  }
};

/* ============================================================
   TELEGRAM API
   ============================================================ */

async function telegram(
  method,
  data,
  env
) {
  if (!env.BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is not configured"
    );
  }

  const url =
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const result =
    await response.json();

  if (!result.ok) {
    console.error(
      "TELEGRAM API ERROR:",
      method,
      result
    );
  }

  return result;
}

async function sendMessage(
  chatId,
  text,
  env,
  extra = {}
) {
  return telegram(
    "sendMessage",
    {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra
    },
    env
  );
}

async function editMessage(
  chatId,
  messageId,
  text,
  env,
  extra = {}
) {
  return telegram(
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      ...extra
    },
    env
  );
}

async function answerCallback(
  callbackId,
  env,
  text = ""
) {
  return telegram(
    "answerCallbackQuery",
    {
      callback_query_id: callbackId,
      text
    },
    env
  );
}

/* ============================================================
   DATABASE HELPERS
   ============================================================ */

async function dbGet(
  env,
  sql,
  ...params
) {
  return env.DB
    .prepare(sql)
    .bind(...params)
    .first();
}

async function dbAll(
  env,
  sql,
  ...params
) {
  const result =
    await env.DB
      .prepare(sql)
      .bind(...params)
      .all();

  return result.results || [];
}

async function dbRun(
  env,
  sql,
  ...params
) {
  return env.DB
    .prepare(sql)
    .bind(...params)
    .run();
}

/* ============================================================
   UPDATE ROUTER
   ============================================================ */

async function handleUpdate(
  update,
  env
) {
  if (update.callback_query) {
    await handleCallback(
      update.callback_query,
      env
    );

    return;
  }

  if (update.message) {
    await handleMessage(
      update.message,
      env
    );
  }
}

/* ============================================================
   MESSAGE
   ============================================================ */

async function handleMessage(
  message,
  env
) {
  if (!message.from) {
    return;
  }

  const telegramId =
    String(message.from.id);

  const chatId =
    message.chat.id;

  const text =
    String(message.text || "")
      .trim();

  await ensureUser(
    env,
    telegramId,
    message.from
  );

  if (!text) {
    return;
  }

  if (text.startsWith("/")) {
    await handleCommand(
      message,
      env
    );

    return;
  }

  await handleGlobalChat(
    message,
    env
  );
}

/* ============================================================
   USERS
   ============================================================ */

async function ensureUser(
  env,
  telegramId,
  tgUser
) {
  const existing =
    await dbGet(
      env,
      `SELECT *
       FROM users
       WHERE telegram_id = ?
       LIMIT 1`,
      telegramId
    );

  if (existing) {
    await dbRun(
      env,
      `UPDATE users
       SET username = ?,
           first_name = ?,
           last_name = ?,
           updated_at = datetime('now')
       WHERE telegram_id = ?`,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      telegramId
    );

    return dbGet(
      env,
      `SELECT *
       FROM users
       WHERE telegram_id = ?
       LIMIT 1`,
      telegramId
    );
  }

  await dbRun(
    env,
    `INSERT INTO users
     (
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
       panel_session,
       panel_status
     )
     VALUES (
       ?, ?, ?, ?, 'player', 0, 0, 0,
       datetime('now'),
       datetime('now'),
       0,
       'offline'
     )`,
    telegramId,
    tgUser.username || null,
    tgUser.first_name || null,
    tgUser.last_name || null
  );

  return dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    telegramId
  );
}

/* ============================================================
   EMPLOYEE / ADMIN
   ============================================================ */

async function getEmployee(
  env,
  telegramId
) {
  return dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     AND (
       role = 'admin'
       OR role = 'moderator'
     )
     LIMIT 1`,
    String(telegramId)
  );
}

async function getUserByTelegramId(
  env,
  telegramId
) {
  return dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(telegramId)
  );
}

async function getUserById(
  env,
  id
) {
  return dbGet(
    env,
    `SELECT *
     FROM users
     WHERE id = ?
     LIMIT 1`,
    id
  );
}

function isAdminRank(rank) {
  return (
    Number(rank) >= 1 &&
    Number(rank) <= 6
  );
}

function isSecretRank(rank) {
  return (
    Number(rank) >=
    SECRET_RANK_MIN
  );
}

function hasRank(
  employee,
  requiredRank
) {
  if (!employee) {
    return false;
  }

  return (
    Number(employee.rank) >=
    Number(requiredRank)
  );
}

function isModerator(
  employee
) {
  return (
    employee &&
    employee.role === "moderator"
  );
}

/* ============================================================
   PANEL SESSION
   ============================================================ */

async function getPanelSession(
  env,
  telegramId
) {
  const user =
    await getUserByTelegramId(
      env,
      telegramId
    );

  if (!user) {
    return null;
  }

  if (
    Number(user.panel_session) !== 1
  ) {
    return null;
  }

  return {
    active: true,
    panel_type:
      user.role === "moderator"
        ? "moderator"
        : "admin",
    user_id: user.id
  };
}

async function createPanelSession(
  env,
  employee,
  type
) {
  await dbRun(
    env,
    `UPDATE users
     SET panel_session = 1,
         panel_status = 'online',
         panel_last_activity = datetime('now'),
         last_login_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    employee.id
  );

  await registerBotAudit(
    env,
    employee.telegram_id,
    "panel_login",
    employee.telegram_id,
    type
  );
}

async function closePanelSession(
  env,
  telegramId
) {
  await dbRun(
    env,
    `UPDATE users
     SET panel_session = 0,
         panel_status = 'offline',
         panel_last_activity = datetime('now'),
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    String(telegramId)
  );
}

async function touchPanelSession(
  env,
  telegramId
) {
  await dbRun(
    env,
    `UPDATE users
     SET panel_last_activity = datetime('now'),
         panel_status = 'online',
         updated_at = datetime('now')
     WHERE telegram_id = ?
     AND panel_session = 1`,
    String(telegramId)
  );
  }
     /* ============================================================
   AUDIT
   ============================================================ */

async function registerAdminAction(
  env,
  employee,
  action,
  targetTelegramId = null,
  amount = 0,
  details = null
) {
  await dbRun(
    env,
    `INSERT INTO admin_actions
     (
       admin_telegram_id,
       action,
       target_telegram_id,
       amount,
       details,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    employee.telegram_id,
    action,
    targetTelegramId,
    Number(amount || 0),
    details
  );

  await registerBotAudit(
    env,
    employee.telegram_id,
    action,
    targetTelegramId,
    details
  );
}

async function registerBotAudit(
  env,
  actorTelegramId,
  action,
  targetTelegramId = null,
  details = null
) {
  await dbRun(
    env,
    `INSERT INTO bot_audit
     (
       bot_name,
       actor_telegram_id,
       action,
       target_telegram_id,
       details,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    CONFIG.botName,
    actorTelegramId || null,
    action,
    targetTelegramId || null,
    details == null
      ? null
      : String(details)
  );
}

/* ============================================================
   COMMAND ROUTER
   ============================================================ */

async function handleCommand(
  message,
  env
) {
  const telegramId =
    String(message.from.id);

  const chatId =
    message.chat.id;

  const parts =
    String(message.text || "")
      .trim()
      .split(/\s+/);

  const command =
    parts[0]
      .split("@")[0]
      .toLowerCase();

  const args =
    parts.slice(1);

  switch (command) {
    case "/start":
      await cmdStart(
        chatId,
        env
      );
      break;

    case "/alogin":
      await cmdALogin(
        chatId,
        telegramId,
        env
      );
      break;

    case "/hlogin":
      await cmdHLogin(
        chatId,
        telegramId,
        env
      );
      break;

    case "/admin":
    case "/panel":
      await cmdPanel(
        chatId,
        telegramId,
        env
      );
      break;

    case "/admins":
      await cmdAdmins(
        chatId,
        telegramId,
        env
      );
      break;

    case "/moder":
      await cmdModer(
        chatId,
        env
      );
      break;

    case "/rank":
      await cmdRank(
        chatId,
        telegramId,
        args,
        env
      );
      break;

    case "/unrank":
      await cmdUnrank(
        chatId,
        telegramId,
        args,
        env
      );
      break;

    case "/logout":
      await closePanelSession(
        env,
        telegramId
      );

      await sendMessage(
        chatId,
        "🔒 Сессия панели закрыта.",
        env
      );
      break;

    case "/balance":
      await cmdBalance(
        chatId,
        telegramId,
        env
      );
      break;

    case "/uc":
      await cmdUC(
        chatId,
        telegramId,
        env
      );
      break;

    case "/wheel":
      await cmdWheel(
        chatId,
        telegramId,
        env
      );
      break;

    default:
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

async function cmdStart(
  chatId,
  env
) {
  await sendMessage(
    chatId,
    `<b>🎮 DOXACHKAA UC</b>

Добро пожаловать!

Доступные функции:

💰 <code>/balance</code> — баланс
💎 <code>/uc</code> — UC
🎡 <code>/wheel</code> — колесо

Для сотрудников:

🔐 <code>/alogin</code> — админ-панель
🛡 <code>/hlogin</code> — панель модератора`,
    env
  );
}

/* ============================================================
   BASIC PLAYER COMMANDS
   ============================================================ */

async function cmdBalance(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUserByTelegramId(
      env,
      telegramId
    );

  if (!user) {
    return;
  }

  await sendMessage(
    chatId,
    `<b>💰 ВАШ БАЛАНС</b>

Баланс: <b>${formatMoney(
      user.balance
    )} ₽</b>
💎 UC: <b>${Number(
      user.uc || 0
    )}</b>`,
    env
  );
}

async function cmdUC(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUserByTelegramId(
      env,
      telegramId
    );

  if (!user) {
    return;
  }

  await sendMessage(
    chatId,
    `💎 Ваш баланс UC: <b>${Number(
      user.uc || 0
    )}</b>`,
    env
  );
}

/* ============================================================
   ADMIN LOGIN
   ============================================================ */

async function cmdALogin(
  chatId,
  telegramId,
  env
) {
  const employee =
    await getEmployee(
      env,
      telegramId
    );

  if (
    !employee ||
    !isAdminRank(employee.rank)
  ) {
    await sendMessage(
      chatId,
      "❌ У вас нет доступа к админ-панели.",
      env
    );

    return;
  }

  const session =
    await getPanelSession(
      env,
      telegramId
    );

  if (session?.active) {
    await sendMessage(
      chatId,
      `<b>🔐 АДМИН-ПАНЕЛЬ</b>

Вы уже авторизованы.`,
      env,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛠 ОТКРЫТЬ ПАНЕЛЬ",
                callback_data:
                  "admin_panel"
              }
            ],
            [
              {
                text: "🚪 ВЫЙТИ",
                callback_data:
                  "panel_logout"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  /*
   * В текущей схеме users есть
   * admin_login_temp и
   * admin_password_hash.
   *
   * Для совместимости используем
   * временное состояние прямо в users.
   */
  await dbRun(
    env,
    `UPDATE users
     SET admin_login_temp = 'waiting'
     WHERE telegram_id = ?`,
    telegramId
  );

  await sendMessage(
    chatId,
    `<b>🔐 АДМИН-ПАНЕЛЬ</b>

Введите логин и пароль одним сообщением:

<code>логин пароль</code>`,
    env
  );
}
/* ============================================================
   MODERATOR LOGIN
   ============================================================ */

async function cmdHLogin(
  chatId,
  telegramId,
  env
) {
  const employee =
    await getEmployee(
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

  const session =
    await getPanelSession(
      env,
      telegramId
    );

  if (session?.active) {
    await sendMessage(
      chatId,
      `<b>🛡 ПАНЕЛЬ МОДЕРАТОРА</b>

Вы уже авторизованы.`,
      env,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🛡 ОТКРЫТЬ ПАНЕЛЬ",
                callback_data:
                  "moder_panel"
              }
            ],
            [
              {
                text: "🚪 ВЫЙТИ",
                callback_data:
                  "panel_logout"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE users
     SET admin_login_temp = 'waiting_moderator'
     WHERE telegram_id = ?`,
    telegramId
  );

  await sendMessage(
    chatId,
    `<b>🛡 ПАНЕЛЬ МОДЕРАТОРА</b>

Введите:

<code>логин пароль</code>`,
    env
  );
}
/* ============================================================
   AUTH INPUT
   ============================================================ */

async function processAuthInput(
  message,
  env
) {
  const telegramId =
    String(message.from.id);

  const user =
    await getUserByTelegramId(
      env,
      telegramId
    );

  if (!user) {
    return false;
  }

  const state =
    String(
      user.admin_login_temp || ""
    );

  if (
    state !== "waiting" &&
    state !== "waiting_moderator"
  ) {
    return false;
  }

  const values =
    String(message.text || "")
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

  const employee =
    await dbGet(
      env,
      `SELECT *
       FROM users
       WHERE admin_login = ?
       AND (
         role = 'admin'
         OR role = 'moderator'
       )
       LIMIT 1`,
      login
    );

  if (!employee) {
    await sendMessage(
      message.chat.id,
      "❌ Неверный логин или пароль.",
      env
    );

    return true;
  }

  /*
   * В базе поле называется
   * admin_password_hash.
   *
   * Поддерживаем два варианта:
   *
   * 1. plain text — для старой конфигурации;
   * 2. SHA-256 hash — для нормальной конфигурации.
   */
  const passwordOk =
    await verifyPassword(
      password,
      employee.admin_password_hash
    );

  if (
    !passwordOk ||
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
    state === "waiting" &&
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
    state === "waiting_moderator" &&
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
    state === "waiting"
      ? "admin"
      : "moderator"
  );

  await dbRun(
    env,
    `UPDATE users
     SET admin_login_temp = NULL,
         last_login_at = datetime('now'),
         panel_last_activity = datetime('now'),
         panel_status = 'online',
         panel_session = 1,
         updated_at = datetime('now')
     WHERE id = ?`,
    employee.id
  );

  if (
    state === "waiting"
  ) {
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
   PASSWORD VERIFY
   ============================================================ */

async function verifyPassword(
  password,
  stored
) {
  if (
    stored === null ||
    stored === undefined
  ) {
    return false;
  }

  const value =
    String(stored);

  /*
   * Совместимость со старым вариантом,
   * где пароль мог храниться напрямую.
   */
  if (value === String(password)) {
    return true;
  }

  /*
   * SHA-256.
   */
  try {
    const data =
      new TextEncoder().encode(
        String(password)
      );

    const hash =
      await crypto.subtle.digest(
        "SHA-256",
        data
      );

    const bytes =
      Array.from(
        new Uint8Array(hash)
      );

    const hex =
      bytes
        .map(
          byte =>
            byte
              .toString(16)
              .padStart(2, "0")
        )
        .join("");

    return hex === value;
  } catch {
    return false;
  }
}

/* ============================================================
   PANEL
   ============================================================ */

async function cmdPanel(
  chatId,
  telegramId,
  env
) {
  const employee =
    await getEmployee(
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

  const session =
    await getPanelSession(
      env,
      telegramId
    );

  if (
    !session ||
    !session.active
  ) {
    await sendMessage(
      chatId,
      "❌ Сначала авторизуйтесь.",
      env
    );

    return;
  }

  await touchPanelSession(
    env,
    telegramId
  );

  if (
    session.panel_type ===
    "moderator"
  ) {
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
   ADMIN PANEL
   ============================================================ */

async function sendAdminPanel(
  chatId,
  employee,
  env
) {
  const rank =
    Number(employee.rank);

  const roleName =
    RANKS[rank]?.name ||
    employee.role;

  const keyboard = [];

  keyboard.push([
    {
      text: "👤 ПОЛЬЗОВАТЕЛИ",
      callback_data:
        "users_list"
    },
    {
      text: "🔎 ПОИСК",
      callback_data:
        "global_search"
    }
  ]);

  keyboard.push([
    {
      text: "💰 БАЛАНС",
      callback_data:
        "balance_menu"
    },
    {
      text: "💎 UC",
      callback_data:
        "uc_menu"
    }
  ]);

  keyboard.push([
    {
      text: "🎡 КОЛЕСО",
      callback_data:
        "wheel_menu"
    },
    {
      text: "📊 СТАТИСТИКА",
      callback_data:
        "admin_stats"
    }
  ]);

  keyboard.push([
    {
      text: "📝 ЖАЛОБЫ",
      callback_data:
        "moder_complaints"
    },
    {
      text: "🛡 МОДЕРАЦИЯ",
      callback_data:
        "moder_list"
    }
  ]);

  keyboard.push([
    {
      text: "🎫 ПОДДЕРЖКА",
      callback_data:
        "support_menu"
    },
    {
      text: "💳 ПЛАТЕЖИ",
      callback_data:
        "payments_menu"
    }
  ]);

  if (rank >= 5) {
    keyboard.push([
      {
        text: "⚙️ НАСТРОЙКИ",
        callback_data:
          "settings_menu"
      },
      {
        text: "🚨 EMERGENCY",
        callback_data:
          "emergency_menu"
      }
    ]);

    keyboard.push([
      {
        text: "👮 СОТРУДНИКИ",
        callback_data:
          "employees_menu"
      }
    ]);
  }

  keyboard.push([
    {
      text: "📋 МОЯ АКТИВНОСТЬ",
      callback_data:
        "my_activity"
    }
  ]);

  keyboard.push([
    {
      text: "🚪 ВЫЙТИ",
      callback_data:
        "panel_logout"
    }
  ]);

  await sendMessage(
    chatId,
    `<b>🛠 АДМИН-ПАНЕЛЬ</b>

👤 ${escapeHtml(
      employee.first_name ||
      employee.username ||
      "Сотрудник"
    )}

🎖 Ранг: <b>${rank}</b>
🏷 ${escapeHtml(
      roleName
    )}

💰 Баланс: <b>${formatMoney(
      employee.balance
    )} ₽</b>
💎 UC: <b>${Number(
      employee.uc || 0
    )}</b>

Выберите раздел:`,
    env,
    {
      reply_markup: {
        inline_keyboard:
          keyboard
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
      employee.first_name ||
      employee.username ||
      "Модератор"
    )}

🏷 Роль: <b>Модератор</b>

Выберите раздел:`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📝 ЖАЛОБЫ",
              callback_data:
                "moder_complaints"
            }
          ],
          [
            {
              text: "👥 ПОЛЬЗОВАТЕЛИ",
              callback_data:
                "users_list"
            }
          ],
          [
            {
              text: "📊 МОЯ АКТИВНОСТЬ",
              callback_data:
                "my_activity"
            }
          ],
          [
            {
              text: "🚪 ВЫЙТИ",
              callback_data:
                "panel_logout"
            }
          ]
        ]
      }
    }
  );
}

/* ============================================================
   ADMINS
   ============================================================ */

async function cmdAdmins(
  chatId,
  telegramId,
  env
) {
  const employee =
    await getEmployee(
      env,
      telegramId
    );

  if (
    !employee ||
    !isAdminRank(employee.rank)
  ) {
    await sendMessage(
      chatId,
      "❌ Доступ запрещён.",
      env
    );

    return;
  }

  const admins =
    await dbAll(
      env,
      `SELECT
         id,
         telegram_id,
         username,
         first_name,
         last_name,
         role,
         rank,
         panel_status,
         last_login_at
       FROM users
       WHERE role = 'admin'
       ORDER BY rank DESC, id ASC`
    );

  if (!admins.length) {
    await sendMessage(
      chatId,
      "👮 Администраторов нет.",
      env
    );

    return;
  }

  let text =
    "<b>👮 АДМИНИСТРАТОРЫ</b>\n\n";

  for (const admin of admins) {
    const rank =
      Number(admin.rank);

    const status =
      admin.panel_status === "online"
        ? "🟢"
        : "⚪";

    text +=
      `${status} <b>${escapeHtml(
        admin.first_name ||
        admin.username ||
        admin.telegram_id
      )}</b>\n` +
      `ID: <code>${escapeHtml(
        admin.telegram_id
      )}</code>\n` +
      `Ранг: <b>${rank}</b> — ${escapeHtml(
        RANKS[rank]?.name ||
        "Неизвестно"
      )}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   MODERATORS
   ============================================================ */

async function cmdModer(
  chatId,
  env
) {
  const moderators =
    await dbAll(
      env,
      `SELECT
         id,
         telegram_id,
         username,
         first_name,
         last_name,
         role,
         rank,
         panel_status
       FROM users
       WHERE role = 'moderator'
       ORDER BY id ASC`
    );

  if (!moderators.length) {
    await sendMessage(
      chatId,
      "🛡 Модераторов нет.",
      env
    );

    return;
  }

  let text =
    "<b>🛡 МОДЕРАТОРЫ</b>\n\n";

  for (
    const moderator
    of moderators
  ) {
    const status =
      moderator.panel_status ===
      "online"
        ? "🟢"
        : "⚪";

    text +=
      `${status} <b>${escapeHtml(
        moderator.first_name ||
        moderator.username ||
        moderator.telegram_id
      )}</b>\n` +
      `ID: <code>${escapeHtml(
        moderator.telegram_id
      )}</code>\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
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
  const employee =
    await getEmployee(
      env,
      telegramId
    );

  if (
    !employee ||
    !isAdminRank(employee.rank)
  ) {
    await sendMessage(
      chatId,
      "❌ Доступ запрещён.",
      env
    );

    return;
  }

  if (args.length < 2) {
    await sendMessage(
      chatId,
      "❌ Формат:\n<code>/rank TelegramID Ранг</code>",
      env
    );

    return;
  }

  const targetTelegramId =
    String(args[0]);

  const newRank =
    Number(args[1]);

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

  if (
    newRank >= Number(employee.rank) &&
    Number(employee.rank) !== 6
  ) {
    await sendMessage(
      chatId,
      "❌ Нельзя выдать ранг равный или выше своего.",
      env
    );

    return;
  }

  const target =
    await getUserByTelegramId(
      env,
      targetTelegramId
    );

  if (!target) {
    await sendMessage(
      chatId,
      "❌ Пользователь не найден.",
      env
    );

    return;
  }

  const oldRank =
    Number(target.rank);

  await dbRun(
    env,
    `UPDATE users
     SET rank = ?,
         role = CASE
           WHEN ? = 0 THEN 'player'
           ELSE 'admin'
         END,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    newRank,
    newRank,
    targetTelegramId
  );

  await dbRun(
    env,
    `INSERT INTO role_change_requests
     (
       target_telegram_id,
       requested_role,
       requested_rank,
       requested_by,
       reason,
       status,
       reviewed_by,
       reviewed_at,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, 'approved', ?, datetime('now'), datetime('now'))`,
    targetTelegramId,
    newRank === 0
      ? "player"
      : "admin",
    newRank,
    telegramId,
    `Изменение ранга ${oldRank} -> ${newRank}`,
    telegramId
  );

  await registerAdminAction(
    env,
    employee,
    "rank_change",
    targetTelegramId,
    0,
    `${oldRank} -> ${newRank}`
  );

  await sendMessage(
    chatId,
    `✅ Ранг пользователя <code>${escapeHtml(
      targetTelegramId
    )}</code> изменён: <b>${newRank}</b>.`,
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
  const employee =
    await getEmployee(
      env,
      telegramId
    );

  if (
    !employee ||
    Number(employee.rank) < 5
  ) {
    await sendMessage(
      chatId,
      "❌ Для снятия ранга требуется 5+ ранг.",
      env
    );

    return;
  }

  if (!args[0]) {
    await sendMessage(
      chatId,
      "❌ Формат:\n<code>/unrank TelegramID</code>",
      env
    );

    return;
  }

  const targetTelegramId =
    String(args[0]);

  const target =
    await getUserByTelegramId(
      env,
      targetTelegramId
    );

  if (!target) {
    await sendMessage(
      chatId,
      "❌ Пользователь не найден.",
      env
    );

    return;
  }

  const oldRank =
    Number(target.rank);

  if (
    oldRank >=
    Number(employee.rank) &&
    Number(employee.rank) !== 6
  ) {
    await sendMessage(
      chatId,
      "❌ Нельзя снять ранг с сотрудника равного или выше себя.",
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE users
     SET rank = 0,
         role = 'player',
         panel_session = 0,
         panel_status = 'offline',
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    targetTelegramId
  );

  await registerAdminAction(
    env,
    employee,
    "unrank",
    targetTelegramId,
    0,
    `Снят ранг ${oldRank}`
  );

  await sendMessage(
    chatId,
    `✅ Ранг пользователя <code>${escapeHtml(
      targetTelegramId
    )}</code> снят.`,
    env
  );
}
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 3/5
   PANEL + ADMIN ACTIONS + WHEEL
   ============================================================ */

/* ============================================================
   ADMIN ACTION LOG
   ============================================================ */

async function logAdminAction(
  env,
  adminTelegramId,
  action,
  targetTelegramId = null,
  amount = 0,
  details = null
) {
  await dbRun(
    env,
    `INSERT INTO admin_actions
     (
       admin_telegram_id,
       action,
       target_telegram_id,
       amount,
       details
     )
     VALUES (?, ?, ?, ?, ?)`,
    String(adminTelegramId),
    action,
    targetTelegramId !== null
      ? String(targetTelegramId)
      : null,
    Number(amount || 0),
    details
  );
}

/* ============================================================
   BALANCE AUDIT
   ============================================================ */

async function changeUserBalance(
  env,
  adminTelegramId,
  targetTelegramId,
  amount,
  reason
) {
  const target = await dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(targetTelegramId)
  );

  if (!target) {
    return {
      ok: false,
      message: "❌ Пользователь не найден."
    };
  }

  const value = Number(amount);

  if (!Number.isFinite(value) || value === 0) {
    return {
      ok: false,
      message: "❌ Некорректная сумма."
    };
  }

  const oldBalance =
    Number(target.balance || 0);

  const newBalance =
    oldBalance + value;

  if (newBalance < 0) {
    return {
      ok: false,
      message:
        "❌ Баланс не может быть отрицательным."
    };
  }

  await dbRun(
    env,
    `UPDATE users
     SET balance = ?,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    newBalance,
    String(targetTelegramId)
  );

  await dbRun(
    env,
    `INSERT INTO balance_audit
     (
       actor_telegram_id,
       target_telegram_id,
       old_balance,
       new_balance,
       amount,
       reason,
       reference_type,
       reference_id
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    String(adminTelegramId),
    String(targetTelegramId),
    oldBalance,
    newBalance,
    value,
    reason || "manual",
    "admin",
    null
  );

  await dbRun(
    env,
    `INSERT INTO transactions
     (
       telegram_id,
       type,
       amount,
       description
     )
     VALUES (?, ?, ?, ?)`,
    String(targetTelegramId),
    value > 0
      ? "admin_balance_add"
      : "admin_balance_remove",
    value,
    reason || "Изменение баланса администратором"
  );

  await logAdminAction(
    env,
    adminTelegramId,
    value > 0
      ? "balance_add"
      : "balance_remove",
    targetTelegramId,
    value,
    reason || null
  );

  return {
    ok: true,
    oldBalance,
    newBalance,
    amount: value
  };
}

/* ============================================================
   UC AUDIT
   ============================================================ */

async function changeUserUC(
  env,
  adminTelegramId,
  targetTelegramId,
  amount,
  reason
) {
  const target = await dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(targetTelegramId)
  );

  if (!target) {
    return {
      ok: false,
      message: "❌ Пользователь не найден."
    };
  }

  const value = Number(amount);

  if (!Number.isInteger(value) || value === 0) {
    return {
      ok: false,
      message:
        "❌ Количество UC должно быть целым числом."
    };
  }

  const oldUC =
    Number(target.uc || 0);

  const newUC =
    oldUC + value;

  if (newUC < 0) {
    return {
      ok: false,
      message:
        "❌ Количество UC не может быть отрицательным."
    };
  }

  await dbRun(
    env,
    `UPDATE users
     SET uc = ?,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    newUC,
    String(targetTelegramId)
  );

  await dbRun(
    env,
    `INSERT INTO uc_audit
     (
       actor_telegram_id,
       target_telegram_id,
       old_uc,
       new_uc,
       amount,
       reason
     )
     VALUES (?, ?, ?, ?, ?, ?)`,
    String(adminTelegramId),
    String(targetTelegramId),
    oldUC,
    newUC,
    value,
    reason || "manual"
  );

  await dbRun(
    env,
    `INSERT INTO transactions
     (
       telegram_id,
       type,
       amount,
       description
     )
     VALUES (?, ?, ?, ?)`,
    String(targetTelegramId),
    value > 0
      ? "admin_uc_add"
      : "admin_uc_remove",
    value,
    reason || "Изменение UC администратором"
  );

  await logAdminAction(
    env,
    adminTelegramId,
    value > 0
      ? "uc_add"
      : "uc_remove",
    targetTelegramId,
    value,
    reason || null
  );

  return {
    ok: true,
    oldUC,
    newUC,
    amount: value
  };
}

/* ============================================================
   USER CARD
   ============================================================ */

async function getUserCard(
  env,
  telegramId
) {
  const user = await dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(telegramId)
  );

  if (!user) {
    return null;
  }

  const transactions =
    await dbAll(
      env,
      `SELECT *
       FROM transactions
       WHERE telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      String(telegramId)
    );

  const balanceAudit =
    await dbAll(
      env,
      `SELECT *
       FROM balance_audit
       WHERE target_telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      String(telegramId)
    );

  const ucAudit =
    await dbAll(
      env,
      `SELECT *
       FROM uc_audit
       WHERE target_telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      String(telegramId)
    );

  const bans =
    await dbAll(
      env,
      `SELECT *
       FROM bans
       WHERE telegram_id = ?
       ORDER BY created_at DESC`,
      String(telegramId)
    );

  const silentBans =
    await dbAll(
      env,
      `SELECT *
       FROM silent_bans
       WHERE telegram_id = ?
       ORDER BY id DESC`,
      String(telegramId)
    );

  const spins =
    await dbAll(
      env,
      `SELECT *
       FROM spin_history
       WHERE telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      String(telegramId)
    );

  return {
    user,
    transactions,
    balanceAudit,
    ucAudit,
    bans,
    silentBans,
    spins
  };
}

/* ============================================================
   SEARCH USER
   ============================================================ */

async function searchUser(
  env,
  query
) {
  const value =
    String(query || "").trim();

  if (!value) {
    return [];
  }

  return dbAll(
    env,
    `SELECT
       id,
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
       panel_status
     FROM users
     WHERE telegram_id = ?
        OR username LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
        OR id = ?
     ORDER BY id DESC
     LIMIT 20`,
    value,
    `%${value}%`,
    `%${value}%`,
    `%${value}%`,
    value
  );
}
/* ============================================================
   BAN USER
   ============================================================ */

async function banUser(
  env,
  adminTelegramId,
  targetTelegramId,
  reason,
  expiresAt = null
) {
  if (!reason) {
    return {
      ok: false,
      message: "❌ Укажите причину блокировки."
    };
  }

  const target = await dbGet(
    env,
    `SELECT telegram_id
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(targetTelegramId)
  );

  if (!target) {
    return {
      ok: false,
      message: "❌ Пользователь не найден."
    };
  }

  await dbRun(
    env,
    `INSERT OR REPLACE INTO bans
     (
       telegram_id,
       reason,
       banned_by,
       expires_at
     )
     VALUES (?, ?, ?, ?)`,
    String(targetTelegramId),
    reason,
    String(adminTelegramId),
    expiresAt
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "ban",
    targetTelegramId,
    0,
    reason
  );

  return {
    ok: true
  };
}

/* ============================================================
   SILENT BAN
   ============================================================ */

async function silentBanUser(
  env,
  adminTelegramId,
  targetTelegramId,
  reason,
  expiresAt = null
) {
  if (!reason) {
    return {
      ok: false,
      message: "❌ Укажите причину."
    };
  }

  const target = await dbGet(
    env,
    `SELECT telegram_id
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(targetTelegramId)
  );

  if (!target) {
    return {
      ok: false,
      message: "❌ Пользователь не найден."
    };
  }

  await dbRun(
    env,
    `INSERT INTO silent_bans
     (
       telegram_id,
       banned_by,
       reason,
       expires_at,
       active
     )
     VALUES (?, ?, ?, ?, 1)`,
    String(targetTelegramId),
    String(adminTelegramId),
    reason,
    expiresAt
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "silent_ban",
    targetTelegramId,
    0,
    reason
  );

  return {
    ok: true
  };
}

/* ============================================================
   UNBAN
   ============================================================ */

async function unbanUser(
  env,
  adminTelegramId,
  targetTelegramId
) {
  await dbRun(
    env,
    `DELETE FROM bans
     WHERE telegram_id = ?`,
    String(targetTelegramId)
  );

  await dbRun(
    env,
    `UPDATE silent_bans
     SET active = 0
     WHERE telegram_id = ?
     AND active = 1`,
    String(targetTelegramId)
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "unban",
    targetTelegramId
  );

  return {
    ok: true
  };
}

/* ============================================================
   WHEEL SETTINGS
   ============================================================ */

async function getWheelSettings(env) {
  const row = await dbGet(
    env,
    `SELECT *
     FROM wheel_settings
     ORDER BY id ASC
     LIMIT 1`
  );

  if (row) {
    return row;
  }

  await dbRun(
    env,
    `INSERT INTO wheel_settings
     (
       spin_cost,
       currency,
       enabled
     )
     VALUES (0, 'RUB', 1)`
  );

  return dbGet(
    env,
    `SELECT *
     FROM wheel_settings
     ORDER BY id DESC
     LIMIT 1`
  );
}

/* ============================================================
   SET WHEEL PRICE
   ============================================================ */

async function setWheelPrice(
  env,
  adminTelegramId,
  price
) {
  const value = Number(price);

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return {
      ok: false,
      message: "❌ Некорректная цена."
    };
  }

  const settings =
    await getWheelSettings(env);

  await dbRun(
    env,
    `UPDATE wheel_settings
     SET spin_cost = ?,
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    value,
    String(adminTelegramId),
    settings.id
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "wheel_price",
    null,
    value,
    "Изменена цена вращения"
  );

  return {
    ok: true,
    price: value
  };
}

/* ============================================================
   ENABLE / DISABLE WHEEL
   ============================================================ */

async function setWheelEnabled(
  env,
  adminTelegramId,
  enabled
) {
  const settings =
    await getWheelSettings(env);

  const value =
    enabled ? 1 : 0;

  await dbRun(
    env,
    `UPDATE wheel_settings
     SET enabled = ?,
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    value,
    String(adminTelegramId),
    settings.id
  );

  await logAdminAction(
    env,
    adminTelegramId,
    value
      ? "wheel_enable"
      : "wheel_disable"
  );

  return {
    ok: true,
    enabled: value
  };
}

/* ============================================================
   WHEEL PRIZES
   ============================================================ */

async function getWheelPrizes(env) {
  return dbAll(
    env,
    `SELECT *
     FROM wheel_prizes
     WHERE enabled = 1
     ORDER BY sort_order ASC, id ASC`
  );
}
/* ============================================================
   UPDATE PRIZE
   ============================================================ */

async function updateWheelPrize(
  env,
  adminTelegramId,
  prizeId,
  name,
  prizeType,
  prizeValue,
  probability
) {
  const id =
    Number(prizeId);

  const value =
    Number(prizeValue);

  const chance =
    Number(probability);

  if (!Number.isInteger(id)) {
    return {
      ok: false,
      message: "❌ Некорректный ID награды."
    };
  }

  if (!name) {
    return {
      ok: false,
      message: "❌ Название награды пустое."
    };
  }

  if (!Number.isFinite(value) || value < 0) {
    return {
      ok: false,
      message: "❌ Некорректное значение награды."
    };
  }

  if (
    !Number.isFinite(chance) ||
    chance < 0 ||
    chance > 100
  ) {
    return {
      ok: false,
      message:
        "❌ Вероятность должна быть от 0 до 100."
    };
  }

  const prize =
    await dbGet(
      env,
      `SELECT id
       FROM wheel_prizes
       WHERE id = ?`,
      id
    );

  if (!prize) {
    return {
      ok: false,
      message: "❌ Награда не найдена."
    };
  }

  await dbRun(
    env,
    `UPDATE wheel_prizes
     SET name = ?,
         prize_type = ?,
         prize_value = ?,
         probability = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    name,
    prizeType || "uc",
    value,
    chance,
    id
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "wheel_prize_update",
    null,
    value,
    `prize_id=${id}; probability=${chance}`
  );

  return {
    ok: true
  };
}

/* ============================================================
   ADD WHEEL PRIZE
   ============================================================ */

async function addWheelPrize(
  env,
  adminTelegramId,
  name,
  prizeType,
  prizeValue,
  probability
) {
  const value =
    Number(prizeValue);

  const chance =
    Number(probability);

  if (!name) {
    return {
      ok: false,
      message: "❌ Укажите название."
    };
  }

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    return {
      ok: false,
      message: "❌ Некорректное значение."
    };
  }

  if (
    !Number.isFinite(chance) ||
    chance < 0 ||
    chance > 100
  ) {
    return {
      ok: false,
      message:
        "❌ Вероятность должна быть от 0 до 100."
    };
  }

  const maxOrder =
    await dbGet(
      env,
      `SELECT COALESCE(
         MAX(sort_order),
         0
       ) AS value
       FROM wheel_prizes`
    );

  const sortOrder =
    Number(maxOrder?.value || 0) + 1;

  await dbRun(
    env,
    `INSERT INTO wheel_prizes
     (
       name,
       prize_type,
       prize_value,
       probability,
       enabled,
       sort_order
     )
     VALUES (?, ?, ?, ?, 1, ?)`,
    name,
    prizeType || "uc",
    value,
    chance,
    sortOrder
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "wheel_prize_add",
    null,
    value,
    `probability=${chance}`
  );

  return {
    ok: true
  };
}

/* ============================================================
   DISABLE WHEEL PRIZE
   ============================================================ */

async function disableWheelPrize(
  env,
  adminTelegramId,
  prizeId
) {
  const id =
    Number(prizeId);

  if (!Number.isInteger(id)) {
    return {
      ok: false,
      message: "❌ Некорректный ID."
    };
  }

  await dbRun(
    env,
    `UPDATE wheel_prizes
     SET enabled = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    id
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "wheel_prize_disable",
    null,
    0,
    `prize_id=${id}`
  );

  return {
    ok: true
  };
}

/* ============================================================
   SHOW WHEEL
   ============================================================ */

async function showWheelAdmin(
  chatId,
  telegramId,
  env
) {
  const settings =
    await getWheelSettings(env);

  const prizes =
    await getWheelPrizes(env);

  let text =
    "<b>🎡 УПРАВЛЕНИЕ КОЛЕСОМ</b>\n\n";

  text +=
    `Статус: ${
      Number(settings.enabled)
        ? "🟢 включено"
        : "🔴 выключено"
    }\n`;

  text +=
    `Цена: <b>${settings.spin_cost}</b> ${escapeHtml(
      settings.currency || "RUB"
    )}\n\n`;

  text += "<b>🎁 Награды:</b>\n";

  if (!prizes.length) {
    text += "Нет активных наград.\n";
  }

  for (const prize of prizes) {
    text +=
      `\n#${prize.id} — ${escapeHtml(
        prize.name
      )}\n`;

    text +=
      `Тип: ${escapeHtml(
        prize.prize_type
      )}\n`;

    text +=
      `Значение: ${prize.prize_value}\n`;

    text +=
      `Шанс: ${prize.probability}%\n`;
  }

  await sendMessage(
    chatId,
    text,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💰 ИЗМЕНИТЬ ЦЕНУ",
              callback_data:
                "wheel_set_price"
            }
          ],
          [
            {
              text:
                Number(settings.enabled)
                  ? "🔴 ВЫКЛЮЧИТЬ"
                  : "🟢 ВКЛЮЧИТЬ",
              callback_data:
                Number(settings.enabled)
                  ? "wheel_disable"
                  : "wheel_enable"
            }
          ],
          [
            {
              text: "🎁 ОБНОВИТЬ НАГРАДЫ",
              callback_data:
                "wheel_refresh"
            }
          ],
          [
            {
              text: "⬅️ НАЗАД",
              callback_data:
                "admin_panel"
            }
          ]
        ]
      }
    }
  );
}
/* ============================================================
   COMPLAINTS
   ============================================================ */

async function getPendingComplaints(env) {
  return dbAll(
    env,
    `SELECT *
     FROM complaints
     WHERE status = 'pending'
     ORDER BY id ASC
     LIMIT 20`
  );
}

async function showComplaints(
  chatId,
  adminTelegramId,
  env
) {
  const employee =
    await getEmployeeByTelegramId(
      env,
      adminTelegramId
    );

  if (
    !employee ||
    Number(employee.rank || 0) < 1
  ) {
    return;
  }

  const complaints =
    await getPendingComplaints(env);

  let text =
    "<b>📋 ЖАЛОБЫ</b>\n\n";

  if (!complaints.length) {
    text += "Активных жалоб нет.";
  } else {
    for (const complaint of complaints) {
      text +=
        `<b>#${complaint.id}</b> ` +
        `${escapeHtml(
          complaint.target_role
        )}\n`;

      text +=
        `От: <code>${escapeHtml(
          complaint.reporter_telegram_id
        )}</code>\n`;

      text +=
        `На: <code>${escapeHtml(
          complaint.target_telegram_id
        )}</code>\n`;

      text +=
        `${escapeHtml(
          complaint.complaint_text
        )}\n\n`;
    }
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   EMPLOYEE LOOKUP
   ============================================================ */

async function getEmployeeByTelegramId(
  env,
  telegramId
) {
  return dbGet(
    env,
    `SELECT
       u.*,
       ar.role AS admin_role
     FROM users u
     LEFT JOIN admin_roles ar
       ON ar.telegram_id = u.telegram_id
     WHERE u.telegram_id = ?
     LIMIT 1`,
    String(telegramId)
  );
}

/* ============================================================
   ROLE SETTINGS
   ============================================================ */

async function getRoleSettings(env) {
  return dbAll(
    env,
    `SELECT *
     FROM role_settings
     ORDER BY rank ASC`
  );
}

async function getRankPermissions(env) {
  return dbAll(
    env,
    `SELECT *
     FROM rank_permissions
     ORDER BY rank ASC`
  );
}

/* ============================================================
   SYSTEM SETTINGS
   ============================================================ */

async function getSystemSetting(
  env,
  key,
  fallback = null
) {
  const row =
    await dbGet(
      env,
      `SELECT value
       FROM system_settings
       WHERE key = ?
       LIMIT 1`,
      String(key)
    );

  return row
    ? row.value
    : fallback;
}

async function setSystemSetting(
  env,
  adminTelegramId,
  key,
  value
) {
  await dbRun(
    env,
    `INSERT INTO system_settings
     (
       key,
       value,
       updated_by,
       updated_at
     )
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key)
     DO UPDATE SET
       value = excluded.value,
       updated_by = excluded.updated_by,
       updated_at = CURRENT_TIMESTAMP`,
    String(key),
    String(value),
    String(adminTelegramId)
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "system_setting",
    null,
    0,
    `${key}=${value}`
  );
}

/* ============================================================
   MAINTENANCE
   ============================================================ */

async function setMaintenance(
  env,
  adminTelegramId,
  enabled
) {
  const value =
    enabled ? "1" : "0";

  await setSystemSetting(
    env,
    adminTelegramId,
    "maintenance",
    value
  );

  return {
    ok: true,
    enabled: value === "1"
  };
}

async function isMaintenanceEnabled(env) {
  const value =
    await getSystemSetting(
      env,
      "maintenance",
      "0"
    );

  return String(value) === "1";
}

/* ============================================================
   ADMIN LIST
   ============================================================ */

async function getAdmins(env) {
  return dbAll(
    env,
    `SELECT
       u.telegram_id,
       u.username,
       u.first_name,
       u.last_name,
       u.role,
       u.rank,
       u.panel_status,
       ar.role AS admin_role
     FROM users u
     LEFT JOIN admin_roles ar
       ON ar.telegram_id = u.telegram_id
     WHERE u.rank > 0
        OR ar.telegram_id IS NOT NULL
     ORDER BY u.rank DESC, u.id ASC`
  );
}

/* ============================================================
   MODERATORS
   ============================================================ */

async function getModerators(env) {
  return dbAll(
    env,
    `SELECT
       u.telegram_id,
       u.username,
       u.first_name,
       u.last_name,
       u.role,
       u.rank,
       u.panel_status
     FROM users u
     WHERE u.role = 'moderator'
     ORDER BY u.id ASC`
  );
}

/* ============================================================
   UPDATE PANEL STATUS
   ============================================================ */

async function setPanelStatus(
  env,
  telegramId,
  status
) {
  await dbRun(
    env,
    `UPDATE users
     SET panel_status = ?,
         panel_last_activity = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE telegram_id = ?`,
    String(status),
    String(telegramId)
  );
}

/* ============================================================
   ACTIVITY
   ============================================================ */

async function getAdminActionsToday(
  env,
  telegramId
) {
  const row =
    await dbGet(
      env,
      `SELECT COUNT(*) AS count
       FROM admin_actions
       WHERE admin_telegram_id = ?
       AND date(created_at) = date('now')`,
      String(telegramId)
    );

  return Number(row?.count || 0);
}

/* ============================================================
   PANEL HOME
   ============================================================ */

/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 4/5
   CALLBACKS + INPUT + MODERATION + SUPPORT
   ============================================================ */

/* ============================================================
   CALLBACK HANDLER
   ============================================================ */

async function handlePanelCallback(
  data,
  chatId,
  telegramId,
  env
) {
  const employee =
    await getEmployeeByTelegramId(
      env,
      telegramId
    );

  if (!employee) {
    await answerCallback(
      arguments[0]?.id || "",
      env,
      "❌ Доступ запрещён."
    ).catch(() => {});

    return;
  }

  const rank =
    Number(employee.rank || 0);

  if (data === "panel_logout") {
    await setPanelStatus(
      env,
      telegramId,
      "offline"
    );

    await logAdminAction(
      env,
      telegramId,
      "panel_logout"
    );

    await sendMessage(
      chatId,
      "🔒 Панель закрыта.",
      env
    );

    return;
  }

  if (data === "admin_panel") {
    if (rank < 1) return;

    await setPanelStatus(
      env,
      telegramId,
      "online"
    );

    await sendAdminPanel(
      chatId,
      employee,
      env
    );

    return;
  }

  if (data === "moder_panel") {
    if (
      employee.role !== "moderator" &&
      rank < 1
    ) {
      return;
    }

    await setPanelStatus(
      env,
      telegramId,
      "online"
    );

    await sendModeratorPanel(
      chatId,
      employee,
      env
    );

    return;
  }

  if (data === "admins_list") {
    if (rank < 1) return;

    const admins =
      await getAdmins(env);

    let text =
      "<b>👮 АДМИНИСТРАТОРЫ</b>\n\n";

    if (!admins.length) {
      text += "Администраторов нет.";
    }

    for (const admin of admins) {
      text +=
        `👤 <b>${escapeHtml(
          admin.first_name ||
          admin.username ||
          "Без имени"
        )}</b>\n`;

      text +=
        `ID: <code>${escapeHtml(
          admin.telegram_id
        )}</code>\n`;

      text +=
        `Ранг: <b>${Number(
          admin.rank || 0
        )}</b>\n`;

      text +=
        `Статус: ${
          admin.panel_status === "online"
            ? "🟢 онлайн"
            : "⚫ офлайн"
        }\n\n`;
    }

    await sendMessage(
      chatId,
      text,
      env,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ НАЗАД",
                callback_data:
                  "admin_panel"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  if (data === "moder_list") {
    if (rank < 1) return;

    const moderators =
      await getModerators(env);

    let text =
      "<b>🛡 МОДЕРАТОРЫ</b>\n\n";

    if (!moderators.length) {
      text += "Модераторов нет.";
    }

    for (const moderator of moderators) {
      text +=
        `🛡 <b>${escapeHtml(
          moderator.first_name ||
          moderator.username ||
          "Без имени"
        )}</b>\n`;

      text +=
        `ID: <code>${escapeHtml(
          moderator.telegram_id
        )}</code>\n`;

      text +=
        `Статус: ${
          moderator.panel_status ===
          "online"
            ? "🟢 онлайн"
            : "⚫ офлайн"
        }\n\n`;
    }

    await sendMessage(
      chatId,
      text,
      env,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ НАЗАД",
                callback_data:
                  "admin_panel"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  if (data === "my_activity") {
    if (rank < 1) return;

    const count =
      await getAdminActionsToday(
        env,
        telegramId
      );

    const history =
      await getAdminActionHistory(
        env,
        telegramId,
        10
      );

    let text =
      "<b>📊 МОЯ АКТИВНОСТЬ</b>\n\n";

    text +=
      `Действий сегодня: <b>${count}</b>\n\n`;

    text +=
      "<b>Последние действия:</b>\n";

    if (!history.length) {
      text += "Нет действий.";
    } else {
      for (const row of history) {
        text +=
          `• ${formatTime(
            row.created_at
          )} — ${escapeHtml(
            row.action
          )}\n`;
      }
    }

    await sendMessage(
      chatId,
      text,
      env
    );

    return;
  }

  /* ==========================================================
     MAINTENANCE
     ========================================================== */

  if (data === "maintenance_on") {
    if (rank < 5) return;

    await setMaintenance(
      env,
      telegramId,
      true
    );

    await sendMessage(
      chatId,
      "🔴 Технические работы <b>ВКЛЮЧЕНЫ</b>.",
      env
    );

    return;
  }

  if (data === "maintenance_off") {
    if (rank < 5) return;

    await setMaintenance(
      env,
      telegramId,
      false
    );

    await sendMessage(
      chatId,
      "🟢 Технические работы <b>ВЫКЛЮЧЕНЫ</b>.",
      env
    );

    return;
  }

  /* ==========================================================
     WHEEL
     ========================================================== */

  if (data === "wheel_admin") {
    if (rank < 5) return;

    await showWheelAdmin(
      chatId,
      telegramId,
      env
    );

    return;
  }

  if (data === "wheel_enable") {
    if (rank < 5) return;

    await setWheelEnabled(
      env,
      telegramId,
      true
    );

    await sendMessage(
      chatId,
      "🎡 Колесо <b>ВКЛЮЧЕНО</b>.",
      env
    );

    return;
  }

  if (data === "wheel_disable") {
    if (rank < 5) return;

    await setWheelEnabled(
      env,
      telegramId,
      false
    );

    await sendMessage(
      chatId,
      "🎡 Колесо <b>ВЫКЛЮЧЕНО</b>.",
      env
    );

    return;
  }

  if (data === "wheel_set_price") {
    if (rank < 5) return;

    await requestPanelInput(
      env,
      telegramId,
      "wheel_price",
      chatId,
      "💰 Введите новую цену вращения в ₽:"
    );

    return;
  }

  if (data === "wheel_refresh") {
    if (rank < 5) return;

    await showWheelAdmin(
      chatId,
      telegramId,
      env
    );

    return;
  }

  /* ==========================================================
     SEARCH
     ========================================================== */

  if (data === "admin_search") {
    if (rank < 1) return;

    await requestPanelInput(
      env,
      telegramId,
      "user_search",
      chatId,
      "🔎 Введите Telegram ID, username или имя игрока:"
    );

    return;
  }

  /* ==========================================================
     COMPLAINTS
     ========================================================== */

  if (data === "moder_complaints") {
    if (rank < 1) return;

    await showComplaints(
      chatId,
      telegramId,
      env
    );

    return;
  }

  /* ==========================================================
     UNKNOWN CALLBACK
     ========================================================== */

  await sendMessage(
    chatId,
    "⚠️ Эта кнопка больше недоступна.",
    env
  );
}

/* ============================================================
   PANEL INPUT STATE
   ============================================================ */

async function requestPanelInput(
  env,
  telegramId,
  state,
  chatId,
  message
) {
  await setSystemSetting(
    env,
    telegramId,
    `panel_input:${telegramId}`,
    state
  );

  await sendMessage(
    chatId,
    message,
    env
  );
}

async function getPanelInputState(
  env,
  telegramId
) {
  return getSystemSetting(
    env,
    `panel_input:${telegramId}`,
    null
  );
}

async function clearPanelInputState(
  env,
  telegramId
) {
  await dbRun(
    env,
    `DELETE FROM system_settings
     WHERE key = ?`,
    `panel_input:${telegramId}`
  );
}

/* ============================================================
   TEXT STATE
   ============================================================ */

async function handleTextState(
  message,
  env
) {
  const telegramId =
    String(message.from.id);

  const state =
    await getPanelInputState(
      env,
      telegramId
    );

  if (!state) {
    return false;
  }

  const employee =
    await getEmployeeByTelegramId(
      env,
      telegramId
    );

  if (!employee) {
    await clearPanelInputState(
      env,
      telegramId
    );

    return true;
  }

  const value =
    String(message.text || "").trim();

  if (!value) {
   
    return true;
  }
  /* ==========================================================
     WHEEL PRICE
     ========================================================== */

  if (state === "wheel_price") {
    if (Number(employee.rank) < 5) {
      await clearPanelInputState(
        env,
        telegramId
      );

      return true;
    }

    const price =
      Number(value);

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      await sendMessage(
        message.chat.id,
        "❌ Введите корректную цену.",
        env
      );

      return true;
    }

    const result =
      await setWheelPrice(
        env,
        telegramId,
        price
      );

    await clearPanelInputState(
      env,
      telegramId
    );

    await sendMessage(
      message.chat.id,
      result.ok
        ? `✅ Цена вращения изменена на <b>${price}</b> ₽.`
        : result.message,
      env
    );

    return true;
  }

  /* ==========================================================
     USER SEARCH
     ========================================================== */

  if (state === "user_search") {
    if (Number(employee.rank) < 1) {
      await clearPanelInputState(
        env,
        telegramId
      );

      return true;
    }

    const users =
      await searchUser(
        env,
        value
      );

    await clearPanelInputState(
      env,
      telegramId
    );

    if (!users.length) {
      await sendMessage(
        message.chat.id,
        "❌ Пользователь не найден.",
        env
      );

      return true;
    }

    let text =
      "<b>🔎 РЕЗУЛЬТАТ ПОИСКА</b>\n\n";

    for (const user of users) {
      text +=
        `👤 <b>${escapeHtml(
          user.first_name ||
          user.username ||
          "Без имени"
        )}</b>\n`;

      text +=
        `ID: <code>${escapeHtml(
          user.telegram_id
        )}</code>\n`;

      text +=
        `Баланс: <b>${Number(
          user.balance || 0
        )}</b> ₽\n`;

      text +=
        `UC: <b>${Number(
          user.uc || 0
        )}</b>\n`;

      text +=
        `Роль: ${escapeHtml(
          user.role || "player"
        )}\n`;

      text +=
        `Ранг: ${Number(
          user.rank || 0
        )}\n\n`;
    }

    await sendMessage(
      message.chat.id,
      text,
      env
    );

    return true;
  }

  return false;
}

/* ============================================================
   MODERATOR PANEL
   ============================================================ */

/* ============================================================
   SUPPORT TICKETS
   ============================================================ */

async function createSupportTicket(
  env,
  telegramId,
  subject
) {
  const existing =
    await dbGet(
      env,
      `SELECT id
       FROM support_tickets
       WHERE player_telegram_id = ?
       AND status = 'open'
       ORDER BY id DESC
       LIMIT 1`,
      String(telegramId)
    );

  if (existing) {
    return {
      ok: false,
      ticketId: existing.id,
      message:
        "❌ У вас уже есть открытый тикет."
    };
  }

  const result =
    await dbRun(
      env,
      `INSERT INTO support_tickets
       (
         player_telegram_id,
         subject,
         status
       )
       VALUES (?, ?, 'open')`,
      String(telegramId),
      subject || "Без темы"
    );

  const ticket =
    await dbGet(
      env,
      `SELECT *
       FROM support_tickets
       WHERE player_telegram_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      String(telegramId)
    );

  return {
    ok: true,
    ticketId:
      ticket?.id ||
      result?.meta?.last_row_id ||
      null
  };
}

/* ============================================================
   SUPPORT MESSAGE
   ============================================================ */

async function addSupportMessage(
  env,
  ticketId,
  senderTelegramId,
  senderRole,
  message
) {
  const ticket =
    await dbGet(
      env,
      `SELECT id
       FROM support_tickets
       WHERE id = ?
       LIMIT 1`,
      Number(ticketId)
    );

  if (!ticket) {
    return {
      ok: false,
      message: "❌ Тикет не найден."
    };
  }

  await dbRun(
    env,
    `INSERT INTO support_messages
     (
       ticket_id,
       sender_telegram_id,
       sender_role,
       message
     )
     VALUES (?, ?, ?, ?)`,
    Number(ticketId),
    String(senderTelegramId),
    String(senderRole || "player"),
    String(message)
  );

  return {
    ok: true
  };
}

/* ============================================================
   CLOSE SUPPORT TICKET
   ============================================================ */

async function closeSupportTicket(
  env,
  ticketId,
  adminTelegramId
) {
  const ticket =
    await dbGet(
      env,
      `SELECT *
       FROM support_tickets
       WHERE id = ?
       LIMIT 1`,
      Number(ticketId)
    );

  if (!ticket) {
    return {
      ok: false,
      message: "❌ Тикет не найден."
    };
  }

  await dbRun(
    env,
    `UPDATE support_tickets
     SET status = 'closed',
         closed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    Number(ticketId)
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "support_close",
    ticket.player_telegram_id,
    0,
    `ticket_id=${ticketId}`
  );

  return {
    ok: true
  };
}

/* ============================================================
   GET TICKET
   ============================================================ */

async function getSupportTicket(
  env,
  ticketId
) {
  const ticket =
    await dbGet(
      env,
      `SELECT *
       FROM support_tickets
       WHERE id = ?
       LIMIT 1`,
      Number(ticketId)
    );

  if (!ticket) {
    return null;
  }

  const messages =
    await dbAll(
      env,
      `SELECT *
       FROM support_messages
       WHERE ticket_id = ?
       ORDER BY id ASC`,
      Number(ticketId)
    );

  return {
    ticket,
    messages
  };
}

/* ============================================================
   OPEN TICKETS
   ============================================================ */

async function getOpenTickets(env) {
  return dbAll(
    env,
    `SELECT *
     FROM support_tickets
     WHERE status = 'open'
     ORDER BY id ASC
     LIMIT 50`
  );
}

/* ============================================================
   PAYMENT REQUESTS
   ============================================================ */

async function getPendingPayments(env) {
  return dbAll(
    env,
    `SELECT *
     FROM payments
     WHERE status = 'pending'
     ORDER BY id ASC
     LIMIT 50`
  );
}

async function getPendingTopups(env) {
  return dbAll(
    env,
    `SELECT *
     FROM topup_requests
     WHERE status = 'pending'
     ORDER BY id ASC
     LIMIT 50`
  );
}

async function getPendingPayouts(env) {
  return dbAll(
    env,
    `SELECT *
     FROM payout_requests
     WHERE status = 'pending'
     ORDER BY id ASC
     LIMIT 50`
  );
}

/* ============================================================
   PAYMENT STATUS
   ============================================================ */

async function updatePaymentStatus(
  env,
  adminTelegramId,
  paymentId,
  status
) {
  const allowed = [
    "pending",
    "paid",
    "cancelled",
    "failed"
  ];

  if (!allowed.includes(status)) {
    return {
      ok: false,
      message: "❌ Некорректный статус."
    };
  }

  const payment =
    await dbGet(
      env,
      `SELECT *
       FROM payments
       WHERE id = ?
       LIMIT 1`,
      Number(paymentId)
    );

  if (!payment) {
    return {
      ok: false,
      message: "❌ Платёж не найден."
    };
  }

  await dbRun(
    env,
    `UPDATE payments
     SET status = ?,
         paid_at =
           CASE
             WHEN ? = 'paid'
             THEN CURRENT_TIMESTAMP
             ELSE paid_at
           END
     WHERE id = ?`,
    status,
    status,
    Number(paymentId)
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "payment_status",
    payment.telegram_id,
    payment.amount,
    `payment_id=${paymentId}; status=${status}`
  );

  return {
    ok: true
  };
}

/* ============================================================
   TOPUP STATUS
   ============================================================ */

async function updateTopupStatus(
  env,
  adminTelegramId,
  requestId,
  status
) {
  const allowed = [
    "pending",
    "approved",
    "rejected"
  ];

  if (!allowed.includes(status)) {
    return {
      ok: false,
      message: "❌ Некорректный статус."
    };
  }

  const request =
    await dbGet(
      env,
      `SELECT *
       FROM topup_requests
       WHERE id = ?
       LIMIT 1`,
      Number(requestId)
    );

  if (!request) {
    return {
      ok: false,
      message: "❌ Заявка не найдена."
    };
  }

  await dbRun(
    env,
    `UPDATE topup_requests
     SET status = ?
     WHERE id = ?`,
    status,
    Number(requestId)
  );

  await logAdminAction(
    env,
    adminTelegramId,
    "topup_status",
    request.telegram_id,
    request.amount,
    `request_id=${requestId}; status=${status}`
  );

  return {
    ok: true
  };
       }
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 5/5
   ФИНАЛЬНАЯ ЧАСТЬ
   ============================================================ */

/* ============================================================
   DAILY BONUS
   ============================================================ */

async function claimDailyBonus(
  env,
  telegramId
) {
  const user = await dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(telegramId)
  );

  if (!user) {
    return {
      ok: false,
      message: "❌ Пользователь не найден."
    };
  }

  const today = getMoscowDate();

  const existing = await dbGet(
    env,
    `SELECT id
     FROM transactions
     WHERE telegram_id = ?
     AND type = 'daily_bonus'
     AND date(created_at) = ?
     LIMIT 1`,
    String(telegramId),
    today
  );

  if (existing) {
    return {
      ok: false,
      message: "❌ Ежедневный бонус уже получен сегодня."
    };
  }

  const reward = 1;

  await dbRun(
    env,
    `UPDATE users
     SET uc = uc + ?,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    reward,
    String(telegramId)
  );

  await dbRun(
    env,
    `INSERT INTO transactions
     (
       telegram_id,
       type,
       amount,
       description,
       created_at
     )
     VALUES (?, 'daily_bonus', ?, ?, datetime('now'))`,
    String(telegramId),
    reward,
    "Ежедневный бонус"
  );

  return {
    ok: true,
    reward
  };
}


/* ============================================================
   PROMOCODE
   ============================================================ */

/*
 * В текущей D1-схеме отдельной таблицы промокодов нет.
 *
 * Поэтому здесь НЕ выполняется запрос к несуществующим
 * promo_codes / promo_uses.
 *
 * Когда таблицы промокодов будут добавлены,
 * сюда можно подключить полноценную систему.
 */

async function usePromoCode(
  env,
  telegramId,
  code
) {
  return {
    ok: false,
    message:
      "❌ Система промокодов пока не подключена к текущей базе."
  };
}
/* ============================================================
   DAILY ACTION COUNT
   ============================================================ */

async function getDailyActionCount(
  env,
  employeeId
) {
  /*
   * employee_actions отсутствует в текущей схеме.
   *
   * Используем admin_actions как журнал действий
   * сотрудников.
   */

  const employee = await getEmployeeById(
    env,
    employeeId
  );

  if (!employee) return 0;

  const row = await dbGet(
    env,
    `SELECT COUNT(*) AS count
     FROM admin_actions
     WHERE admin_telegram_id = ?
     AND date(created_at) = date('now')`,
    String(employee.telegram_id)
  );

  return Number(row?.count || 0);
}


/* ============================================================
   GLOBAL SEARCH
   ============================================================ */

async function globalSearch(
  env,
  query
) {
  const q = String(query || "").trim();

  if (!q) {
    return {
      users: [],
      payments: [],
      payouts: [],
      tickets: []
    };
  }

  const users = await dbAll(
    env,
    `SELECT
       id,
       telegram_id,
       username,
       first_name,
       last_name,
       role,
       rank,
       balance,
       uc,
       created_at
     FROM users
     WHERE telegram_id = ?
        OR username LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
     ORDER BY id DESC
     LIMIT 20`,
    q,
    `%${q}%`,
    `%${q}%`,
    `%${q}%`
  );

  let payments = [];

  if (/^\d+$/.test(q)) {
    payments = await dbAll(
      env,
      `SELECT *
       FROM payments
       WHERE id = ?
       LIMIT 20`,
      Number(q)
    );
  }

  let payouts = [];

  if (/^\d+$/.test(q)) {
    payouts = await dbAll(
      env,
      `SELECT *
       FROM payout_requests
       WHERE id = ?
       LIMIT 20`,
      Number(q)
    );
  }

  let tickets = [];

  if (/^\d+$/.test(q)) {
    tickets = await dbAll(
      env,
      `SELECT *
       FROM support_tickets
       WHERE id = ?
       LIMIT 20`,
      Number(q)
    );
  }

  return {
    users,
    payments,
    payouts,
    tickets
  };
}


/* ============================================================
   USER CARD
   ============================================================ */

async function getPlayerCard(
  env,
  telegramId
) {
  const user = await dbGet(
    env,
    `SELECT *
     FROM users
     WHERE telegram_id = ?
     LIMIT 1`,
    String(telegramId)
  );

  if (!user) return null;

  const transactions = await dbAll(
    env,
    `SELECT *
     FROM transactions
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT 30`,
    String(telegramId)
  );

  const payments = await dbAll(
    env,
    `SELECT *
     FROM payments
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT 20`,
    String(telegramId)
  );

  const payouts = await dbAll(
    env,
    `SELECT *
     FROM payout_requests
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT 20`,
    String(telegramId)
  );

  const bans = await dbAll(
    env,
    `SELECT *
     FROM bans
     WHERE telegram_id = ?
     ORDER BY created_at DESC`,
    String(telegramId)
  );

  const silentBans = await dbAll(
    env,
    `SELECT *
     FROM silent_bans
     WHERE telegram_id = ?
     ORDER BY created_at DESC`,
    String(telegramId)
  );

  const tickets = await dbAll(
    env,
    `SELECT *
     FROM support_tickets
     WHERE player_telegram_id = ?
     ORDER BY id DESC
     LIMIT 20`,
    String(telegramId)
  );

  const spins = await dbAll(
    env,
    `SELECT *
     FROM spin_history
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT 20`,
    String(telegramId)
  );

  return {
    user,
    transactions,
    payments,
    payouts,
    bans,
    silentBans,
    tickets,
    spins
  };
}


/* ============================================================
   ADMIN ACTION HISTORY
   ============================================================ */

async function getAdminActionHistory(
  env,
  telegramId,
  limit = 50
) {
  const safeLimit = Math.min(
    Math.max(
      Number(limit) || 50,
      1
    ),
    100
  );

  return dbAll(
    env,
    `SELECT *
     FROM admin_actions
     WHERE admin_telegram_id = ?
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    String(telegramId)
  );
}


/* ============================================================
   USER TRANSACTION HISTORY
   ============================================================ */

async function getUserTransactions(
  env,
  telegramId,
  limit = 50
) {
  const safeLimit = Math.min(
    Math.max(
      Number(limit) || 50,
      1
    ),
    100
  );

  return dbAll(
    env,
    `SELECT *
     FROM transactions
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    String(telegramId)
  );
}


/* ============================================================
   USER SPIN HISTORY
   ============================================================ */

async function getUserSpinHistory(
  env,
  telegramId,
  limit = 20
) {
  const safeLimit = Math.min(
    Math.max(
      Number(limit) || 20,
      1
    ),
    100
  );

  return dbAll(
    env,
    `SELECT *
     FROM spin_history
     WHERE telegram_id = ?
     ORDER BY id DESC
     LIMIT ${safeLimit}`,
    String(telegramId)
  );
}


/* ============================================================
   ACTIVE BAN CHECK
   ============================================================ */

async function getActiveBan(
  env,
  telegramId
) {
  return dbGet(
    env,
    `SELECT *
     FROM bans
     WHERE telegram_id = ?
     AND (
       expires_at IS NULL
       OR expires_at > datetime('now')
     )
     LIMIT 1`,
    String(telegramId)
  );
}


/* ============================================================
   ACTIVE SILENT BAN CHECK
   ============================================================ */

async function getActiveSilentBan(
  env,
  telegramId
) {
  return dbGet(
    env,
    `SELECT *
     FROM silent_bans
     WHERE telegram_id = ?
     AND active = 1
     AND (
       expires_at IS NULL
       OR expires_at > datetime('now')
     )
     ORDER BY id DESC
     LIMIT 1`,
    String(telegramId)
  );
}


/* ============================================================
   MAINTENANCE
   ============================================================ */

/* ============================================================
   MOSCOW DATE
   ============================================================ */

function getMoscowDate() {
  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: CONFIG.moscowTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(new Date());
}


/* ============================================================
   TIME FORMAT
   ============================================================ */

function formatTime(value) {
  if (!value) return "--:--";

  try {
    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        timeZone: CONFIG.moscowTimezone,
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(new Date(value));
  } catch {
    return "--:--";
  }
}


/* ============================================================
   MINUTES FORMAT
   ============================================================ */

function formatMinutes(minutes) {
  const total =
    Math.max(
      0,
      Number(minutes || 0)
    );

  const hours =
    Math.floor(total / 60);

  const mins =
    total % 60;

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


/* ============================================================
   SAFE NUMBER
   ============================================================ */

function safeNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


/* ============================================================
   SAFE INTEGER
   ============================================================ */

function safeInteger(value, fallback = 0) {
  const number =
    Number.parseInt(
      value,
      10
    );

  return Number.isFinite(number)
    ? number
    : fallback;
}


/* ============================================================
   FINAL
   ============================================================ */

console.log(
  "DOXACHKAA UC Worker loaded successfully."
);
       
