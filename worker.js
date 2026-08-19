const OWNER_IDS = [
  "683842108"
];

const ROLE_RANKS = {
  owner: 6,
  deputy_owner: 5,
  admin_4: 4,
  admin_3: 3,
  admin_2: 2,
  admin_1: 1,
  moderator: 0,
  player: null
};

const ADMIN_ROLES = [
  "admin_1",
  "admin_2",
  "admin_3",
  "admin_4",
  "moderator"
];

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      /*
       * PUBLIC
       */

      if (path === "/" && method === "GET") {
        return json({
          ok: true,
          service: "cold-queen-db",
          status: "online"
        });
      }

      if (path === "/api/user" && method === "POST") {
        return await getUser(request, env);
      }

      if (path === "/api/wheel" && method === "GET") {
        return await getWheel(request, env);
      }

      if (path === "/api/wheel/spin" && method === "POST") {
        return await spinWheel(request, env);
      }

      if (path === "/api/chat" && method === "GET") {
        return await getChat(request, env);
      }

      if (path === "/api/chat/send" && method === "POST") {
        return await sendChatMessage(request, env);
      }

      if (path === "/api/complaint" && method === "POST") {
        return await createComplaint(request, env);
      }

      if (path === "/api/payment/create" && method === "POST") {
        return await createPayment(request, env);
      }

      if (path === "/api/payment/receipt" && method === "POST") {
        return await submitPaymentReceipt(request, env);
      }

      /*
       * ADMIN PANEL
       */

      if (path === "/api/admin" && method === "GET") {
        return await adminPanel(request, env);
      }

      if (path === "/api/admin/users" && method === "GET") {
        return await getAdminUsers(request, env);
      }

      if (path === "/api/admin/balance" && method === "POST") {
        return await changeBalance(request, env);
      }

      if (path === "/api/admin/uc" && method === "POST") {
        return await changeUC(request, env);
      }

      if (path === "/api/admin/ban" && method === "POST") {
        return await banUser(request, env);
      }

      if (path === "/api/admin/unban" && method === "POST") {
        return await unbanUser(request, env);
      }

      if (path === "/api/admin/silent-bans" && method === "GET") {
        return await getSilentBans(request, env);
      }

      /*
       * ROLES
       */

      if (
        path === "/api/admin/role/request" &&
        method === "POST"
      ) {
        return await createRoleRequest(request, env);
      }

      if (
        path === "/api/admin/role/requests" &&
        method === "GET"
      ) {
        return await getRoleRequests(request, env);
      }

      if (
        path === "/api/admin/role/review" &&
        method === "POST"
      ) {
        return await reviewRoleRequest(request, env);
      }

      if (
        path === "/api/admin/role/remove" &&
        method === "POST"
      ) {
        return await removeRole(request, env);
      }

      /*
       * WHEEL MANAGEMENT
       * Только Owner
       */

      if (
        path === "/api/admin/wheel/prize" &&
        method === "POST"
      ) {
        return await saveWheelPrize(request, env);
      }

      if (
        path === "/api/admin/wheel/prize/delete" &&
        method === "POST"
      ) {
        return await deleteWheelPrize(request, env);
      }

      if (
        path === "/api/admin/wheel/settings" &&
        method === "POST"
      ) {
        return await saveWheelSettings(request, env);
      }

      /*
       * PAYMENTS
       * Только Owner подтверждает оплату
       */

      if (
        path === "/api/admin/payments" &&
        method === "GET"
      ) {
        return await getPayments(request, env);
      }

      if (
        path === "/api/admin/payment/approve" &&
        method === "POST"
      ) {
        return await approvePayment(request, env);
      }

      if (
        path === "/api/admin/payment/reject" &&
        method === "POST"
      ) {
        return await rejectPayment(request, env);
      }

      /*
       * COMPLAINTS
       */

      if (
        path === "/api/admin/complaints" &&
        method === "GET"
      ) {
        return await getComplaints(request, env);
      }

      if (
        path === "/api/admin/complaint/review" &&
        method === "POST"
      ) {
        return await reviewComplaint(request, env);
      }

      /*
       * CHAT MODERATION
       */

      if (
        path === "/api/admin/chat/delete" &&
        method === "POST"
      ) {
        return await deleteChatMessage(request, env);
      }

      /*
       * LOGS
       */

      if (
        path === "/api/admin/logs" &&
        method === "GET"
      ) {
        return await getAuditLogs(request, env);
      }

      return json({
        ok: false,
        error: "Not found"
      }, 404);

    } catch (error) {
      console.error(error);

      return json({
        ok: false,
        error: "Internal server error",
        message: error?.message || String(error)
      }, 500);
    }
  }
};


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-ID",
    "Content-Type": "application/json; charset=utf-8"
  };
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: corsHeaders()
    }
  );
}


async function readBody(request) {
  try {
    const text = await request.text();

    if (!text) {
      return {};
    }

    return JSON.parse(text);
  } catch {
    return {};
  }
}


function normalizeId(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  return String(value).trim();
}


function getRequestTelegramId(request, data = {}) {
  const bodyId = normalizeId(
    data.telegram_id
  );

  if (bodyId) {
    return bodyId;
  }

  return normalizeId(
    request.headers.get("X-Telegram-ID")
  );
}


async function getRole(env, telegramId) {
  const id = normalizeId(telegramId);

  if (!id) {
    return null;
  }

  if (OWNER_IDS.includes(id)) {
    return "owner";
  }

  const row = await env.DB.prepare(`
    SELECT role
    FROM admin_roles
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(id).first();

  return row?.role || null;
}


async function getRank(env, role) {
  if (!role) {
    return null;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      ROLE_RANKS,
      role
    )
  ) {
    return ROLE_RANKS[role];
  }

  const row = await env.DB.prepare(`
    SELECT rank
    FROM role_settings
    WHERE role_key = ?
    LIMIT 1
  `).bind(role).first();

  if (!row) {
    return null;
  }

  return Number(row.rank);
}


async function getAccess(env, telegramId) {
  const id = normalizeId(telegramId);

  if (!id) {
    return null;
  }

  const role = await getRole(
    env,
    id
  );

  if (!role) {
    return null;
  }

  const rank = await getRank(
    env,
    role
  );

  if (rank === null) {
    return null;
  }

  return {
    adminId: id,
    role,
    rank
  };
}


async function checkAdmin(
  request,
  env,
  minimumRank = 1
) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  if (!telegramId) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Telegram ID required"
      }, 401)
    };
  }

  const access = await getAccess(
    env,
    telegramId
  );

  if (!access) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Access denied"
      }, 403)
    };
  }

  if (access.rank < minimumRank) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Insufficient permissions"
      }, 403)
    };
  }

  return {
    ok: true,
    ...access,
    data
  };
}


async function logAction(
  env,
  adminId,
  action,
  targetId = null,
  amount = 0,
  details = null
) {
  await env.DB.prepare(`
    INSERT INTO admin_actions
    (
      admin_telegram_id,
      action,
      target_telegram_id,
      amount,
      details
    )
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    normalizeId(adminId),
    String(action),
    normalizeId(targetId),
    Number(amount || 0),
    details
      ? JSON.stringify(details)
      : null
  ).run();
}


