const OWNER_IDS = [
  "683842108"
];

const RANKS = {
  ADMIN_1: 1,
  ADMIN_2: 2,
  ADMIN_3: 3,
  ADMIN_4: 4,
  DEPUTY_OWNER: 5,
  OWNER: 6
};

const ROLE_INFO = {
  admin_1: {
    rank: 1,
    name: "Admin",
    color: "#90EE90"
  },

  admin_2: {
    rank: 2,
    name: "Admin Chat",
    color: "#00A000"
  },

  admin_3: {
    rank: 3,
    name: "Admin Moderator",
    color: "#39FF14"
  },

  admin_4: {
    rank: 4,
    name: "Curator",
    color: "#BF00FF"
  },

  deputy_owner: {
    rank: 5,
    name: "Deputy Owner",
    color: "#FF0000"
  },

  owner: {
    rank: 6,
    name: "Owner",
    color: "#FF0000"
  },

  moderator: {
    rank: 0,
    name: "Moderator",
    color: "#87CEEB"
  },

  player: {
    rank: 0,
    name: "Player",
    color: "#FFFFFF"
  }
};


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
       * HEALTH CHECK
       */

      if (
        path === "/" &&
        method === "GET"
      ) {
        return json({
          ok: true,
          service: "cold-queen-db",
          status: "online"
        });
      }


      /*
       * PLAYER
       */

      if (
        path === "/api/user" &&
        method === "POST"
      ) {
        return await getUser(
          request,
          env
        );
      }


      /*
       * WHEEL
       */

      if (
        path === "/api/wheel" &&
        method === "GET"
      ) {
        return await getWheel(
          request,
          env
        );
      }

      if (
        path === "/api/wheel/spin" &&
        method === "POST"
      ) {
        return await spinWheel(
          request,
          env
        );
      }


      /*
       * CHAT
       */

      if (
        path === "/api/chat" &&
        method === "GET"
      ) {
        return await getChat(
          request,
          env
        );
      }

      if (
        path === "/api/chat" &&
        method === "POST"
      ) {
        return await sendChatMessage(
          request,
          env
        );
      }

      if (
        path === "/api/chat/delete" &&
        method === "POST"
      ) {
        return await deleteChatMessage(
          request,
          env
        );
      }


      /*
       * SUPPORT
       */

      if (
        path === "/api/support/create" &&
        method === "POST"
      ) {
        return await createSupportTicket(
          request,
          env
        );
      }

      if (
        path === "/api/support/message" &&
        method === "POST"
      ) {
        return await sendSupportMessage(
          request,
          env
        );
      }


      /*
       * PAYMENTS
       */

      if (
        path === "/api/payment/create" &&
        method === "POST"
      ) {
        return await createPayment(
          request,
          env
        );
      }


      /*
       * PAYOUT
       */

      if (
        path === "/api/payout/create" &&
        method === "POST"
      ) {
        return await createPayout(
          request,
          env
        );
      }


      /*
       * COMPLAINTS
       */

      if (
        path === "/api/complaint/create" &&
        method === "POST"
      ) {
        return await createComplaint(
          request,
          env
        );
      }


      /*
       * ADMIN PANEL
       */

      if (
        path === "/api/admin" &&
        method === "GET"
      ) {
        return await adminPanel(
          request,
          env
        );
      }


      /*
       * ADMIN BALANCE
       */

      if (
        path === "/api/admin/balance" &&
        method === "POST"
      ) {
        return await changeBalance(
          request,
          env
        );
      }


      /*
       * ADMIN UC
       */

      if (
        path === "/api/admin/uc" &&
        method === "POST"
      ) {
        return await changeUC(
          request,
          env
        );
      }


      /*
       * ADMIN SPINS
       */

      if (
        path === "/api/admin/spins" &&
        method === "POST"
      ) {
        return await changeSpins(
          request,
          env
        );
      }


      /*
       * BAN
       */

      if (
        path === "/api/admin/ban" &&
        method === "POST"
      ) {
        return await banUser(
          request,
          env
        );
      }


      /*
       * SILENT BAN
       */

      if (
        path === "/api/admin/silent-ban" &&
        method === "POST"
      ) {
        return await silentBanUser(
          request,
          env
        );
      }


      /*
       * UNBAN
       */

      if (
        path === "/api/admin/unban" &&
        method === "POST"
      ) {
        return await unbanUser(
          request,
          env
        );
      }


      /*
       * ROLES
       */

      if (
        path === "/api/admin/role/request" &&
        method === "POST"
      ) {
        return await requestRoleChange(
          request,
          env
        );
      }

      if (
        path === "/api/admin/role/approve" &&
        method === "POST"
      ) {
        return await approveRoleChange(
          request,
          env
        );
      }

      if (
        path === "/api/admin/role/remove" &&
        method === "POST"
      ) {
        return await removeRole(
          request,
          env
        );
      }


      /*
       * WHEEL SETTINGS
       * OWNER / DEPUTY ONLY
       */

      if (
        path === "/api/admin/wheel/settings" &&
        method === "POST"
      ) {
        return await updateWheelSettings(
          request,
          env
        );
      }

      if (
        path === "/api/admin/wheel/prize" &&
        method === "POST"
      ) {
        return await saveWheelPrize(
          request,
          env
        );
      }

      if (
        path === "/api/admin/wheel/prize/delete" &&
        method === "POST"
      ) {
        return await deleteWheelPrize(
          request,
          env
        );
      }


      /*
       * COMPLAINTS / OBSERVATION
       */

      if (
        path === "/api/admin/complaints" &&
        method === "GET"
      ) {
        return await getComplaints(
          request,
          env
        );
      }

      if (
        path === "/api/admin/observations" &&
        method === "GET"
      ) {
        return await getObservations(
          request,
          env
        );
      }


      /*
       * PAYMENTS
       */

      if (
        path === "/api/admin/payments" &&
        method === "GET"
      ) {
        return await getPayments(
          request,
          env
        );
      }

      if (
        path === "/api/admin/payment/approve" &&
        method === "POST"
      ) {
        return await approvePayment(
          request,
          env
        );
      }


      /*
       * PAYOUTS
       */

      if (
        path === "/api/admin/payouts" &&
        method === "GET"
      ) {
        return await getPayouts(
          request,
          env
        );
      }

      if (
        path === "/api/admin/payout/approve" &&
        method === "POST"
      ) {
        return await approvePayout(
          request,
          env
        );
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
      "Content-Type, Authorization, X-Telegram-ID",

    "Content-Type":
      "application/json; charset=utf-8"
  };

}


