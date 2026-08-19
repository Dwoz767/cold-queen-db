const OWNER_IDS = [
  "683842108"
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

      if (path === "/api/admin" && method === "GET") {
        return await adminPanel(request, env);
      }

      if (path === "/api/admin/balance" && method === "POST") {
        return await changeBalance(request, env);
      }

      if (path === "/api/admin/ban" && method === "POST") {
        return await banUser(request, env);
      }

      if (path === "/api/admin/unban" && method === "POST") {
        return await unbanUser(request, env);
      }

      if (path === "/api/admin/grant" && method === "POST") {
        return await grantAdmin(request, env);
      }

      if (path === "/api/admin/remove" && method === "POST") {
        return await removeAdmin(request, env);
      }

      if (path === "/api/payment/create" && method === "POST") {
        return await createPayment(request, env);
      }

      if (path === "/api/admin/payments" && method === "GET") {
        return await getPayments(request, env);
      }

      if (
        path === "/api/admin/payment/approve" &&
        method === "POST"
      ) {
        return await approvePayment(request, env);
      }

      return json({
        ok: false,
        error: "Not found"
      }, 404);

    } catch (error) {
      console.error(error);

      return json({
        ok: false,
        error: "Internal server error"
      }, 500);
    }
  }
};


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
    "Content-Type":
      "application/json; charset=utf-8"
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


async function getRole(env, telegramId) {
  const id = String(telegramId);

  if (OWNER_IDS.includes(id)) {
    return "owner";
  }

  const row =
    await env.DB.prepare(`
      SELECT role
      FROM admin_roles
      WHERE telegram_id = ?
    `).bind(id).first();

  return row ? row.role : null;
}


async function checkAdmin(
  request,
  env,
  requiredRole = "admin"
) {
  const data =
    await readBody(request);

  const headerId =
    request.headers.get(
      "X-Telegram-ID"
    );

  const adminId =
    data.telegram_id ||
    headerId;

  if (!adminId) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Telegram ID required"
      }, 401)
    };
  }

  const role =
    await getRole(env, adminId);

  if (!role) {
    return {
      ok: false,
      response: json({
        ok: false,
        error: "Access denied"
      }, 403)
    };
  }

  if (requiredRole === "owner") {
    if (role !== "owner") {
      return {
        ok: false,
        response: json({
          ok: false,
          error: "Owner access required"
        }, 403)
      };
    }
  }

  return {
    ok: true,
    adminId: String(adminId),
    role,
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
    String(adminId),
    action,
    targetId
      ? String(targetId)
      : null,
    Number(amount || 0),
    details
      ? JSON.stringify(details)
      : null
  ).run();
                             }
async function getUser(request, env) {
  const data = await readBody(request);

  const telegramId =
    data.telegram_id ||
    request.headers.get("X-Telegram-ID");

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  const user =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        username,
        game_id,
        balance,
        uc_balance,
        spins,
        created_at
      FROM users
      WHERE telegram_id = ?
    `).bind(
      String(telegramId)
    ).first();

  if (!user) {
    return json({
      ok: false,
      error: "Пользователь не найден"
    }, 404);
  }

  const ban =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        reason,
        banned_by,
        expires_at,
        created_at
      FROM bans
      WHERE telegram_id = ?
    `).bind(
      String(telegramId)
    ).first();

  const role =
    await getRole(
      env,
      telegramId
    );

  return json({
    ok: true,
    user,
    role,
    banned: !!ban,
    ban: ban || null
  });
}


async function adminPanel(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "admin"
    );

  if (!access.ok) {
    return access.response;
  }

  const users =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        username,
        game_id,
        balance,
        uc_balance,
        spins,
        created_at
      FROM users
      ORDER BY id DESC
      LIMIT 100
    `).all();

  const admins =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        role,
        granted_by,
        created_at
      FROM admin_roles
      ORDER BY created_at DESC
    `).all();

  const bans =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        reason,
        banned_by,
        expires_at,
        created_at
      FROM bans
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

  return json({
    ok: true,
    admin: {
      telegram_id: access.adminId,
      role: access.role
    },
    users: users.results || [],
    admins: admins.results || [],
    bans: bans.results || []
  });
}


async function changeBalance(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "admin"
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    data.target_telegram_id ||
    data.telegram_id;

  const amount =
    Number(data.amount);

  if (
    !targetId ||
    !Number.isFinite(amount) ||
    amount === 0
  ) {
    return json({
      ok: false,
      error: "Неверные данные"
    }, 400);
  }

  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        balance
      FROM users
      WHERE telegram_id = ?
    `).bind(
      String(targetId)
    ).first();

  if (!user) {
    return json({
      ok: false,
      error: "Пользователь не найден"
    }, 404);
  }

  const oldBalance =
    Number(user.balance || 0);

  const newBalance =
    oldBalance + amount;

  if (newBalance < 0) {
    return json({
      ok: false,
      error: "Баланс не может быть отрицательным"
    }, 400);
  }

  await env.DB.prepare(`
    UPDATE users
    SET balance = ?
    WHERE telegram_id = ?
  `).bind(
    newBalance,
    String(targetId)
  ).run();

  await env.DB.prepare(`
    INSERT INTO transactions
    (
      telegram_id,
      type,
      amount,
      description
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    String(targetId),
    amount > 0
      ? "admin_credit"
      : "admin_debit",
    amount,
    "Изменение баланса администратором"
  ).run();

  await logAction(
    env,
    access.adminId,
    amount > 0
      ? "add_balance"
      : "remove_balance",
    targetId,
    amount,
    {
      old_balance: oldBalance,
      new_balance: newBalance
    }
  );

  return json({
    ok: true,
    telegram_id:
      String(targetId),
    old_balance: oldBalance,
    new_balance: newBalance
  });
}