async function ensureUser(env, telegramId) {
  const id = normalizeId(telegramId);

  if (!id) {
    return null;
  }

  let user = await env.DB.prepare(`
    SELECT *
    FROM users
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(id).first();

  if (!user) {
    await env.DB.prepare(`
      INSERT INTO users
      (
        telegram_id,
        balance,
        uc,
        spins
      )
      VALUES (?, 0, 0, 0)
    `).bind(id).run();

    user = await env.DB.prepare(`
      SELECT *
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `).bind(id).first();
  }

  return user;
}


async function getUser(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  const user = await ensureUser(
    env,
    telegramId
  );

  if (!user) {
    return json({
      ok: false,
      error: "User not found"
    }, 404);
  }

  const role = await getRole(
    env,
    telegramId
  );

  let roleData = null;

  if (role) {
    roleData = await env.DB.prepare(`
      SELECT
        role_key,
        rank,
        role_name,
        color,
        description
      FROM role_settings
      WHERE role_key = ?
      LIMIT 1
    `).bind(role).first();
  }

  const ban = await env.DB.prepare(`
    SELECT
      reason,
      expires_at
    FROM bans
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(telegramId).first();

  const silentBan = await env.DB.prepare(`
    SELECT
      id,
      reason,
      expires_at
    FROM silent_bans
    WHERE telegram_id = ?
      AND active = 1
    ORDER BY id DESC
    LIMIT 1
  `).bind(telegramId).first();

  return json({
    ok: true,
    user,
    role: role || "player",
    role_data: roleData,
    banned: Boolean(ban),
    ban: ban || null,
    silent_banned: Boolean(silentBan)
  });
          }
async function getWheel(request, env) {
  const prizes = await env.DB.prepare(`
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
  `).all();

  const settings = await env.DB.prepare(`
    SELECT
      id,
      spin_cost,
      currency,
      enabled
    FROM wheel_settings
    WHERE id = 1
    LIMIT 1
  `).first();

  return json({
    ok: true,
    settings: settings || {
      id: 1,
      spin_cost: 0,
      currency: "RUB",
      enabled: 1
    },
    prizes: prizes.results || []
  });
}


function secureRandom() {
  const array = new Uint32Array(2);

  crypto.getRandomValues(array);

  const high = Number(array[0]);
  const low = Number(array[1]);

  return (
    (high * 4294967296 + low) /
    18446744073709551616
  );
}


function selectPrize(prizes) {
  if (!prizes || !prizes.length) {
    return null;
  }

  const enabled = prizes.filter(
    prize =>
      Number(prize.enabled) === 1 &&
      Number(prize.probability) > 0
  );

  if (!enabled.length) {
    return null;
  }

  let total = 0;

  for (const prize of enabled) {
    total += Number(
      prize.probability
    );
  }

  if (total <= 0) {
    return null;
  }

  const random =
    secureRandom() * total;

  let current = 0;

  for (const prize of enabled) {
    current += Number(
      prize.probability
    );

    if (random < current) {
      return prize;
    }
  }

  return enabled[
    enabled.length - 1
  ];
}


async function spinWheel(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  const user = await ensureUser(
    env,
    telegramId
  );

  if (!user) {
    return json({
      ok: false,
      error: "User not found"
    }, 404);
  }

  const activeBan = await env.DB.prepare(`
    SELECT id, reason, expires_at
    FROM bans
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(telegramId).first();

  if (activeBan) {
    return json({
      ok: false,
      error: "User is banned",
      ban: activeBan
    }, 403);
  }

  const silentBan = await env.DB.prepare(`
    SELECT id, reason, expires_at
    FROM silent_bans
    WHERE telegram_id = ?
      AND active = 1
    ORDER BY id DESC
    LIMIT 1
  `).bind(telegramId).first();

  if (silentBan) {
    return json({
      ok: false,
      error: "User is banned",
      ban: silentBan
    }, 403);
  }

  const settings = await env.DB.prepare(`
    SELECT
      spin_cost,
      currency,
      enabled
    FROM wheel_settings
    WHERE id = 1
    LIMIT 1
  `).first();

  if (
    !settings ||
    Number(settings.enabled) !== 1
  ) {
    return json({
      ok: false,
      error: "Wheel is disabled"
    }, 403);
  }

  const cost =
    Number(settings.spin_cost || 0);

  const balance =
    Number(user.balance || 0);

  if (balance < cost) {
    return json({
      ok: false,
      error: "Insufficient balance",
      balance,
      spin_cost: cost
    }, 400);
  }

  const prizes = await env.DB.prepare(`
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
  `).all();

  const prize = selectPrize(
    prizes.results || []
  );

  if (!prize) {
    return json({
      ok: false,
      error: "No active prizes configured"
    }, 500);
  }

  const oldBalance = balance;
  const newBalance =
    oldBalance - cost;

  await env.DB.prepare(`
    UPDATE users
    SET balance = ?
    WHERE telegram_id = ?
  `).bind(
    newBalance,
    telegramId
  ).run();

  await env.DB.prepare(`
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
    telegramId,
    Number(prize.id),
    String(prize.name),
    String(prize.prize_type),
    Number(prize.prize_value || 0),
    cost
  ).run();

  await env.DB.prepare(`
    INSERT INTO balance_audit
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    telegramId,
    telegramId,
    oldBalance,
    newBalance,
    -cost,
    "Вращение колеса",
    "spin",
    String(prize.id)
  ).run();

  /*
   * Если приз имеет тип UC —
   * начисляем UC игроку.
   */

  if (
    String(prize.prize_type)
      .toLowerCase() === "uc"
  ) {
    const ucAmount =
      Number(prize.prize_value || 0);

    if (ucAmount > 0) {
      const oldUC =
        Number(user.uc || 0);

      const newUC =
        oldUC + ucAmount;

      await env.DB.prepare(`
        UPDATE users
        SET uc = ?
        WHERE telegram_id = ?
      `).bind(
        newUC,
        telegramId
      ).run();

      await env.DB.prepare(`
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
        telegramId,
        telegramId,
        oldUC,
        newUC,
        ucAmount,
        "Выигрыш в колесе"
      ).run();
    }
  }

  return json({
    ok: true,
    result: {
      prize_id: Number(prize.id),
      prize_name: String(prize.name),
      prize_type: String(prize.prize_type),
      prize_value: Number(
        prize.prize_value || 0
      )
    },
    balance: newBalance
  });
}


async function getChat(request, env) {
  const result = await env.DB.prepare(`
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
  `).all();

  const messages =
    result.results || [];

  for (const message of messages) {
    if (!message.role_key) {
      message.role_data = {
        role_name: "Player",
        color: "#FFFFFF",
        rank: null
      };
      continue;
    }

    const role = await env.DB.prepare(`
      SELECT
        role_key,
        rank,
        role_name,
        color,
        description
      FROM role_settings
      WHERE role_key = ?
      LIMIT 1
    `).bind(
      message.role_key
    ).first();

    message.role_data =
      role || {
        role_name: "Player",
        color: "#FFFFFF",
        rank: null
      };
  }

  return json({
    ok: true,
    messages
  });
}


