/**
 * DOXACHKAA UC
 * Cloudflare Worker + D1 + Telegram Mini App + Telegram Webhook
 *
 * D1 binding:
 *   DB
 *
 * Secrets:
 *   BOT_TOKEN
 *   SESSION_SECRET
 *   WEBAPP_URL
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-Init-Data",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
};

const RANKS = {
  0: {
    name: "Игрок",
    color: "#ffffff",
  },
  1: {
    name: "Администратор",
    color: "#00aaff",
  },
  2: {
    name: "Администратор",
    color: "#00ff66",
  },
  3: {
    name: "Следящий администратор",
    color: "#ff7a00",
  },
  4: {
    name: "Куратор",
    color: "#b000ff",
  },
  5: {
    name: "Заместитель Главного Администратора",
    color: "#ff003c",
  },
  6: {
    name: "Главный Администратор",
    color: "#ff003c",
  },
};

const MODERATOR = {
  name: "Модератор",
  color: "#ffff00",
};

const DEFAULT_SETTINGS = {
  spin_cost: 100,
  min_withdraw_uc: 3000,
  daily_bonus: 0,
  promo_weekly_spin: 1,
  technical_enabled: 0,
  technical_message: "",
  technical_reason: "",
  technical_ends_at: "",
  balance_enabled: 1,
  withdrawal_enabled: 1,
  promo_enabled: 1,
  wheel_enabled: 1,
  global_chat_enabled: 1,
};

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        });
      }

      const url = new URL(request.url);

      /*
       * Telegram webhook
       */
      if (url.pathname === "/telegram/webhook") {
        return await telegramWebhook(request, env);
      }

      /*
       * Health check
       */
      if (url.pathname === "/health") {
        return json({
          ok: true,
          service: "doxachkaa_uc",
          time: new Date().toISOString(),
        });
      }

      /*
       * API
       */
      if (url.pathname.startsWith("/api/")) {
        return await apiRouter(request, env, url);
      }

      /*
       * Если Worker используется вместе с Pages/Assets,
       * сюда можно добавить static assets.
       */
      return new Response(
        "DOXACHKAA UC API ONLINE",
        {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        }
      );

    } catch (error) {
      console.error(error);

      return json(
        {
          ok: false,
          error: "INTERNAL_ERROR",
          message: "Внутренняя ошибка сервера",
        },
        500
      );
    }
  },
};


/* =========================================================
   RESPONSE
========================================================= */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
      },
    }
  );
}


/* =========================================================
   DATABASE
========================================================= */

async function first(db, sql, ...params) {
  return await db
    .prepare(sql)
    .bind(...params)
    .first();
}

async function all(db, sql, ...params) {
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all();

  return result.results || [];
}

async function run(db, sql, ...params) {
  return await db
    .prepare(sql)
    .bind(...params)
    .run();
}


/* =========================================================
   SETTINGS
========================================================= */

async function getSetting(db, key, fallback = null) {
  const row = await first(
    db,
    `
      SELECT value
      FROM system_settings
      WHERE key = ?
      LIMIT 1
    `,
    key
  );

  if (!row) return fallback;

  return row.value;
}

async function setSetting(db, key, value, actor) {
  await run(
    db,
    `
      INSERT INTO system_settings
      (key, value, updated_by, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key)
      DO UPDATE SET
        value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `,
    key,
    String(value),
    actor
  );
}

