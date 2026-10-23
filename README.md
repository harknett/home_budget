# Home Budget

Envelope budgeting for a household, self-hosted. Every dollar in your accounts
has a job; income waits in **Unallocated** until you give it one.

Built to be read on a phone: the main screen is a dense list of envelopes with
their balances — no cards, no bubbles — and the one number that matters,
Unallocated, stays pinned at the top.

## What it does

| | |
| --- | --- |
| **Envelopes** | Grouped, ordered, with optional targets. Balances carry over month to month. |
| **Accounts** | Checking, savings, cash, credit cards (on-budget) and loans (off-budget). Each has a register with a running balance and cleared ticks. |
| **Transactions** | Spending (split across envelopes), income, transfers between accounts, and moves between envelopes. |
| **Funding** | Hand out Unallocated money envelope by envelope, with a live count of what is left. Funding plans propose amounts on a schedule — every two weeks, the 1st of the month — as fixed amounts or top-ups to a target. Nothing is funded until you confirm it. |
| **Logins** | Required for everything. One household, several logins; the owner adds the rest. No public sign-up. |

### Coming next

- **Import** — CSV (with a saved column mapping per account) and QFX/OFX,
  through a review screen that skips duplicates and matches imported rows to
  ones you already entered by hand.
- **Reconciliation** — enter the statement balance, tick off cleared items,
  finish at zero difference and lock them.
- **Reports and export** — spending by envelope by month, income vs. spending,
  balances over time; CSV for every report and a full JSON backup.

## How the money works

Every record has two sides — the **accounts** money moved in, and the
**envelopes** it was for — and the two always add up to the same amount. So
the money in your on-budget accounts always equals the money in your
envelopes, Unallocated included.

| Action | Accounts | Envelopes |
| --- | --- | --- |
| Spend $50 on groceries | Checking −50 | Groceries −50 |
| Spend $50 on the card | Visa −50 (owing more) | Groceries −50 |
| Get paid $2,000 | Checking +2,000 | Unallocated +2,000 |
| Pay the card $300 | Checking −300, Visa +300 | — |
| Fund groceries $200 | — | Unallocated −200, Groceries +200 |
| Move $20 to fuel | — | Groceries −20, Fuel +20 |

Card debt you already owe goes in as the card's opening balance and comes out
of Unallocated, so it is in the budget from day one.

## Running it

Node 22.13 or newer (the app uses the built-in `node:sqlite`).

```bash
npm install
SETUP_TOKEN=pick-something npm run dev
```

Open http://localhost:3000, which sends you to `/setup` to create the owner
login with that token. Data lives in `./data/budget.db` (set `DATA_DIR` to
move it).

```bash
npm test          # the ledger, money and schedule rules, against real SQLite
npm run lint
npm run typecheck
npm run build
```

Deploying behind nginx with systemd: see [deploy/README.md](deploy/README.md).

## Stack

Next.js 16 (App Router, server actions), React 19, Tailwind 4, SQLite via
`node:sqlite`. No ORM and no client-side state library; domain logic lives in
`src/lib/` and is tested without React.

| Path | What |
| --- | --- |
| `src/lib/ledger/entry.ts` | Entry builders and the balance rule. |
| `src/lib/db/store.ts` | Every query, behind one class. `postEntry` is the only way money moves. |
| `src/lib/db/migrations.ts` | The schema. Append-only. |
| `src/lib/funding/` | Plan schedules and proposals. |
| `src/lib/money.ts` | Cents in, dollars out. |
| `src/app/(app)/` | The signed-in screens. |

## License

MIT — see [LICENSE](LICENSE).