async function sendChatMessage(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  const message =
    String(data.message || "").trim();

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  if (!message) {
    return json({
      ok: false,
      error: "Message is empty"
    }, 400);
  }

  if (message.length > 1000) {
    return json({
      ok: false,
      error: "Message too long"
    }, 400);
  }

  const ban = await env.DB.prepare(`
    SELECT id
    FROM bans
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(telegramId).first();

  if (ban) {
    return json({
      ok: false,
      error: "User is banned"
    }, 403);
  }

  const silentBan = await env.DB.prepare(`
    SELECT id
    FROM silent_bans
    WHERE telegram_id = ?
      AND active = 1
    LIMIT 1
  `).bind(telegramId).first();

  if (silentBan) {
    return json({
      ok: false,
      error: "User is banned"
    }, 403);
  }

  const role =
    await getRole(
      env,
      telegramId
    );

  const username =
    data.username
      ? String(data.username)
      : null;

  const result =
    await env.DB.prepare(`
      INSERT INTO wheel_chat_messages
      (
        telegram_id,
        username,
        role_key,
        message
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      telegramId,
      username,
      role,
      message
    ).run();

  return json({
    ok: true,
    message_id:
      result.meta.last_row_id
  });
}


async function createComplaint(request, env) {
  const data = await readBody(request);

  const reporterId =
    getRequestTelegramId(
      request,
      data
    );

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const complaintText =
    String(
      data.complaint_text || ""
    ).trim();

  if (!reporterId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  if (!targetId) {
    return json({
      ok: false,
      error: "Target Telegram ID required"
    }, 400);
  }

  if (!complaintText) {
    return json({
      ok: false,
      error: "Complaint text required"
    }, 400);
  }

  if (complaintText.length > 3000) {
    return json({
      ok: false,
      error: "Complaint is too long"
    }, 400);
  }

  const targetRole =
    await getRole(
      env,
      targetId
    );

  const roleForComplaint =
    targetRole || "player";

  const result =
    await env.DB.prepare(`
      INSERT INTO complaints
      (
        reporter_telegram_id,
        target_telegram_id,
        target_role,
        complaint_text,
        status
      )
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(
      reporterId,
      targetId,
      roleForComplaint,
      complaintText
    ).run();

  return json({
    ok: true,
    complaint_id:
      result.meta.last_row_id,
    status: "pending"
  });
}


async function createPayment(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  const amount =
    Number(data.amount);

  const description =
    String(
      data.description ||
      "Пополнение через поддержку"
    );

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "Invalid amount"
    }, 400);
  }

  const result =
    await env.DB.prepare(`
      INSERT INTO payments
      (
        telegram_id,
        amount,
        currency,
        provider,
        status,
        description
      )
      VALUES (?, ?, 'RUB', 'manual_support', 'pending', ?)
    `).bind(
      telegramId,
      amount,
      description
    ).run();

  return json({
    ok: true,
    payment_id:
      result.meta.last_row_id,
    status: "pending"
  });
      }
async function submitPaymentReceipt(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  const paymentId =
    Number(data.payment_id);

  const receiptUrl =
    data.receipt_url
      ? String(data.receipt_url)
      : null;

  const receiptNote =
    data.receipt_note
      ? String(data.receipt_note)
      : null;

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  if (
    !Number.isInteger(paymentId) ||
    paymentId <= 0
  ) {
    return json({
      ok: false,
      error: "Invalid payment_id"
    }, 400);
  }

  const payment =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        status
      FROM payments
      WHERE id = ?
      LIMIT 1
    `).bind(
      paymentId
    ).first();

  if (!payment) {
    return json({
      ok: false,
      error: "Payment not found"
    }, 404);
  }

  if (
    String(payment.telegram_id) !==
    telegramId
  ) {
    return json({
      ok: false,
      error: "Access denied"
    }, 403);
  }

  if (payment.status !== "pending") {
    return json({
      ok: false,
      error: "Payment is not pending"
    }, 409);
  }

  const result =
    await env.DB.prepare(`
      INSERT INTO payment_receipts
      (
        payment_id,
        telegram_id,
        receipt_url,
        receipt_note
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      paymentId,
      telegramId,
      receiptUrl,
      receiptNote
    ).run();

  return json({
    ok: true,
    receipt_id:
      result.meta.last_row_id,
    payment_id: paymentId,
    status: "pending"
  });
}


/*
 * ADMIN PANEL
 *
 * Игроки здесь НЕ выводятся как отдельная
 * административная роль.
 *
 * Показываются только:
 * Owner
 * Deputy Owner
 * Admin 1-4
 * Moderator
 */

async function adminPanel(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      1
    );

  if (!access.ok) {
    return access.response;
  }

  const roleSettings =
    await env.DB.prepare(`
      SELECT
        role_key,
        rank,
        role_name,
        color,
        description
      FROM role_settings
      WHERE role_key != 'player'
      ORDER BY
        CASE
          WHEN rank IS NULL THEN -1
          ELSE rank
        END DESC
    `).all();

  const admins =
    await env.DB.prepare(`
      SELECT
        ar.telegram_id,
        ar.role,
        ar.granted_by,
        ar.created_at,
        rs.rank,
        rs.role_name,
        rs.color
      FROM admin_roles ar
      LEFT JOIN role_settings rs
        ON rs.role_key = ar.role
      WHERE ar.role != 'player'
      ORDER BY
        CASE
          WHEN rs.rank IS NULL THEN -1
          ELSE rs.rank
        END DESC,
        ar.created_at ASC
    `).all();

  return json({
    ok: true,

    current_user: {
      telegram_id:
        access.adminId,
      role:
        access.role,
      rank:
        access.rank
    },

    roles:
      roleSettings.results || [],

    admins:
      admins.results || []
  });
}


async function getAdminUsers(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      1
    );

  if (!access.ok) {
    return access.response;
  }

  /*
   * Обычные Player намеренно не попадают
   * в список административной панели.
   */

  const result =
    await env.DB.prepare(`
      SELECT
        ar.telegram_id,
        ar.role,
        ar.granted_by,
        ar.created_at,
        rs.rank,
        rs.role_name,
        rs.color
      FROM admin_roles ar
      LEFT JOIN role_settings rs
        ON rs.role_key = ar.role
      WHERE ar.role IN (
        'owner',
        'deputy_owner',
        'admin_4',
        'admin_3',
        'admin_2',
        'admin_1',
        'moderator'
      )
      ORDER BY
        CASE
          WHEN rs.rank IS NULL THEN -1
          ELSE rs.rank
        END DESC
    `).all();

  return json({
    ok: true,
    users:
      result.results || []
  });
}


async function changeBalance(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      1
    );

  if (!access.ok) {
    return access.response;
  }

  const data =
    access.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const amount =
    Number(data.amount);

  const reason =
    String(
      data.reason ||
      "Изменение баланса"
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  if (
    !Number.isFinite(amount) ||
    amount === 0
  ) {
    return json({
      ok: false,
      error:
        "Amount must not be zero"
    }, 400);
  }

  /*
   * Администратор не может менять баланс
   * Owner / Deputy Owner.
   */

  const targetAccess =
    await getAccess(
      env,
      targetId
    );

  if (
    targetAccess &&
    targetAccess.rank >= access.rank
  ) {
    return json({
      ok: false,
      error:
        "You cannot change balance of an equal or higher rank"
    }, 403);
  }

  const user =
    await ensureUser(
      env,
      targetId
    );

  if (!user) {
    return json({
      ok: false,
      error:
        "User not found"
    }, 404);
  }

  const oldBalance =
    Number(user.balance || 0);

  const newBalance =
    oldBalance + amount;

  if (newBalance < 0) {
    return json({
      ok: false,
      error:
        "Balance cannot be negative"
    }, 400);
  }

  await env.DB.prepare(`
    UPDATE users
    SET balance = ?
    WHERE telegram_id = ?
  `).bind(
    newBalance,
    targetId
  ).run();

  await env.DB.prepare(`
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
    access.adminId,
    targetId,
    oldBalance,
    newBalance,
    amount,
    reason
  ).run();

  await logAction(
    env,
    access.adminId,
    "change_balance",
    targetId,
    amount,
    {
      old_balance:
        oldBalance,
      new_balance:
        newBalance,
      reason
    }
  );

  return json({
    ok: true,
    telegram_id:
      targetId,
    old_balance:
      oldBalance,
    new_balance:
      newBalance,
    amount
  });
}


async function changeUC(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      1
    );

  if (!access.ok) {
    return access.response;
  }

  const data =
    access.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const amount =
    Number(data.amount);

  const reason =
    String(
      data.reason ||
      "Изменение UC"
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  if (
    !Number.isInteger(amount) ||
    amount === 0
  ) {
    return json({
      ok: false,
      error:
        "UC amount must be a non-zero integer"
    }, 400);
  }

  const targetAccess =
    await getAccess(
      env,
      targetId
    );

  if (
    targetAccess &&
    targetAccess.rank >= access.rank
  ) {
    return json({
      ok: false,
      error:
        "You cannot change UC of an equal or higher rank"
    }, 403);
  }

  const user =
    await ensureUser(
      env,
      targetId
    );

  const oldUC =
    Number(user.uc || 0);

  const newUC =
    oldUC + amount;

  if (newUC < 0) {
    return json({
      ok: false,
      error:
        "UC cannot be negative"
    }, 400);
  }

  await env.DB.prepare(`
    UPDATE users
    SET uc = ?
    WHERE telegram_id = ?
  `).bind(
    newUC,
    targetId
  ).run();

  await env.DB.prepare(`
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
    access.adminId,
    targetId,
    oldUC,
    newUC,
    amount,
    reason
  ).run();

  await logAction(
    env,
    access.adminId,
    "change_uc",
    targetId,
    amount,
    {
      old_uc: oldUC,
      new_uc: newUC,
      reason
    }
  );

  return json({
    ok: true,
    telegram_id:
      targetId,
    old_uc:
      oldUC,
    new_uc:
      newUC,
    amount
  });
}


async function banUser(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      1
    );

  if (!access.ok) {
    return access.response;
  }

  const data =
    access.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const reason =
    String(
      data.reason || ""
    ).trim();

  const expiresAt =
    data.expires_at
      ? String(data.expires_at)
      : null;

  const silent =
    Boolean(data.silent);

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  if (!reason) {
    return json({
      ok: false,
      error:
        "Ban reason required"
    }, 400);
  }

  const targetAccess =
    await getAccess(
      env,
      targetId
    );

  /*
   * Нельзя банить себя.
   */

  if (
    targetId === access.adminId
  ) {
    return json({
      ok: false,
      error:
        "You cannot ban yourself"
    }, 400);
  }

  /*
   * Нельзя банить равного
   * или более высокого по рангу.
   */

  if (
    targetAccess &&
    targetAccess.rank >= access.rank
  ) {
    return json({
      ok: false,
      error:
        "You cannot ban an equal or higher rank"
    }, 403);
  }

  /*
   * Тихий бан разрешён ТОЛЬКО
   * Owner и Deputy Owner.
   */

  if (
    silent &&
    access.rank < 5
  ) {
    return json({
      ok: false,
      error:
        "Silent ban is available only to Owner and Deputy Owner"
    }, 403);
  }

  if (silent) {
    await env.DB.prepare(`
      INSERT INTO silent_bans
      (
        telegram_id,
        banned_by,
        reason,
        expires_at,
        active
      )
      VALUES (?, ?, ?, ?, 1)
    `).bind(
      targetId,
      access.adminId,
      reason,
      expiresAt
    ).run();

    await logAction(
      env,
      access.adminId,
      "silent_ban",
      targetId,
      0,
      {
        reason,
        expires_at:
          expiresAt
      }
    );

    return json({
      ok: true,
      type: "silent_ban",
      telegram_id:
        targetId
    });
  }

  /*
   * Обычный бан.
   */

  await env.DB.prepare(`
    DELETE FROM bans
    WHERE telegram_id = ?
  `).bind(
    targetId
  ).run();

  await env.DB.prepare(`
    INSERT INTO bans
    (
      telegram_id,
      banned_by,
      reason,
      expires_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    targetId,
    access.adminId,
    reason,
    expiresAt
  ).run();

  await logAction(
    env,
    access.adminId,
    "ban",
    targetId,
    0,
    {
      reason,
      expires_at:
        expiresAt
    }
  );

  return json({
    ok: true,
    type: "ban",
    telegram_id:
      targetId,
    reason,
    expires_at:
      expiresAt
  });
}


async function unbanUser(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      1
    );

  if (!access.ok) {
    return access.response;
  }

  const data =
    access.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  const targetAccess =
    await getAccess(
      env,
      targetId
    );

  if (
    targetAccess &&
    targetAccess.rank >= access.rank
  ) {
    return json({
      ok: false,
      error:
        "You cannot unban an equal or higher rank"
    }, 403);
  }

  await env.DB.prepare(`
    DELETE FROM bans
    WHERE telegram_id = ?
  `).bind(
    targetId
  ).run();

  /*
   * Silent ban снимается отдельно.
   * Owner / Deputy могут снять его.
   */

  if (access.rank >= 5) {
    await env.DB.prepare(`
      UPDATE silent_bans
      SET active = 0
      WHERE telegram_id = ?
        AND active = 1
    `).bind(
      targetId
    ).run();
  }

  await logAction(
    env,
    access.adminId,
    "unban",
    targetId
  );

  return json({
    ok: true,
    telegram_id:
      targetId
  });
}


async function getSilentBans(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      5
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        banned_by,
        reason,
        expires_at,
        active,
        created_at
      FROM silent_bans
      ORDER BY id DESC
      LIMIT 200
    `).all();

  return json({
    ok: true,
    silent_bans:
      result.results || []
  });
}
async function createRoleRequest(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      5
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const requestedRole =
    String(
      data.requested_role || ""
    ).trim();

  const requestedRank =
    Number(data.requested_rank);

  const realName =
    data.real_name
      ? String(data.real_name)
      : null;

  const age =
    data.age !== undefined &&
    data.age !== null &&
    data.age !== ""
      ? Number(data.age)
      : null;

  const username =
    data.username
      ? String(data.username)
      : null;

  const reason =
    data.reason
      ? String(data.reason)
      : null;

  const allowedRoles = [
    "admin_1",
    "admin_2",
    "admin_3",
    "admin_4",
    "moderator"
  ];

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  if (
    !allowedRoles.includes(
      requestedRole
    )
  ) {
    return json({
      ok: false,
      error:
        "Invalid requested role"
    }, 400);
  }

  if (
    !Number.isInteger(
      requestedRank
    ) ||
    requestedRank < 0 ||
    requestedRank > 4
  ) {
    return json({
      ok: false,
      error:
        "Invalid requested rank"
    }, 400);
  }

  const result =
    await env.DB.prepare(`
      INSERT INTO role_change_requests
      (
        target_telegram_id,
        requested_role,
        requested_rank,
        requested_by,
        real_name,
        age,
        username,
        reason,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      targetId,
      requestedRole,
      requestedRank,
      access.adminId,
      realName,
      age,
      username,
      reason
    ).run();

  await logAction(
    env,
    access.adminId,
    "role_request",
    targetId,
    0,
    {
      requested_role:
        requestedRole,
      requested_rank:
        requestedRank
    }
  );

  return json({
    ok: true,
    request_id:
      result.meta.last_row_id,
    status: "pending"
  });
}


async function getRoleRequests(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      4
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        target_telegram_id,
        requested_role,
        requested_rank,
        requested_by,
        real_name,
        age,
        username,
        reason,
        status,
        reviewed_by,
        reviewed_at,
        created_at
      FROM role_change_requests
      ORDER BY id DESC
      LIMIT 200
    `).all();

  return json({
    ok: true,
    requests:
      result.results || []
  });
}


async function reviewRoleRequest(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      5
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const requestId =
    Number(data.request_id);

  const decision =
    String(
      data.decision || ""
    ).toLowerCase();

  if (
    !Number.isInteger(requestId) ||
    requestId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid request_id"
    }, 400);
  }

  if (
    decision !== "approve" &&
    decision !== "reject"
  ) {
    return json({
      ok: false,
      error:
        "Decision must be approve or reject"
    }, 400);
  }

  const roleRequest =
    await env.DB.prepare(`
      SELECT *
      FROM role_change_requests
      WHERE id = ?
      LIMIT 1
    `).bind(
      requestId
    ).first();

  if (!roleRequest) {
    return json({
      ok: false,
      error:
        "Role request not found"
    }, 404);
  }

  if (
    roleRequest.status !==
    "pending"
  ) {
    return json({
      ok: false,
      error:
        "Request already reviewed"
    }, 409);
  }

  /*
   * Заместитель не может назначить
   * другого заместителя или Owner.
   */

  if (
    Number(
      roleRequest.requested_rank
    ) >= 5
  ) {
    if (access.rank < 6) {
      return json({
        ok: false,
        error:
          "Only Owner can assign Deputy Owner or Owner"
      }, 403);
    }
  }

  if (
    decision === "reject"
  ) {
    await env.DB.prepare(`
      UPDATE role_change_requests
      SET
        status = 'rejected',
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      access.adminId,
      requestId
    ).run();

    await logAction(
      env,
      access.adminId,
      "role_request_rejected",
      roleRequest.target_telegram_id,
      0,
      {
        request_id:
          requestId,
        requested_role:
          roleRequest.requested_role
      }
    );

    return json({
      ok: true,
      status: "rejected"
    });
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO admin_roles
    (
      telegram_id,
      role,
      granted_by
    )
    VALUES (?, ?, ?)
  `).bind(
    String(
      roleRequest.target_telegram_id
    ),
    String(
      roleRequest.requested_role
    ),
    access.adminId
  ).run();

  await env.DB.prepare(`
    UPDATE role_change_requests
    SET
      status = 'approved',
      reviewed_by = ?,
      reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    access.adminId,
    requestId
  ).run();

  await logAction(
    env,
    access.adminId,
    "role_granted",
    roleRequest.target_telegram_id,
    0,
    {
      request_id:
        requestId,
      role:
        roleRequest.requested_role,
      rank:
        roleRequest.requested_rank
    }
  );

  return json({
    ok: true,
    status: "approved",
    telegram_id:
      String(
        roleRequest.target_telegram_id
      ),
    role:
      String(
        roleRequest.requested_role
      )
  });
}