async function getNumberSetting(db, key, fallback) {
  const value = await getSetting(db, key, null);

  if (value === null) {
    return fallback;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

async function getBoolSetting(db, key, fallback = false) {
  const value = await getSetting(db, key, null);

  if (value === null) {
    return fallback;
  }

  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}


/* =========================================================
   TELEGRAM INIT DATA
========================================================= */

async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    throw new Error("Telegram authorization required");
  }

  const params = new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    throw new Error("Missing Telegram hash");
  }

  const authDate = Number(params.get("auth_date"));

  if (!authDate) {
    throw new Error("Missing auth_date");
  }

  /*
   * Не принимаем старые initData.
   */
  const age = Math.floor(Date.now() / 1000) - authDate;

  if (age > 86400 || age < -60) {
    throw new Error("Telegram session expired");
  }

  params.delete("hash");
  params.delete("signature");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  /*
   * Telegram Web Apps:
   * secret_key = HMAC_SHA256("WebAppData", bot_token)
   * hash = HMAC_SHA256(secret_key, data_check_string)
   */

  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("WebAppData"),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const secret = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    new TextEncoder().encode(botToken)
  );

  const dataKey = await crypto.subtle.importKey(
    "raw",
    secret,
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const calculated = await crypto.subtle.sign(
    "HMAC",
    dataKey,
    new TextEncoder().encode(dataCheckString)
  );

  const calculatedHex = [...new Uint8Array(calculated)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

  if (!timingSafeEqual(calculatedHex, hash)) {
    throw new Error("Invalid Telegram signature");
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    throw new Error("Telegram user missing");
  }

  return JSON.parse(userRaw);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}


/* =========================================================
   AUTH
========================================================= */

async function getTelegramUser(request, env) {
  const initData =
    request.headers.get("X-Telegram-Init-Data") ||
    request.headers.get("Authorization")?.replace(
      /^Bearer\s+/i,
      ""
    );

  return await validateTelegramInitData(
    initData,
    env.BOT_TOKEN
  );
}

async function ensureUser(db, tgUser) {
  const telegramId = String(tgUser.id);

  let user = await first(
    db,
    `
      SELECT *
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `,
    telegramId
  );

  if (!user) {
    const now = new Date().toISOString();

    await run(
      db,
      `
        INSERT INTO users
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
        VALUES (?, ?, ?, ?, 'player', 0, 0, 0, ?, ?, 0, 'offline')
      `,
      telegramId,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      now,
      now
    );

    user = await first(
      db,
      `
        SELECT *
        FROM users
        WHERE telegram_id = ?
      `,
      telegramId
    );
  } else {
    await run(
      db,
      `
        UPDATE users
        SET
          username = ?,
          first_name = ?,
          last_name = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      telegramId
    );
  }

  return user;
}


/* =========================================================
   ROLE
========================================================= */

function numericRank(user) {
  const rank = Number(user?.rank || 0);

  return Number.isFinite(rank) ? rank : 0;
}

function isAdmin(user) {
  return numericRank(user) >= 1;
}

function isSenior(user) {
  return numericRank(user) >= 5;
}

function isSuperAdmin(user) {
  return numericRank(user) >= 6;
}

function canRank(user, targetRank) {
  const rank = numericRank(user);
  const target = Number(targetRank);

  if (rank === 6) {
    return target >= 0 && target <= 6;
  }

  if (rank === 5) {
    return target >= 0 && target <= 5;
  }

  return false;
}

function canManageTarget(actor, target) {
  const actorRank = numericRank(actor);
  const targetRank = numericRank(target);

  if (actorRank === 6) {
    return true;
  }

  if (actorRank === 5) {
    return targetRank <= 5;
  }

  return false;
}


/* =========================================================
   PANEL SESSION
========================================================= */

async function requirePanel(request, env, minimumRank = 1) {
  const tgUser = await getTelegramUser(request, env);

  const db = env.DB;

  const user = await ensureUser(
    db,
    tgUser
  );

  if (numericRank(user) < minimumRank) {
    throw new Error("FORBIDDEN");
  }

  if (!Number(user.panel_session)) {
    throw new Error("PANEL_LOGIN_REQUIRED");
  }

  /*
   * Продлеваем активность.
   */
  await run(
    db,
    `
      UPDATE users
      SET panel_last_activity = CURRENT_TIMESTAMP,
          panel_status = 'online'
      WHERE telegram_id = ?
    `,
    user.telegram_id
  );

  return await first(
    db,
    `
      SELECT *
      FROM users
      WHERE telegram_id = ?
    `,
    user.telegram_id
  );
}


/* =========================================================
   API ROUTER
========================================================= */

async function apiRouter(request, env, url) {
  const path = url.pathname;

  if (path === "/api/config" && request.method === "GET") {
    return await apiConfig(env);
  }

  if (path === "/api/me" && request.method === "GET") {
    return await apiMe(request, env);
  }

  if (path === "/api/spin" && request.method === "POST") {
    return await apiSpin(request, env);
  }

  if (path === "/api/topup" && request.method === "POST") {
    return await apiTopup(request, env);
  }

  if (path === "/api/withdraw" && request.method === "POST") {
    return await apiWithdraw(request, env);
  }

  if (path === "/api/daily-bonus" && request.method === "POST") {
    return await apiDailyBonus(request, env);
  }

  if (path === "/api/promo/use" && request.method === "POST") {
    return await apiPromoUse(request, env);
  }

  if (path === "/api/admin/login" && request.method === "POST") {
    return await apiAdminLogin(request, env);
  }

  if (path === "/api/admin/logout" && request.method === "POST") {
    return await apiAdminLogout(request, env);
  }

  if (path === "/api/admin/dashboard" && request.method === "GET") {
    return await apiAdminDashboard(request, env);
  }

  if (path === "/api/admin/users" && request.method === "GET") {
    return await apiAdminUsers(request, env);
  }

  if (path === "/api/admin/user" && request.method === "GET") {
    return await apiAdminUser(request, env);
  }

  if (path === "/api/admin/rank" && request.method === "POST") {
    return await apiAdminRank(request, env);
  }

  if (path === "/api/admin/balance" && request.method === "POST") {
    return await apiAdminBalance(request, env);
  }

  if (path === "/api/admin/uc" && request.method === "POST") {
    return await apiAdminUC(request, env);
  }

  if (path === "/api/admin/settings" && request.method === "GET") {
    return await apiAdminSettings(request, env);
  }

  if (path === "/api/admin/settings" && request.method === "POST") {
    return await apiAdminSettingsSave(request, env);
  }

  if (path === "/api/admin/wheel" && request.method === "GET") {
    return await apiAdminWheel(request, env);
  }

  if (path === "/api/admin/wheel" && request.method === "POST") {
    return await apiAdminWheelSave(request, env);
  }

  if (path === "/api/admin/activity" && request.method === "GET") {
    return await apiAdminActivity(request, env);
  }

  if (path === "/api/admin/complaints" && request.method === "GET") {
    return await apiAdminComplaints(request, env);
  }

  if (path === "/api/admin/logs" && request.method === "GET") {
    return await apiAdminLogs(request, env);
  }

  if (path === "/api/admin/maintenance" && request.method === "POST") {
    return await apiAdminMaintenance(request, env);
  }

  if (path === "/api/admin/employees" && request.method === "GET") {
    return await apiAdminEmployees(request, env);
  }

  if (path === "/api/admin/employee/access" && request.method === "POST") {
    return await apiAdminEmployeeAccess(request, env);
  }

  return json(
    {
      ok: false,
      error: "NOT_FOUND",
    },
    404
  );
}


/* =========================================================
   PUBLIC CONFIG
========================================================= */

async function apiConfig(env) {
  const db = env.DB;

  const spinCost = await getNumberSetting(
    db,
    "spin_cost",
    DEFAULT_SETTINGS.spin_cost
  );

  const minWithdraw = await getNumberSetting(
    db,
    "min_withdraw_uc",
    DEFAULT_SETTINGS.min_withdraw_uc
  );

  const maintenance = await first(
    db,
    `
      SELECT *
      FROM maintenance_settings
      WHERE id = 1
    `
  );

  const wheel = await first(
    db,
    `
      SELECT *
      FROM wheel_settings
      WHERE id = 1
    `
  );

  const prizes = await all(
    db,
    `
      SELECT
        id,
        name,
        prize_type,
        prize_value,
        probability,
        enabled,
        sort_order
      FROM wheel_prizes
      WHERE enabled = 1
      ORDER BY sort_order ASC, id ASC
    `
  );

  return json({
    ok: true,

    settings: {
      spin_cost: spinCost,
      min_withdraw_uc: minWithdraw,
      daily_bonus: await getNumberSetting(
        db,
        "daily_bonus",
        0
      ),
      promo_weekly_spin: await getBoolSetting(
        db,
        "promo_weekly_spin",
        true
      ),
      balance_enabled:
        await getBoolSetting(
          db,
          "balance_enabled",
          true
        ),
      withdrawal_enabled:
        await getBoolSetting(
          db,
          "withdrawal_enabled",
          true
        ),
      promo_enabled:
        await getBoolSetting(
          db,
          "promo_enabled",
          true
        ),
    },

    wheel: wheel || {
      spin_cost: spinCost,
      currency: "RUB",
      enabled: 1,
    },

    prizes,

    maintenance: maintenance || {
      enabled: 0,
      message: "",
      reason: "",
      ends_at: null,
    },
  });
}


/* =========================================================
   ME
========================================================= */

async function apiMe(request, env) {
  const tgUser = await getTelegramUser(
    request,
    env
  );

  const db = env.DB;

  const user = await ensureUser(
    db,
    tgUser
  );

  const rank = numericRank(user);

  /*
   * 5-6 скрыты, пока не авторизованы
   * в панели.
   */
  const hidden =
    rank >= 5 &&
    !Number(user.panel_session);

  return json({
    ok: true,

    user: {
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,

      role: user.role,
      rank,

      rank_name:
        rank >= 1
          ? RANKS[rank]?.name
          : "Игрок",

      rank_color:
        rank >= 1
          ? RANKS[rank]?.color
          : "#ffffff",

      balance: Number(user.balance || 0),
      uc: Number(user.uc || 0),

      panel_session:
        Boolean(Number(user.panel_session)),

      hidden,

      panel_status:
        user.panel_status || "offline",
    },
  });
}


/* =========================================================
   SPIN
========================================================= */

async function apiSpin(request, env) {
  const tgUser = await getTelegramUser(
    request,
    env
  );

  const db = env.DB;

  const user = await ensureUser(
    db,
    tgUser
  );

  const restriction = await first(
    db,
    `
      SELECT *
      FROM user_restrictions
      WHERE telegram_id = ?
    `,
    user.telegram_id
  );

  if (
    restriction &&
    Number(restriction.balance_blocked)
  ) {
    return json({
      ok: false,
      error: "BALANCE_BLOCKED",
    }, 403);
  }

  if (
    restriction &&
    Number(restriction.uc_blocked)
  ) {
    return json({
      ok: false,
      error: "UC_BLOCKED",
    }, 403);
  }

  const maintenance = await first(
    db,
    `
      SELECT *
      FROM maintenance_settings
      WHERE id = 1
    `
  );

  if (
    maintenance &&
    Number(maintenance.enabled)
  ) {
    return json({
      ok: false,
      error: "MAINTENANCE",
      message:
        maintenance.message ||
        "Технические работы",
    }, 503);
  }

  const wheel = await first(
    db,
    `
      SELECT *
      FROM wheel_settings
      WHERE id = 1
    `
  );

  if (
    wheel &&
    !Number(wheel.enabled)
  ) {
    return json({
      ok: false,
      error: "WHEEL_DISABLED",
    }, 403);
  }

  const cost =
    Number(
      wheel?.spin_cost ??
      await getNumberSetting(
        db,
        "spin_cost",
        100
      )
    );

  const balance =
    Number(user.balance || 0);

  if (balance < cost) {
    return json({
      ok: false,
      error: "INSUFFICIENT_BALANCE",
      required: cost,
      balance,
    }, 400);
  }

  const prizes = await all(
    db,
    `
      SELECT *
      FROM wheel_prizes
      WHERE enabled = 1
      ORDER BY sort_order ASC, id ASC
    `
  );

  if (!prizes.length) {
    return json({
      ok: false,
      error: "NO_PRIZES",
    }, 500);
  }

  const prize =
    weightedPrize(prizes);

  const oldBalance =
    Number(user.balance || 0);

  const oldUC =
    Number(user.uc || 0);

  const newBalance =
    oldBalance - cost;

  const prizeUC =
    prize.prize_type === "uc"
      ? Number(prize.prize_value || 0)
      : 0;

  const newUC =
    oldUC + prizeUC;

  /*
   * Транзакционный batch.
   */
  await db.batch([
    db.prepare(`
      UPDATE users
      SET
        balance = ?,
        uc = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(
      newBalance,
      newUC,
      user.telegram_id
    ),

    db.prepare(`
      INSERT INTO spin_history
      (
        telegram_id,
        prize_id,
        prize_name,
        prize_type,
        prize_value,
        cost
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      user.telegram_id,
      prize.id,
      prize.name,
      prize.prize_type,
      prizeUC,
      cost
    ),

    db.prepare(`
      INSERT INTO spins
      (
        telegram_id,
        spin_number,
        prize_uc,
        prize_balance
      )
      SELECT
        ?,
        COALESCE(
          MAX(spin_number),
          0
        ) + 1,
        ?,
        0
      FROM spins
      WHERE telegram_id = ?
    `).bind(
      user.telegram_id,
      prizeUC,
      user.telegram_id
    ),

    db.prepare(`
      INSERT INTO transactions
      (
        telegram_id,
        type,
        amount,
        description
      )
      VALUES (?, 'spin', ?, ?)
    `).bind(
      user.telegram_id,
      -cost,
      `Прокрутка: ${prize.name}`
    ),

    db.prepare(`
      INSERT INTO uc_audit
      (
        actor_telegram_id,
        target_telegram_id,
        old_uc,
        new_uc,
        amount,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      user.telegram_id,
      user.telegram_id,
      oldUC,
      newUC,
      prizeUC,
      "Колесо"
    )
  ]);

  return json({
    ok: true,

    prize: {
      id: prize.id,
      name: prize.name,
      type: prize.prize_type,
      value: prizeUC,
    },

    balance: newBalance,
    uc: newUC,
    cost,
  });
}

function weightedPrize(prizes) {
  let total = 0;

  for (const prize of prizes) {
    total += Math.max(
      0,
      Number(prize.probability || 0)
    );
  }

  if (total <= 0) {
    return prizes[
      Math.floor(
        Math.random() * prizes.length
      )
    ];
  }

  let random =
    Math.random() * total;

  for (const prize of prizes) {
    random -= Math.max(
      0,
      Number(prize.probability || 0)
    );

    if (random <= 0) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}


/* =========================================================
   TOPUP
========================================================= */

async function apiTopup(request, env) {
  const tgUser = await getTelegramUser(
    request,
    env
  );

  const body = await request.json();

  const amount =
    Number(body.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "INVALID_AMOUNT",
    }, 400);
  }

  const db = env.DB;

  const user =
    await ensureUser(db, tgUser);

  const id = await run(
    db,
    `
      INSERT INTO topup_requests
      (
        telegram_id,
        amount,
        status
      )
      VALUES (?, ?, 'pending')
    `,
    user.telegram_id,
    amount
  );

  await run(
    db,
    `
      INSERT INTO notification_center
      (
        target_telegram_id,
        type,
        title,
        message
      )
      VALUES
      (
        NULL,
        'topup',
        'Новое пополнение',
        ?
      )
    `,
    `Заявка #${id.meta?.last_row_id || "new"} от ${user.telegram_id}: ${amount} RUB`
  );

  return json({
    ok: true,
    message:
      "Заявка на пополнение создана",
  });
}


/* =========================================================
   WITHDRAW
========================================================= */

async function apiWithdraw(request, env) {
  const tgUser = await getTelegramUser(
    request,
    env
  );

  const body = await request.json();

  const pubgId =
    String(body.pubg_mobile_id || "").trim();

  const amount =
    Number(body.uc_amount);

  if (!pubgId) {
    return json({
      ok: false,
      error: "PUBG_ID_REQUIRED",
    }, 400);
  }

  if (
    !Number.isInteger(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "INVALID_UC",
    }, 400);
  }

  const db = env.DB;

  const user =
    await ensureUser(db, tgUser);

  const min =
    await getNumberSetting(
      db,
      "min_withdraw_uc",
      3000
    );

  if (amount < min) {
    return json({
      ok: false,
      error: "MIN_WITHDRAW",
      min,
    }, 400);
  }

  if (Number(user.uc) < amount) {
    return json({
      ok: false,
      error: "INSUFFICIENT_UC",
    }, 400);
  }

  const result = await run(
    db,
    `
      INSERT INTO payout_requests
      (
        telegram_id,
        pubg_mobile_id,
        uc_amount
      )
      VALUES (?, ?, ?)
    `,
    user.telegram_id,
    pubgId,
    amount
  );

  await run(
    db,
    `
      INSERT INTO notification_center
      (
        target_telegram_id,
        type,
        title,
        message
      )
      VALUES
      (
        NULL,
        'withdraw',
        'Новая заявка на вывод',
        ?
      )
    `,
    `Вывод ${amount} UC от ${user.telegram_id}`
  );

  return json({
    ok: true,
    request_id:
      result.meta?.last_row_id || null,
  });
}
/* =========================================================
   DAILY BONUS
========================================================= */