function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,
      headers: corsHeaders()
    }
  );

}


async function readBody(request) {

  try {

    const text =
      await request.text();

    if (!text) {
      return {};
    }

    return JSON.parse(text);

  } catch {

    return {};

  }

}


function normalizeId(id) {

  return String(id || "").trim();

}


function roleRank(role) {

  if (role === "owner") {
    return 6;
  }

  if (role === "deputy_owner") {
    return 5;
  }

  if (role === "admin_4") {
    return 4;
  }

  if (role === "admin_3") {
    return 3;
  }

  if (role === "admin_2") {
    return 2;
  }

  if (role === "admin_1") {
    return 1;
  }

  if (role === "moderator") {
    return 0;
  }

  return 0;

}


function roleColor(role) {

  return (
    ROLE_INFO[role]?.color ||
    "#FFFFFF"
  );

}


function roleName(role) {

  return (
    ROLE_INFO[role]?.name ||
    "Player"
  );

}


async function getRole(
  env,
  telegramId
) {

  const id =
    normalizeId(telegramId);

  if (
    OWNER_IDS.includes(id)
  ) {
    return "owner";
  }


  const row =
    await env.DB.prepare(`
      SELECT role
      FROM admin_roles
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();


  return row
    ? row.role
    : "player";

}


async function getActor(
  request,
  env
) {

  const headerId =
    request.headers.get(
      "X-Telegram-ID"
    );

  let body = {};

  if (
    request.method !== "GET"
  ) {
    body =
      await readBody(request);
  }

  const telegramId =
    normalizeId(
      body.telegram_id ||
      headerId
    );

  if (!telegramId) {

    return {
      ok: false,
      response: json({
        ok: false,
        error:
          "Telegram ID required"
      }, 401)
    };

  }

  const role =
    await getRole(
      env,
      telegramId
    );

  return {
    ok: true,
    telegramId,
    role,
    rank: roleRank(role),
    data: body
  };

}


async function requireRank(
  request,
  env,
  minimumRank
) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor;
  }

  if (
    actor.rank < minimumRank
  ) {

    return {
      ok: false,
      response: json({
        ok: false,
        error:
          "Недостаточно прав"
      }, 403)
    };

  }

  return actor;

}


async function requireOwnerOrDeputy(
  request,
  env
) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor;
  }

  if (
    actor.role !== "owner" &&
    actor.role !== "deputy_owner"
  ) {

    return {
      ok: false,
      response: json({
        ok: false,
        error:
          "Доступ только Owner или Deputy Owner"
      }, 403)
    };

  }

  return actor;

        }
/* =========================================================
   USER
   ========================================================= */

async function getUser(request, env) {

  const data = await readBody(request);

  const telegramId =
    normalizeId(data.telegram_id);

  if (!telegramId) {
    return json({
      ok: false,
      error: "Telegram ID required"
    }, 400);
  }

  let user = await env.DB.prepare(`
    SELECT *
    FROM users
    WHERE telegram_id = ?
    LIMIT 1
  `)
  .bind(telegramId)
  .first();

  if (!user) {

    await env.DB.prepare(`
      INSERT INTO users
      (
        telegram_id,
        balance
      )
      VALUES (?, 0)
    `)
    .bind(telegramId)
    .run();

    user = await env.DB.prepare(`
      SELECT *
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(telegramId)
    .first();

  }

  const role =
    await getRole(
      env,
      telegramId
    );

  const activeBan =
    await env.DB.prepare(`
      SELECT *
      FROM silent_bans
      WHERE telegram_id = ?
        AND active = 1
        AND (
          expires_at IS NULL
          OR expires_at > CURRENT_TIMESTAMP
        )
      ORDER BY id DESC
      LIMIT 1
    `)
    .bind(telegramId)
    .first();

  return json({
    ok: true,

    user: {
      ...user,

      role,

      role_name:
        roleName(role),

      role_color:
        roleColor(role),

      rank:
        roleRank(role),

      banned:
        !!activeBan
    }
  });

}


/* =========================================================
   WHEEL
   ========================================================= */