async function removeRole(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      5
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  const targetAccess =
    await getAccess(
      env,
      targetId
    );

  if (!targetAccess) {
    return json({
      ok: false,
      error:
        "Target role not found"
    }, 404);
  }

  /*
   * Нельзя снять роль равного
   * или более высокого ранга.
   */

  if (
    targetAccess.rank >= access.rank
  ) {
    return json({
      ok: false,
      error:
        "You cannot remove an equal or higher rank"
    }, 403);
  }

  await env.DB.prepare(`
    DELETE FROM admin_roles
    WHERE telegram_id = ?
  `).bind(
    targetId
  ).run();

  await logAction(
    env,
    access.adminId,
    "role_removed",
    targetId,
    0,
    {
      old_role:
        targetAccess.role,
      old_rank:
        targetAccess.rank
    }
  );

  return json({
    ok: true,
    telegram_id:
      targetId,
    removed_role:
      targetAccess.role
  });
}


/*
 * WHEEL MANAGEMENT
 *
 * Только Owner может менять настройки
 * колеса и призы.
 */

async function saveWheelPrize(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      6
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const id =
    data.id !== undefined
      ? Number(data.id)
      : null;

  const name =
    String(
      data.name || ""
    ).trim();

  const prizeType =
    String(
      data.prize_type || "uc"
    );

  const prizeValue =
    Number(
      data.prize_value || 0
    );

  const probability =
    Number(
      data.probability || 0
    );

  const enabled =
    data.enabled === undefined
      ? 1
      : Number(data.enabled)
        ? 1
        : 0;

  const sortOrder =
    Number(
      data.sort_order || 0
    );

  if (!name) {
    return json({
      ok: false,
      error:
        "Prize name required"
    }, 400);
  }

  if (
    !Number.isFinite(
      probability
    ) ||
    probability < 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid probability"
    }, 400);
  }

  if (id) {
    await env.DB.prepare(`
      UPDATE wheel_prizes
      SET
        name = ?,
        prize_type = ?,
        prize_value = ?,
        probability = ?,
        enabled = ?,
        sort_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      name,
      prizeType,
      prizeValue,
      probability,
      enabled,
      sortOrder,
      id
    ).run();

    await logAction(
      env,
      access.adminId,
      "wheel_prize_update",
      null,
      0,
      {
        prize_id:
          id
      }
    );

    return json({
      ok: true,
      prize_id: id
    });
  }

  const result =
    await env.DB.prepare(`
      INSERT INTO wheel_prizes
      (
        name,
        prize_type,
        prize_value,
        probability,
        enabled,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      name,
      prizeType,
      prizeValue,
      probability,
      enabled,
      sortOrder
    ).run();

  await logAction(
    env,
    access.adminId,
    "wheel_prize_create",
    null,
    0,
    {
      prize_id:
        result.meta.last_row_id
    }
  );

  return json({
    ok: true,
    prize_id:
      result.meta.last_row_id
  });
}


async function deleteWheelPrize(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      6
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const prizeId =
    Number(data.prize_id);

  if (
    !Number.isInteger(prizeId) ||
    prizeId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid prize_id"
    }, 400);
  }

  await env.DB.prepare(`
    DELETE FROM wheel_prizes
    WHERE id = ?
  `).bind(
    prizeId
  ).run();

  await logAction(
    env,
    access.adminId,
    "wheel_prize_delete",
    null,
    0,
    {
      prize_id:
        prizeId
    }
  );

  return json({
    ok: true,
    prize_id:
      prizeId
  });
}


