/**
 * DOXACHKAA UC
 * Cloudflare Worker + D1 + Telegram Bot + Telegram Mini App
 *
 * D1 binding:
 *   DB
 *
 * Secrets:
 *   BOT_TOKEN
 *   WEBAPP_URL
 *
 * Optional:
 *   WEBHOOK_SECRET
 *
 * IMPORTANT:
 * - Real balances/UC live in D1.
 * - Client localStorage is NOT trusted.
 * - Telegram Mini App initData is verified server-side.
 * - Permissions are checked server-side.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // --------------------------------------------------
      // Telegram webhook
      // --------------------------------------------------

      if (
        request.method === "POST" &&
        url.pathname === "/telegram/webhook"
      ) {
        return await telegramWebhook(request, env, ctx);
      }

      // --------------------------------------------------
      // Mini App / frontend
      // --------------------------------------------------

      if (request.method === "GET" && url.pathname === "/") {
        return await serveIndex(env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/index.html"
      ) {
        return await serveIndex(env);
      }

      // --------------------------------------------------
      // Health
      // --------------------------------------------------

      if (
        request.method === "GET" &&
        url.pathname === "/api/health"
      ) {
        return json({
          ok: true,
          service: "doxachkayaa-uc",
          time: new Date().toISOString()
        });
      }

      // --------------------------------------------------
      // API
      // --------------------------------------------------

      if (url.pathname.startsWith("/api/")) {
        return await apiRouter(request, env, ctx);
      }

      return new Response("Not Found", {
        status: 404
      });

    } catch (error) {
      console.error(error);

      return json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Внутренняя ошибка сервера"
      }, 500);
    }
  }
};


// ======================================================
// CONFIG
// ======================================================

const RANKS = {
  0: {
    name: "player",
    color: "#ffffff"
  },

  1: {
    name: "admin",
    color: "#198cff"
  },

  2: {
    name: "admin",
    color: "#39ff88"
  },

  3: {
    name: "admin",
    color: "#ff8c32"
  },

  4: {
    name: "curator",
    color: "#c45cff"
  },

  5: {
    name: "deputy",
    color: "#ff3030"
  },

  6: {
    name: "chief_admin",
    color: "#ff2020"
  }
};

const MODERATOR_ROLE = "moderator";

const ACTION_POINTS = 15;
const DAILY_ACTIVITY_MINUTES = 240;
const DAILY_ACTIVITY_BONUS = 100;
const MIN_WITHDRAW_UC = 3000;


// ======================================================
// RESPONSE HELPERS
// ======================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function html(data, status = 200) {
  return new Response(data, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function nowISO() {
  return new Date().toISOString();
}

function todayMSK() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isAdmin(user) {
  return Number(user?.rank || 0) >= 1;
}

function isSenior(user) {
  return Number(user?.rank || 0) >= 5;
}

function isChief(user) {
  return Number(user?.rank || 0) >= 6;
}

function isCurator(user) {
  return Number(user?.rank || 0) >= 4;
}


// ======================================================
// DATABASE
// ======================================================

async function getUser(env, telegramId) {
  return await env.DB
    .prepare(`
      SELECT *
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(String(telegramId))
    .first();
}

async function ensureUser(env, telegramUser) {
  const telegramId = String(telegramUser.id);

  let user = await getUser(env, telegramId);

  if (user) {
    await env.DB
      .prepare(`
        UPDATE users
        SET
          username = ?,
          first_name = ?,
          last_name = ?,
          updated_at = ?
        WHERE telegram_id = ?
      `)
      .bind(
        telegramUser.username || null,
        telegramUser.first_name || null,
        telegramUser.last_name || null,
        nowISO(),
        telegramId
      )
      .run();

    return await getUser(env, telegramId);
  }

  await env.DB
    .prepare(`
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
        panel_session,
        panel_status
      )
      VALUES (?, ?, ?, ?, 'player', 0, 0, 0, ?, ?, 0, 'offline')
    `)
    .bind(
      telegramId,
      telegramUser.username || null,
      telegramUser.first_name || null,
      telegramUser.last_name || null,
      nowISO(),
      nowISO()
    )
    .run();

  return await getUser(env, telegramId);
}


// ======================================================
// TELEGRAM MINI APP AUTH
// ======================================================

async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    return null;
  }

  const params = new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("WebAppData"),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const secret = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    new TextEncoder().encode(botToken)
  );

  const secretHex = [...new Uint8Array(secret)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

  const dataKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretHex),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    dataKey,
    new TextEncoder().encode(dataCheckString)
  );

  const calculated = [...new Uint8Array(signature)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");

  if (calculated !== hash) {
    return null;
  }

  const authDate = Number(params.get("auth_date") || 0);

  if (!authDate) {
    return null;
  }

  // 24 часа
  if (
    Math.floor(Date.now() / 1000) - authDate >
    86400
  ) {
    return null;
  }

  let user;

  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch {
    return null;
  }

  if (!user.id) {
    return null;
  }

  return user;
}


// ======================================================
// API AUTH
// ======================================================

async function authenticateRequest(request, env) {
  const initData =
    request.headers.get("X-Telegram-Init-Data") ||
    request.headers.get("Authorization")?.replace(
      /^tma\s+/i,
      ""
    );

  if (!initData) {
    return null;
  }

  const telegramUser =
    await validateTelegramInitData(
      initData,
      env.BOT_TOKEN
    );

  if (!telegramUser) {
    return null;
  }

  return await ensureUser(
    env,
    telegramUser
  );
}


// ======================================================
// API ROUTER
// ======================================================

async function apiRouter(request, env, ctx) {
  const url = new URL(request.url);

  const user =
    await authenticateRequest(
      request,
      env
    );

  // Public endpoint
  if (url.pathname === "/api/config") {
    return await getPublicConfig(env);
  }

  if (!user) {
    return json({
      ok: false,
      error: "UNAUTHORIZED"
    }, 401);
  }

  // ----------------------------------------------------
  // ME
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/me"
  ) {
    return await apiMe(user, env);
  }

  // ----------------------------------------------------
  // WHEEL
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/wheel"
  ) {
    return await apiWheel(env);
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/wheel/spin"
  ) {
    return await apiSpin(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // PROFILE
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/profile"
  ) {
    return await apiProfile(user, env);
  }

  // ----------------------------------------------------
  // DAILY BONUS
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/daily-bonus"
  ) {
    return await claimDailyBonus(
      user,
      env
    );
  }

  // ----------------------------------------------------
  // TOPUP
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/topup"
  ) {
    return await createTopup(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // WITHDRAW
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/withdraw"
  ) {
    return await createWithdrawal(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // COMPLAINTS
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/complaints"
  ) {
    return await createComplaint(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // CHAT
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/chat"
  ) {
    return await getChat(
      user,
      env
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/chat"
  ) {
    return await sendChatMessage(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // ADMIN
  // ----------------------------------------------------

  if (url.pathname.startsWith("/api/admin/")) {

    if (!isAdmin(user)) {
      return json({
        ok: false,
        error: "FORBIDDEN"
      }, 403);
    }

    return await adminRouter(
      request,
      user,
      env
    );
  }

  return json({
    ok: false,
    error: "NOT_FOUND"
  }, 404);
}


// ======================================================
// PUBLIC CONFIG
// ======================================================

async function getPublicConfig(env) {
  const wheel =
    await env.DB
      .prepare(`
        SELECT *
        FROM wheel_settings
        WHERE id = 1
      `)
      .first();

  const maintenance =
    await env.DB
      .prepare(`
        SELECT *
        FROM maintenance_settings
        WHERE id = 1
      `)
      .first();

  return json({
    ok: true,

    wheel: wheel || {
      spin_cost: 0,
      currency: "RUB",
      enabled: 1
    },

    maintenance: maintenance || {
      enabled: 0
    },

    minWithdrawUC: MIN_WITHDRAW_UC
  });
}


// ======================================================
// ME
// ======================================================

async function apiMe(user, env) {
  const restrictions =
    await env.DB
      .prepare(`
        SELECT *
        FROM user_restrictions
        WHERE telegram_id = ?
      `)
      .bind(user.telegram_id)
      .first();

  return json({
    ok: true,

    user: {
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,

      role: user.role,
      rank: user.rank,

      balance: Number(user.balance),
      uc: Number(user.uc),

      panel_session:
        Number(user.panel_session) === 1,

      panel_status:
        user.panel_status,

      restrictions: restrictions || {
        balance_blocked: 0,
        uc_blocked: 0
      }
    }
  });
}


// ======================================================
// PROFILE
// ======================================================

async function apiProfile(user, env) {
  const spins =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM spin_history
        WHERE telegram_id = ?
      `)
      .bind(user.telegram_id)
      .first();

  const complaints =
    await env.DB
      .prepare(`
        SELECT COUNT(*) AS total
        FROM complaints
        WHERE reporter_telegram_id = ?
      `)
      .bind(user.telegram_id)
      .first();

  return json({
    ok: true,

    profile: {
      id: user.telegram_id,
      username: user.username,
      name: [
        user.first_name,
        user.last_name
      ].filter(Boolean).join(" "),

      role: user.role,
      rank: user.rank,

      balance: Number(user.balance),
      uc: Number(user.uc),

      spins: Number(spins?.total || 0),
      complaints: Number(complaints?.total || 0),

      created_at: user.created_at
    }
  });
}


// ======================================================
// WHEEL
// ======================================================

async function apiWheel(env) {
  const settings =
    await env.DB
      .prepare(`
        SELECT *
        FROM wheel_settings
        WHERE id = 1
      `)
      .first();

  const prizes =
    await env.DB
      .prepare(`
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
      `)
      .all();

  return json({
    ok: true,
    settings,
    prizes: prizes.results || []
  });
}


// ======================================================
// SECURE RANDOM
// ======================================================

function secureRandom() {
  const array =
    new Uint32Array(1);

  crypto.getRandomValues(array);

  return array[0] /
    4294967296;
}


// ======================================================
// PICK PRIZE
// ======================================================

function choosePrize(prizes) {
  if (!prizes.length) {
    return null;
  }

  const total =
    prizes.reduce(
      (sum, prize) =>
        sum + Number(prize.probability || 0),
      0
    );

  if (total <= 0) {
    return prizes[0];
  }

  let random =
    secureRandom() * total;

  for (const prize of prizes) {

    random -=
      Number(prize.probability || 0);

    if (random <= 0) {
      return prize;
    }
  }

  return prizes[prizes.length - 1];
}


// ======================================================
// SPIN
// ======================================================

async function apiSpin(request, user, env) {

  const maintenance =
    await env.DB
      .prepare(`
        SELECT *
        FROM maintenance_settings
        WHERE id = 1
      `)
      .first();

  if (
    maintenance &&
    Number(maintenance.enabled) === 1
  ) {
    return json({
      ok: false,
      error: "MAINTENANCE",
      message:
        maintenance.message ||
        "Игра временно недоступна"
    }, 503);
  }

  const settings =
    await env.DB
      .prepare(`
        SELECT *
        FROM wheel_settings
        WHERE id = 1
      `)
      .first();

  if (!settings) {
    return json({
      ok: false,
      error: "WHEEL_NOT_CONFIGURED"
    }, 500);
  }

  if (
    Number(settings.enabled) !== 1
  ) {
    return json({
      ok: false,
      error: "WHEEL_DISABLED"
    }, 403);
  }

  const restriction =
    await env.DB
      .prepare(`
        SELECT *
        FROM user_restrictions
        WHERE telegram_id = ?
      `)
      .bind(user.telegram_id)
      .first();

  if (
    restriction &&
    Number(restriction.uc_blocked) === 1
  ) {
    return json({
      ok: false,
      error: "UC_BLOCKED"
    }, 403);
  }

  if (
    restriction &&
    Number(restriction.balance_blocked) === 1
  ) {
    return json({
      ok: false,
      error: "BALANCE_BLOCKED"
    }, 403);
  }

  const cost =
    Number(settings.spin_cost || 0);

  if (Number(user.balance) < cost) {
    return json({
      ok: false,
      error: "INSUFFICIENT_BALANCE",
      required: cost,
      balance: Number(user.balance)
    }, 400);
  }

  const prizes =
    await env.DB
      .prepare(`
        SELECT *
        FROM wheel_prizes
        WHERE enabled = 1
        ORDER BY sort_order ASC, id ASC
      `)
      .all();

  const prize =
    choosePrize(prizes.results || []);

  if (!prize) {
    return json({
      ok: false,
      error: "NO_PRIZES"
    }, 500);
  }

  const newBalance =
    Number(user.balance) - cost;

  const prizeUC =
    prize.prize_type === "uc"
      ? Number(prize.prize_value || 0)
      : 0;

  const prizeBalance =
    prize.prize_type === "balance"
      ? Number(prize.prize_value || 0)
      : 0;

  const newUC =
    Number(user.uc) + prizeUC;

  const spinNumber =
    await getNextSpinNumber(
      user.telegram_id,
      env
    );

  // ----------------------------------------------------
  // TRANSACTION
  // ----------------------------------------------------

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET
        balance = ?,
        uc = ?,
        updated_at = ?
      WHERE telegram_id = ?
    `).bind(
      newBalance,
      newUC,
      nowISO(),
      user.telegram_id
    ),

    env.DB.prepare(`
      INSERT INTO spins (
        telegram_id,
        spin_number,
        prize_uc,
        prize_balance
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      user.telegram_id,
      spinNumber,
      prizeUC,
      prizeBalance
    ),

    env.DB.prepare(`
      INSERT INTO spin_history (
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
      Number(prize.prize_value || 0),
      cost
    ),

    env.DB.prepare(`
      INSERT INTO spin_audit (
        actor_telegram_id,
        target_telegram_id,
        old_spins,
        new_spins,
        amount,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      user.telegram_id,
      user.telegram_id,
      spinNumber - 1,
      spinNumber,
      cost,
      "wheel_spin"
    ),

    env.DB.prepare(`
      INSERT INTO transactions (
        telegram_id,
        type,
        amount,
        description
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      user.telegram_id,
      "wheel_spin",
      -cost,
      `Прокрутка #${spinNumber}`
    ),

    env.DB.prepare(`
      INSERT INTO uc_audit (
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
      Number(user.uc),
      newUC,
      prizeUC,
      `wheel:${prize.name}`
    )

  ]);

  return json({
    ok: true,

    spin: {
      number: spinNumber,

      prize: {
        id: prize.id,
        name: prize.name,
        type: prize.prize_type,
        value: Number(prize.prize_value || 0)
      },

      balance: newBalance,
      uc: newUC,
      cost
    }
  });
}


async function getNextSpinNumber(
  telegramId,
  env
) {
  const row =
    await env.DB
      .prepare(`
        SELECT MAX(spin_number) AS max_spin
        FROM spins
        WHERE telegram_id = ?
      `)
      .bind(telegramId)
      .first();

  return Number(row?.max_spin || 0) + 1;
}


// ======================================================
// DAILY BONUS
// ======================================================

async function claimDailyBonus(user, env) {

  const today =
    todayMSK();

  const record =
    await env.DB
      .prepare(`
        SELECT *
        FROM daily_bonuses
        WHERE telegram_id = ?
      `)
      .bind(user.telegram_id)
      .first();

  if (
    record &&
    record.last_claim_date === today
  ) {
    return json({
      ok: false,
      error: "ALREADY_CLAIMED"
    }, 400);
  }

  const reward =
    await getSystemNumber(
      env,
      "daily_bonus_uc",
      100
    );

  const newUC =
    Number(user.uc) + reward;

  await env.DB.batch([

    env.DB.prepare(`
      INSERT INTO daily_bonuses (
        telegram_id,
        last_claim_date,
        updated_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(telegram_id)
      DO UPDATE SET
        last_claim_date = excluded.last_claim_date,
        updated_at = excluded.updated_at
    `).bind(
      user.telegram_id,
      today,
      nowISO()
    ),

    env.DB.prepare(`
      UPDATE users
      SET
        uc = ?,
        updated_at = ?
      WHERE telegram_id = ?
    `).bind(
      newUC,
      nowISO(),
      user.telegram_id
    ),

    env.DB.prepare(`
      INSERT INTO uc_audit (
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
      Number(user.uc),
      newUC,
      reward,
      "daily_bonus"
    )

  ]);

  return json({
    ok: true,
    reward,
    uc: newUC
  });
}
// ======================================================
// TOPUP
// ======================================================

async function createTopup(
  request,
  user,
  env
) {
  const body =
    await request.json().catch(
      () => ({})
    );

  const amount =
    Number(body.amount);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "INVALID_AMOUNT"
    }, 400);
  }

  const result =
    await env.DB
      .prepare(`
        INSERT INTO topup_requests (
          telegram_id,
          amount,
          status
        )
        VALUES (?, ?, 'pending')
      `)
      .bind(
        user.telegram_id,
        amount
      )
      .run();

  return json({
    ok: true,
    request_id:
      result.meta.last_row_id,
    amount,
    status: "pending"
  });
}


// ======================================================
// WITHDRAW
// ======================================================

async function createWithdrawal(
  request,
  user,
  env
) {
  const body =
    await request.json().catch(
      () => ({})
    );

  const pubgId =
    String(body.pubg_mobile_id || "")
      .trim();

  const amount =
    Number(body.uc_amount);

  if (!pubgId) {
    return json({
      ok: false,
      error: "PUBG_ID_REQUIRED"
    }, 400);
  }

  if (
    !Number.isInteger(amount) ||
    amount < MIN_WITHDRAW_UC
  ) {
    return json({
      ok: false,
      error: "MINIMUM_WITHDRAW",
      minimum: MIN_WITHDRAW_UC
    }, 400);
  }

  if (Number(user.uc) < amount) {
    return json({
      ok: false,
      error: "INSUFFICIENT_UC"
    }, 400);
  }

  const restriction =
    await env.DB
      .prepare(`
        SELECT *
        FROM user_restrictions
        WHERE telegram_id = ?
      `)
      .bind(user.telegram_id)
      .first();

  if (
    restriction &&
    Number(restriction.uc_blocked) === 1
  ) {
    return json({
      ok: false,
      error: "UC_BLOCKED"
    }, 403);
  }

  const result =
    await env.DB
      .prepare(`
        INSERT INTO payout_requests (
          telegram_id,
          pubg_mobile_id,
          uc_amount,
          status
        )
        VALUES (?, ?, ?, 'pending')
      `)
      .bind(
        user.telegram_id,
        pubgId,
        amount
      )
      .run();

  return json({
    ok: true,
    request_id:
      result.meta.last_row_id,
    status: "pending"
  });
}


// ======================================================
// COMPLAINTS
// ======================================================

async function createComplaint(
  request,
  user,
  env
) {
  const body =
    await request.json().catch(
      () => ({})
    );

  const target =
    String(body.target_telegram_id || "")
      .trim();

  const targetRole =
    String(body.target_role || "")
      .trim();

  const text =
    String(body.complaint_text || "")
      .trim();

  if (!target || !targetRole || !text) {
    return json({
      ok: false,
      error: "INVALID_COMPLAINT"
    }, 400);
  }

  const result =
    await env.DB
      .prepare(`
        INSERT INTO complaints (
          reporter_telegram_id,
          target_telegram_id,
          target_role,
          complaint_text
        )
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        user.telegram_id,
        target,
        targetRole,
        text
      )
      .run();

  return json({
    ok: true,
    complaint_id:
      result.meta.last_row_id
  });
}


// ======================================================
// CHAT
// ======================================================

async function getChat(user, env) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          telegram_id,
          username,
          role_key,
          message,
          created_at
        FROM wheel_chat_messages
        WHERE deleted = 0
        ORDER BY id DESC
        LIMIT 100
      `)
      .all();

  return json({
    ok: true,
    messages:
      (result.results || []).reverse()
  });
}


async function sendChatMessage(
  request,
  user,
  env
) {
  const body =
    await request.json().catch(
      () => ({})
    );

  const message =
    String(body.message || "")
      .trim();

  if (!message) {
    return json({
      ok: false,
      error: "EMPTY_MESSAGE"
    }, 400);
  }

  if (message.length > 500) {
    return json({
      ok: false,
      error: "MESSAGE_TOO_LONG"
    }, 400);
     }
     const result =
    await env.DB
      .prepare(`
        INSERT INTO wheel_chat_messages (
          telegram_id,
          username,
          role_key,
          message
        )
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        user.telegram_id,
        user.username || null,
        getRoleKey(user),
        message
      )
      .run();

  return json({
    ok: true,
    id: result.meta.last_row_id
  });
}


function getRoleKey(user) {

  if (Number(user.rank) >= 1) {
    return `rank_${user.rank}`;
  }

  if (user.role === MODERATOR_ROLE) {
    return MODERATOR_ROLE;
  }

  return "player";
}


// ======================================================
// ADMIN ROUTER
// ======================================================

async function adminRouter(
  request,
  user,
  env
) {
  const url =
    new URL(request.url);

  // ----------------------------------------------------
  // Admin dashboard
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/dashboard"
  ) {
    return await adminDashboard(
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Search player
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/player"
  ) {

    if (
      Number(user.rank) < 4
    ) {
      return json({
        ok: false,
        error: "FORBIDDEN"
      }, 403);
    }

    const id =
      url.searchParams.get(
        "telegram_id"
      );

    if (!id) {
      return json({
        ok: false,
        error: "ID_REQUIRED"
      }, 400);
    }

    return await adminPlayerSearch(
      id,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Rank
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/rank"
  ) {
    return await adminRank(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Unrank
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/unrank"
  ) {
    return await adminUnrank(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Wheel settings
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/wheel/settings"
  ) {
    return await updateWheelSettings(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Wheel prizes
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/wheel/prize"
  ) {
    return await updateWheelPrize(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Maintenance
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/maintenance"
  ) {
    return await updateMaintenance(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Emergency
  // ----------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/emergency"
  ) {
    return await updateEmergency(
      request,
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Activity
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/activity"
  ) {
    if (!isCurator(user)) {
      return json({
        ok: false,
        error: "FORBIDDEN"
      }, 403);
    }

    return await getStaffActivity(
      user,
      env
    );
  }

  // ----------------------------------------------------
  // Notifications
  // ----------------------------------------------------

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/notifications"
  ) {
    return await getNotifications(
      user,
      env
    );
  }

  return json({
    ok: false,
    error: "ADMIN_ENDPOINT_NOT_FOUND"
  }, 404);
}


// ======================================================
// ADMIN DASHBOARD
// ======================================================
   async function adminDashboard(
  user,
  env
) {
  const counts = {};

  const tables = [
    ["complaints", "pending"],
    ["topup_requests", "pending"],
    ["payout_requests", "pending"],
    ["support_tickets", "open"]
  ];

  for (
    const [table, status]
    of tables
  ) {

    const row =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS count
          FROM ${table}
          WHERE status = ?
        `)
        .bind(status)
        .first();

    counts[table] =
      Number(row?.count || 0);
  }

  return json({
    ok: true,

    admin: {
      telegram_id: user.telegram_id,
      username: user.username,
      rank: user.rank,
      role: user.role
    },

    counts
  });
}


// ======================================================
// PLAYER SEARCH
// ======================================================

async function adminPlayerSearch(
  telegramId,
  actor,
  env
) {
  const target =
    await getUser(
      env,
      telegramId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND"
    }, 404);
  }

  const bans =
    await env.DB
      .prepare(`
        SELECT *
        FROM bans
        WHERE telegram_id = ?
      `)
      .bind(telegramId)
      .all();

  const mutes =
    await env.DB
      .prepare(`
        SELECT *
        FROM mutes
        WHERE telegram_id = ?
        ORDER BY id DESC
        LIMIT 50
      `)
      .bind(telegramId)
      .all();

  const spins =
    await env.DB
      .prepare(`
        SELECT *
        FROM spin_history
        WHERE telegram_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
      .bind(telegramId)
      .all();

  const actions =
    await env.DB
      .prepare(`
        SELECT *
        FROM admin_actions
        WHERE target_telegram_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
      .bind(telegramId)
      .all();

  const complaints =
    await env.DB
      .prepare(`
        SELECT *
        FROM complaints
        WHERE target_telegram_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
      .bind(telegramId)
      .all();

  return json({
    ok: true,

    user: {
      telegram_id: target.telegram_id,
      username: target.username,
      first_name: target.first_name,
      last_name: target.last_name,
      role: target.role,
      rank: target.rank,
      balance: Number(target.balance),
      uc: Number(target.uc),
      created_at: target.created_at
    },

    bans: bans.results || [],
    mutes: mutes.results || [],
    spins: spins.results || [],
    actions: actions.results || [],
    complaints:
      complaints.results || []
  });
}


// ======================================================
// RANK
// ======================================================

async function adminRank(
  request,
  actor,
  env
) {
  if (
    Number(actor.rank) < 5
  ) {
    return json({
      ok: false,
      error: "RANK_PERMISSION_DENIED"
    }, 403);
  }

  const body =
    await request.json().catch(
      () => ({})
    );

  const targetId =
    String(body.telegram_id || "")
      .trim();

  const newRank =
    Number(body.rank);

  const reason =
    String(body.reason || "")
      .trim();

  if (
    !targetId ||
    !Number.isInteger(newRank) ||
    newRank < 0 ||
    newRank > 6
  ) {
    return json({
      ok: false,
      error: "INVALID_RANK_REQUEST"
    }, 400);
  }

  // Rank 5 cannot touch rank 6
  if (
    Number(actor.rank) === 5 &&
    newRank >= 6
  ) {
    return json({
      ok: false,
      error: "RANK_6_RESERVED"
    }, 403);
  }

  const target =
    await getUser(
      env,
      targetId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND"
    }, 404);
  }

  if (
    Number(actor.rank) === 5 &&
    Number(target.rank) >= 6
  ) {
    return json({
      ok: false,
      error: "CANNOT_MODIFY_RANK_6"
    }, 403);
  }

  const oldRank =
    Number(target.rank);

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET
        rank = ?,
        role = ?,
        updated_at = ?
      WHERE telegram_id = ?
    `).bind(
      newRank,
      roleForRank(newRank),
      nowISO(),
      targetId
    ),

    env.DB.prepare(`
      INSERT INTO employee_promotions (
        telegram_id,
        old_rank,
        new_rank,
        points_at_decision,
        decided_by,
        reason
      )
      SELECT
        ?,
        ?,
        ?,
        COALESCE(
          (
            SELECT points
            FROM staff_points
            WHERE telegram_id = ?
          ),
          0
        ),
        ?,
        ?
    `).bind(
      targetId,
      oldRank,
      newRank,
      targetId,
      actor.telegram_id,
      reason || null
    ),

    env.DB.prepare(`
      INSERT INTO admin_actions (
        admin_telegram_id,
        action,
        target_telegram_id,
        details
      )
      VALUES (?, 'rank_change', ?, ?)
    `).bind(
      actor.telegram_id,
      targetId,
      JSON.stringify({
        oldRank,
        newRank,
        reason
      })
    ),
     env.DB.prepare(`
      INSERT INTO action_feed (
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
      actor.username ||
        actor.first_name ||
        null,
      actor.rank,
      targetId,
      JSON.stringify({
        oldRank,
        newRank
      })
    )
  ]);

  return json({
    ok: true,
    old_rank: oldRank,
    new_rank: newRank
  });
}


// ======================================================
// UNRANK
// ======================================================

async function adminUnrank(
  request,
  actor,
  env
) {
  if (
    Number(actor.rank) < 5
  ) {
    return json({
      ok: false,
      error: "FORBIDDEN"
    }, 403);
  }

  const body =
    await request.json().catch(
      () => ({})
    );

  const targetId =
    String(body.telegram_id || "")
      .trim();

  if (!targetId) {
    return json({
      ok: false,
      error: "ID_REQUIRED"
    }, 400);
  }

  const target =
    await getUser(
      env,
      targetId
    );

  if (!target) {
    return json({
      ok: false,
      error: "USER_NOT_FOUND"
    }, 404);
  }

  if (
    Number(actor.rank) === 5 &&
    Number(target.rank) >= 6
  ) {
    return json({
      ok: false,
      error: "CANNOT_MODIFY_RANK_6"
    }, 403);
  }

  const oldRank =
    Number(target.rank);

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET
        rank = 0,
        role = 'player',
        updated_at = ?
      WHERE telegram_id = ?
    `).bind(
      nowISO(),
      targetId
    ),

    env.DB.prepare(`
      INSERT INTO employee_promotions (
        telegram_id,
        old_rank,
        new_rank,
        points_at_decision,
        decided_by,
        reason
      )
      VALUES (?, ?, 0, 0, ?, 'unrank')
    `).bind(
      targetId,
      oldRank,
      actor.telegram_id
    ),

    env.DB.prepare(`
      INSERT INTO admin_actions (
        admin_telegram_id,
        action,
        target_telegram_id,
        details
      )
      VALUES (?, 'unrank', ?, ?)
    `).bind(
      actor.telegram_id,
      targetId,
      JSON.stringify({
        oldRank,
        newRank: 0
      })
    )
  ]);

  return json({
    ok: true,
    old_rank: oldRank,
    new_rank: 0
  });
}


function roleForRank(rank) {

  if (rank >= 1) {
    return "admin";
  }

  return "player";
}


// ======================================================
// WHEEL SETTINGS ADMIN
// ======================================================

async function updateWheelSettings(
  request,
  actor,
  env
) {
  if (!isSenior(actor)) {
    return json({
      ok: false,
      error: "FORBIDDEN"
    }, 403);
  }

  const body =
    await request.json().catch(
      () => ({})
    );

  const cost =
    Number(body.spin_cost);

  const enabled =
    Number(body.enabled ? 1 : 0);

  if (
    !Number.isFinite(cost) ||
    cost < 0
  ) {
    return json({
      ok: false,
      error: "INVALID_COST"
    }, 400);
  }

  await env.DB
    .prepare(`
      INSERT INTO wheel_settings (
        id,
        spin_cost,
        currency,
        enabled,
        updated_by,
        updated_at
      )
      VALUES (1, ?, 'RUB', ?, ?, ?)
      ON CONFLICT(id)
      DO UPDATE SET
        spin_cost = excluded.spin_cost,
        enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `)
    .bind(
      cost,
      enabled,
      actor.telegram_id,
      nowISO()
    )
    .run();

  await writeAdminAction(
    env,
    actor,
    "wheel_settings_update",
    null,
    {
      spin_cost: cost,
      enabled
    }
  );

  return json({
    ok: true
  });
}
// ======================================================
// WHEEL PRIZE ADMIN
// ======================================================

async function updateWheelPrize(
  request,
  actor,
  env
) {
  if (!isSenior(actor)) {
    return json({
      ok: false,
      error: "FORBIDDEN"
    }, 403);
  }

  const body =
    await request.json().catch(
      () => ({})
    );

  const id =
    Number(body.id);

  if (!Number.isInteger(id)) {
    return json({
      ok: false,
      error: "INVALID_ID"
    }, 400);
  }

  const probability =
    Number(body.probability);

  const enabled =
    Number(body.enabled ? 1 : 0);

  if (
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 100
  ) {
    return json({
      ok: false,
      error: "INVALID_PROBABILITY"
    }, 400);
  }

  await env.DB
    .prepare(`
      UPDATE wheel_prizes
      SET
        probability = ?,
        enabled = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      probability,
      enabled,
      nowISO(),
      id
    )
    .run();

  await writeAdminAction(
    env,
    actor,
    "wheel_prize_update",
    null,
    {
      prize_id: id,
      probability,
      enabled
    }
  );

  return json({
    ok: true
  });
}


// ======================================================
// MAINTENANCE
// ======================================================

async function updateMaintenance(
  request,
  actor,
  env
) {
  if (!isSenior(actor)) {
    return json({
      ok: false,
      error: "FORBIDDEN"
    }, 403);
  }

  const body =
    await request.json().catch(
      () => ({})
    );

  const enabled =
    Number(body.enabled ? 1 : 0);

  await env.DB
    .prepare(`
      INSERT INTO maintenance_settings (
        id,
        enabled,
        message,
        reason,
        ends_at,
        updated_by,
        updated_at
      )
      VALUES (
        1, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id)
      DO UPDATE SET
        enabled = excluded.enabled,
        message = excluded.message,
        reason = excluded.reason,
        ends_at = excluded.ends_at,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `)
    .bind(
      enabled,
      body.message || null,
      body.reason || null,
      body.ends_at || null,
      actor.telegram_id,
      nowISO()
    )
    .run();

  return json({
    ok: true
  });
}


// ======================================================
// EMERGENCY
// ======================================================

async function updateEmergency(
  request,
  actor,
  env
) {
  if (!isSenior(actor)) {
    return json({
      ok: false,
      error: "FORBIDDEN"
    }, 403);
  }

  const body =
    await request.json().catch(
      () => ({})
    );

  const allowed = [
    "wheel_disabled",
    "topup_disabled",
    "withdraw_disabled",
    "promo_disabled"
  ];

  const statements = [];

  for (const key of allowed) {

    if (!(key in body)) {
      continue;
    }

    statements.push(
      env.DB.prepare(`
        INSERT INTO system_flags (
          key,
          value,
          updated_by,
          updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key)
        DO UPDATE SET
          value = excluded.value,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `).bind(
        key,
        body[key] ? "1" : "0",
        actor.telegram_id,
        nowISO()
      )
    );
  }

  if (statements.length) {
    await env.DB.batch(statements);
  }

  return json({
    ok: true
  });
}
// ======================================================
// STAFF ACTIVITY
// ======================================================

async function getStaffActivity(
  actor,
  env
) {
  const date =
    todayMSK();

  const result =
    await env.DB
      .prepare(`
        SELECT
          d.*,
          u.username,
          u.first_name,
          u.last_name,
          u.rank,
          u.panel_status,
          u.panel_last_activity
        FROM staff_activity_daily d
        JOIN users u
          ON u.telegram_id = d.telegram_id
        WHERE d.activity_date = ?
        ORDER BY
          d.points_earned DESC,
          d.active_minutes DESC
      `)
      .bind(date)
      .all();

  return json({
    ok: true,
    date,
    activity:
      result.results || []
  });
}


// ======================================================
// NOTIFICATIONS
// ======================================================

async function getNotifications(
  user,
  env
) {
  const result =
    await env.DB
      .prepare(`
        SELECT *
        FROM notification_center
        WHERE
          target_telegram_id IS NULL
          OR target_telegram_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
      .bind(user.telegram_id)
      .all();

  return json({
    ok: true,
    notifications:
      result.results || []
  });
}


// ======================================================
// ADMIN ACTION
// ======================================================

async function writeAdminAction(
  env,
  actor,
  action,
  target,
  details
) {
  await env.DB.batch([

    env.DB.prepare(`
      INSERT INTO admin_actions (
        admin_telegram_id,
        action,
        target_telegram_id,
        details
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      actor.telegram_id,
      action,
      target || null,
      JSON.stringify(details || {})
    ),

    env.DB.prepare(`
      INSERT INTO action_feed (
        actor_telegram_id,
        actor_name,
        actor_rank,
        action,
        target_telegram_id,
        details
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      actor.telegram_id,
      actor.username ||
        actor.first_name ||
        null,
      actor.rank,
      action,
      target || null,
      JSON.stringify(details || {})
    )
  ]);
}


// ======================================================
// SYSTEM NUMBER
// ======================================================

async function getSystemNumber(
  env,
  key,
  fallback
) {
  const row =
    await env.DB
      .prepare(`
        SELECT value
        FROM system_settings
        WHERE key = ?
      `)
      .bind(key)
      .first();

  if (!row) {
    return fallback;
  }

  const number =
    Number(row.value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


// ======================================================
// TELEGRAM BOT
// ======================================================

async function telegramWebhook(
  request,
  env
) {
  const update =
    await request.json();

  // ----------------------------------------------
  // MESSAGE
  // ----------------------------------------------

  if (update.message) {

    const message =
      update.message;

    const telegramUser =
      message.from;

    if (!telegramUser) {
      return json({
        ok: true
      });
    }

    const user =
      await ensureUser(
        env,
        telegramUser
      );

    const text =
      String(message.text || "")
        .trim();

    // /start
    if (
      text === "/start" ||
      text.startsWith("/start ")
    ) {
      await telegramStart(
        message.chat.id,
        user,
        env
      );

      return json({
        ok: true
      });
    }

    // /alogin
    if (text === "/alogin") {

      if (
        Number(user.rank) >= 1
      ) {
        await telegramSendMessage(
          env,
          message.chat.id,
          "🔐 Админ-панель\n\nОткройте Mini App для входа в панель."
        );
}
       return json({
        ok: true
      });
    }

    // /hlogin
    if (text === "/hlogin") {

      if (
        user.role === MODERATOR_ROLE
      ) {
        await telegramSendMessage(
          env,
          message.chat.id,
          "🔐 Панель модератора\n\nОткройте Mini App для входа."
        );
      }

      return json({
        ok: true
      });
    }

    // /admins
    if (text === "/admins") {
      await telegramAdmins(
        message.chat.id,
        env
      );

      return json({
        ok: true
      });
    }

    // /moder
    if (text === "/moder") {
      await telegramModerators(
        message.chat.id,
        env
      );

      return json({
        ok: true
      });
    }

    // Unknown command
    return json({
      ok: true
    });
  }

  return json({
    ok: true
  });
}


// ======================================================
// TELEGRAM START
// ======================================================

async function telegramStart(
  chatId,
  user,
  env
) {
  const webApp =
    env.WEBAPP_URL;

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🎰 Открыть DOXACHKAA UC",
          web_app: {
            url: webApp
          }
        }
      ]
    ]
  };

  await telegramSendMessage(
    env,
    chatId,
    `🎰 <b>DOXACHKAA UC</b>\n\nДобро пожаловать!\n\nID: <code>${escapeHtml(user.telegram_id)}</code>`,
    keyboard
  );
}


// ======================================================
// /admins
// ======================================================

async function telegramAdmins(
  chatId,
  env
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          telegram_id,
          username,
          first_name,
          rank,
          panel_status,
          panel_session
        FROM users
        WHERE rank BETWEEN 1 AND 6
          AND (
            rank < 5
            OR panel_session = 1
          )
        ORDER BY rank DESC
      `)
      .all();

  const list =
    result.results || [];

  if (!list.length) {
    await telegramSendMessage(
      env,
      chatId,
      "👮 Сейчас администраторов онлайн нет."
    );

    return;
  }

  let text =
    "👮 <b>Администраторы</b>\n\n";

  for (const admin of list) {

    const name =
      admin.username
        ? `@${escapeHtml(admin.username)}`
        : escapeHtml(
            admin.first_name ||
            admin.telegram_id
          );

    text +=
      `${statusIcon(admin.panel_status)} ` +
      `${name} — ${admin.rank} ранг\n`;
  }

  await telegramSendMessage(
    env,
    chatId,
    text
  );
}


// ======================================================
// /moder
// ======================================================

async function telegramModerators(
  chatId,
  env
) {
  const result =
    await env.DB
      .prepare(`
        SELECT
          telegram_id,
          username,
          first_name,
          panel_status
        FROM users
        WHERE role = 'moderator'
          AND panel_session = 1
        ORDER BY first_name
      `)
      .all();

  const list =
    result.results || [];

  if (!list.length) {

    await telegramSendMessage(
      env,
      chatId,
      "🟡 Модераторов онлайн нет."
    );

    return;
  }

  let text =
    "🛡 <b>Модераторы</b>\n\n";

  for (const moderator of list) {

    const name =
      moderator.username
        ? `@${escapeHtml(moderator.username)}`
        : escapeHtml(
            moderator.first_name ||
            moderator.telegram_id
          );

    text +=
      `🟢 ${name}\n`;
  }

  await telegramSendMessage(
    env,
    chatId,
    text
  );
}


function statusIcon(status) {

  switch (status) {

    case "online":
      return "🟢";

    case "away":
      return "🟡";

    case "inactive":
      return "🔴";

    default:
      return "⚫";
  }
}
// ======================================================
// TELEGRAM SEND
// ======================================================

async function telegramSendMessage(
  env,
  chatId,
  text,
  replyMarkup = null
) {
  if (!env.BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN is not configured"
    );
  }

  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML"
  };

  if (replyMarkup) {
    body.reply_markup =
      replyMarkup;
  }

  const response =
    await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

  if (!response.ok) {
    console.error(
      "Telegram API error",
      await response.text()
    );
  }
}


// ======================================================
// HTML
// ======================================================

async function serveIndex(env) {

  /*
   * Вариант 1:
   * Если index.html лежит в Worker assets,
   * здесь можно использовать env.ASSETS.
   *
   * Вариант 2:
   * Cloudflare Pages / Worker Static Assets.
   */

  if (env.ASSETS) {

    return await env.ASSETS.fetch(
      new Request(
        "https://internal/index.html"
      )
    );
  }

  return new Response(
    `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>DOXACHKAA UC</title>
</head>
<body style="
background:#050b10;
color:white;
font-family:Arial;
text-align:center;
padding:50px;
">
<h1>DOXACHKAA UC</h1>
<p>Mini App frontend не подключён.</p>
</body>
</html>`,
    {
      headers: {
        "content-type":
          "text/html; charset=utf-8"
      }
    }
  );
}


// ======================================================
// ESCAPE
// ======================================================

function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
