/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 1/4
   Cloudflare Worker + Telegram + D1
   ПОД ТЕКУЩУЮ СХЕМУ БАЗЫ
   ============================================================ */

const CONFIG = {
  moscowTimezone: "Europe/Moscow",
  minWithdrawUC: 3000,
  pointsPerAction: 15,
  requiredActivityMinutes: 240,
  dailyActivityBonus: 100,
  maxMessageLength: 4000
};

const RANKS = {
  0: {
    name: "Игрок",
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

const ADMIN_RANK_MIN = 1;
const SUPER_ADMIN_RANK = 5;

/* ============================================================
   WORKER
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
      text: String(text),
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
      text: String(text),
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
      text: String(text)
    },
    env
  );
}

/* ============================================================
   DATABASE
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
   UPDATE
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

  await ensureUser(
    env,
    telegramId,
    message.from
  );

  const text =
    String(message.text || "")
      .trim();

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

  /*
   * Сначала проверяем ввод пароля
   * и другие состояния панели.
   */
  if (
    await processAuthInput(
      message,
      env
    )
  ) {
    return;
  }

  if (
    await handleTextState(
      message,
      env
    )
  ) {
    return;
  }

  /*
   * Обычное сообщение.
   */
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
      tgUser.username || "",
      tgUser.first_name || "",
      tgUser.last_name || "",
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
     VALUES
     (
       ?, ?, ?, ?,
       'player',
       0,
       0,
       0,
       datetime('now'),
       datetime('now'),
       0,
       'offline'
     )`,
    telegramId,
    tgUser.username || "",
    tgUser.first_name || "",
    tgUser.last_name || ""
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
   USER / ADMIN
   ============================================================ */

async function getUser(
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

async function getAdminRole(
  env,
  telegramId
) {
  return dbGet(
    env,
    `SELECT *
     FROM admin_roles
     WHERE telegram_id = ?
     LIMIT 1`,
    String(telegramId)
  );
}

async function getEmployee(
  env,
  telegramId
) {
  const user =
    await getUser(
      env,
      telegramId
    );

  if (!user) {
    return null;
  }

  const adminRole =
    await getAdminRole(
      env,
      telegramId
    );

  if (
    Number(user.rank) >= ADMIN_RANK_MIN ||
    user.role === "moderator" ||
    adminRole
  ) {
    return {
      ...user,
      admin_role:
        adminRole?.role || null
    };
  }

  return null;
}

function isAdminRank(rank) {
  return (
    Number(rank) >= 1 &&
    Number(rank) <= 6
  );
}

function hasRank(
  employee,
  requiredRank
) {
  return (
    !!employee &&
    Number(employee.rank) >=
      Number(requiredRank)
  );
}

function isModerator(
  employee
) {
  return (
    !!employee &&
    String(employee.role)
      .toLowerCase() ===
      "moderator"
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
  details = ""
) {
  if (!employee) {
    return;
  }

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
     VALUES
     (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    String(employee.telegram_id),
    String(action),
    targetTelegramId
      ? String(targetTelegramId)
      : null,
    Number(amount || 0),
    details
      ? String(details)
      : null
  );
}

/* ============================================================
   BALANCE
   ============================================================ */

async function changeBalance(
  env,
  employee,
  targetTelegramId,
  amount,
  reason
) {
  if (
    !hasRank(
      employee,
      SUPER_ADMIN_RANK
    )
  ) {
    return {
      ok: false,
      message:
        "❌ Недостаточно прав."
    };
  }

  const user =
    await getUser(
      env,
      targetTelegramId
    );

  if (!user) {
    return {
      ok: false,
      message:
        "❌ Пользователь не найден."
    };
  }

  const oldBalance =
    Number(user.balance || 0);

  const newBalance =
    oldBalance + Number(amount);

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
       reference_id,
       created_at
     )
     VALUES
     (?, ?, ?, ?, ?, ?, 'manual', NULL, CURRENT_TIMESTAMP)`,
    String(employee.telegram_id),
    String(targetTelegramId),
    oldBalance,
    newBalance,
    Number(amount),
    String(reason)
  );

  await registerAdminAction(
    env,
    employee,
    "balance_change",
    targetTelegramId,
    amount,
    reason
  );

  return {
    ok: true,
    oldBalance,
    newBalance
  };
}

/* ============================================================
   UC
   ============================================================ */