async function saveWheelSettings(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      6
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const spinCost =
    Number(
      data.spin_cost
    );

  const currency =
    String(
      data.currency || "RUB"
    );

  const enabled =
    data.enabled === undefined
      ? 1
      : Number(data.enabled)
        ? 1
        : 0;

  if (
    !Number.isFinite(
      spinCost
    ) ||
    spinCost < 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid spin_cost"
    }, 400);
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO wheel_settings
    (
      id,
      spin_cost,
      currency,
      enabled,
      updated_by,
      updated_at
    )
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    spinCost,
    currency,
    enabled,
    access.adminId
  ).run();

  await logAction(
    env,
    access.adminId,
    "wheel_settings_update",
    null,
    0,
    {
      spin_cost:
        spinCost,
      currency,
      enabled
    }
  );

  return json({
    ok: true,
    spin_cost:
      spinCost,
    currency,
    enabled
  });
      }
async function createPayment(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(request, data);

  const amount =
    Number(data.amount);

  const description =
    String(
      data.description ||
      "Пополнение игрового баланса"
    );

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "Invalid amount"
    }, 400);
  }

  /*
   * Оплата создаётся как ручная.
   * Автоматического платёжного провайдера нет.
   * Подтверждение выполняется Owner.
   */

  const result =
    await env.DB.prepare(`
      INSERT INTO payments
      (
        telegram_id,
        amount,
        currency,
        provider,
        status,
        description
      )
      VALUES (
        ?,
        ?,
        'RUB',
        'manual_support',
        'pending',
        ?
      )
    `).bind(
      telegramId,
      amount,
      description
    ).run();

  await logAction(
    env,
    telegramId,
    "create_payment",
    telegramId,
    amount,
    {
      payment_id:
        result.meta.last_row_id,
      description
    }
  );

  return json({
    ok: true,
    payment_id:
      result.meta.last_row_id,
    telegram_id:
      telegramId,
    amount,
    currency: "RUB",
    status: "pending",
    message:
      "Заявка создана. Передайте чек поддержке."
  });
}


