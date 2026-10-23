<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Home Budget

Envelope budgeting for one household, self-hosted. Production port is
**3007**; the shared-host port table lives in `deploy/README.md`.

## Rules that are easy to break

- **Money is whole cents.** Every amount is an integer, stored, summed and
  compared as one. `parseMoney` and `formatMoney` (`src/lib/money.ts`) are the
  only conversions, at the form and import boundary. Never a float.
- **Every entry balances.** An entry's account lines on on-budget accounts sum
  to exactly its envelope lines (`checkBalanced`, `src/lib/ledger/entry.ts`).
  That is why on-budget account money always equals envelope money, and the
  home screen shouts if it ever does not. `Store.postEntry` is the only way
  money moves; never insert lines directly.
- **Signs are the change in the balance.** A credit card owing money is
  negative. Spending is negative on both sides.
- **Unallocated is an envelope**, the one with `system = 'unallocated'`.
  Income lands there; funding moves money out of it. It cannot be renamed,
  hidden or deleted, and `fund` refuses to take it below zero.
- **Loans are off-budget.** An off-budget account line has no envelope side,
  so paying one from checking spends from an envelope. Credit cards stay
  on-budget: a card purchase spends from an envelope, and paying the card is a
  plain transfer that touches none.
- **Envelope balances carry over.** There are no monthly budget sheets; a
  month is a report, not a reset.
- **Funding is never automatic.** A due plan is a proposal on Fund until
  someone confirms it. Plan run k falls on `start + k × interval`, counted from
  the start, never chained, so month-end anchors cannot drift. Confirming —
  or skipping — takes one run; missed runs stay due one at a time.
- **Reconciled lines are locked.** `deleteEntry` and `setLineStatus` refuse
  them; only a reconciliation changes them.
- **Accounts with history are closed, envelopes with history are hidden.**
  `account_lines` and `envelope_lines` reference them with `ON DELETE
  RESTRICT`, so history can never point at nothing.
- **Two Tailwind classes for the same property do not cascade in the order
  written.** Build controls from `controlClass` plus explicit sizes rather
  than overriding `inputClass`'s width or height.
- **"Today" is the user's day.** The host runs in UTC; `today(user.timeZone)`
  — never `new Date()` — decides the date.
- **Domain logic lives in `src/lib/`** and stays free of React, so `test/`
  runs it under `node` against a real SQLite file.
- **Never edit a shipped migration** — append to `MIGRATIONS`.
- **The CSP lives in `src/proxy.ts`**, with a per-request nonce. A static
  `script-src 'self'` stops React hydrating and every form silently dies.
- **A page that reads the database or `process.env` is `force-dynamic`.**
- `output: "standalone"` is what systemd runs; deploys copy `.next/static`
  by hand.
