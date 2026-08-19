PRAGMA foreign_keys = ON;

-- ============================================================
-- DOXACHKAA UC — D1 DATABASE
-- schema.sql
-- ============================================================


-- ============================================================
-- ИГРОКИ
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',

    balance_rub REAL DEFAULT 0,
    uc INTEGER DEFAULT 0,

    free_spins INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- СОТРУДНИКИ
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    telegram_id TEXT UNIQUE NOT NULL,

    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,

    display_name TEXT DEFAULT '',

    role TEXT NOT NULL DEFAULT 'player',

    /*
       0 = игрок
       1-6 = администрация
       moderator = модератор
    */
    rank INTEGER DEFAULT 0,

    enabled INTEGER DEFAULT 1,

    status TEXT DEFAULT 'offline',

    last_activity TEXT,

    total_points INTEGER DEFAULT 0,
    today_points INTEGER DEFAULT 0,

    appointed_at TEXT DEFAULT CURRENT_TIMESTAMP,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- СЕССИИ ПАНЕЛЕЙ
-- ============================================================

CREATE TABLE IF NOT EXISTS panel_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    telegram_id TEXT NOT NULL,

    employee_id INTEGER NOT NULL,

    panel_type TEXT NOT NULL,

    active INTEGER DEFAULT 1,

    login_at TEXT DEFAULT CURRENT_TIMESTAMP,

    logout_at TEXT,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_panel_sessions_telegram
ON panel_sessions(telegram_id);

CREATE INDEX IF NOT EXISTS idx_panel_sessions_employee
ON panel_sessions(employee_id);

CREATE INDEX IF NOT EXISTS idx_panel_sessions_active
ON panel_sessions(active);


-- ============================================================
-- ПОПЫТКИ АВТОРИЗАЦИИ
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    telegram_id TEXT NOT NULL,

    auth_type TEXT NOT NULL,

    step TEXT DEFAULT 'credentials',

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_auth_attempts_telegram
ON auth_attempts(telegram_id);


-- ============================================================
-- СОСТОЯНИЯ ПАНЕЛИ
-- ============================================================