async function getPayments(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      6
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        p.id,
        p.telegram_id,
        p.amount,
        p.currency,
        p.provider,
        p.status,
        p.description,
        p.created_at,
        p.paid_at,
        pr.id AS receipt_id,
        pr.receipt_url,
        pr.receipt_note,
        pr.submitted_at
      FROM payments p
      LEFT JOIN payment_receipts pr
        ON pr.payment_id = p.id
      ORDER BY p.id DESC
      LIMIT 200
    `).all();

  return json({
    ok: true,
    payments:
      result.results || []
  });
}


async function approvePayment(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      6
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const paymentId =
    Number(data.payment_id);

  if (
    !Number.isInteger(paymentId) ||
    paymentId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid payment_id"
    }, 400);
  }

  const payment =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        amount,
        currency,
        status
      FROM payments
      WHERE id = ?
      LIMIT 1
    `).bind(
      paymentId
    ).first();

  if (!payment) {
    return json({
      ok: false,
      error:
        "Payment not found"
    }, 404);
  }

  if (
    payment.status === "paid"
  ) {
    return json({
      ok: false,
      error:
        "Payment already approved"
    }, 409);
  }

  const user =
    await ensureUser(
      env,
      String(payment.telegram_id)
    );

  const oldBalance =
    Number(user.balance || 0);

  const amount =
    Number(payment.amount || 0);

  const newBalance =
    oldBalance + amount;

  await env.DB.prepare(`
    UPDATE users
    SET balance = ?
    WHERE telegram_id = ?
  `).bind(
    newBalance,
    String(payment.telegram_id)
  ).run();

  await env.DB.prepare(`
    UPDATE payments
    SET
      status = 'paid',
      paid_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    paymentId
  ).run();

  await env.DB.prepare(`
    INSERT INTO transactions
    (
      telegram_id,
      type,
      amount,
      description
    )
    VALUES (?, 'payment', ?, ?)
  `).bind(
    String(payment.telegram_id),
    amount,
    "Пополнение через поддержку"
  ).run();

  await env.DB.prepare(`
    INSERT INTO balance_audit
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
    VALUES (?, ?, ?, ?, ?, ?, 'payment', ?)
  `).bind(
    access.adminId,
    String(payment.telegram_id),
    oldBalance,
    newBalance,
    amount,
    "Подтверждение ручной оплаты Owner",
    String(paymentId)
  ).run();

  await logAction(
    env,
    access.adminId,
    "approve_payment",
    String(payment.telegram_id),
    amount,
    {
      payment_id:
        paymentId,
      old_balance:
        oldBalance,
      new_balance:
        newBalance
    }
  );

  return json({
    ok: true,
    payment_id:
      paymentId,
    telegram_id:
      String(payment.telegram_id),
    amount,
    new_balance:
      newBalance,
    status: "paid"
  });
}


async function createComplaint(request, env) {
  const data = await readBody(request);

  const reporterId =
    getRequestTelegramId(
      request,
      data
    );

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const complaintText =
    String(
      data.complaint_text ||
      ""
    ).trim();

  if (!reporterId) {
    return json({
      ok: false,
      error:
        "Telegram ID required"
    }, 400);
  }

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Target Telegram ID required"
    }, 400);
  }

  if (!complaintText) {
    return json({
      ok: false,
      error:
        "Complaint text required"
    }, 400);
  }

  const targetAccess =
    await getAccess(
      env,
      targetId
    );

  if (!targetAccess) {
    return json({
      ok: false,
      error:
        "Target is not a staff member"
    }, 400);
  }

  if (
    targetAccess.role === "owner"
  ) {
    return json({
      ok: false,
      error:
        "Owner complaints are disabled"
    }, 403);
  }

  const result =
    await env.DB.prepare(`
      INSERT INTO complaints
      (
        reporter_telegram_id,
        target_telegram_id,
        target_role,
        complaint_text,
        status
      )
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(
      reporterId,
      targetId,
      targetAccess.role,
      complaintText
    ).run();

  await logAction(
    env,
    reporterId,
    "create_complaint",
    targetId,
    0,
    {
      complaint_id:
        result.meta.last_row_id
    }
  );

  return json({
    ok: true,
    complaint_id:
      result.meta.last_row_id,
    status:
      "pending"
  });
}