async function getWheel(request, env) {

  const settings =
    await env.DB.prepare(`
      SELECT
        id,
        spin_cost,
        currency,
        enabled
      FROM wheel_settings
      WHERE id = 1
      LIMIT 1
    `)
    .first();

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
    `)
    .all();

  return json({
    ok: true,

    settings: settings || {
      spin_cost: 0,
      currency: "RUB",
      enabled: 0
    },

    prizes:
      prizes.results || []
  });

}


/*
 * ВАЖНО:
 *
 * Случайный результат вращения создаётся здесь,
 * на сервере.
 *
 * index.html НЕ определяет приз.
 */

async function spinWheel(request, env) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const telegramId =
    actor.telegramId;

  const ban =
    await env.DB.prepare(`
      SELECT id
      FROM silent_bans
      WHERE telegram_id = ?
        AND active = 1
        AND (
          expires_at IS NULL
          OR expires_at > CURRENT_TIMESTAMP
        )
      LIMIT 1
    `)
    .bind(telegramId)
    .first();

  if (ban) {
    return json({
      ok: false,
      error: "Доступ к игре ограничен"
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
    `)
    .first();

  if (!settings) {
    return json({
      ok: false,
      error: "Настройки колеса не найдены"
    }, 500);
  }

  if (!Number(settings.enabled)) {
    return json({
      ok: false,
      error: "Колесо временно отключено"
    }, 403);
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
        AND probability > 0
      ORDER BY id ASC
    `)
    .all();

  const availablePrizes =
    prizes.results || [];

  if (!availablePrizes.length) {
    return json({
      ok: false,
      error: "Нет доступных призов"
    }, 500);
  }


  const totalProbability =
    availablePrizes.reduce(
      (sum, prize) =>
        sum + Number(
          prize.probability || 0
        ),
      0
    );


  if (
    totalProbability <= 0
  ) {
    return json({
      ok: false,
      error:
        "Сумма вероятностей должна быть больше 0"
    }, 500);
  }


  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        balance
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(telegramId)
    .first();

  if (!user) {
    return json({
      ok: false,
      error: "Пользователь не найден"
    }, 404);
  }


  const oldBalance =
    Number(user.balance || 0);

  const spinCost =
    Number(settings.spin_cost || 0);


  if (
    oldBalance < spinCost
  ) {
    return json({
      ok: false,
      error: "Недостаточно баланса",
      balance: oldBalance,
      spin_cost: spinCost
    }, 400);
  }


  /*
   * Криптографически стойкая случайность
   */

  const randomArray =
    new Uint32Array(1);

  crypto.getRandomValues(
    randomArray
  );

  const random =
    randomArray[0] /
    4294967296;


  let cursor =
    random *
    totalProbability;

  let selectedPrize =
    availablePrizes[
      availablePrizes.length - 1
    ];


  for (
    const prize of availablePrizes
  ) {

    const probability =
      Number(
        prize.probability || 0
      );

    if (
      cursor < probability
    ) {
      selectedPrize =
        prize;
      break;
    }

    cursor -= probability;
  }


  const newBalance =
    oldBalance -
    spinCost;


  /*
   * Все изменения записываем
   * в одной D1 batch-транзакции.
   */

  const statements = [];


  statements.push(
    env.DB.prepare(`
      UPDATE users
      SET balance = ?
      WHERE telegram_id = ?
    `)
    .bind(
      newBalance,
      telegramId
    )
  );


  statements.push(
    env.DB.prepare(`
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
    `)
    .bind(
      telegramId,
      selectedPrize.id,
      selectedPrize.name,
      selectedPrize.prize_type,
      Number(
        selectedPrize.prize_value || 0
      ),
      spinCost
    )
  );


  statements.push(
    env.DB.prepare(`
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
    `)
    .bind(
      telegramId,
      telegramId,
      oldBalance,
      newBalance,
      -spinCost,
      "Вращение колеса",
      "spin",
      String(selectedPrize.id)
    )
  );


  await env.DB.batch(
    statements
  );


  /*
   * Если выигран UC —
   * начисляем UC отдельно
   * и сохраняем аудит.
   */

  if (
    selectedPrize.prize_type === "uc" &&
    Number(selectedPrize.prize_value || 0) > 0
  ) {

    const ucAmount =
      Number(
        selectedPrize.prize_value
      );

    const currentUCRow =
      await env.DB.prepare(`
        SELECT
          uc
        FROM users
        WHERE telegram_id = ?
        LIMIT 1
      `)
      .bind(telegramId)
      .first();

    const oldUC =
      Number(
        currentUCRow?.uc || 0
      );

    const newUC =
      oldUC + ucAmount;


    await env.DB.batch([

      env.DB.prepare(`
        UPDATE users
        SET uc = ?
        WHERE telegram_id = ?
      `)
      .bind(
        newUC,
        telegramId
      ),

      env.DB.prepare(`
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
      `)
      .bind(
        telegramId,
        telegramId,
        oldUC,
        newUC,
        ucAmount,
        "Выигрыш в колесе"
      )

    ]);

  }


  return json({
    ok: true,

    result: {
      prize_id:
        selectedPrize.id,

      prize_name:
        selectedPrize.name,

      prize_type:
        selectedPrize.prize_type,

      prize_value:
        Number(
          selectedPrize.prize_value || 0
        )
    },

    balance:
      newBalance
  });

}


/* =========================================================
   CHAT
   ========================================================= */

async function getChat(request, env) {

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
    `)
    .all();


  const messages =
    (result.results || [])
      .reverse()
      .map(message => {

        const role =
          message.role_key ||
          "player";

        return {
          ...message,

          role_name:
            roleName(role),

          role_color:
            roleColor(role)
        };

      });


  return json({
    ok: true,
    messages
  });

}


async function sendChatMessage(
  request,
  env
) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }


  const data =
    actor.data;

  const message =
    String(
      data.message || ""
    ).trim();


  if (!message) {
    return json({
      ok: false,
      error: "Сообщение пустое"
    }, 400);
  }


  if (
    message.length > 1000
  ) {
    return json({
      ok: false,
      error:
        "Сообщение слишком длинное"
    }, 400);
  }


  const username =
    data.username
      ? String(data.username)
      : null;


  await env.DB.prepare(`
    INSERT INTO wheel_chat_messages
    (
      telegram_id,
      username,
      role_key,
      message
    )
    VALUES (?, ?, ?, ?)
  `)
  .bind(
    actor.telegramId,
    username,
    actor.role,
    message
  )
  .run();


  return json({
    ok: true
  });

}


async function deleteChatMessage(
  request,
  env
) {

  const actor =
    await requireRank(
      request,
      env,
      2
    );

  if (!actor.ok) {
    return actor.response;
  }


  const data =
    actor.data;

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
        "Неверный ID сообщения"
    }, 400);
  }


  await env.DB.prepare(`
    UPDATE wheel_chat_messages
    SET
      deleted = 1,
      deleted_by = ?,
      deleted_reason = ?
    WHERE id = ?
  `)
  .bind(
    actor.telegramId,
    reason,
    messageId
  )
  .run();


  await logAction(
    env,
    actor.telegramId,
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
    ok: true
  });

}


/* =========================================================
   SUPPORT
   ========================================================= */

async function createSupportTicket(
  request,
  env
) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }


  const data =
    actor.data;


  const subject =
    String(
      data.subject ||
      "Поддержка"
    ).slice(0, 200);


  const result =
    await env.DB.prepare(`
      INSERT INTO support_tickets
      (
        player_telegram_id,
        subject
      )
      VALUES (?, ?)
    `)
    .bind(
      actor.telegramId,
      subject
    )
    .run();


  return json({
    ok: true,
    ticket_id:
      result.meta.last_row_id
  });

}


