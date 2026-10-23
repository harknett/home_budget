import { DatabaseSync } from "node:sqlite";

import { DEFAULT_TIME_ZONE } from "@/lib/dates";
import type { CadenceUnit } from "@/lib/funding/schedule";
import { checkBalanced, funding, opening, type EntryKind, type NewEntry } from "@/lib/ledger/entry";

import { MIGRATIONS } from "./migrations";
import type {
  Account,
  AccountKind,
  Envelope,
  EnvelopeActivity,
  EnvelopeGroup,
  FundingPlan,
  FundingPlanLine,
  LineStatus,
  PlanRule,
  RegisterRow,
  Role,
  User,
} from "./types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v);
const num = (v: unknown): number => Number(v);
const nnum = (v: unknown): number | null => (v == null ? null : Number(v));
const bool = (v: unknown): boolean => Number(v) === 1;

function mapUser(r: Row): User {
  return {
    id: num(r.id),
    email: str(r.email),
    name: str(r.name),
    role: str(r.role) as Role,
    timeZone: str(r.time_zone),
    mustChangePassword: bool(r.must_change_password),
    createdAt: str(r.created_at),
  };
}

function mapAccount(r: Row): Account {
  return {
    id: num(r.id),
    name: str(r.name),
    kind: str(r.kind) as AccountKind,
    onBudget: bool(r.on_budget),
    position: num(r.position),
    closedAt: r.closed_at == null ? null : str(r.closed_at),
    balance: num(r.balance ?? 0),
    clearedBalance: num(r.cleared_balance ?? 0),
  };
}

function mapEnvelope(r: Row): Envelope {
  return {
    id: num(r.id),
    groupId: nnum(r.group_id),
    name: str(r.name),
    position: num(r.position),
    targetCents: nnum(r.target_cents),
    hidden: bool(r.hidden),
    isUnallocated: r.system === "unallocated",
    balance: num(r.balance ?? 0),
  };
}

/** Thrown when an action would break a rule the store owns. */
export class LedgerError extends Error {}

const ACCOUNT_WITH_BALANCE = `
  SELECT a.*,
         COALESCE(SUM(l.amount), 0) AS balance,
         COALESCE(SUM(CASE WHEN l.status != 'uncleared' THEN l.amount END), 0) AS cleared_balance
  FROM accounts a
  LEFT JOIN account_lines l ON l.account_id = a.id`;

const ENVELOPE_WITH_BALANCE = `
  SELECT e.*, COALESCE(SUM(l.amount), 0) AS balance
  FROM envelopes e
  LEFT JOIN envelope_lines l ON l.envelope_id = e.id`;

export class Store {
  private readonly db: DatabaseSync;
  /** Nesting depth, so an inner `transaction` becomes a savepoint. */
  private depth = 0;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    for (let version = row.user_version; version < MIGRATIONS.length; version++) {
      this.db.exec(MIGRATIONS[version]!);
    }
    // user_version cannot be parameterised; the value is an integer we control.
    this.db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Run work as one unit, re-entrantly.
   *
   * Methods nest legitimately — `fund` posts an entry and advances a plan,
   * and `postEntry` wraps its own rows — and SQLite has no nested `BEGIN`.
   * The outermost call owns the transaction; inner ones become savepoints, so
   * a failure anywhere unwinds everything.
   */
  transaction<T>(work: () => T): T {
    const nested = this.depth > 0;
    const name = `sp_${this.depth}`;

    this.db.exec(nested ? `SAVEPOINT ${name}` : "BEGIN");
    this.depth++;
    try {
      const result = work();
      this.db.exec(nested ? `RELEASE ${name}` : "COMMIT");
      return result;
    } catch (err) {
      if (nested) {
        // ROLLBACK TO leaves the savepoint on the stack; RELEASE pops it.
        this.db.exec(`ROLLBACK TO ${name}`);
        this.db.exec(`RELEASE ${name}`);
      } else {
        this.db.exec("ROLLBACK");
      }
      throw err;
    } finally {
      this.depth--;
    }
  }

  // --- users ---------------------------------------------------------------

  countUsers(): number {
    return num((this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row).n);
  }

  createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
    role: Role;
    timeZone?: string;
    mustChangePassword: boolean;
  }): User {
    const row = this.db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, time_zone, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        input.email.trim().toLowerCase(),
        input.name.trim(),
        input.passwordHash,
        input.role,
        input.timeZone ?? DEFAULT_TIME_ZONE,
        input.mustChangePassword ? 1 : 0,
      ) as Row;
    return mapUser(row);
  }

  findUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.trim().toLowerCase()) as Row | undefined;
    return row ? { ...mapUser(row), passwordHash: str(row.password_hash) } : undefined;
  }

  findUser(id: number): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
    return row ? mapUser(row) : undefined;
  }

  listUsers(): User[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY name").all() as Row[]).map(mapUser);
  }

  setPassword(userId: number, passwordHash: string, mustChange: boolean): void {
    this.db
      .prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?")
      .run(passwordHash, mustChange ? 1 : 0, userId);
  }

  setTimeZone(userId: number, timeZone: string): void {
    this.db.prepare("UPDATE users SET time_zone = ? WHERE id = ?").run(timeZone, userId);
  }

  /** The last owner cannot be removed: nobody would be left to manage logins. */
  deleteUser(userId: number): void {
    this.transaction(() => {
      const user = this.findUser(userId);
      if (!user) return;
      if (user.role === "owner") {
        const owners = num(
          (this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get() as Row).n,
        );
        if (owners <= 1) throw new LedgerError("The last owner cannot be removed.");
      }
      this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    });
  }

  // --- sessions ------------------------------------------------------------

  createSession(tokenHash: string, userId: number, expiresAt: string): void {
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, userId, expiresAt);
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  deleteExpiredSessions(): void {
    this.db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  }

  /** Sessions for one login, dropped when its password changes. */
  deleteUserSessions(userId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  findSessionUser(tokenHash: string): User | undefined {
    const row = this.db
      .prepare(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
      )
      .get(tokenHash) as Row | undefined;
    return row ? mapUser(row) : undefined;
  }

  // --- throttling ----------------------------------------------------------

  pruneAttempts(): void {
    this.db
      .prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')")
      .run();
  }

  loginFailuresByIp(ip: string, windowMinutes: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM login_attempts
         WHERE ip = ? AND created_at > datetime('now', ?)`,
      )
      .get(ip, `-${windowMinutes} minutes`) as Row;
    return num(row.n);
  }

  loginFailuresByEmail(email: string, windowMinutes: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM login_attempts
         WHERE email = ? AND created_at > datetime('now', ?)`,
      )
      .get(email.trim().toLowerCase(), `-${windowMinutes} minutes`) as Row;
    return num(row.n);
  }

  recordLoginFailure(ip: string, email: string): void {
    this.db
      .prepare("INSERT INTO login_attempts (ip, email) VALUES (?, ?)")
      .run(ip, email.trim().toLowerCase());
  }

  clearLoginFailures(ip: string, email: string): void {
    this.db
      .prepare("DELETE FROM login_attempts WHERE ip = ? OR email = ?")
      .run(ip, email.trim().toLowerCase());
  }

  // --- accounts ------------------------------------------------------------

  /**
   * Open an account, with its starting balance as an entry of its own so the
   * register starts from a real line rather than a number from nowhere.
   */
  createAccount(input: {
    name: string;
    kind: AccountKind;
    onBudget: boolean;
    openingCents: number;
    date: string;
    createdBy: number | null;
  }): Account {
    return this.transaction(() => {
      const position = num(
        (this.db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM accounts").get() as Row).n,
      );
      const row = this.db
        .prepare("INSERT INTO accounts (name, kind, on_budget, position) VALUES (?, ?, ?, ?) RETURNING id")
        .get(input.name.trim(), input.kind, input.onBudget ? 1 : 0, position) as Row;
      const id = num(row.id);

      if (input.openingCents !== 0) {
        this.postEntry(
          opening({
            date: input.date,
            accountId: id,
            amount: input.openingCents,
            onBudget: input.onBudget,
            unallocatedId: this.unallocatedId(),
          }),
          input.createdBy,
        );
      }
      return this.findAccount(id)!;
    });
  }

  findAccount(id: number): Account | undefined {
    const row = this.db.prepare(`${ACCOUNT_WITH_BALANCE} WHERE a.id = ? GROUP BY a.id`).get(id) as
      | Row
      | undefined;
    return row ? mapAccount(row) : undefined;
  }

  listAccounts(includeClosed = false): Account[] {
    const where = includeClosed ? "" : "WHERE a.closed_at IS NULL";
    return (
      this.db
        .prepare(`${ACCOUNT_WITH_BALANCE} ${where} GROUP BY a.id ORDER BY a.closed_at IS NOT NULL, a.position, a.name`)
        .all() as Row[]
    ).map(mapAccount);
  }

  renameAccount(id: number, name: string): void {
    this.db.prepare("UPDATE accounts SET name = ? WHERE id = ?").run(name.trim(), id);
  }

  /**
   * Close an account. Only at a zero balance: closing one with money in it
   * would hide that money from the account list while the envelopes still
   * count it.
   */
  closeAccount(id: number): void {
    const account = this.findAccount(id);
    if (!account) throw new LedgerError("No such account.");
    if (account.balance !== 0) {
      throw new LedgerError("Move the balance out first. Only an empty account can be closed.");
    }
    this.db.prepare("UPDATE accounts SET closed_at = datetime('now') WHERE id = ?").run(id);
  }

  reopenAccount(id: number): void {
    this.db.prepare("UPDATE accounts SET closed_at = NULL WHERE id = ?").run(id);
  }

  // --- envelopes -----------------------------------------------------------

  unallocatedId(): number {
    const row = this.db.prepare("SELECT id FROM envelopes WHERE system = 'unallocated'").get() as Row;
    return num(row.id);
  }

  listGroups(): EnvelopeGroup[] {
    return (this.db.prepare("SELECT * FROM envelope_groups ORDER BY position, name").all() as Row[]).map(
      (r) => ({ id: num(r.id), name: str(r.name), position: num(r.position) }),
    );
  }

  createGroup(name: string): number {
    const row = this.db
      .prepare(
        `INSERT INTO envelope_groups (name, position)
         VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM envelope_groups)) RETURNING id`,
      )
      .get(name.trim()) as Row;
    return num(row.id);
  }

  renameGroup(id: number, name: string): void {
    this.db.prepare("UPDATE envelope_groups SET name = ? WHERE id = ?").run(name.trim(), id);
  }

  /** A group can go once it is empty; its envelopes are never orphaned. */
  deleteGroup(id: number): void {
    const n = num(
      (this.db.prepare("SELECT COUNT(*) AS n FROM envelopes WHERE group_id = ?").get(id) as Row).n,
    );
    if (n > 0) throw new LedgerError("Move or delete its envelopes first.");
    this.db.prepare("DELETE FROM envelope_groups WHERE id = ?").run(id);
  }

  moveGroup(id: number, direction: -1 | 1): void {
    this.swapPosition("envelope_groups", id, direction, "1 = 1");
  }

  createEnvelope(input: { groupId: number; name: string; targetCents: number | null }): number {
    const row = this.db
      .prepare(
        `INSERT INTO envelopes (group_id, name, target_cents, position)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM envelopes WHERE group_id = ?))
         RETURNING id`,
      )
      .get(input.groupId, input.name.trim(), input.targetCents, input.groupId) as Row;
    return num(row.id);
  }

  updateEnvelope(
    id: number,
    input: { name: string; groupId: number; targetCents: number | null; hidden: boolean },
  ): void {
    const envelope = this.findEnvelope(id);
    if (!envelope) throw new LedgerError("No such envelope.");
    if (envelope.isUnallocated) throw new LedgerError("Unallocated is built in and stays as it is.");
    this.db
      .prepare("UPDATE envelopes SET name = ?, group_id = ?, target_cents = ?, hidden = ? WHERE id = ?")
      .run(input.name.trim(), input.groupId, input.targetCents, input.hidden ? 1 : 0, id);
  }

  moveEnvelope(id: number, direction: -1 | 1): void {
    const envelope = this.findEnvelope(id);
    if (!envelope || envelope.groupId === null) return;
    this.swapPosition("envelopes", id, direction, `group_id = ${envelope.groupId}`);
  }

  /**
   * Delete an envelope that has never held money. One with history is hidden
   * instead, so past spending still has somewhere to point.
   */
  deleteEnvelope(id: number): void {
    const envelope = this.findEnvelope(id);
    if (!envelope) return;
    if (envelope.isUnallocated) throw new LedgerError("Unallocated cannot be deleted.");
    const used = num(
      (this.db.prepare("SELECT COUNT(*) AS n FROM envelope_lines WHERE envelope_id = ?").get(id) as Row).n,
    );
    if (used > 0) throw new LedgerError("It has history. Hide it instead.");
    this.db.prepare("DELETE FROM envelopes WHERE id = ?").run(id);
  }

  findEnvelope(id: number): Envelope | undefined {
    const row = this.db.prepare(`${ENVELOPE_WITH_BALANCE} WHERE e.id = ? GROUP BY e.id`).get(id) as
      | Row
      | undefined;
    return row ? mapEnvelope(row) : undefined;
  }

  /** Every envelope with its balance, Unallocated first, then by group order. */
  listEnvelopes(includeHidden = false): Envelope[] {
    const where = includeHidden ? "" : "WHERE e.hidden = 0";
    return (
      this.db
        .prepare(
          `${ENVELOPE_WITH_BALANCE}
           LEFT JOIN envelope_groups g ON g.id = e.group_id
           ${where}
           GROUP BY e.id
           ORDER BY e.system IS NULL, g.position, g.name, e.position, e.name`,
        )
        .all() as Row[]
    ).map(mapEnvelope);
  }

  /** Swap a row's position with its neighbour among rows matching `scope`. */
  private swapPosition(table: "envelopes" | "envelope_groups", id: number, direction: -1 | 1, scope: string): void {
    this.transaction(() => {
      const rows = this.db
        .prepare(`SELECT id, position FROM ${table} WHERE ${scope} ORDER BY position, id`)
        .all() as Row[];
      // Renumber first, so ties left by older rows cannot make a swap a no-op.
      rows.forEach((r, i) => {
        this.db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).run(i, num(r.id));
      });
      const index = rows.findIndex((r) => num(r.id) === id);
      const other = rows[index + direction];
      if (index < 0 || !other) return;
      this.db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).run(index + direction, id);
      this.db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`).run(index, num(other.id));
    });
  }

  // --- entries -------------------------------------------------------------

  /**
   * Write one entry, refusing any that would break the balance rule (see
   * lib/ledger/entry.ts). This is the only way money moves.
   */
  postEntry(entry: NewEntry, createdBy: number | null): number {
    const onBudget = (accountId: number) => {
      const row = this.db.prepare("SELECT on_budget FROM accounts WHERE id = ?").get(accountId) as
        | Row
        | undefined;
      return row ? bool(row.on_budget) : undefined;
    };
    checkBalanced(entry, onBudget);

    return this.transaction(() => {
      const row = this.db
        .prepare(
          `INSERT INTO entries (date, kind, payee, memo, plan_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .get(entry.date, entry.kind, entry.payee.trim(), entry.memo.trim(), entry.planId ?? null, createdBy) as Row;
      const id = num(row.id);

      const accountLine = this.db.prepare(
        "INSERT INTO account_lines (entry_id, account_id, amount) VALUES (?, ?, ?)",
      );
      for (const line of entry.accountLines) accountLine.run(id, line.accountId, line.amount);

      const envelopeLine = this.db.prepare(
        "INSERT INTO envelope_lines (entry_id, envelope_id, amount) VALUES (?, ?, ?)",
      );
      for (const line of entry.envelopeLines) envelopeLine.run(id, line.envelopeId, line.amount);
      return id;
    });
  }

  /**
   * Delete an entry, both sides together. Refused once any of it is
   * reconciled: the bank has agreed to that line, and it is locked.
   */
  deleteEntry(id: number): void {
    const locked = num(
      (
        this.db
          .prepare("SELECT COUNT(*) AS n FROM account_lines WHERE entry_id = ? AND status = 'reconciled'")
          .get(id) as Row
      ).n,
    );
    if (locked > 0) throw new LedgerError("Reconciled entries are locked.");
    this.db.prepare("DELETE FROM entries WHERE id = ?").run(id);
  }

  /** Mark a line cleared or not. Reconciled lines only change through a reconciliation. */
  setLineStatus(lineId: number, status: Exclude<LineStatus, "reconciled">): void {
    const row = this.db.prepare("SELECT status FROM account_lines WHERE id = ?").get(lineId) as Row | undefined;
    if (!row) throw new LedgerError("No such line.");
    if (row.status === "reconciled") throw new LedgerError("Reconciled lines are locked.");
    this.db.prepare("UPDATE account_lines SET status = ? WHERE id = ?").run(status, lineId);
  }

  /** An account's lines, newest first, with the balance after each. */
  register(accountId: number, limit = 200): RegisterRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT l.id AS line_id, l.entry_id, l.amount, l.status,
                  e.date, e.kind, e.payee, e.memo,
                  (SELECT GROUP_CONCAT(v.name, ', ')
                     FROM envelope_lines el JOIN envelopes v ON v.id = el.envelope_id
                    WHERE el.entry_id = e.id) AS envelopes,
                  (SELECT a.name FROM account_lines o JOIN accounts a ON a.id = o.account_id
                    WHERE o.entry_id = e.id AND o.id != l.id LIMIT 1) AS other_account,
                  SUM(l.amount) OVER (ORDER BY e.date, e.id, l.id) AS running_balance
           FROM account_lines l JOIN entries e ON e.id = l.entry_id
           WHERE l.account_id = ?
         )
         ORDER BY date DESC, entry_id DESC, line_id DESC
         LIMIT ?`,
      )
      .all(accountId, limit) as Row[];
    return rows.map((r) => ({
      lineId: num(r.line_id),
      entryId: num(r.entry_id),
      date: str(r.date),
      kind: str(r.kind) as EntryKind,
      payee: str(r.payee),
      memo: str(r.memo),
      amount: num(r.amount),
      status: str(r.status) as LineStatus,
      envelopes: r.envelopes == null ? "" : str(r.envelopes),
      otherAccount: r.other_account == null ? null : str(r.other_account),
      runningBalance: num(r.running_balance),
    }));
  }

  /** What has moved in and out of an envelope, newest first. */
  envelopeActivity(envelopeId: number, limit = 100): EnvelopeActivity[] {
    const rows = this.db
      .prepare(
        `SELECT e.id AS entry_id, e.date, e.kind, e.payee, e.memo, SUM(l.amount) AS amount,
                (SELECT GROUP_CONCAT(a.name, ', ')
                   FROM account_lines al JOIN accounts a ON a.id = al.account_id
                  WHERE al.entry_id = e.id) AS accounts
         FROM envelope_lines l JOIN entries e ON e.id = l.entry_id
         WHERE l.envelope_id = ?
         GROUP BY e.id
         ORDER BY e.date DESC, e.id DESC
         LIMIT ?`,
      )
      .all(envelopeId, limit) as Row[];
    return rows.map((r) => ({
      entryId: num(r.entry_id),
      date: str(r.date),
      kind: str(r.kind) as EntryKind,
      payee: str(r.payee),
      memo: str(r.memo),
      amount: num(r.amount),
      accounts: r.accounts == null ? "" : str(r.accounts),
    }));
  }

  /**
   * The two totals that must always agree: money in on-budget accounts, and
   * money in envelopes. Any difference is a bug, and the home screen says so.
   */
  totals(): { onBudget: number; envelopes: number } {
    const accounts = this.db
      .prepare(
        `SELECT COALESCE(SUM(l.amount), 0) AS n
         FROM account_lines l JOIN accounts a ON a.id = l.account_id
         WHERE a.on_budget = 1`,
      )
      .get() as Row;
    const envelopes = this.db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM envelope_lines").get() as Row;
    return { onBudget: num(accounts.n), envelopes: num(envelopes.n) };
  }

  // --- funding plans -------------------------------------------------------

  createPlan(input: { name: string; startDate: string; every: number; unit: CadenceUnit }): number {
    const row = this.db
      .prepare("INSERT INTO funding_plans (name, start_date, every, unit) VALUES (?, ?, ?, ?) RETURNING id")
      .get(input.name.trim(), input.startDate, input.every, input.unit) as Row;
    return num(row.id);
  }

  /**
   * Change a plan's schedule. A new start or interval restarts the run count:
   * the old count meant occurrences of the old schedule.
   */
  updatePlan(
    id: number,
    input: { name: string; startDate: string; every: number; unit: CadenceUnit; active: boolean },
  ): void {
    const plan = this.findPlan(id);
    if (!plan) throw new LedgerError("No such plan.");
    const rescheduled =
      plan.startDate !== input.startDate || plan.every !== input.every || plan.unit !== input.unit;
    this.db
      .prepare(
        `UPDATE funding_plans SET name = ?, start_date = ?, every = ?, unit = ?, active = ?,
                runs = CASE WHEN ? THEN 0 ELSE runs END
         WHERE id = ?`,
      )
      .run(input.name.trim(), input.startDate, input.every, input.unit, input.active ? 1 : 0, rescheduled ? 1 : 0, id);
  }

  /** Replace a plan's envelope lines. Zero fixed amounts are left out. */
  setPlanLines(planId: number, lines: FundingPlanLine[]): void {
    this.transaction(() => {
      this.db.prepare("DELETE FROM funding_plan_lines WHERE plan_id = ?").run(planId);
      const insert = this.db.prepare(
        "INSERT INTO funding_plan_lines (plan_id, envelope_id, rule, amount_cents) VALUES (?, ?, ?, ?)",
      );
      for (const line of lines) {
        if (line.rule === "fixed" && line.amountCents === 0) continue;
        insert.run(planId, line.envelopeId, line.rule, line.amountCents);
      }
    });
  }

  deletePlan(id: number): void {
    this.db.prepare("DELETE FROM funding_plans WHERE id = ?").run(id);
  }

  findPlan(id: number): FundingPlan | undefined {
    return this.listPlans().find((p) => p.id === id);
  }

  listPlans(): FundingPlan[] {
    const plans = this.db.prepare("SELECT * FROM funding_plans ORDER BY active DESC, name").all() as Row[];
    const lines = this.db
      .prepare(
        `SELECT pl.* FROM funding_plan_lines pl
         JOIN envelopes e ON e.id = pl.envelope_id
         LEFT JOIN envelope_groups g ON g.id = e.group_id
         ORDER BY g.position, e.position`,
      )
      .all() as Row[];
    return plans.map((p) => ({
      id: num(p.id),
      name: str(p.name),
      startDate: str(p.start_date),
      every: num(p.every),
      unit: str(p.unit) as CadenceUnit,
      runs: num(p.runs),
      active: bool(p.active),
      lines: lines
        .filter((l) => num(l.plan_id) === num(p.id))
        .map((l) => ({
          envelopeId: num(l.envelope_id),
          rule: str(l.rule) as PlanRule,
          amountCents: num(l.amount_cents),
        })),
    }));
  }

  /**
   * Hand out Unallocated money, as one entry. With a plan, this is that
   * plan's next run and the plan moves on to the one after.
   *
   * Over-allocating is refused here, not just on screen: Unallocated going
   * negative means spending money that has not arrived.
   */
  fund(input: {
    date: string;
    amounts: { envelopeId: number; amount: number }[];
    planId: number | null;
    createdBy: number | null;
  }): number | null {
    return this.transaction(() => {
      const unallocatedId = this.unallocatedId();
      const amounts = input.amounts.filter((a) => a.amount !== 0 && a.envelopeId !== unallocatedId);
      const total = amounts.reduce((sum, a) => sum + a.amount, 0);
      const available = this.findEnvelope(unallocatedId)!.balance;
      if (total > available) {
        throw new LedgerError("That is more than is unallocated. Lower some amounts.");
      }

      const id =
        amounts.length > 0
          ? this.postEntry(
              funding({ date: input.date, unallocatedId, amounts, planId: input.planId }),
              input.createdBy,
            )
          : null;
      if (input.planId !== null) {
        this.db.prepare("UPDATE funding_plans SET runs = runs + 1 WHERE id = ?").run(input.planId);
      }
      return id;
    });
  }
}