async function getComplaints(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      3
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        reporter_telegram_id,
        target_telegram_id,
        target_role,
        complaint_text,
        status,
        reviewed_by,
        reviewed_at,
        resolution,
        created_at
      FROM complaints
      WHERE
        (
          target_role = 'moderator'
          AND ?
        )
        OR
        (
          target_role IN (
            'admin_1',
            'admin_2',
            'admin_3'
          )
          AND ?
        )
        OR
        (
          target_role = 'admin_4'
          AND ?
        )
        OR
        (
          target_role = 'deputy_owner'
          AND ?
        )
      ORDER BY id DESC
      LIMIT 200
    `).bind(
      access.rank >= 3 ? 1 : 0,
      access.rank >= 4 ? 1 : 0,
      access.rank >= 5 ? 1 : 0,
      access.rank >= 6 ? 1 : 0
    ).all();

  return json({
    ok: true,
    complaints:
      result.results || []
  });
}


async function reviewComplaint(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      3
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const complaintId =
    Number(data.complaint_id);

  const status =
    String(
      data.status || ""
    ).toLowerCase();

  const resolution =
    String(
      data.resolution ||
      ""
    ).trim();

  if (
    !Number.isInteger(
      complaintId
    ) ||
    complaintId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid complaint_id"
    }, 400);
  }

  if (
    status !== "approved" &&
    status !== "rejected" &&
    status !== "closed"
  ) {
    return json({
      ok: false,
      error:
        "Invalid complaint status"
    }, 400);
  }

  const complaint =
    await env.DB.prepare(`
      SELECT *
      FROM complaints
      WHERE id = ?
      LIMIT 1
    `).bind(
      complaintId
    ).first();

  if (!complaint) {
    return json({
      ok: false,
      error:
        "Complaint not found"
    }, 404);
  }

  const targetAccess =
    await getAccess(
      env,
      complaint.target_telegram_id
    );

  if (
    targetAccess &&
    targetAccess.rank >= access.rank
  ) {
    return json({
      ok: false,
      error:
        "You cannot review a complaint against an equal or higher rank"
    }, 403);
  }

  /*
   * Жалобы:
   *
   * Moderator -> Admin 3+
   * Admin 1-3 -> Admin 4+
   * Admin 4 -> Deputy / Owner
   * Deputy -> Owner
   */

  if (
    targetAccess &&
    targetAccess.role === "moderator" &&
    access.rank < 3
  ) {
    return json({
      ok: false,
      error:
        "Admin 3 or higher required"
    }, 403);
  }

  if (
    targetAccess &&
    [
      "admin_1",
      "admin_2",
      "admin_3"
    ].includes(
      targetAccess.role
    ) &&
    access.rank < 4
  ) {
    return json({
      ok: false,
      error:
        "Curator or higher required"
    }, 403);
  }

  if (
    targetAccess &&
    targetAccess.role === "admin_4" &&
    access.rank < 5
  ) {
    return json({
      ok: false,
      error:
        "Deputy Owner or Owner required"
    }, 403);
  }

  if (
    targetAccess &&
    targetAccess.role === "deputy_owner" &&
    access.rank < 6
  ) {
    return json({
      ok: false,
      error:
        "Owner required"
    }, 403);
  }

  await env.DB.prepare(`
    UPDATE complaints
    SET
      status = ?,
      reviewed_by = ?,
      reviewed_at = CURRENT_TIMESTAMP,
      resolution = ?
    WHERE id = ?
  `).bind(
    status,
    access.adminId,
    resolution || null,
    complaintId
  ).run();

  await logAction(
    env,
    access.adminId,
    "review_complaint",
    complaint.target_telegram_id,
    0,
    {
      complaint_id:
        complaintId,
      status,
      resolution
    }
  );

  return json({
    ok: true,
    complaint_id:
      complaintId,
    status
  });
}


async function sendChatMessage(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  const message =
    String(
      data.message || ""
    ).trim();

  const username =
    data.username
      ? String(data.username)
      : null;

  if (!telegramId) {
    return json({
      ok: false,
      error:
        "Telegram ID required"
    }, 400);
  }

  if (!message) {
    return json({
      ok: false,
      error:
        "Message required"
    }, 400);
  }

  if (message.length > 1000) {
    return json({
      ok: false,
      error:
        "Message too long"
    }, 400);
  }

  const banned =
    await isBanned(
      env,
      telegramId
    );

  if (banned) {
    return json({
      ok: false,
      error:
        "User is banned"
    }, 403);
  }

  const access =
    await getAccess(
      env,
      telegramId
    );

  const roleKey =
    access
      ? access.role
      : "player";

  const result =
    await env.DB.prepare(`
      INSERT INTO wheel_chat_messages
      (
        telegram_id,
        username,
        role_key,
        message
      )
      VALUES (?, ?, ?, ?)
    `).bind(
      telegramId,
      username,
      roleKey,
      message
    ).run();

  return json({
    ok: true,
    message_id:
      result.meta.last_row_id
  });
}


async function getChatMessages(request, env) {
  const result =
    await env.DB.prepare(`
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
    `).all();

  return json({
    ok: true,
    messages:
      (result.results || [])
        .reverse()
  });
}


async function deleteChatMessage(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      2
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const messageId =
    Number(data.message_id);

  const reason =
    String(
      data.reason ||
      "Нарушение правил чата"
    );

  if (
    !Number.isInteger(messageId) ||
    messageId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Invalid message_id"
    }, 400);
  }

  await env.DB.prepare(`
    UPDATE wheel_chat_messages
    SET
      deleted = 1,
      deleted_by = ?,
      deleted_reason = ?
    WHERE id = ?
  `).bind(
    access.adminId,
    reason,
    messageId
  ).run();

  await logAction(
    env,
    access.adminId,
    "delete_chat_message",
    null,
    0,
    {
      message_id:
        messageId,
      reason
    }
  );

  return json({
    ok: true,
    message_id:
      messageId
  });
}


async function getAuditLogs(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      4
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        bot_name,
        actor_telegram_id,
        action,
        target_telegram_id,
        details,
        created_at
      FROM bot_audit
      ORDER BY id DESC
      LIMIT 300
    `).all();

  return json({
    ok: true,
    logs:
      result.results || []
  });
}


async function getBalanceAudit(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      4
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        actor_telegram_id,
        target_telegram_id,
        old_balance,
        new_balance,
        amount,
        reason,
        reference_type,
        reference_id,
        created_at
      FROM balance_audit
      ORDER BY id DESC
      LIMIT 300
    `).all();

  return json({
    ok: true,
    logs:
      result.results || []
  });
}


/*
 * СПИН КОЛЕСА
 *
 * ВАЖНО:
 * результат выбирается ТОЛЬКО здесь,
 * на сервере.
 *
 * Браузер не передаёт процент выигрыша
 * и не выбирает prize_id.
 */

async function spinWheel(request, env) {
  const data = await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  if (!telegramId) {
    return json({
      ok: false,
      error:
        "Telegram ID required"
    }, 400);
  }

  const banned =
    await isBanned(
      env,
      telegramId
    );

  if (banned) {
    return json({
      ok: false,
      error:
        "User is banned"
    }, 403);
  }

  const settings =
    await env.DB.prepare(`
      SELECT
        spin_cost,
        currency,
        enabled
      FROM wheel_settings
      WHERE id = 1
      LIMIT 1
    `).first();

  if (
    !settings ||
    Number(settings.enabled) !== 1
  ) {
    return json({
      ok: false,
      error:
        "Wheel is disabled"
    }, 503);
  }

  const prizes =
    await env.DB.prepare(`
      SELECT
        id,
        name,
        prize_type,
        prize_value,
        probability
      FROM wheel_prizes
      WHERE enabled = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

  const availablePrizes =
    prizes.results || [];

  if (!availablePrizes.length) {
    return json({
      ok: false,
      error:
        "No prizes configured"
    }, 503);
  }

  /*
   * Используем криптографически стойкий
   * случайный источник.
   */

  const randomBuffer =
    new Uint32Array(1);

  crypto.getRandomValues(
    randomBuffer
  );

  const random =
    randomBuffer[0] /
    4294967296;

  let totalProbability = 0;

  for (
    const prize of availablePrizes
  ) {
    const probability =
      Math.max(
        0,
        Number(
          prize.probability || 0
        )
      );

    totalProbability +=
      probability;
  }

  if (
    totalProbability <= 0
  ) {
    return json({
      ok: false,
      error:
        "Prize probabilities are not configured"
    }, 503);
  }

  let cursor =
    random *
    totalProbability;

  let selected =
    availablePrizes[
      availablePrizes.length - 1
    ];

  for (
    const prize of availablePrizes
  ) {
    cursor -=
      Math.max(
        0,
        Number(
          prize.probability || 0
        )
      );

    if (cursor <= 0) {
      selected = prize;
      break;
    }
  }

  const user =
    await ensureUser(
      env,
      telegramId
    );

  const oldBalance =
    Number(
      user.balance || 0
    );

  const cost =
    Number(
      settings.spin_cost || 0
    );

  if (
    oldBalance < cost
  ) {
    return json({
      ok: false,
      error:
        "Insufficient balance",
      balance:
        oldBalance,
      spin_cost:
        cost
    }, 400);
  }

  const newBalance =
    oldBalance - cost;

  await env.DB.prepare(`
    UPDATE users
    SET balance = ?
    WHERE telegram_id = ?
  `).bind(
    newBalance,
    telegramId
  ).run();

  await env.DB.prepare(`
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
    telegramId,
    selected.id,
    selected.name,
    selected.prize_type,
    Number(selected.prize_value || 0),
    cost
  ).run();

  await env.DB.prepare(`
    INSERT INTO balance_audit
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
    VALUES (?, ?, ?, ?, ?, ?, 'spin', ?)
  `).bind(
    telegramId,
    telegramId,
    oldBalance,
    newBalance,
    -cost,
    "Оплата вращения колеса",
    "spin"
  ).run();

  /*
   * Если приз — UC, начисляем UC
   * также на сервере.
   */

  if (
    String(
      selected.prize_type
    ).toLowerCase() === "uc"
  ) {
    const oldUC =
      Number(
        user.uc || 0
      );

    const prizeUC =
      Number(
        selected.prize_value || 0
      );

    const newUC =
      oldUC + prizeUC;

    await env.DB.prepare(`
      UPDATE users
      SET uc = ?
      WHERE telegram_id = ?
    `).bind(
      newUC,
      telegramId
    ).run();

    await env.DB.prepare(`
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
      telegramId,
      telegramId,
      oldUC,
      newUC,
      prizeUC,
      "Выигрыш в колесе"
    ).run();
  }

  return json({
    ok: true,

    /*
     * Клиент получает только уже выбранный
     * сервером результат.
     */

    prize: {
      id:
        selected.id,
      name:
        selected.name,
      type:
        selected.prize_type,
      value:
        Number(
          selected.prize_value || 0
        )
    },

    balance:
      newBalance,

    spin_cost:
      cost
  });
}