async function sendSupportMessage(
  request,
  env
) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }


  const data =
    actor.data;

  const ticketId =
    Number(data.ticket_id);

  const message =
    String(
      data.message || ""
    ).trim();


  if (
    !Number.isInteger(ticketId) ||
    ticketId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверный ticket_id"
    }, 400);
  }


  if (!message) {
    return json({
      ok: false,
      error:
        "Сообщение пустое"
    }, 400);
  }


  const ticket =
    await env.DB.prepare(`
      SELECT
        id,
        player_telegram_id,
        assigned_to,
        status
      FROM support_tickets
      WHERE id = ?
      LIMIT 1
    `)
    .bind(ticketId)
    .first();


  if (!ticket) {
    return json({
      ok: false,
      error:
        "Обращение не найдено"
    }, 404);
  }


  const isPlayer =
    String(
      ticket.player_telegram_id
    ) === actor.telegramId;


  const isStaff =
    actor.rank >= 1;


  if (
    !isPlayer &&
    !isStaff
  ) {
    return json({
      ok: false,
      error:
        "Нет доступа"
    }, 403);
  }


  await env.DB.prepare(`
    INSERT INTO support_messages
    (
      ticket_id,
      sender_telegram_id,
      sender_role,
      message
    )
    VALUES (?, ?, ?, ?)
  `)
  .bind(
    ticketId,
    actor.telegramId,
    actor.role,
    message
  )
  .run();


  return json({
    ok: true
  });

    }
/* =========================================================
   PAYMENTS
   ========================================================= */

async function createPayment(request, env) {

  const actor =
    await getActor(request, env);

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const amount =
    Number(data.amount);

  const description =
    String(
      data.description ||
      "Пополнение игрового баланса"
    ).slice(0, 500);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error: "Неверная сумма"
    }, 400);
  }

  /*
   * Деньги подтверждает только Owner.
   * Остальные сотрудники не могут подтверждать
   * оплату через этот endpoint.
   */

  const result =
    await env.DB.prepare(`
      INSERT INTO support_tickets
      (
        player_telegram_id,
        subject
      )
      VALUES (?, ?)
    `)
    .bind(
      actor.telegramId,
      `Пополнение: ${amount} RUB`
    )
    .run();

  const ticketId =
    result.meta.last_row_id;

  await env.DB.prepare(`
    INSERT INTO support_messages
    (
      ticket_id,
      sender_telegram_id,
      sender_role,
      message
    )
    VALUES (?, ?, ?, ?)
  `)
  .bind(
    ticketId,
    actor.telegramId,
    actor.role,
    `Запрос на пополнение: ${amount} RUB. ${description}`
  )
  .run();

  return json({
    ok: true,
    ticket_id: ticketId,
    status: "pending",
    message:
      "Заявка передана Owner для ручной проверки."
  });
}


/* =========================================================
   PAYOUT / ВЫВОД UC
   ========================================================= */

async function createPayout(request, env) {

  const actor =
    await getActor(request, env);

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const pubgMobileId =
    String(
      data.pubg_mobile_id || ""
    ).trim();

  const ucAmount =
    Number(data.uc_amount);

  if (!pubgMobileId) {
    return json({
      ok: false,
      error:
        "PUBG Mobile ID не указан"
    }, 400);
  }

  if (
    !Number.isInteger(ucAmount) ||
    ucAmount <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверное количество UC"
    }, 400);
  }

  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        uc
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(actor.telegramId)
    .first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Пользователь не найден"
    }, 404);
  }

  const currentUC =
    Number(user.uc || 0);

  if (currentUC < ucAmount) {
    return json({
      ok: false,
      error:
        "Недостаточно UC",
      uc:
        currentUC
    }, 400);
  }

  /*
   * UC резервируются сразу,
   * чтобы игрок не смог создать
   * несколько заявок на один баланс.
   */

  const newUC =
    currentUC - ucAmount;

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET uc = ?
      WHERE telegram_id = ?
    `)
    .bind(
      newUC,
      actor.telegramId
    ),

    env.DB.prepare(`
      INSERT INTO payout_requests
      (
        telegram_id,
        pubg_mobile_id,
        uc_amount
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      actor.telegramId,
      pubgMobileId,
      ucAmount
    ),

    env.DB.prepare(`
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
    `)
    .bind(
      actor.telegramId,
      actor.telegramId,
      currentUC,
      newUC,
      -ucAmount,
      "Создание заявки на вывод UC"
    )

  ]);

  return json({
    ok: true,
    status: "pending",
    pubg_mobile_id:
      pubgMobileId,
    uc_amount:
      ucAmount,
    remaining_uc:
      newUC
  });
}


/* =========================================================
   COMPLAINTS
   ========================================================= */

async function createComplaint(
  request,
  env
) {

  const actor =
    await getActor(request, env);

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const complaintText =
    String(
      data.complaint_text || ""
    ).trim();

  if (!targetId) {
    return json({
      ok: false,
      error:
        "ID сотрудника не указан"
    }, 400);
  }

  if (!complaintText) {
    return json({
      ok: false,
      error:
        "Текст жалобы пуст"
    }, 400);
  }

  const targetRole =
    await getRole(
      env,
      targetId
    );

  if (
    targetRole === "player"
  ) {
    return json({
      ok: false,
      error:
        "Жалоба должна быть на сотрудника"
    }, 400);
  }

  const result =
    await env.DB.prepare(`
      INSERT INTO complaints
      (
        reporter_telegram_id,
        target_telegram_id,
        target_role,
        complaint_text
      )
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      actor.telegramId,
      targetId,
      targetRole,
      complaintText
    )
    .run();

  return json({
    ok: true,
    complaint_id:
      result.meta.last_row_id,
    status: "pending"
  });
}


/* =========================================================
   ADMIN PANEL
   ========================================================= */

async function adminPanel(
  request,
  env
) {

  const actor =
    await requireRank(
      request,
      env,
      1
    );

  if (!actor.ok) {
    return actor.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT
        role_key,
        rank,
        role_name,
        color,
        description
      FROM role_settings
      ORDER BY rank DESC
    `)
    .all();

  return json({
    ok: true,

    actor: {
      telegram_id:
        actor.telegramId,

      role:
        actor.role,

      rank:
        actor.rank,

      role_name:
        roleName(actor.role),

      color:
        roleColor(actor.role)
    },

    permissions:
      getPermissions(actor.role),

    roles:
      result.results || []
  });
}