CREATE TABLE IF NOT EXISTS panel_states (
    telegram_id TEXT PRIMARY KEY,

    state TEXT NOT NULL,

    data TEXT DEFAULT '{}',

    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- ДЕЙСТВИЯ СОТРУДНИКОВ
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER NOT NULL,

    action_type TEXT NOT NULL,

    target_id TEXT,

    points INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_employee_actions_employee
ON employee_actions(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_actions_date
ON employee_actions(created_at);


-- ============================================================
-- ЛОГИ АДМИНИСТРАЦИИ
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER,

    action_type TEXT NOT NULL,

    target_id TEXT,

    secret INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_admin_logs_employee
ON admin_logs(employee_id);

CREATE INDEX IF NOT EXISTS idx_admin_logs_secret
ON admin_logs(secret);

CREATE INDEX IF NOT EXISTS idx_admin_logs_date
ON admin_logs(created_at);


-- ============================================================
-- ИЗМЕНЕНИЯ РАНГОВ
-- ============================================================

CREATE TABLE IF NOT EXISTS rank_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    actor_id INTEGER NOT NULL,

    target_id INTEGER NOT NULL,

    old_rank INTEGER NOT NULL,

    new_rank INTEGER NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(actor_id)
        REFERENCES employees(id)
        ON DELETE CASCADE,

    FOREIGN KEY(target_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);


-- ============================================================
-- ЕЖЕДНЕВНАЯ АКТИВНОСТЬ
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_activity_bonus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER NOT NULL,

    activity_date TEXT NOT NULL,

    points INTEGER DEFAULT 100,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(employee_id, activity_date),

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);


-- ============================================================
-- БАНЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER NOT NULL,

    employee_id INTEGER,

    reason TEXT NOT NULL,

    silent INTEGER DEFAULT 0,

    active INTEGER DEFAULT 1,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    expires_at TEXT,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_bans_player
ON bans(player_id);

CREATE INDEX IF NOT EXISTS idx_bans_active
ON bans(active);


-- ============================================================
-- МУТЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS mutes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER NOT NULL,

    employee_id INTEGER,

    reason TEXT NOT NULL,

    expires_at TEXT,

    active INTEGER DEFAULT 1,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_mutes_player
ON mutes(player_id);

CREATE INDEX IF NOT EXISTS idx_mutes_active
ON mutes(active);


-- ============================================================
-- БАЛАНС — ИСТОРИЯ
-- ============================================================

CREATE TABLE IF NOT EXISTS balance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER NOT NULL,

    employee_id INTEGER,

    amount REAL NOT NULL,

    type TEXT NOT NULL,

    request_id INTEGER,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_balance_history_player
ON balance_history(player_id);


-- ============================================================
-- UC — ИСТОРИЯ
-- ============================================================

CREATE TABLE IF NOT EXISTS uc_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER NOT NULL,

    employee_id INTEGER,

    amount INTEGER NOT NULL,

    type TEXT NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_uc_history_player
ON uc_history(player_id);


-- ============================================================
-- ЖАЛОБЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id TEXT NOT NULL,

    type TEXT NOT NULL,

    text TEXT NOT NULL,

    status TEXT DEFAULT 'open',

    assigned_employee_id INTEGER,

    result TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    closed_at TEXT,

    FOREIGN KEY(assigned_employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_complaints_status
ON complaints(status);

CREATE INDEX IF NOT EXISTS idx_complaints_type
ON complaints(type);


-- ============================================================
-- ЗАЯВКИ НА ПОПОЛНЕНИЕ
-- ============================================================

CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id TEXT NOT NULL,

    amount_rub REAL NOT NULL,

    uc_amount INTEGER DEFAULT 0,

    status TEXT DEFAULT 'pending',

    payment_details TEXT,

    receipt_file TEXT,

    checked_by INTEGER,

    checked_at TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(checked_by)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_deposits_status
ON deposit_requests(status);

CREATE INDEX IF NOT EXISTS idx_deposits_player
ON deposit_requests(player_id);


-- ============================================================
-- ВЫВОД UC
-- ============================================================

CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id TEXT NOT NULL,

    uc_amount INTEGER NOT NULL,

    status TEXT DEFAULT 'pending',

    requisites TEXT,

    checked_by INTEGER,

    checked_at TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(checked_by)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_withdrawals_status
ON withdrawals(status);

CREATE INDEX IF NOT EXISTS idx_withdrawals_player
ON withdrawals(player_id);


-- ============================================================
-- КОЛЕСО — НАСТРОЙКИ
-- ============================================================

CREATE TABLE IF NOT EXISTS wheel_settings (
    key TEXT PRIMARY KEY,

    value TEXT NOT NULL
);


INSERT OR IGNORE INTO wheel_settings
(key, value)
VALUES
('price', '100');


INSERT OR IGNORE INTO wheel_settings
(key, value)
VALUES
('uc_chance', '10');


INSERT OR IGNORE INTO wheel_settings
(key, value)
VALUES
('rewards_count', '8');


INSERT OR IGNORE INTO wheel_settings
(key, value)
VALUES
('test_mode', '0');


-- ============================================================
-- КОЛЕСО — НАГРАДЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS wheel_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,

    reward_type TEXT NOT NULL,

    reward_value INTEGER DEFAULT 0,

    chance REAL DEFAULT 0,

    enabled INTEGER DEFAULT 1,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- КОЛЕСО — ИСТОРИЯ ПРОКРУТОК
-- ============================================================

CREATE TABLE IF NOT EXISTS wheel_spins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER,

    reward_id INTEGER,

    reward_type TEXT,

    reward_value INTEGER DEFAULT 0,

    price REAL DEFAULT 0,

    test_mode INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE SET NULL,

    FOREIGN KEY(reward_id)
        REFERENCES wheel_rewards(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_wheel_spins_player
ON wheel_spins(player_id);


-- ============================================================
-- КОЛЕСО — ЛОГИ ИЗМЕНЕНИЙ
-- ============================================================

CREATE TABLE IF NOT EXISTS wheel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER,

    action TEXT NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


-- ============================================================
-- ПРОМОКОДЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    code TEXT UNIQUE NOT NULL,

    enabled INTEGER DEFAULT 1,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- ИСПОЛЬЗОВАНИЕ ПРОМОКОДОВ
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    promo_id INTEGER NOT NULL,

    player_id INTEGER NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(promo_id, player_id),

    FOREIGN KEY(promo_id)
        REFERENCES promo_codes(id)
        ON DELETE CASCADE,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
);


-- ============================================================
-- ЕЖЕДНЕВНЫЙ БОНУС
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_bonuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER NOT NULL,

    bonus_date TEXT NOT NULL,

    reward_uc INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(player_id, bonus_date),

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
);


-- ============================================================
-- СИСТЕМНЫЕ НАСТРОЙКИ
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,

    value TEXT NOT NULL,

    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


INSERT OR IGNORE INTO system_settings
(key, value)
VALUES
('maintenance', '0');


INSERT OR IGNORE INTO system_settings
(key, value)
VALUES
('maintenance_message', 'Технические работы');


INSERT OR IGNORE INTO system_settings
(key, value)
VALUES
('maintenance_reason', '');


INSERT OR IGNORE INTO system_settings
(key, value)
VALUES
('maintenance_end', '');


-- ============================================================
-- АВАРИЙНЫЙ РЕЖИМ
-- ============================================================

CREATE TABLE IF NOT EXISTS emergency_settings (
    key TEXT PRIMARY KEY,

    value TEXT NOT NULL,

    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);


INSERT OR IGNORE INTO emergency_settings
(key, value)
VALUES
('wheel', '0');


INSERT OR IGNORE INTO emergency_settings
(key, value)
VALUES
('deposit', '0');


INSERT OR IGNORE INTO emergency_settings
(key, value)
VALUES
('withdraw', '0');


INSERT OR IGNORE INTO emergency_settings
(key, value)
VALUES
('promos', '0');


-- ============================================================
-- СЕКРЕТНЫЕ КОМАНДЫ
-- ============================================================

CREATE TABLE IF NOT EXISTS secret_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    command TEXT UNIQUE NOT NULL,

    action TEXT NOT NULL,

    min_rank INTEGER DEFAULT 5,

    enabled INTEGER DEFAULT 1,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- РЕЗЕРВНЫЕ КОПИИ
-- ============================================================

CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER,

    data TEXT NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL
);