async function getWheel(request, env) {
  const settings =
    await env.DB.prepare(`
      SELECT
        spin_cost,
        currency,
        enabled
      FROM wheel_settings
      WHERE id = 1
      LIMIT 1
    `).first();

  const prizes =
    await env.DB.prepare(`
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
    `).all();

  return json({
    ok: true,
    settings:
      settings || {
        spin_cost: 0,
        currency: "RUB",
        enabled: 0
      },
    prizes:
      prizes.results || []
  });
}


async function getSpinHistory(request, env) {
  const data =
    await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  if (!telegramId) {
    return json({
      ok: false,
      error:
        "Telegram ID required"
    }, 400);
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        prize_name,
        prize_type,
        prize_value,
        cost,
        created_at
      FROM spin_history
      WHERE telegram_id = ?
      ORDER BY id DESC
      LIMIT 100
    `).bind(
      telegramId
    ).all();

  return json({
    ok: true,
    history:
      result.results || []
  });
}


/*
 * ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ
 */

async function getUser(request, env) {
  const data =
    await readBody(request);

  const telegramId =
    getRequestTelegramId(
      request,
      data
    );

  if (!telegramId) {
    return json({
      ok: false,
      error:
        "Telegram ID required"
    }, 400);
  }

  const user =
    await ensureUser(
      env,
      telegramId
    );

  const access =
    await getAccess(
      env,
      telegramId
    );

  const banned =
    await isBanned(
      env,
      telegramId
    );

  return json({
    ok: true,

    user: {
      telegram_id:
        telegramId,
      balance:
        Number(user.balance || 0),
      uc:
        Number(user.uc || 0)
    },

    role:
      access
        ? access.role
        : "player",

    rank:
      access
        ? access.rank
        : null,

    role_name:
      access
        ? access.roleName
        : "Player",

    color:
      access
        ? access.color
        : "#FFFFFF",

    banned:
      Boolean(banned)
  });
}


/*
 * ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
 */

function normalizeId(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const id =
    String(value).trim();

  return id || null;
}


function getRequestTelegramId(
  request,
  data
) {
  const headerId =
    request.headers.get(
      "X-Telegram-ID"
    );

  return normalizeId(
    data.telegram_id ||
    headerId
  );
}


async function getAccess(
  env,
  telegramId
) {
  const id =
    normalizeId(
      telegramId
    );

  if (!id) {
    return null;
  }

  if (
    OWNER_IDS.includes(id)
  ) {
    const owner =
      await env.DB.prepare(`
        SELECT
          role_key,
          rank,
          role_name,
          color
        FROM role_settings
        WHERE role_key = 'owner'
        LIMIT 1
      `).first();

    return {
      role:
        "owner",
      rank:
        6,
      roleName:
        owner?.role_name ||
        "Owner",
      color:
        owner?.color ||
        "#FF0000"
    };
  }

  const row =
    await env.DB.prepare(`
      SELECT
        ar.telegram_id,
        ar.role,
        rs.rank,
        rs.role_name,
        rs.color
      FROM admin_roles ar
      LEFT JOIN role_settings rs
        ON rs.role_key = ar.role
      WHERE ar.telegram_id = ?
      LIMIT 1
    `).bind(
      id
    ).first();

  if (!row) {
    return null;
  }

  /*
   * Moderator имеет rank 0.
   * Player вообще не является
   * административной ролью.
   */

  return {
    role:
      row.role,
    rank:
      row.role === "moderator"
        ? 0
        : Number(
            row.rank ?? 0
          ),
    roleName:
      row.role_name ||
      row.role,
    color:
      row.color ||
      "#FFFFFF"
  };
}


async function getRole(
  env,
  telegramId
) {
  const access =
    await getAccess(
      env,
      telegramId
    );

  return access
    ? access.role
    : null;
}


async function checkAdmin(
  request,
  env,
  requiredRank = 1
) {
  const data =
    await readBody(
      request
    );

  const adminId =
    getRequestTelegramId(
      request,
      data
    );

  if (!adminId) {
    return {
      ok: false,
      response: json({
        ok: false,
        error:
          "Telegram ID required"
      }, 401)
    };
  }

  const access =
    await getAccess(
      env,
      adminId
    );

  if (!access) {
    return {
      ok: false,
      response: json({
        ok: false,
        error:
          "Access denied"
      }, 403)
    };
  }

  if (
    access.rank < requiredRank
  ) {
    return {
      ok: false,
      response: json({
        ok: false,
        error:
          "Insufficient permissions"
      }, 403)
    };
  }

  return {
    ok: true,
    adminId,
    role:
      access.role,
    rank:
      access.rank,
    data
  };
}


async function ensureUser(
  env,
  telegramId
) {
  const id =
    normalizeId(
      telegramId
    );

  if (!id) {
    return null;
  }

  let user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        balance,
        uc
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `).bind(
      id
    ).first();

  if (user) {
    return user;
  }

  await env.DB.prepare(`
    INSERT INTO users
    (
      telegram_id,
      balance,
      uc
    )
    VALUES (?, 0, 0)
  `).bind(
    id
  ).run();

  user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        balance,
        uc
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `).bind(
      id
    ).first();

  return user;
}


async function isBanned(
  env,
  telegramId
) {
  const id =
    normalizeId(
      telegramId
    );

  if (!id) {
    return false;
  }

  const ban =
    await env.DB.prepare(`
      SELECT
        id
      FROM bans
      WHERE telegram_id = ?
        AND (
          expires_at IS NULL
          OR expires_at > CURRENT_TIMESTAMP
        )
      LIMIT 1
    `).bind(
      id
    ).first();

  if (ban) {
    return true;
  }

  const silentBan =
    await env.DB.prepare(`
      SELECT
        id
      FROM silent_bans
      WHERE telegram_id = ?
        AND active = 1
        AND (
          expires_at IS NULL
          OR expires_at > CURRENT_TIMESTAMP
        )
      LIMIT 1
    `).bind(
      id
    ).first();

  return Boolean(
    silentBan
  );
}


async function logAction(
  env,
  actorId,
  action,
  targetId = null,
  amount = 0,
  details = null
) {
  await env.DB.prepare(`
    INSERT INTO bot_audit
    (
      bot_name,
      actor_telegram_id,
      action,
      target_telegram_id,
      details
    )
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    "cold-queen",
    actorId
      ? String(actorId)
      : null,
    String(action),
    targetId
      ? String(targetId)
      : null,
    details
      ? JSON.stringify({
          amount,
          ...details
        })
      : JSON.stringify({
          amount
        })
  ).run();
      }