function getPermissions(role) {

  const permissions = {
    view_panel: false,
    view_chat: false,
    moderate_chat: false,
    view_moderator_complaints: false,
    view_admin_complaints: false,
    observe_moderators: false,
    observe_admins: false,
    ban_lower_rank: false,
    silent_ban: false,
    change_balance: false,
    change_uc: false,
    change_spins: false,
    manage_wheel: false,
    change_role_colors: false,
    appoint_moderator: false,
    appoint_admin: false,
    appoint_deputy: false,
    payment_confirmation: false
  };

  if (role === "admin_1") {
    permissions.view_panel = true;
    permissions.view_chat = true;
    permissions.ban_lower_rank = true;
  }

  if (role === "admin_2") {
    permissions.view_panel = true;
    permissions.view_chat = true;
    permissions.moderate_chat = true;
    permissions.ban_lower_rank = true;
  }

  if (role === "admin_3") {
    permissions.view_panel = true;
    permissions.view_chat = true;
    permissions.moderate_chat = true;
    permissions.view_moderator_complaints = true;
    permissions.observe_moderators = true;
    permissions.ban_lower_rank = true;
  }

  if (role === "admin_4") {
    permissions.view_panel = true;
    permissions.view_chat = true;
    permissions.moderate_chat = true;
    permissions.view_moderator_complaints = true;
    permissions.view_admin_complaints = true;
    permissions.observe_moderators = true;
    permissions.observe_admins = true;
    permissions.ban_lower_rank = true;
  }

  if (
    role === "deputy_owner" ||
    role === "owner"
  ) {

    Object.keys(
      permissions
    ).forEach(key => {
      permissions[key] = true;
    });

  }

  /*
   * Тихий бан только Owner/Deputy.
   */

  if (
    role !== "owner" &&
    role !== "deputy_owner"
  ) {
    permissions.silent_ban = false;
  }

  return permissions;
}


/* =========================================================
   BALANCE
   ========================================================= */

async function changeBalance(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const amount =
    Number(data.amount);

  const reason =
    String(
      data.reason || ""
    ).trim();

  if (!targetId) {
    return json({
      ok: false,
      error:
        "ID игрока не указан"
    }, 400);
  }

  if (
    !Number.isFinite(amount) ||
    amount === 0
  ) {
    return json({
      ok: false,
      error:
        "Неверная сумма"
    }, 400);
  }

  if (!reason) {
    return json({
      ok: false,
      error:
        "Причина обязательна"
    }, 400);
  }

  /*
   * Баланс может менять только
   * Owner или Deputy Owner.
   */

  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        balance
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(targetId)
    .first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Игрок не найден"
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
        "Баланс не может быть отрицательным"
    }, 400);
  }

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET balance = ?
      WHERE telegram_id = ?
    `)
    .bind(
      newBalance,
      targetId
    ),

    env.DB.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      actor.telegramId,
      targetId,
      oldBalance,
      newBalance,
      amount,
      reason,
      "admin_balance"
    )

  ]);

  await logAction(
    env,
    actor.telegramId,
    "change_balance",
    targetId,
    amount,
    {
      reason,
      old_balance:
        oldBalance,
      new_balance:
        newBalance
    }
  );

  return json({
    ok: true,
    telegram_id:
      targetId,
    old_balance:
      oldBalance,
    new_balance:
      newBalance
  });
}


/* =========================================================
   UC
   ========================================================= */

async function changeUC(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const amount =
    Number(data.amount);

  const reason =
    String(
      data.reason || ""
    ).trim();

  if (!targetId) {
    return json({
      ok: false,
      error:
        "ID игрока не указан"
    }, 400);
  }

  if (
    !Number.isInteger(amount) ||
    amount === 0
  ) {
    return json({
      ok: false,
      error:
        "Неверное количество UC"
    }, 400);
  }

  if (!reason) {
    return json({
      ok: false,
      error:
        "Причина обязательна"
    }, 400);
  }

  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        uc
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(targetId)
    .first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Игрок не найден"
    }, 404);
  }

  const oldUC =
    Number(user.uc || 0);

  const newUC =
    oldUC + amount;

  if (newUC < 0) {
    return json({
      ok: false,
      error:
        "UC не может быть отрицательным"
    }, 400);
  }

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET uc = ?
      WHERE telegram_id = ?
    `)
    .bind(
      newUC,
      targetId
    ),

    env.DB.prepare(`
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
    `)
    .bind(
      actor.telegramId,
      targetId,
      oldUC,
      newUC,
      amount,
      reason
    )

  ]);

  return json({
    ok: true,
    telegram_id:
      targetId,
    old_uc:
      oldUC,
    new_uc:
      newUC
  });
}


/* =========================================================
   SPINS
   ========================================================= */

async function changeSpins(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const amount =
    Number(data.amount);

  const reason =
    String(
      data.reason || ""
    ).trim();

  if (!targetId) {
    return json({
      ok: false,
      error:
        "ID игрока не указан"
    }, 400);
  }

  if (
    !Number.isInteger(amount) ||
    amount === 0
  ) {
    return json({
      ok: false,
      error:
        "Неверное количество вращений"
    }, 400);
  }

  if (!reason) {
    return json({
      ok: false,
      error:
        "Причина обязательна"
    }, 400);
  }

  /*
   * Эта функция рассчитана на наличие
   * колонки spins в users.
   */

  const user =
    await env.DB.prepare(`
      SELECT
        telegram_id,
        spins
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(targetId)
    .first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Игрок не найден"
    }, 404);
  }

  const oldSpins =
    Number(user.spins || 0);

  const newSpins =
    oldSpins + amount;

  if (newSpins < 0) {
    return json({
      ok: false,
      error:
        "Количество вращений не может быть отрицательным"
    }, 400);
  }

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET spins = ?
      WHERE telegram_id = ?
    `)
    .bind(
      newSpins,
      targetId
    ),

    env.DB.prepare(`
      INSERT INTO spin_audit
      (
        actor_telegram_id,
        target_telegram_id,
        old_spins,
        new_spins,
        amount,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .bind(
      actor.telegramId,
      targetId,
      oldSpins,
      newSpins,
      amount,
      reason
    )

  ]);

  return json({
    ok: true,
    telegram_id:
      targetId,
    old_spins:
      oldSpins,
    new_spins:
      newSpins
  });
}
/* =========================================================
   BAN SYSTEM
   ========================================================= */

async function banUser(request, env) {

  const actor =
    await getActor(request, env);

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const reason =
    String(
      data.reason || ""
    ).trim();

  if (!targetId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  if (!reason) {
    return json({
      ok: false,
      error: "Причина бана обязательна"
    }, 400);
  }

  const targetRole =
    await getRole(
      env,
      targetId
    );

  const targetRank =
    roleRank(targetRole);

  /*
   * Нельзя банить равного или старшего.
   * Owner имеет максимальный ранг.
   */

  if (
    targetId === actor.telegramId
  ) {
    return json({
      ok: false,
      error: "Нельзя забанить себя"
    }, 400);
  }

  if (
    targetRank >= actor.rank &&
    targetRole !== "player"
  ) {
    return json({
      ok: false,
      error:
        "Нельзя банить сотрудника своего или более высокого ранга"
    }, 403);
  }

  /*
   * Создаём обычный бан через silent_bans,
   * но делаем его видимым для самого игрока
   * на уровне API.
   */

  const expiresAt =
    data.expires_at
      ? String(data.expires_at)
      : null;

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
  `)
  .bind(
    targetId,
    actor.telegramId,
    reason,
    expiresAt
  )
  .run();

  await logAction(
    env,
    actor.telegramId,
    "ban",
    targetId,
    0,
    {
      target_role:
        targetRole,
      reason,
      expires_at:
        expiresAt
    }
  );

  return json({
    ok: true,
    message: "Пользователь заблокирован",
    telegram_id: targetId
  });
}