-- ============================================================
-- УВЕДОМЛЕНИЯ
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER,

    type TEXT NOT NULL,

    title TEXT NOT NULL,

    text TEXT,

    is_read INTEGER DEFAULT 0,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_notifications_employee
ON notifications(employee_id);

CREATE INDEX IF NOT EXISTS idx_notifications_read
ON notifications(is_read);


-- ============================================================
-- ТЕХНИЧЕСКИЙ ЧАТ / СОБЫТИЯ
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    player_id INTEGER,

    telegram_id TEXT,

    username TEXT,

    message TEXT NOT NULL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE SET NULL
);


-- ============================================================
-- АУДИТ ФИНАНСОВ
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    employee_id INTEGER,

    player_id INTEGER,

    action TEXT NOT NULL,

    amount REAL,

    details TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(employee_id)
        REFERENCES employees(id)
        ON DELETE SET NULL,

    FOREIGN KEY(player_id)
        REFERENCES players(id)
        ON DELETE SET NULL
);


-- ============================================================
-- ИНИЦИАЛЬНЫЕ НАГРАДЫ КОЛЕСА
-- ============================================================

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(1, 'Ничего', 'nothing', 0, 40, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(2, '10 UC', 'uc', 10, 20, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(3, '25 UC', 'uc', 25, 15, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(4, '50 UC', 'uc', 50, 10, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(5, '100 UC', 'uc', 100, 5, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(6, '200 UC', 'uc', 200, 3, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(7, '500 UC', 'uc', 500, 1, 1);

INSERT OR IGNORE INTO wheel_rewards
(id, name, reward_type, reward_value, chance, enabled)
VALUES
(8, 'Бонус', 'bonus', 1, 6, 1);