async function changeUC(
  env,
  employee,
  targetTelegramId,
  amount,
  reason
) {
  if (
    !hasRank(
      employee,
      SUPER_ADMIN_RANK
    )
  ) {
    return {
      ok: false,
      message:
        "❌ Недостаточно прав."
    };
  }

  const user =
    await getUser(
      env,
      targetTelegramId
    );

  if (!user) {
    return {
      ok: false,
      message:
        "❌ Пользователь не найден."
    };
  }

  const oldUC =
    Number(user.uc || 0);

  const newUC =
    oldUC + Number(amount);

  if (newUC < 0) {
    return {
      ok: false,
      message:
        "❌ UC не может быть отрицательным."
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
       reason,
       created_at
     )
     VALUES
     (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    String(employee.telegram_id),
    String(targetTelegramId),
    oldUC,
    newUC,
    Number(amount),
    String(reason)
  );

  await registerAdminAction(
    env,
    employee,
    "uc_change",
    targetTelegramId,
    amount,
    reason
  );

  return {
    ok: true,
    oldUC,
    newUC
  };
     }
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 2/4
   ============================================================ */

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

    case "/profile":
      await cmdProfile(
        chatId,
        telegramId,
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

    case "/panel":
    case "/admin":
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
      await logoutPanel(
        chatId,
        telegramId,
        env
      );
      break;

    case "/complaints":
      await cmdComplaints(
        chatId,
        telegramId,
        env
      );
      break;

    case "/support":
      await cmdSupport(
        chatId,
        telegramId,
        args,
        env
      );
      break;

    case "/spin":
      await cmdSpin(
        chatId,
        telegramId,
        env
      );
      break;

    case "/daily":
      await cmdDaily(
        chatId,
        telegramId,
        env
      );
      break;

    case "/promo":
      await cmdPromo(
        chatId,
        telegramId,
        args,
        env
      );
      break;

    default:
      await sendMessage(
        chatId,
        "❓ Неизвестная команда.",
        env
      );
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

Доступные команды:

/profile — профиль
/balance — баланс
/spin — колесо
/daily — ежедневный бонус
/promo КОД — промокод
/support — поддержка

Для сотрудников:

/alogin — админ-панель
/hlogin — панель модератора`,
    env
  );
}

/* ============================================================
   PROFILE
   ============================================================ */

async function cmdProfile(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUser(
      env,
      telegramId
    );

  if (!user) {
    return;
  }

  const rank =
    RANKS[
      Number(user.rank)
    ] || RANKS[0];

  const roleText =
    user.role === "moderator"
      ? MODERATOR.name
      : rank.name;

  await sendMessage(
    chatId,
    `<b>👤 ПРОФИЛЬ</b>

Telegram ID:
<code>${escapeHtml(
      user.telegram_id
    )}</code>

Username:
@${escapeHtml(
      user.username || "нет"
    )}

Имя:
${escapeHtml(
      user.first_name || "—"
    )}

Роль:
<b>${escapeHtml(
      roleText
    )}</b>

Ранг:
<b>${Number(
      user.rank || 0
    )}</b>

💰 Баланс:
<b>${formatMoney(
      user.balance
    )} ₽</b>

💎 UC:
<b>${Number(
      user.uc || 0
    )}</b>`,
    env
  );
}

/* ============================================================
   BALANCE
   ============================================================ */

async function cmdBalance(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUser(
      env,
      telegramId
    );

  if (!user) {
    return;
  }

  await sendMessage(
    chatId,
    `<b>💰 ВАШ БАЛАНС</b>

Баланс:
<b>${formatMoney(
      user.balance
    )} ₽</b>

UC:
<b>${Number(
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
  const user =
    await getUser(
      env,
      telegramId
    );

  if (
    !user ||
    !isAdminRank(user.rank)
  ) {
    await sendMessage(
      chatId,
      "❌ У вас нет доступа к админ-панели.",
      env
    );

    return;
  }

  if (
    Number(user.panel_session) === 1
  ) {
    await sendAdminPanel(
      chatId,
      user,
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE users
     SET admin_login_temp = ?,
         panel_temp_state = 'login',
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    user.admin_login || "",
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
  const user =
    await getUser(
      env,
      telegramId
    );

  if (
    !user ||
    String(user.role)
      .toLowerCase() !==
      "moderator"
  ) {
    await sendMessage(
      chatId,
      "❌ У вас нет доступа к панели модератора.",
      env
    );

    return;
  }

  if (
    Number(user.panel_session) === 1
  ) {
    await sendModeratorPanel(
      chatId,
      user,
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE users
     SET panel_temp_state = 'login',
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    telegramId
  );

  await sendMessage(
    chatId,
    `<b>🛡 ПАНЕЛЬ МОДЕРАТОРА</b>

Введите логин и пароль:

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
    await getUser(
      env,
      telegramId
    );

  if (
    !user ||
    user.panel_temp_state !==
      "login"
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

  const login =
    values[0];

  const password =
    values.slice(1).join(" ");

  if (
    !user.admin_login ||
    login !==
      user.admin_login
  ) {
    await sendMessage(
      message.chat.id,
      "❌ Неверный логин или пароль.",
      env
    );

    return true;
  }

  const valid =
    await verifyPassword(
      password,
      user.admin_password_hash
    );

  if (!valid) {
    await sendMessage(
      message.chat.id,
      "❌ Неверный логин или пароль.",
      env
    );

    return true;
  }

  if (
    !isAdminRank(user.rank) &&
    user.role !== "moderator"
  ) {
    await sendMessage(
      message.chat.id,
      "❌ Недостаточно прав.",
      env
    );

    return true;
  }

  await dbRun(
    env,
    `UPDATE users
     SET panel_session = 1,
         panel_last_activity = datetime('now'),
         last_login_at = datetime('now'),
         panel_status = 'online',
         panel_temp_state = NULL,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    telegramId
  );

  await registerAdminAction(
    env,
    user,
    "panel_login",
    telegramId,
    0,
    "Успешный вход"
  );

  const fresh =
    await getUser(
      env,
      telegramId
    );

  if (
    fresh.role ===
      "moderator" &&
    !isAdminRank(fresh.rank)
  ) {
    await sendModeratorPanel(
      message.chat.id,
      fresh,
      env
    );
  } else {
    await sendAdminPanel(
      message.chat.id,
      fresh,
      env
    );
  }

  return true;
}

/* ============================================================
   PASSWORD
   ============================================================ */

async function verifyPassword(
  password,
  stored
) {
  if (!stored) {
    return false;
  }

  const value =
    String(stored);

  /*
   * Поддерживаем SHA-256 в формате:
   * sha256:HEX
   *
   * Также поддерживаем чистый HEX SHA-256.
   */
  const hash =
    await sha256(password);

  if (
    value.toLowerCase() ===
    `sha256:${hash}`.toLowerCase()
  ) {
    return true;
  }

  if (
    value.toLowerCase() ===
    hash.toLowerCase()
  ) {
    return true;
  }

  /*
   * Если в старой базе пароль временно
   * хранится открытым текстом.
   */
  return value ===
    String(password);
}

async function sha256(
  text
) {
  const data =
    new TextEncoder()
      .encode(String(text));

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map(
      b => b
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

/* ============================================================
   PANEL
   ============================================================ */

async function cmdPanel(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUser(
      env,
      telegramId
    );

  if (!user) {
    return;
  }

  if (
    Number(user.panel_session) !== 1
  ) {
    await sendMessage(
      chatId,
      "❌ Сначала авторизуйтесь через /alogin или /hlogin.",
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE users
     SET panel_last_activity = datetime('now'),
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    telegramId
  );

  if (
    user.role === "moderator" &&
    !isAdminRank(user.rank)
  ) {
    await sendModeratorPanel(
      chatId,
      user,
      env
    );
  } else {
    await sendAdminPanel(
      chatId,
      user,
      env
    );
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */

async function logoutPanel(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUser(
      env,
      telegramId
    );

  await dbRun(
    env,
    `UPDATE users
     SET panel_session = 0,
         panel_status = 'offline',
         panel_temp_state = NULL,
         panel_last_activity = datetime('now'),
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    telegramId
  );

  if (user) {
    await registerAdminAction(
      env,
      user,
      "panel_logout",
      telegramId,
      0,
      "Выход из панели"
    );
  }

  await sendMessage(
    chatId,
    "🔒 Сессия панели закрыта.",
    env
  );
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
    RANKS[
      Number(employee.rank)
    ] || RANKS[0];

  await sendMessage(
    chatId,
    `<b>🛠 АДМИН-ПАНЕЛЬ</b>

Сотрудник:
<b>${escapeHtml(
      employee.first_name ||
      employee.username ||
      employee.telegram_id
    )}</b>

Ранг:
<b>${Number(
      employee.rank
    )} — ${escapeHtml(
      rank.name
    )}</b>

Выберите раздел:`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "👥 АДМИНЫ",
              callback_data:
                "admins_list"
            },
            {
              text: "🛡 МОДЕРАТОРЫ",
              callback_data:
                "moder_list"
            }
          ],
          [
            {
              text: "🔎 ПОИСК",
              callback_data:
                "global_search"
            },
            {
              text: "📋 ЖАЛОБЫ",
              callback_data:
                "moder_complaints"
            }
          ],
          [
            {
              text: "🎡 КОЛЕСО",
              callback_data:
                "wheel_menu"
            },
            {
              text: "💰 БАЛАНС / UC",
              callback_data:
                "finance_menu"
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

Доступные действия:`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📋 ЖАЛОБЫ",
              callback_data:
                "moder_complaints"
            }
          ],
          [
            {
              text: "🔎 ПОИСК ИГРОКА",
              callback_data:
                "global_search"
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
   DOXACHKAA UC — worker.js
   ЧАСТЬ 3/4
   ============================================================ */

/* ============================================================
   CALLBACK ROUTER
   ============================================================ */

async function handleCallback(
  callback,
  env
) {
  const data =
    String(
      callback.data || ""
    );

  const chatId =
    callback.message?.chat?.id;

  const messageId =
    callback.message?.message_id;

  const telegramId =
    String(callback.from.id);

  await answerCallback(
    callback.id,
    env
  );

  if (!chatId) {
    return;
  }

  const employee =
    await getEmployee(
      env,
      telegramId
    );

  if (
    data === "panel_logout"
  ) {
    await logoutPanel(
      chatId,
      telegramId,
      env
    );

    return;
  }

  if (
    data === "admin_panel"
  ) {
    await cmdPanel(
      chatId,
      telegramId,
      env
    );

    return;
  }

  if (
    data === "moder_panel"
  ) {
    await cmdPanel(
      chatId,
      telegramId,
      env
    );

    return;
  }

  if (!employee) {
    await sendMessage(
      chatId,
      "❌ Доступ запрещён.",
      env
    );

    return;
  }

  if (
    Number(employee.panel_session) !== 1
  ) {
    await sendMessage(
      chatId,
      "❌ Сессия панели завершена.",
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE users
     SET panel_last_activity = datetime('now'),
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    telegramId
  );

  switch (data) {

    case "admins_list":
      await cmdAdmins(
        chatId,
        telegramId,
        env
      );
      return;

    case "moder_list":
      await cmdModer(
        chatId,
        env
      );
      return;

    case "moder_complaints":
      await showComplaints(
        chatId,
        employee,
        env
      );
      return;

    case "global_search":
      await requestPanelState(
        env,
        telegramId,
        "search",
        chatId,
        "🔎 Введите Telegram ID или ID пользователя:"
      );
      return;

    case "finance_menu":
      await showFinanceMenu(
        chatId,
        employee,
        env
      );
      return;

    case "wheel_menu":
      await showWheelMenu(
        chatId,
        employee,
        env
      );
      return;

    case "wheel_price":
      if (!hasRank(employee, 5)) {
        await sendMessage(
          chatId,
          "❌ Требуется 5+ ранг.",
          env
        );
        return;
      }

      await requestPanelState(
        env,
        telegramId,
        "wheel_price",
        chatId,
        "💰 Введите новую цену вращения в ₽:"
      );
      return;

    case "wheel_enable":
      if (!hasRank(employee, 5)) {
        return;
      }

      await setWheelEnabled(
        env,
        employee,
        chatId,
        true
      );
      return;

    case "wheel_disable":
      if (!hasRank(employee, 5)) {
        return;
      }

      await setWheelEnabled(
        env,
        employee,
        chatId,
        false
      );
      return;

    case "wheel_history":
      await showWheelHistory(
        chatId,
        employee,
        env
      );
      return;

    case "wheel_prizes":
      await showWheelPrizes(
        chatId,
        env
      );
      return;

    case "my_activity":
      await showActivity(
        chatId,
        employee,
        env
      );
      return;

    case "create_employee":
      if (!hasRank(employee, 5)) {
        return;
      }

      await requestPanelState(
        env,
        telegramId,
        "create_employee",
        chatId,
        `👤 Создание сотрудника.

Формат:
<code>TelegramID Логин Пароль Ранг Роль</code>

Роль:
admin или moderator`
      );
      return;

    default:
      break;
  }

  if (
    data.startsWith("complaint_")
  ) {
    const id =
      Number(
        data.replace(
          "complaint_",
          ""
        )
      );

    await reviewComplaint(
      chatId,
      employee,
      id,
      env
    );

    return;
  }

  if (
    data.startsWith("ticket_")
  ) {
    const id =
      Number(
        data.replace(
          "ticket_",
          ""
        )
      );

    await showTicket(
      chatId,
      employee,
      id,
      env
    );

    return;
  }
}

/* ============================================================
   PANEL TEXT STATES
   ============================================================ */

async function requestPanelState(
  env,
  telegramId,
  state,
  chatId,
  text
) {
  await dbRun(
    env,
    `UPDATE users
     SET panel_temp_state = ?,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    state,
    String(telegramId)
  );

  await sendMessage(
    chatId,
    text,
    env
  );
}

async function clearPanelState(
  env,
  telegramId
) {
  await dbRun(
    env,
    `UPDATE users
     SET panel_temp_state = NULL,
         updated_at = datetime('now')
     WHERE telegram_id = ?`,
    String(telegramId)
  );
}

async function handleTextState(
  message,
  env
) {
  const telegramId =
    String(message.from.id);

  const user =
    await getUser(
      env,
      telegramId
    );

  if (
    !user ||
    !user.panel_temp_state
  ) {
    return false;
  }

  const value =
    String(message.text || "")
      .trim();

  if (!value) {
    return true;
  }

  switch (
    user.panel_temp_state
  ) {

    case "search": {
      await clearPanelState(
        env,
        telegramId
      );

      const result =
        await globalSearch(
          env,
          value
        );

      await sendSearchResult(
        message.chat.id,
        result,
        env
      );

      return true;
    }

    case "wheel_price": {
      if (!hasRank(user, 5)) {
        await clearPanelState(
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
          "❌ Цена должна быть числом не меньше 0.",
          env
        );

        return true;
      }

      await dbRun(
        env,
        `UPDATE wheel_settings
         SET spin_cost = ?,
             updated_by = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT id
           FROM wheel_settings
           ORDER BY id
           LIMIT 1
         )`,
        price,
        String(telegramId)
      );

      await registerAdminAction(
        env,
        user,
        "wheel_price_change",
        null,
        price,
        `Цена вращения: ${price}`
      );

      await clearPanelState(
        env,
        telegramId
      );

      await sendMessage(
        message.chat.id,
        `✅ Цена вращения установлена: <b>${formatMoney(
          price
        )} ₽</b>`,
        env
      );

      return true;
    }

    case "create_employee": {
      if (!hasRank(user, 5)) {
        await clearPanelState(
          env,
          telegramId
        );
        return true;
      }

      const parts =
        value.split(/\s+/);

      if (parts.length < 5) {
        await sendMessage(
          message.chat.id,
          `❌ Формат:

<code>TelegramID Логин Пароль Ранг Роль</code>`,
          env
        );

        return true;
      }

      const targetTelegramId =
        parts[0];

      const login =
        parts[1];

      const password =
        parts[2];

      const rank =
        Number(parts[3]);

      const role =
        String(parts[4])
          .toLowerCase();

      if (
        !Number.isFinite(rank) ||
        rank < 1 ||
        rank > Number(user.rank)
      ) {
        await sendMessage(
          message.chat.id,
          "❌ Нельзя выдать ранг выше своего.",
          env
        );

        return true;
      }

      if (
        !["admin", "moderator"]
          .includes(role)
      ) {
        await sendMessage(
          message.chat.id,
          "❌ Роль должна быть admin или moderator.",
          env
        );

        return true;
      }

      const existing =
        await getUser(
          env,
          targetTelegramId
        );

      if (existing) {
        await sendMessage(
          message.chat.id,
          "❌ Пользователь уже существует.",
          env
        );

        return true;
      }

      const passwordHash =
        `sha256:${await sha256(
          password
        )}`;

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
           admin_login,
           admin_password_hash,
           panel_session,
           panel_status
         )
         VALUES
         (?, ?, '', '', ?, ?, 0, 0,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          ?, ?, 0, 'offline')`,
        targetTelegramId,
        login,
        role,
        role === "moderator"
          ? 0
          : rank,
        login,
        passwordHash
      );

      if (role === "admin") {
        await dbRun(
          env,
          `INSERT OR REPLACE INTO admin_roles
           (
             telegram_id,
             role,
             granted_by,
             created_at
           )
           VALUES
           (?, ?, ?, CURRENT_TIMESTAMP)`,
          targetTelegramId,
          "admin",
          String(
            user.telegram_id
          )
        );
      }

      await registerAdminAction(
        env,
        user,
        "employee_create",
        targetTelegramId,
        0,
        `login=${login}; rank=${rank}; role=${role}`
      );

      await clearPanelState(
        env,
        telegramId
      );

      await sendMessage(
        message.chat.id,
        `✅ Сотрудник создан.

Telegram ID:
<code>${escapeHtml(
          targetTelegramId
        )}</code>

Логин:
<code>${escapeHtml(
          login
        )}</code>

Пароль:
<code>${escapeHtml(
          password
        )}</code>

Роль:
<b>${escapeHtml(
          role
        )}</b>

Ранг:
<b>${role === "moderator"
          ? 0
          : rank}</b>`,
        env
      );

      return true;
    }

    default:
      return false;
  }
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
    Number(employee.panel_session) !== 1
  ) {
    return;
  }

  const rows =
    await dbAll(
      env,
      `SELECT telegram_id,
              username,
              first_name,
              role,
              rank,
              panel_status
       FROM users
       WHERE rank >= 1
       ORDER BY rank DESC, id ASC
       LIMIT 100`
    );

  let text =
    "<b>👥 АДМИНИСТРАЦИЯ</b>\n\n";

  if (!rows.length) {
    text += "Список пуст.";
  }

  for (const row of rows) {
    const rank =
      RANKS[
        Number(row.rank)
      ] || RANKS[0];

    text +=
      `• <b>${escapeHtml(
        row.first_name ||
        row.username ||
        row.telegram_id
      )}</b>\n` +
      `  ID: <code>${escapeHtml(
        row.telegram_id
      )}</code>\n` +
      `  Ранг: ${Number(
        row.rank
      )} — ${escapeHtml(
        rank.name
      )}\n` +
      `  Статус: ${escapeHtml(
        row.panel_status || "offline"
      )}\n\n`;
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
              text: "➕ СОЗДАТЬ",
              callback_data:
                "create_employee"
            }
          ],
          [
            {
              text: "⬅️ ПАНЕЛЬ",
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
   MODERATORS
   ============================================================ */

async function cmdModer(
  chatId,
  env
) {
  const rows =
    await dbAll(
      env,
      `SELECT telegram_id,
              username,
              first_name,
              panel_status
       FROM users
       WHERE role = 'moderator'
       ORDER BY id DESC
       LIMIT 100`
    );

  let text =
    "<b>🛡 МОДЕРАТОРЫ</b>\n\n";

  if (!rows.length) {
    text += "Список пуст.";
  }

  for (const row of rows) {
    text +=
      `• <b>${escapeHtml(
        row.first_name ||
        row.username ||
        row.telegram_id
      )}</b>\n` +
      `  ID: <code>${escapeHtml(
        row.telegram_id
      )}</code>\n` +
      `  Статус: ${escapeHtml(
        row.panel_status || "offline"
      )}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
               }
/* ============================================================
   DOXACHKAA UC — worker.js
   ЧАСТЬ 4/4
   ============================================================ */

/* ============================================================
   SEARCH
   ============================================================ */

async function globalSearch(
  env,
  query
) {
  const q =
    String(query || "")
      .trim();

  if (!q) {
    return {
      users: [],
      payments: [],
      topups: [],
      payouts: []
    };
  }

  const users =
    await dbAll(
      env,
      `SELECT *
       FROM users
       WHERE telegram_id = ?
          OR CAST(id AS TEXT) = ?
          OR username LIKE ?
          OR admin_login = ?
       ORDER BY id DESC
       LIMIT 20`,
      q,
      q,
      `%${q}%`,
      q
    );

  const payments =
    await dbAll(
      env,
      `SELECT *
       FROM payments
       WHERE telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      q
    );

  const topups =
    await dbAll(
      env,
      `SELECT *
       FROM topup_requests
       WHERE telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      q
    );

  const payouts =
    await dbAll(
      env,
      `SELECT *
       FROM payout_requests
       WHERE telegram_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      q
    );

  return {
    users,
    payments,
    topups,
    payouts
  };
}

async function sendSearchResult(
  chatId,
  result,
  env
) {
  let text =
    "<b>🔎 РЕЗУЛЬТАТ ПОИСКА</b>\n\n";

  if (!result.users.length) {
    text +=
      "Пользователи не найдены.\n";
  }

  for (const user of result.users) {
    text +=
      `👤 <b>${escapeHtml(
        user.first_name ||
        user.username ||
        "Пользователь"
      )}</b>\n` +
      `ID: <code>${escapeHtml(
        user.telegram_id
      )}</code>\n` +
      `Баланс: <b>${formatMoney(
        user.balance
      )} ₽</b>\n` +
      `UC: <b>${Number(
        user.uc || 0
      )}</b>\n\n`;
  }

  if (result.payments.length) {
    text +=
      "<b>💳 ПЛАТЕЖИ</b>\n\n";

    for (const row of result.payments) {
      text +=
        `#${row.id} — ${formatMoney(
          row.amount
        )} ${escapeHtml(
          row.currency || "RUB"
        )} — ${escapeHtml(
          row.status
        )}\n`;
    }

    text += "\n";
  }

  if (result.topups.length) {
    text +=
      "<b>💰 ПОПОЛНЕНИЯ</b>\n\n";

    for (const row of result.topups) {
      text +=
        `#${row.id} — ${formatMoney(
          row.amount
        )} ₽ — ${escapeHtml(
          row.status || "pending"
        )}\n`;
    }

    text += "\n";
  }

  if (result.payouts.length) {
    text +=
      "<b>💎 ВЫВОДЫ UC</b>\n\n";

    for (const row of result.payouts) {
      text +=
        `#${row.id} — ${Number(
          row.uc_amount || 0
        )} UC — ${escapeHtml(
          row.status || "pending"
        )}\n`;
    }
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   COMPLAINTS
   ============================================================ */

async function cmdComplaints(
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
    return;
  }

  await showComplaints(
    chatId,
    employee,
    env
  );
}

async function showComplaints(
  chatId,
  employee,
  env
) {
  const rows =
    await dbAll(
      env,
      `SELECT *
       FROM complaints
       WHERE status = 'pending'
       ORDER BY id DESC
       LIMIT 20`
    );

  let text =
    "<b>📋 ЖАЛОБЫ</b>\n\n";

  if (!rows.length) {
    text += "Новых жалоб нет.";

    await sendMessage(
      chatId,
      text,
      env
    );

    return;
  }

  const buttons = [];

  for (const row of rows) {
    text +=
      `#${row.id} — ` +
      `${escapeHtml(
        row.target_role
      )}\n` +
      `От: <code>${escapeHtml(
        row.reporter_telegram_id
      )}</code>\n` +
      `На: <code>${escapeHtml(
        row.target_telegram_id
      )}</code>\n` +
      `${escapeHtml(
        row.complaint_text
      )}\n\n`;

    buttons.push([
      {
        text: `📋 Жалоба #${row.id}`,
        callback_data:
          `complaint_${row.id}`
      }
    ]);
  }

  await sendMessage(
    chatId,
    text,
    env,
    {
      reply_markup: {
        inline_keyboard:
          buttons
      }
    }
  );
}

async function reviewComplaint(
  chatId,
  employee,
  complaintId,
  env
) {
  if (!employee) {
    return;
  }

  const complaint =
    await dbGet(
      env,
      `SELECT *
       FROM complaints
       WHERE id = ?
       LIMIT 1`,
      complaintId
    );

  if (!complaint) {
    await sendMessage(
      chatId,
      "❌ Жалоба не найдена.",
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE complaints
     SET status = 'reviewed',
         reviewed_by = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         resolution = ?
     WHERE id = ?`,
    String(employee.telegram_id),
    "Рассмотрено администрацией",
    complaintId
  );

  await registerAdminAction(
    env,
    employee,
    "complaint_review",
    complaint.target_telegram_id,
    0,
    `complaint_id=${complaintId}`
  );

  await sendMessage(
    chatId,
    `✅ Жалоба #${complaintId} отмечена как рассмотренная.`,
    env
  );
}

/* ============================================================
   SUPPORT
   ============================================================ */

async function cmdSupport(
  chatId,
  telegramId,
  args,
  env
) {
  const text =
    args.length
      ? args.join(" ")
      : "";

  if (!text) {
    await sendMessage(
      chatId,
      `🆘 Для обращения используйте:

<code>/support текст обращения</code>`,
      env
    );

    return;
  }

  const result =
    await dbRun(
      env,
      `INSERT INTO support_tickets
       (
         player_telegram_id,
         subject,
         status,
         created_at
       )
       VALUES
       (?, ?, 'open', CURRENT_TIMESTAMP)`,
      telegramId,
      text.slice(0, 200)
    );

  const ticketId =
    result.meta?.last_row_id;

  if (ticketId) {
    await dbRun(
      env,
      `INSERT INTO support_messages
       (
         ticket_id,
         sender_telegram_id,
         sender_role,
         message,
         created_at
       )
       VALUES
       (?, ?, 'player', ?, CURRENT_TIMESTAMP)`,
      ticketId,
      telegramId,
      text.slice(
        0,
        CONFIG.maxMessageLength
      )
    );
  }

  await sendMessage(
    chatId,
    `✅ Обращение создано.

Номер тикета:
<b>#${ticketId || "—"}</b>`,
    env
  );
}

async function showTicket(
  chatId,
  employee,
  ticketId,
  env
) {
  if (!employee) {
    return;
  }

  const ticket =
    await dbGet(
      env,
      `SELECT *
       FROM support_tickets
       WHERE id = ?
       LIMIT 1`,
      ticketId
    );

  if (!ticket) {
    await sendMessage(
      chatId,
      "❌ Тикет не найден.",
      env
    );

    return;
  }

  const messages =
    await dbAll(
      env,
      `SELECT *
       FROM support_messages
       WHERE ticket_id = ?
       ORDER BY id ASC
       LIMIT 50`,
      ticketId
    );

  let text =
    `<b>🎫 ТИКЕТ #${ticket.id}</b>

Игрок:
<code>${escapeHtml(
      ticket.player_telegram_id
    )}</code>

Статус:
<b>${escapeHtml(
      ticket.status
    )}</b>

`;

  for (const row of messages) {
    text +=
      `<b>${escapeHtml(
        row.sender_role
      )}</b>: ${escapeHtml(
        row.message
      )}\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   WHEEL SETTINGS
   ============================================================ */

async function getWheelSettings(
  env
) {
  return dbGet(
    env,
    `SELECT *
     FROM wheel_settings
     ORDER BY id
     LIMIT 1`
  );
}

async function showWheelMenu(
  chatId,
  employee,
  env
) {
  const settings =
    await getWheelSettings(
      env
    );

  const cost =
    settings
      ? Number(settings.spin_cost || 0)
      : 0;

  const enabled =
    settings
      ? Number(settings.enabled || 0)
      : 0;

  await sendMessage(
    chatId,
    `<b>🎡 КОЛЕСО</b>

Цена:
<b>${formatMoney(
      cost
    )} ₽</b>

Статус:
<b>${enabled
      ? "ВКЛЮЧЕНО"
      : "ВЫКЛЮЧЕНО"}</b>`,
    env,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💰 ЦЕНА",
              callback_data:
                "wheel_price"
            }
          ],
          [
            {
              text: "✅ ВКЛ",
              callback_data:
                "wheel_enable"
            },
            {
              text: "⛔ ВЫКЛ",
              callback_data:
                "wheel_disable"
            }
          ],
          [
            {
              text: "🎁 ПРИЗЫ",
              callback_data:
                "wheel_prizes"
            },
            {
              text: "📜 ИСТОРИЯ",
              callback_data:
                "wheel_history"
            }
          ]
        ]
      }
    }
  );
}

async function setWheelEnabled(
  env,
  employee,
  chatId,
  enabled
) {
  if (!hasRank(employee, 5)) {
    await sendMessage(
      chatId,
      "❌ Требуется 5+ ранг.",
      env
    );

    return;
  }

  const settings =
    await getWheelSettings(
      env
    );

  if (!settings) {
    await sendMessage(
      chatId,
      "❌ Таблица wheel_settings пуста.",
      env
    );

    return;
  }

  await dbRun(
    env,
    `UPDATE wheel_settings
     SET enabled = ?,
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    enabled ? 1 : 0,
    String(employee.telegram_id),
    settings.id
  );

  await registerAdminAction(
    env,
    employee,
    enabled
      ? "wheel_enable"
      : "wheel_disable",
    null,
    0,
    enabled
      ? "Колесо включено"
      : "Колесо выключено"
  );

  await sendMessage(
    chatId,
    enabled
      ? "✅ Колесо включено."
      : "⛔ Колесо выключено.",
    env
  );
}

/* ============================================================
   WHEEL PRIZES
   ============================================================ */

async function showWheelPrizes(
  chatId,
  env
) {
  const rows =
    await dbAll(
      env,
      `SELECT *
       FROM wheel_prizes
       WHERE enabled = 1
       ORDER BY sort_order ASC, id ASC
       LIMIT 100`
    );

  let text =
    "<b>🎁 ПРИЗЫ КОЛЕСА</b>\n\n";

  if (!rows.length) {
    text += "Призы отсутствуют.";
  }

  for (const row of rows) {
    text +=
      `#${row.id} — ` +
      `${escapeHtml(
        row.name
      )}\n` +
      `Тип: ${escapeHtml(
        row.prize_type
      )}\n` +
      `Значение: <b>${Number(
        row.prize_value || 0
      )}</b>\n` +
      `Шанс: <b>${Number(
        row.probability || 0
      )}%</b>\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   WHEEL HISTORY
   ============================================================ */

async function showWheelHistory(
  chatId,
  employee,
  env
) {
  const rows =
    await dbAll(
      env,
      `SELECT *
       FROM spin_history
       ORDER BY id DESC
       LIMIT 30`
    );

  let text =
    "<b>📜 ИСТОРИЯ КОЛЕСА</b>\n\n";

  if (!rows.length) {
    text += "История пуста.";
  }

  for (const row of rows) {
    text +=
      `${formatTime(
        row.created_at
      )} — ` +
      `<code>${escapeHtml(
        row.telegram_id
      )}</code>\n` +
      `${escapeHtml(
        row.prize_name || "Приз"
      )} — ` +
      `<b>${Number(
        row.prize_value || 0
      )}</b>\n\n`;
  }

  await sendMessage(
    chatId,
    text,
    env
  );
}

/* ============================================================
   SPIN
   ============================================================ */

async function cmdSpin(
  chatId,
  telegramId,
  env
) {
  const user =
    await getUser(
      env,
      telegramId
    );

  if (!user) {
    return;
  }

  const settings =
    await getWheelSettings(
      env
    );

  if (
    !settings ||
    Number(settings.enabled) !== 1
  ) {
    await sendMessage(
      chatId,
      "⛔ Колесо сейчас отключено.",
      env
    );

    return;
  }

  const cost =
    Number(settings.spin_cost || 0);

  if (
    Number(user.balance || 0) <
    cost
  ) {
    await sendMessage(
      chatId,
      `❌ Недостаточно средств.

Цена вращения:
<b>${formatMoney(
        cost
      )} ₽</b>`,
      env
    );

    return;
  }

  const prizes =
    await dbAll(
      env,
      `SELECT *
       FROM wheel_prizes
       WHERE enabled = 1
       ORDER BY sort_order ASC, id ASC`
    );

  if (!prizes.length) {
    await sendMessage(
      chatId,
      "❌ В колесе нет активных призов.",
      env
    );

    return;
  }

  const prize =
    weightedPrize(
      prizes
    );

  if (!prize) {
    await sendMessage(
      chatId,
      "❌ Не удалось определить приз.",
      env
    );

    return;
  }

  const oldBalance =
    Number(user.balance || 0);

  const newBalance =
    oldBalance - cost;

  await dbRun(
    env,
    `UPDATE users
     SET balance = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE telegram_id = ?`,
    newBalance,
    telegramId
  );

  await dbRun(
    env,
    `INSERT INTO spin_history
     (
       telegram_id,
       prize_id,
       prize_name,
       prize_type,
       prize_value,
       cost,
       created_at
     )
     VALUES
     (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    telegramId,
    prize.id,
    prize.name,
    prize.prize_type,
    Number(prize.prize_value || 0),
    cost
  );

  await dbRun(
    env,
    `INSERT INTO spins
     (
       telegram_id,
       spin_number,
       prize_uc,
       prize_balance,
       created_at
     )
     VALUES
     (
       ?,
       COALESCE(
         (
           SELECT MAX(spin_number) + 1
           FROM spins
           WHERE telegram_id = ?
         ),
         1
       ),
       ?,
       ?,
       CURRENT_TIMESTAMP
     )`,
    telegramId,
    telegramId,
    prize.prize_type === "uc"
      ? Number(prize.prize_value || 0)
      : 0,
    prize.prize_type === "balance"
      ? Number(prize.prize_value || 0)
      : 0
  );

  let rewardText =
    escapeHtml(
      prize.name
    );

  if (
    prize.prize_type ===
    "uc"
  ) {
    await dbRun(
      env,
      `UPDATE users
       SET uc = uc + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ?`,
      Number(prize.prize_value || 0),
      telegramId
    );

    rewardText +=
      ` — +${Number(
        prize.prize_value || 0
      )} UC`;
  }

  if (
    prize.prize_type ===
    "balance"
  ) {
    await dbRun(
      env,
      `UPDATE users
       SET balance = balance + ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = ?`,
      Number(prize.prize_value || 0),
      telegramId
    );

    rewardText +=
      ` — +${formatMoney(
        prize.prize_value
      )} ₽`;
  }

  await sendMessage(
    chatId,
    `<b>🎡 ВРАЩЕНИЕ</b>

🎁 Ваш приз:
<b>${rewardText}</b>

💰 Списано:
<b>${formatMoney(
      cost
    )} ₽</b>`,
    env
  );
}

function weightedPrize(
  prizes
) {
  const valid =
    prizes.filter(
      row =>
        Number(row.probability) > 0
    );

  if (!valid.length) {
    return prizes[0] || null;
  }

  const total =
    valid.reduce(
      (sum, row) =>
        sum +
        Number(row.probability),
      0
    );

  let random =
    Math.random() * total;

  for (const prize of valid) {
    random -=
      Number(prize.probability);

    if (random <= 0) {
      return prize;
    }
  }

  return valid[
    valid.length - 1
  ];
}

/* ============================================================
   DAILY
   ============================================================ */

async function cmdDaily(
  chatId,
  telegramId,
  env
) {
  const today =
    getMoscowDate();

  const key =
    `daily_bonus_${telegramId}`;

  const existing =
    await dbGet(
      env,
      `SELECT value
       FROM system_settings
       WHERE key = ?`,
      key
    );

  if (
    existing?.value === today
  ) {
    await sendMessage(
      chatId,
      "❌ Ежедневный бонус уже получен сегодня.",
      env
    );

    return;
  }

  const reward = 1;

  await dbRun(
    env,
    `UPDATE users
     SET uc = uc + ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE telegram_id = ?`,
    reward,
    telegramId
  );

  await dbRun(
    env,
    `INSERT INTO system_settings
     (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key)
     DO UPDATE SET
       value = excluded.value,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    key,
    today,
    telegramId
  );

  await sendMessage(
    chatId,
    `🎁 Ежедневный бонус получен!

💎 Начислено:
<b>+${reward} UC</b>`,
    env
  );
}

/* ============================================================
   PROMO
   ============================================================ */

async function cmdPromo(
  chatId,
  telegramId,
  args,
  env
) {
  /*
   * В текущей базе нет таблиц promo_codes/promo_uses.
   * Поэтому команда специально не делает запрос
   * к несуществующим таблицам.
   */

  await sendMessage(
    chatId,
    "ℹ️ Система промокодов пока не подключена к текущей схеме D1.",
    env
  );
}

/* ============================================================
   FINANCE MENU
   ============================================================ */

async function showFinanceMenu(
  chatId,
  employee,
  env
) {
  await sendMessage(
    chatId,
    `<b>💰 ФИНАНСЫ</b>

Управление балансом и UC доступно администраторам 5+ ранга.`,
    env
  );
}

/* ============================================================
   ACTIVITY
   ============================================================ */

async function showActivity(
  chatId,
  employee,
  env
) {
  const since =
    `${getMoscowDate()} 00:00:00`;

  const actions =
    await dbGet(
      env,
      `SELECT COUNT(*) AS count
       FROM admin_actions
       WHERE admin_telegram_id = ?
       AND created_at >= ?`,
      String(employee.telegram_id),
      since
    );

  const count =
    Number(actions?.count || 0);

  const minutes =
    Math.floor(
      count * 5
    );

  const points =
    count *
    CONFIG.pointsPerAction;

  await sendMessage(
    chatId,
    `<b>📊 МОЯ АКТИВНОСТЬ</b>

Действий сегодня:
<b>${count}</b>

Расчётная активность:
<b>${formatMinutes(
      minutes
    )}</b>

Баллов:
<b>${points}</b>

Требование:
<b>${formatMinutes(
      CONFIG.requiredActivityMinutes
    )}</b>`,
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
    !hasRank(employee, 5)
  ) {
    await sendMessage(
      chatId,
      "❌ Недостаточно прав.",
      env
    );

    return;
  }

  if (args.length < 2) {
    await sendMessage(
      chatId,
      "Формат:\n<code>/rank TelegramID Ранг</code>",
      env
    );

    return;
  }

  const targetId =
    String(args[0]);

  const newRank =
    Number(args[1]);

  if (
    !Number.isInteger(newRank) ||
    newRank < 0 ||
    newRank > Number(employee.rank)
  ) {
    await sendMessage(
      chatId,
      "❌ Некорректный ранг.",
      env
    );

    return;
  }

  const target =
    await getUser(
      env,
      targetId
    );

  if (!target) {
    await sendMessage(
      chatId,
      "❌ Пользователь не найден.",
      env
    );

    return;
  }

  nst oldRank =
    Number(target.rank || 0);

  await dbRun(
    env,
    `UPDATE users
     SET rank = ?,
         role = CASE
           WHEN ? > 0 THEN 'admin'
           ELSE 'player'
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE telegram_id = ?`,
    newRank,
    newRank,
    targetId
  );

  if (newRank > 0) {
    await dbRun(
      env,
      `INSERT OR REPLACE INTO admin_roles
       (
         telegram_id,
         role,
         granted_by,
         created_at
       )
       VALUES
       (?, 'admin', ?, CURRENT_TIMESTAMP)`,
      targetId,
      telegramId
    );
  } else {
    await dbRun(
      env,
      `DELETE FROM admin_roles
       WHERE telegram_id = ?`,
      targetId
    );
  }

  await registerAdminAction(
    env,
    employee,
    "rank_change",
    targetId,
    newRank,
    `old_rank=${oldRank}; new_rank=${newRank}`
  );

  await sendMessage(
    chatId,
    `✅ Ранг изменён.

Игрок:
<code>${escapeHtml(
      targetId
    )}</code>

Было:
<b>${oldRank}</b>

Стало:
<b>${newRank}</b>`,
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
    !hasRank(employee, 5)
  ) {
    await sendMessage(
      chatId,
      "❌ Недостаточно прав.",
      env
    );

    return;
  }

  if (!args[0]) {
    await sendMessage(
      chatId,
      "Формат:\n<code>/unrank TelegramID</code>",
      env
    );

    return;
  }

  const targetId =
    String(args[0]);

  const target =
    await getUser(
      env,
      targetId
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
    Number(target.rank || 0);

  await dbRun(
    env,
    `UPDATE users
     SET rank = 0,
         role = 'player',
         updated_at = CURRENT_TIMESTAMP
     WHERE telegram_id = ?`,
    targetId
  );

  await dbRun(
    env,
    `DELETE FROM admin_roles
     WHERE telegram_id = ?`,
    targetId
  );

  await registerAdminAction(
    env,
    employee,
    "rank_remove",
    targetId,
    oldRank,
    `old_rank=${oldRank}; new_rank=0`
  );

  await sendMessage(
    chatId,
    `✅ Административный ранг снят.

Игрок:
<code>${escapeHtml(
      targetId
    )}</code>`,
    env
  );
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

  const text =
    String(message.text || "")
      .trim();

  if (!text) {
    return;
  }

  /*
   * Проверка активного обычного бана.
   */
  const ban =
    await dbGet(
      env,
      `SELECT *
       FROM bans
       WHERE telegram_id = ?
       AND (
         expires_at IS NULL
         OR expires_at > CURRENT_TIMESTAMP
       )
       LIMIT 1`,
      telegramId
    );

  if (ban) {
    await sendMessage(
      message.chat.id,
      `🚫 Вы заблокированы.

Причина:
${escapeHtml(
        ban.reason || "Не указана"
      )}`,
      env
    );

    return;
  }

  /*
   * Проверка silent ban.
   */
  const silent =
    await dbGet(
      env,
      `SELECT *
       FROM silent_bans
       WHERE telegram_id = ?
       AND active = 1
       AND (
         expires_at IS NULL
         OR expires_at > CURRENT_TIMESTAMP
       )
       LIMIT 1`,
      telegramId
    );

  if (silent) {
    return;
  }

  /*
   * Здесь сообщение сохраняется в чат.
   * Рассылка всем пользователям намеренно
   * не выполняется автоматически.
   */
  await dbRun(
    env,
    `INSERT INTO wheel_chat_messages
     (
       telegram_id,
       username,
       role_key,
       message,
       deleted,
       created_at
     )
     VALUES
     (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
    telegramId,
    message.from.username || "",
    "player",
    text.slice(
      0,
      CONFIG.maxMessageLength
    )
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

function formatMoney(
  value
) {
  const number =
    Number(value || 0);

  return number
    .toLocaleString(
      "ru-RU",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }
    );
}

function escapeHtml(
  value
) {
  return String(
    value ?? ""
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

function formatTime(
  value
) {
  if (!value) {
    return "--:--";
  }

  try {
    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        timeZone:
          CONFIG.moscowTimezone,
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(
      new Date(value)
    );
  } catch {
    return "--:--";
  }
}

function formatMinutes(
  minutes
) {
  const total =
    Math.max(
      0,
      Number(minutes || 0)
    );

  const hours =
    Math.floor(
      total / 60
    );

  const mins =
    total % 60;

  return `${hours}ч ${mins}м`;
}

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
  ).format(
    new Date()
  );
}