/* =========================================================
   SILENT BAN
   ========================================================= */

async function silentBanUser(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const reason =
    String(
      data.reason || ""
    ).trim();

  if (!targetId) {
    return json({
      ok: false,
      error: "Telegram ID не указан"
    }, 400);
  }

  if (!reason) {
    return json({
      ok: false,
      error:
        "Причина тихого бана обязательна"
    }, 400);
  }

  if (
    targetId === actor.telegramId
  ) {
    return json({
      ok: false,
      error: "Нельзя забанить себя"
    }, 400);
  }

  const targetRole =
    await getRole(
      env,
      targetId
    );

  const targetRank =
    roleRank(targetRole);

  if (
    targetRole !== "player" &&
    targetRank >= actor.rank
  ) {
    return json({
      ok: false,
      error:
        "Нельзя тихо забанить сотрудника равного или более высокого ранга"
    }, 403);
  }

  const expiresAt =
    data.expires_at
      ? String(data.expires_at)
      : null;

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
  `)
  .bind(
    targetId,
    actor.telegramId,
    reason,
    expiresAt
  )
  .run();

  /*
   * ВАЖНО:
   * запись о тихом бане НЕ возвращается
   * обычному пользователю.
   * Просмотр журнала будет отдельно ограничен
   * Owner / Deputy Owner.
   */

  await logAction(
    env,
    actor.telegramId,
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
    message:
      "Тихий бан применён"
  });
}


/* =========================================================
   UNBAN
   ========================================================= */

async function unbanUser(
  request,
  env
) {

  const actor =
    await requireRank(
      request,
      env,
      1
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "Telegram ID не указан"
    }, 400);
  }

  const targetRole =
    await getRole(
      env,
      targetId
    );

  const targetRank =
    roleRank(targetRole);

  if (
    targetRole !== "player" &&
    targetRank >= actor.rank
  ) {
    return json({
      ok: false,
      error:
        "Нельзя снять блокировку с равного или более высокого ранга"
    }, 403);
  }

  await env.DB.prepare(`
    UPDATE silent_bans
    SET active = 0
    WHERE telegram_id = ?
      AND active = 1
  `)
  .bind(targetId)
  .run();

  await logAction(
    env,
    actor.telegramId,
    "unban",
    targetId
  );

  return json({
    ok: true,
    message:
      "Блокировка снята"
  });
}


/* =========================================================
   ROLE REQUEST
   ========================================================= */

async function requestRoleChange(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  const requestedRole =
    String(
      data.requested_role || ""
    );

  const requestedRank =
    Number(
      data.requested_rank ||
      roleRank(requestedRole)
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "ID пользователя не указан"
    }, 400);
  }

  if (
    !ROLE_INFO[requestedRole]
  ) {
    return json({
      ok: false,
      error:
        "Неизвестная роль"
    }, 400);
  }

  /*
   * Назначать Owner нельзя через обычный запрос.
   */

  if (
    requestedRole === "owner"
  ) {
    return json({
      ok: false,
      error:
        "Owner назначается отдельно"
    }, 403);
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
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      targetId,
      requestedRole,
      requestedRank,
      actor.telegramId,
      data.real_name || null,
      data.age || null,
      data.username || null,
      data.reason || null
    )
    .run();

  return json({
    ok: true,
    request_id:
      result.meta.last_row_id,
    status:
      "pending"
  });
}


/* =========================================================
   APPROVE ROLE
   ========================================================= */

async function approveRoleChange(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const requestId =
    Number(data.request_id);

  if (
    !Number.isInteger(requestId) ||
    requestId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверный request_id"
    }, 400);
  }

  const roleRequest =
    await env.DB.prepare(`
      SELECT *
      FROM role_change_requests
      WHERE id = ?
      LIMIT 1
    `)
    .bind(requestId)
    .first();

  if (!roleRequest) {
    return json({
      ok: false,
      error:
        "Запрос не найден"
    }, 404);
  }

  if (
    roleRequest.status !== "pending"
  ) {
    return json({
      ok: false,
      error:
        "Запрос уже обработан"
    }, 409);
  }

  const role =
    roleRequest.requested_role;

  /*
   * Заместитель может назначать Admin,
   * но не самого себя и не Owner.
   */

  if (
    actor.role === "deputy_owner" &&
    roleRank(role) >= 5
  ) {
    return json({
      ok: false,
      error:
        "Deputy Owner не может назначать Deputy Owner или Owner"
    }, 403);
  }

  await env.DB.batch([

    env.DB.prepare(`
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
    `)
    .bind(
      roleRequest.target_telegram_id,
      role,
      actor.telegramId
    ),

    env.DB.prepare(`
      UPDATE role_change_requests
      SET
        status = 'approved',
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      actor.telegramId,
      requestId
    )

  ]);

  await logAction(
    env,
    actor.telegramId,
    "role_approved",
    roleRequest.target_telegram_id,
    0,
    {
      role,
      request_id:
        requestId
    }
  );

  return json({
    ok: true,
    role
  });
}