async function apiDailyBonus(request, env) {
  const tgUser = await getTelegramUser(
    request,
    env
  );

  const db = env.DB;

  const user =
    await ensureUser(db, tgUser);

  const today =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Europe/Moscow",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(new Date());

  const bonus =
    await getNumberSetting(
      db,
      "daily_bonus",
      0
    );

  if (bonus <= 0) {
    return json({
      ok: false,
      error: "BONUS_DISABLED",
    });
  }

  const row =
    await first(
      db,
      `
        SELECT *
        FROM daily_bonuses
        WHERE telegram_id = ?
      `,
      user.telegram_id
    );

  if (
    row &&
    row.last_claim_date === today
  ) {
    return json({
      ok: false,
      error: "ALREADY_CLAIMED",
    }, 400);
  }

  const oldUC =
    Number(user.uc || 0);

  const newUC =
    oldUC + bonus;

  await db.batch([
    db.prepare(`
      UPDATE users
      SET
        uc = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(
      newUC,
      user.telegram_id
    ),

    db.prepare(`
      INSERT INTO daily_bonuses
      (
        telegram_id,
        last_claim_date
      )
      VALUES (?, ?)
      ON CONFLICT(telegram_id)
      DO UPDATE SET
        last_claim_date = excluded.last_claim_date,
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      user.telegram_id,
      today
    ),

    db.prepare(`
      INSERT INTO uc_audit
      (
        actor_telegram_id,
        target_telegram_id,
        old_uc,
        new_uc,
        amount,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      user.telegram_id,
      user.telegram_id,
      oldUC,
      newUC,
      bonus,
      "Ежедневный бонус"
    )
  ]);

  return json({
    ok: true,
    bonus,
    uc: newUC,
  });
}


/* =========================================================
   PROMO
========================================================= */

async function apiPromoUse(request, env) {
  const tgUser = await getTelegramUser(
    request,
    env
  );

  const body =
    await request.json();

  const code =
    String(body.code || "")
      .trim()
      .toUpperCase();

  if (!code) {
    return json({
      ok: false,
      error: "CODE_REQUIRED",
    }, 400);
  }

  const db = env.DB;

  const user =
    await ensureUser(db, tgUser);

  const promo =
    await first(
      db,
      `
        SELECT *
        FROM promo_codes
        WHERE code = ?
          AND enabled = 1
          AND (
            expires_at IS NULL
            OR expires_at > CURRENT_TIMESTAMP
          )
      `,
      code
    );

  if (!promo) {
    return json({
      ok: false,
      error: "PROMO_NOT_FOUND",
    }, 404);
  }

  if (
    promo.max_uses !== null &&
    Number(promo.uses_count) >=
      Number(promo.max_uses)
  ) {
    return json({
      ok: false,
      error: "PROMO_LIMIT",
    }, 400);
  }

  const already =
    await first(
      db,
      `
        SELECT id
        FROM promo_uses
        WHERE promo_id = ?
          AND telegram_id = ?
      `,
      promo.id,
      user.telegram_id
    );

  if (already) {
    return json({
      ok: false,
      error: "PROMO_ALREADY_USED",
    }, 400);
  }

  await db.batch([
    db.prepare(`
      INSERT INTO promo_uses
      (
        promo_id,
        telegram_id
      )
      VALUES (?, ?)
    `).bind(
      promo.id,
      user.telegram_id
    ),

    db.prepare(`
      UPDATE promo_codes
      SET uses_count = uses_count + 1
      WHERE id = ?
    `).bind(promo.id),
  ]);

  return json({
    ok: true,
    message:
      "Промокод активирован. Бесплатное вращение доступно."
  });
      }
      /* =========================================================
   ADMIN LOGIN
========================================================= */

async function apiAdminLogin(request, env) {
  const tgUser =
    await getTelegramUser(
      request,
      env
    );

  const body =
    await request.json();

  const login =
    String(body.login || "").trim();

  const password =
    String(body.password || "");

  const db = env.DB;

  const user =
    await ensureUser(db, tgUser);

  if (!isAdmin(user)) {
    return json({
      ok: false,
      error: "FORBIDDEN",
    }, 403);
  }

  const access =
    await first(
      db,
      `
        SELECT *
        FROM employee_access
        WHERE telegram_id = ?
      `,
      user.telegram_id
    );

  if (
    !access ||
    !Number(access.login_enabled)
  ) {
    return json({
      ok: false,
      error: "LOGIN_DISABLED",
    }, 403);
  }

  if (
    user.admin_login !== login
  ) {
    return json({
      ok: false,
      error: "INVALID_LOGIN",
    }, 401);
  }

  const valid =
    await verifyPassword(
      password,
      user.admin_password_hash
    );

  if (!valid) {
    return json({
      ok: false,
      error: "INVALID_PASSWORD",
    }, 401);
  }

  await run(
    db,
    `
      UPDATE users
      SET
        panel_session = 1,
        panel_last_activity = CURRENT_TIMESTAMP,
        last_login_at = CURRENT_TIMESTAMP,
        panel_status = 'online'
      WHERE telegram_id = ?
    `,
    user.telegram_id
  );

  /*
   * Стартуем сессию активности.
   */
  await run(
    db,
    `
      INSERT INTO staff_activity_sessions
      (
        telegram_id,
        started_at,
        active
      )
      VALUES (?, CURRENT_TIMESTAMP, 1)
    `,
    user.telegram_id
  );

  return json({
    ok: true,
    message: "Вход выполнен",
    rank: numericRank(user),
  });
}


/* =========================================================
   ADMIN LOGOUT
========================================================= */

async function apiAdminLogout(request, env) {
  const user =
    await requirePanel(
      request,
      env,
      1
    );

  const db = env.DB;

  await run(
    db,
    `
      UPDATE staff_activity_sessions
      SET
        ended_at = CURRENT_TIMESTAMP,
        active = 0
      WHERE telegram_id = ?
        AND active = 1
    `,
    user.telegram_id
  );

  await run(
    db,
    `
      UPDATE users
      SET
        panel_session = 0,
        panel_status = 'offline',
        panel_last_activity = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `,
    user.telegram_id
  );

  return json({
    ok: true,
  });
}


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function apiAdminDashboard(request, env) {
  const user =
    await requirePanel(
      request,
      env,
      1
    );

  const db = env.DB;

  const rank =
    numericRank(user);

  const online =
    await first(
      db,
      `
        SELECT COUNT(*) AS count
        FROM users
        WHERE
          rank >= 1
          AND panel_session = 1
      `
    );

  const complaints =
    await first(
      db,
      `
        SELECT COUNT(*) AS count
        FROM complaints
        WHERE status = 'pending'
      `
    );

  const topups =
    await first(
      db,
      `
        SELECT COUNT(*) AS count
        FROM topup_requests
        WHERE status = 'pending'
      `
    );

  const withdrawals =
    await first(
      db,
      `
        SELECT COUNT(*) AS count
        FROM payout_requests
        WHERE status = 'pending'
      `
    );

  const staff =
    await all(
      db,
      `
        SELECT
          u.telegram_id,
          u.username,
          u.first_name,
          u.rank,
          u.panel_status,
          u.panel_session,
          u.panel_last_activity,
          COALESCE(sp.points, 0) AS points
        FROM users u
        LEFT JOIN staff_points sp
          ON sp.telegram_id = u.telegram_id
        WHERE u.rank >= 1
        ORDER BY u.rank DESC, points DESC
      `
    );

  return json({
    ok: true,

    current_user: {
      telegram_id: user.telegram_id,
      rank,
    },

    stats: {
      online_admins:
        Number(online?.count || 0),

      pending_complaints:
        Number(complaints?.count || 0),

      pending_topups:
        Number(topups?.count || 0),

      pending_withdrawals:
        Number(withdrawals?.count || 0),
    },

    staff,
  });
    }
/* =========================================================
   ADMIN USERS SEARCH
========================================================= */

async function apiAdminUsers(request, env) {
  const user =
    await requirePanel(
      request,
      env,
      4
    );

  const db = env.DB;

  const url =
    new URL(request.url);

  const q =
    String(
      url.searchParams.get("q") || ""
    ).trim();

  if (!q) {
    return json({
      ok: true,
      users: [],
    });
  }

  const users =
    await all(
      db,
      `
        SELECT
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
          panel_status,
          panel_session,
          panel_last_activity
        FROM users
        WHERE
          telegram_id LIKE ?
          OR username LIKE ?
          OR admin_login LIKE ?
        ORDER BY rank DESC, telegram_id ASC
        LIMIT 100
      `,
      `%${q}%`,
      `%${q}%`,
      `%${q}%`
    );

  return json({
    ok: true,
    users,
  });
}


/* =========================================================
   ADMIN USER CARD
========================================================= */

async function apiAdminUser(request, env) {
  const user =
    await requirePanel(
      request,
      env,
      4
    );

  const url =
    new URL(request.url);

  const targetId =
    url.searchParams.get(
      "telegram_id"
    );

  if (!targetId) {
    return json({
      ok: false,
      error: "ID_REQUIRED",
    }, 400);
  }

  const db = env.DB;

  const target =
    await first(
      db,
      `
        SELECT
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
          panel_status,
          panel_session,
          panel_last_activity,
          last_login_at
        FROM users
        WHERE telegram_id = ?
      `,
      targetId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND",
    }, 404);
  }

  const bans =
    await all(
      db,
      `
        SELECT *
        FROM bans
        WHERE telegram_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      targetId
    );

  const mutes =
    await all(
      db,
      `
        SELECT *
        FROM mutes
        WHERE telegram_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      targetId
    );

  const spins =
    await all(
      db,
      `
        SELECT *
        FROM spin_history
        WHERE telegram_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      targetId
    );

  const complaints =
    await all(
      db,
      `
        SELECT *
        FROM complaints
        WHERE reporter_telegram_id = ?
           OR target_telegram_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      targetId,
      targetId
    );

  return json({
    ok: true,
    user: target,
    bans,
    mutes,
    spins,
    complaints,
  });
}


/* =========================================================
   CHANGE RANK
========================================================= */

async function apiAdminRank(request, env) {
  const actor =
    await requirePanel(
      request,
      env,
      5
    );

  const body =
    await request.json();

  const targetId =
    String(body.telegram_id || "");

  const newRank =
    Number(body.rank);

  const reason =
    String(body.reason || "");

  if (!targetId) {
    return json({
      ok: false,
      error: "ID_REQUIRED",
    }, 400);
  }

  if (!Number.isInteger(newRank)) {
    return json({
      ok: false,
      error: "INVALID_RANK",
    }, 400);
  }

  if (!canRank(actor, newRank)) {
    return json({
      ok: false,
      error: "RANK_FORBIDDEN",
    }, 403);
  }

  const db = env.DB;

  const target =
    await first(
      db,
      `
        SELECT *
        FROM users
        WHERE telegram_id = ?
      `,
      targetId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND",
    }, 404);
  }

  if (!canManageTarget(actor, target)) {
    return json({
      ok: false,
      error: "TARGET_FORBIDDEN",
    }, 403);
  }

  const oldRank =
    numericRank(target);

  await db.batch([
    db.prepare(`
      UPDATE users
      SET
        rank = ?,
        role = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(
      newRank,
      newRank > 0 ? "admin" : "player",
      targetId
    ),

    db.prepare(`
      INSERT INTO employee_promotions
      (
        telegram_id,
        old_rank,
        new_rank,
        points_at_decision,
        decided_by,
        reason
      )
      VALUES (?, ?, ?, 0, ?, ?)
    `).bind(
      targetId,
      oldRank,
      newRank,
      actor.telegram_id,
      reason
    ),

    db.prepare(`
      INSERT INTO action_feed
      (
        actor_telegram_id,
        actor_name,
        actor_rank,
        action,
        target_telegram_id,
        details
      )
      VALUES (?, ?, ?, 'rank_change', ?, ?)
    `).bind(
      actor.telegram_id,
      actor.username || actor.first_name || "",
      numericRank(actor),
      targetId,
      `Ранг ${oldRank} → ${newRank}`
    )
  ]);

  return json({
    ok: true,
    old_rank: oldRank,
    new_rank: newRank,
  });
}
/* =========================================================
   BALANCE CONTROL
========================================================= */

async function apiAdminBalance(request, env) {
  const actor =
    await requirePanel(
      request,
      env,
      5
    );

  const body =
    await request.json();

  const targetId =
    String(body.telegram_id || "");

  const amount =
    Number(body.amount);

  const reason =
    String(body.reason || "");

  if (
    !targetId ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "INVALID_DATA",
    }, 400);
  }

  const db = env.DB;

  const target =
    await first(
      db,
      `
        SELECT *
        FROM users
        WHERE telegram_id = ?
      `,
      targetId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND",
    }, 404);
  }

  const oldBalance =
    Number(target.balance || 0);

  const newBalance =
    oldBalance + amount;

  await db.batch([
    db.prepare(`
      UPDATE users
      SET
        balance = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(
      newBalance,
      targetId
    ),

    db.prepare(`
      INSERT INTO balance_audit
      (
        actor_telegram_id,
        target_telegram_id,
        old_balance,
        new_balance,
        amount,
        reason,
        reference_type
      )
      VALUES (?, ?, ?, ?, ?, ?, 'admin')
    `).bind(
      actor.telegram_id,
      targetId,
      oldBalance,
      newBalance,
      amount,
      reason || "Ручное начисление"
    ),

    db.prepare(`
      INSERT INTO transactions
      (
        telegram_id,
        type,
        amount,
        description
      )
      VALUES (?, 'admin_balance', ?, ?)
    `).bind(
      targetId,
      amount,
      reason || "Начисление баланса"
    ),

    db.prepare(`
      INSERT INTO notification_center
      (
        target_telegram_id,
        type,
        title,
        message
      )
      VALUES (?, 'balance', 'Пополнение баланса', ?)
    `).bind(
      targetId,
      `Вам начислили ${amount} ₽. ${reason || ""}`
    )
  ]);

  return json({
    ok: true,
    old_balance: oldBalance,
    new_balance: newBalance,
  });
}


/* =========================================================
   UC CONTROL
========================================================= */

async function apiAdminUC(request, env) {
  const actor =
    await requirePanel(
      request,
      env,
      5
    );

  const body =
    await request.json();

  const targetId =
    String(body.telegram_id || "");

  const amount =
    Number(body.amount);

  const reason =
    String(body.reason || "");

  if (
    !targetId ||
    !Number.isInteger(amount)
  ) {
    return json({
      ok: false,
      error: "INVALID_DATA",
    }, 400);
  }

  const db = env.DB;

  const target =
    await first(
      db,
      `
        SELECT *
        FROM users
        WHERE telegram_id = ?
      `,
      targetId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND",
    }, 404);
  }

  const oldUC =
    Number(target.uc || 0);

  const newUC =
    Math.max(
      0,
      oldUC + amount
    );

  const actualAmount =
    newUC - oldUC;

  await db.batch([
    db.prepare(`
      UPDATE users
      SET
        uc = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = ?
    `).bind(
      newUC,
      targetId
    ),

    db.prepare(`
      INSERT INTO uc_audit
      (
        actor_telegram_id,
        target_telegram_id,
        old_uc,
        new_uc,
        amount,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      actor.telegram_id,
      targetId,
      oldUC,
      newUC,
      actualAmount,
      reason || "Ручное изменение UC"
    ),

    db.prepare(`
      INSERT INTO notification_center
      (
        target_telegram_id,
        type,
        title,
        message
      )
      VALUES (?, 'uc', 'Изменение UC', ?)
    `).bind(
      targetId,
      `Ваш баланс изменён на ${actualAmount} UC.`
    )
  ]);

  return json({
    ok: true,
    old_uc: oldUC,
    new_uc: newUC,
  });
}
