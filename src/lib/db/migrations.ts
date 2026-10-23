/**
 * Ordered schema migrations, tracked by SQLite's `user_version` pragma.
 * Never edit a migration that has shipped - append a new one instead.
 *
 * Every amount is whole cents (INTEGER). See src/lib/money.ts.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    -- Owners manage logins. Everyone in the household works the same budget.
    role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    -- Which zone "today" is counted in for this person.
    time_zone     TEXT NOT NULL DEFAULT 'America/New_York',
    -- Set while the account still holds a password somebody else chose.
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0,1)),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    -- SHA-256 of the cookie token; the raw token never touches disk.
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  -- Failed sign-ins, for throttling. Pruned on every check.
  CREATE TABLE login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT NOT NULL,
    email      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_attempts_ip ON login_attempts(ip, created_at);
  CREATE INDEX idx_attempts_email ON login_attempts(email, created_at);

  -- Where money physically is. A credit card's balance is negative while
  -- money is owed on it.
  CREATE TABLE accounts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('checking','savings','cash','credit_card','loan')),
    -- On-budget accounts are what the envelopes divide up. Loans are tracked
    -- off-budget: a balance, with no envelope side.
    on_budget  INTEGER NOT NULL DEFAULT 1 CHECK (on_budget IN (0,1)),
    position   INTEGER NOT NULL DEFAULT 0,
    closed_at  TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE envelope_groups (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  -- What money is for. Balances carry over: an envelope is a running total,
  -- not a monthly budget line.
  CREATE TABLE envelopes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Null only for the built-in Unallocated envelope.
    group_id     INTEGER REFERENCES envelope_groups(id) ON DELETE RESTRICT,
    name         TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    -- What a "top up" funding rule fills to. Null means no target.
    target_cents INTEGER CHECK (target_cents IS NULL OR target_cents >= 0),
    hidden       INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
    -- 'unallocated' marks the one envelope income lands in. It cannot be
    -- renamed into something else or deleted.
    system       TEXT UNIQUE CHECK (system IS NULL OR system IN ('unallocated')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT INTO envelopes (group_id, name, system) VALUES (NULL, 'Unallocated', 'unallocated');

  -- How to hand out Unallocated money, on a schedule. Runs are counted, and
  -- run k falls on start_date + k x (every unit). See lib/funding/schedule.ts.
  CREATE TABLE funding_plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    start_date TEXT NOT NULL,
    every      INTEGER NOT NULL DEFAULT 1 CHECK (every > 0),
    unit       TEXT NOT NULL CHECK (unit IN ('day','week','month')),
    runs       INTEGER NOT NULL DEFAULT 0 CHECK (runs >= 0),
    active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE funding_plan_lines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     INTEGER NOT NULL REFERENCES funding_plans(id) ON DELETE CASCADE,
    envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
    -- 'fixed' adds amount_cents each run. 'top_up' fills the envelope to its
    -- target, never past it, and at most amount_cents when that is above 0.
    rule        TEXT NOT NULL DEFAULT 'fixed' CHECK (rule IN ('fixed','top_up')),
    amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
    UNIQUE (plan_id, envelope_id)
  );

  -- One record of money moving. Its lines must balance: see lib/ledger/entry.ts.
  CREATE TABLE entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN
                 ('expense','income','transfer','move','funding','adjustment','opening')),
    payee      TEXT NOT NULL DEFAULT '',
    memo       TEXT NOT NULL DEFAULT '',
    -- The plan this funding entry was a run of. A deleted plan leaves its
    -- history standing.
    plan_id    INTEGER REFERENCES funding_plans(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_entries_date ON entries(date);

  CREATE TABLE account_lines (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id   INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    -- RESTRICT: an account with history is closed, never deleted.
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    amount     INTEGER NOT NULL,
    -- uncleared -> cleared (the bank has it) -> reconciled (locked by a
    -- finished reconciliation).
    status     TEXT NOT NULL DEFAULT 'uncleared'
                 CHECK (status IN ('uncleared','cleared','reconciled'))
  );
  CREATE INDEX idx_account_lines_account ON account_lines(account_id);
  CREATE INDEX idx_account_lines_entry ON account_lines(entry_id);

  CREATE TABLE envelope_lines (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE RESTRICT,
    amount      INTEGER NOT NULL
  );
  CREATE INDEX idx_envelope_lines_envelope ON envelope_lines(envelope_id);
  CREATE INDEX idx_envelope_lines_entry ON envelope_lines(entry_id);
  `,
];