/* =========================================================
   REMOVE ROLE
   ========================================================= */

async function removeRole(
  request,
  env
) {

  const actor =
    await requireRank(
      request,
      env,
      4
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const targetId =
    normalizeId(
      data.target_telegram_id
    );

  if (!targetId) {
    return json({
      ok: false,
      error:
        "ID пользователя не указан"
    }, 400);
  }

  const targetRole =
    await getRole(
      env,
      targetId
    );

  const targetRank =
    roleRank(targetRole);

  /*
   * Нельзя снять роль с равного
   * или более высокого сотрудника.
   */

  if (
    targetRole === "owner"
  ) {
    return json({
      ok: false,
      error:
        "Owner нельзя снять через эту функцию"
    }, 403);
  }

  if (
    targetRank >= actor.rank
  ) {
    return json({
      ok: false,
      error:
        "Недостаточно прав для снятия этой роли"
    }, 403);
  }

  await env.DB.prepare(`
    DELETE FROM admin_roles
    WHERE telegram_id = ?
  `)
  .bind(targetId)
  .run();

  await logAction(
    env,
    actor.telegramId,
    "remove_role",
    targetId,
    0,
    {
      old_role:
        targetRole
    }
  );

  return json({
    ok: true,
    message:
      "Роль снята"
  });
}


/* =========================================================
   WHEEL SETTINGS
   ========================================================= */

async function updateWheelSettings(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  /*
   * Изменять колесо по твоему правилу
   * должен Owner.
   * Поэтому Deputy здесь блокируется.
   */

  if (
    actor.role !== "owner"
  ) {
    return json({
      ok: false,
      error:
        "Настройки колеса изменяет только Owner"
    }, 403);
  }

  const spinCost =
    Number(
      data.spin_cost
    );

  const currency =
    String(
      data.currency ||
      "RUB"
    );

  const enabled =
    Number(
      data.enabled ?? 1
    ) ? 1 : 0;

  if (
    !Number.isFinite(spinCost) ||
    spinCost < 0
  ) {
    return json({
      ok: false,
      error:
        "Неверная стоимость вращения"
    }, 400);
  }

  await env.DB.prepare(`
    UPDATE wheel_settings
    SET
      spin_cost = ?,
      currency = ?,
      enabled = ?,
      updated_by = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `)
  .bind(
    spinCost,
    currency,
    enabled,
    actor.telegramId
  )
  .run();

  await logAction(
    env,
    actor.telegramId,
    "update_wheel_settings",
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
    ok: true
  });
}


/* =========================================================
   WHEEL PRIZE
   ========================================================= */

async function saveWheelPrize(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  if (
    actor.role !== "owner"
  ) {
    return json({
      ok: false,
      error:
        "Призы колеса изменяет только Owner"
    }, 403);
  }

  const data = actor.data;

  const id =
    Number(data.id || 0);

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
      data.probability
    );

  const enabled =
    Number(
      data.enabled ?? 1
    ) ? 1 : 0;

  const sortOrder =
    Number(
      data.sort_order || 0
    );

  if (!name) {
    return json({
      ok: false,
      error:
        "Название приза обязательно"
    }, 400);
  }

  /*
   * 0% разрешено.
   */

  if (
    !Number.isFinite(probability) ||
    probability < 0
  ) {
    return json({
      ok: false,
      error:
        "Вероятность не может быть отрицательной"
    }, 400);
  }

  if (id > 0) {

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
    `)
    .bind(
      name,
      prizeType,
      Math.floor(prizeValue),
      probability,
      enabled,
      sortOrder,
      id
    )
    .run();

  } else {

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
      `)
      .bind(
        name,
        prizeType,
        Math.floor(prizeValue),
        probability,
        enabled,
        sortOrder
      )
      .run();

    return json({
      ok: true,
      prize_id:
        result.meta.last_row_id
    });

  }

  await logAction(
    env,
    actor.telegramId,
    "save_wheel_prize",
    null,
    0,
    {
      id,
      name,
      probability,
      enabled
    }
  );

  return json({
    ok: true,
    prize_id: id
  });
}


/* =========================================================
   DELETE WHEEL PRIZE
   ========================================================= */

async function deleteWheelPrize(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  if (
    actor.role !== "owner"
  ) {
    return json({
      ok: false,
      error:
        "Удалять призы может только Owner"
    }, 403);
  }

  const data = actor.data;

  const prizeId =
    Number(data.prize_id);

  if (
    !Number.isInteger(prizeId) ||
    prizeId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверный prize_id"
    }, 400);
  }

  await env.DB.prepare(`
    DELETE FROM wheel_prizes
    WHERE id = ?
  `)
  .bind(prizeId)
  .run();

  await logAction(
    env,
    actor.telegramId,
    "delete_wheel_prize",
    null,
    0,
    {
      prize_id:
        prizeId
    }
  );

  return json({
    ok: true
  });
}


/* =========================================================
   COMPLAINTS
   ========================================================= */

async function getComplaints(
  request,
  env
) {

  const actor =
    await requireRank(
      request,
      env,
      3
    );

  if (!actor.ok) {
    return actor.response;
  }

  let query = `
    SELECT *
    FROM complaints
    WHERE 1 = 1
  `;

  const params = [];

  /*
   * Ранг 3 смотрит жалобы на модераторов.
   * Ранг 4 — на админов ниже себя.
   * Owner / Deputy — всё.
   */

  if (
    actor.role === "admin_3"
  ) {

    query += `
      AND target_role = ?
    `;

    params.push(
      "moderator"
    );

  } else if (
    actor.role === "admin_4"
  ) {

    query += `
      AND target_role IN
      (
        'admin_1',
        'admin_2',
        'admin_3'
      )
    `;

  }

  query += `
    ORDER BY id DESC
    LIMIT 100
  `;

  const result =
    await env.DB.prepare(
      query
    )
    .bind(...params)
    .all();

  return json({
    ok: true,
    complaints:
      result.results || []
  });
}


/* =========================================================
   OBSERVATIONS
   ========================================================= */