async function banUser(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "admin"
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    data.target_telegram_id ||
    data.telegram_id;

  const reason =
    data.reason ||
    "Нарушение правил";

  const expiresAt =
    data.expires_at ||
    null;

  if (!targetId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO bans
    (
      telegram_id,
      reason,
      banned_by,
      expires_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(telegram_id)
    DO UPDATE SET
      reason = excluded.reason,
      banned_by = excluded.banned_by,
      expires_at = excluded.expires_at
  `).bind(
    String(targetId),
    reason,
    String(access.adminId),
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
      expires_at: expiresAt
    }
  );

  return json({
    ok: true,
    message:
      "Пользователь заблокирован",
    telegram_id:
      String(targetId)
  });
}


async function unbanUser(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "admin"
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    data.target_telegram_id ||
    data.telegram_id;

  if (!targetId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  await env.DB.prepare(`
    DELETE FROM bans
    WHERE telegram_id = ?
  `).bind(
    String(targetId)
  ).run();

  await logAction(
    env,
    access.adminId,
    "unban",
    targetId
  );

  return json({
    ok: true,
    message:
      "Пользователь разблокирован",
    telegram_id:
      String(targetId)
  });
}
async function grantAdmin(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "owner"
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    data.target_telegram_id;

  const role =
    data.role || "admin";

  if (!targetId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  if (
    role !== "admin" &&
    role !== "moderator"
  ) {
    return json({
      ok: false,
      error: "Разрешены только admin или moderator"
    }, 400);
  }

  await env.DB.prepare(`
    INSERT INTO admin_roles
    (
      telegram_id,
      role,
      granted_by
    )
    VALUES (?, ?, ?)
    ON CONFLICT(telegram_id)
    DO UPDATE SET
      role = excluded.role,
      granted_by = excluded.granted_by
  `).bind(
    String(targetId),
    role,
    String(access.adminId)
  ).run();

  await logAction(
    env,
    access.adminId,
    "grant_admin",
    targetId,
    0,
    { role }
  );

  return json({
    ok: true,
    telegram_id:
      String(targetId),
    role
  });
}


async function removeAdmin(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "owner"
    );

  if (!access.ok) {
    return access.response;
  }

  const data = access.data;

  const targetId =
    data.target_telegram_id;

  if (!targetId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  if (
    OWNER_IDS.includes(
      String(targetId)
    )
  ) {
    return json({
      ok: false,
      error:
        "Нельзя удалить Owner"
    }, 403);
  }

  await env.DB.prepare(`
    DELETE FROM admin_roles
    WHERE telegram_id = ?
  `).bind(
    String(targetId)
  ).run();

  await logAction(
    env,
    access.adminId,
    "remove_admin",
    targetId
  );

  return json({
    ok: true,
    telegram_id:
      String(targetId)
  });
}


async function createPayment(request, env) {
  const data =
    await readBody(request);

  const telegramId =
    data.telegram_id;

  const amount =
    Number(data.amount);

  const description =
    data.description ||
    "Пополнение баланса";

  if (
    !telegramId ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверный telegram_id или amount"
    }, 400);
  }

  const user =
    await env.DB.prepare(`
      SELECT telegram_id
      FROM users
      WHERE telegram_id = ?
    `).bind(
      String(telegramId)
    ).first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Пользователь не найден"
    }, 404);
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
      String(telegramId),
      Math.floor(amount),
      description
    ).run();

  return json({
    ok: true,
    payment_id:
      result.meta.last_row_id,
    status: "pending",
    message:
      "Заявка создана. Оплата подтверждается поддержкой."
  });
}


async function getPayments(request, env) {
  const access =
    await checkAdmin(
      request,
      env,
      "admin"
    );

  if (!access.ok) {
    return access.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        amount,
        currency,
        provider,
        provider_payment_id,
        status,
        description,
        created_at,
        paid_at
      FROM payments
      ORDER BY id DESC
      LIMIT 100
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
      "admin"
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
        "Неверный payment_id"
    }, 400);
  }

  const payment =
    await env.DB.prepare(`
      SELECT
        id,
        telegram_id,
        amount,
        status
      FROM payments
      WHERE id = ?
    `).bind(
      paymentId
    ).first();

  if (!payment) {
    return json({
      ok: false,
      error:
        "Платёж не найден"
    }, 404);
  }

  if (payment.status === "paid") {
    return json({
      ok: false,
      error:
        "Платёж уже подтверждён"
    }, 409);
  }

  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        balance
      FROM users
      WHERE telegram_id = ?
    `).bind(
      String(payment.telegram_id)
    ).first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Пользователь не найден"
    }, 404);
  }

  const oldBalance =
    Number(user.balance || 0);

  const newBalance =
    oldBalance +
    Number(payment.amount || 0);

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
    Number(payment.amount),
    "Пополнение через поддержку"
  ).run();

  await logAction(
    env,
    access.adminId,
    "approve_payment",
    payment.telegram_id,
    Number(payment.amount),
    {
      payment_id: paymentId,
      old_balance: oldBalance,
      new_balance: newBalance
    }
  );

  return json({
    ok: true,
    payment_id: paymentId,
    telegram_id:
      String(payment.telegram_id),
    amount:
      Number(payment.amount),
    new_balance:
      newBalance
  });
              }