async function getObservations(
  request,
  env
) {

  const actor =
    await requireRank(
      request,
      env,
      3
    );

  if (!actor.ok) {
    return actor.response;
  }

  let query = `
    SELECT *
    FROM admin_observations
    WHERE 1 = 1
  `;

  const params = [];

  if (
    actor.role === "admin_3"
  ) {

    query += `
      AND target_role = ?
    `;

    params.push(
      "moderator"
    );

  } else if (
    actor.role === "admin_4"
  ) {

    query += `
      AND target_role IN
      (
        'admin_1',
        'admin_2',
        'admin_3',
        'moderator'
      )
    `;

  }

  query += `
    ORDER BY id DESC
    LIMIT 100
  `;

  const result =
    await env.DB.prepare(
      query
    )
    .bind(...params)
    .all();

  return json({
    ok: true,
    observations:
      result.results || []
  });
}


/* =========================================================
   PAYMENTS
   ========================================================= */

async function getPayments(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  /*
   * Здесь нет таблицы payments
   * в твоей первоначальной схеме.
   *
   * Поэтому показываем заявки поддержки,
   * связанные с пополнением.
   */

  const result =
    await env.DB.prepare(`
      SELECT
        id,
        player_telegram_id,
        assigned_to,
        subject,
        status,
        created_at,
        closed_at
      FROM support_tickets
      WHERE subject LIKE 'Пополнение:%'
      ORDER BY id DESC
      LIMIT 100
    `)
    .all();

  return json({
    ok: true,
    payments:
      result.results || []
  });
}


/* =========================================================
   PAYMENT APPROVE
   ========================================================= */

async function approvePayment(
  request,
  env
) {

  const actor =
    await getActor(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  /*
   * Пополнение подтверждает ТОЛЬКО Owner.
   */

  if (
    actor.role !== "owner"
  ) {
    return json({
      ok: false,
      error:
        "Пополнение подтверждает только Owner"
    }, 403);
  }

  const data = actor.data;

  const ticketId =
    Number(data.ticket_id);

  const amount =
    Number(data.amount);

  if (
    !Number.isInteger(ticketId) ||
    ticketId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверный ticket_id"
    }, 400);
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверная сумма"
    }, 400);
  }

  const ticket =
    await env.DB.prepare(`
      SELECT
        id,
        player_telegram_id,
        status
      FROM support_tickets
      WHERE id = ?
      LIMIT 1
    `)
    .bind(ticketId)
    .first();

  if (!ticket) {
    return json({
      ok: false,
      error:
        "Заявка не найдена"
    }, 404);
  }

  const targetId =
    String(
      ticket.player_telegram_id
    );

  const user =
    await env.DB.prepare(`
      SELECT
        balance
      FROM users
      WHERE telegram_id = ?
      LIMIT 1
    `)
    .bind(targetId)
    .first();

  if (!user) {
    return json({
      ok: false,
      error:
        "Игрок не найден"
    }, 404);
  }

  const oldBalance =
    Number(user.balance || 0);

  const newBalance =
    oldBalance + amount;

  await env.DB.batch([

    env.DB.prepare(`
      UPDATE users
      SET balance = ?
      WHERE telegram_id = ?
    `)
    .bind(
      newBalance,
      targetId
    ),

    env.DB.prepare(`
      UPDATE support_tickets
      SET
        status = 'closed',
        assigned_to = ?,
        closed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(
      actor.telegramId,
      ticketId
    ),

    env.DB.prepare(`
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
    `)
    .bind(
      actor.telegramId,
      targetId,
      oldBalance,
      newBalance,
      amount,
      "Подтверждение оплаты Owner",
      "payment",
      String(ticketId)
    )

  ]);

  await logAction(
    env,
    actor.telegramId,
    "approve_payment",
    targetId,
    amount,
    {
      ticket_id:
        ticketId,
      old_balance:
        oldBalance,
      new_balance:
        newBalance
    }
  );

  return json({
    ok: true,
    telegram_id:
      targetId,
    amount,
    new_balance:
      newBalance
  });
}


/* =========================================================
   PAYOUTS
   ========================================================= */

async function getPayouts(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const result =
    await env.DB.prepare(`
      SELECT *
      FROM payout_requests
      ORDER BY id DESC
      LIMIT 100
    `)
    .all();

  return json({
    ok: true,
    payouts:
      result.results || []
  });
}


async function approvePayout(
  request,
  env
) {

  const actor =
    await requireOwnerOrDeputy(
      request,
      env
    );

  if (!actor.ok) {
    return actor.response;
  }

  const data = actor.data;

  const payoutId =
    Number(data.payout_id);

  if (
    !Number.isInteger(payoutId) ||
    payoutId <= 0
  ) {
    return json({
      ok: false,
      error:
        "Неверный payout_id"
    }, 400);
  }

  const payout =
    await env.DB.prepare(`
      SELECT *
      FROM payout_requests
      WHERE id = ?
      LIMIT 1
    `)
    .bind(payoutId)
    .first();

  if (!payout) {
    return json({
      ok: false,
      error:
        "Заявка на вывод не найдена"
    }, 404);
  }

  if (
    payout.status !== "pending"
  ) {
    return json({
      ok: false,
      error:
        "Заявка уже обработана"
    }, 409);
  }

  await env.DB.prepare(`
    UPDATE payout_requests
    SET
      status = 'approved',
      reviewed_by = ?,
      reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
  .bind(
    actor.telegramId,
    payoutId
  )
  .run();

  await logAction(
    env,
    actor.telegramId,
    "approve_payout",
    payout.telegram_id,
    payout.uc_amount,
    {
      payout_id:
        payoutId,
      pubg_mobile_id:
        payout.pubg_mobile_id
    }
  );

  return json({
    ok: true,
    payout_id:
      payoutId,
    status:
      "approved"
  });
}


/* =========================================================
   AUDIT LOG
   ========================================================= */

async function logAction(
  env,
  adminId,
  action,
  targetId = null,
  amount = 0,
  details = null
) {

  /*
   * В твоей схеме нет admin_actions.
   * Используем bot_audit как единый журнал.
   */

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
  `)
  .bind(
    "cold-queen-db",
    String(adminId),
    String(action),
    targetId
      ? String(targetId)
      : null,
    JSON.stringify({
      amount:
        Number(amount || 0),
      details:
        details || null
    })
  )
  .run();

}


/* =========================================================
   END
   ========================================================= */
