# Kete Commitments

What the company signed — with its clients, its suppliers and its funders — and what each contract
requires: obligations and their dates, retentions and bonds to recover, and a funder's **rules of
spending**, checked before money is committed. One of the four apps behind the center, Kete
Enterprise (doctrine D-048).

```mermaid
flowchart LR
  M[Who keeps the contracts] -->|/engagements| W[Kete Commitments]
  F[Kete Finance] -->|spending_check, for the person| W
  W -->|allowed, or the passage that refuses| F
  W -->|same rights, journal, autonomy| DB[(Postgres · RLS)]
  W -->|projects · third parties| E[Kete Enterprise]
```

Every obligation, retention, bond and rule carries **the passage of the contract** it comes from,
as it is written: a refusal cites it, a reminder quotes it.

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
pnpm demo              # http://localhost:3431 — three contracts, a funder's rules, in a throwaway schema
```

`pnpm demo` opens as the owner; `/manager` and `/staff` open as the roles of the trade. It runs
without a center: projects are named by who writes the contract.

**Joined to the whole platform** (kete-core's `pnpm platform`, `KETE_DEMO_JOINED=on`): the app signs
people in through the local Compte Kete, its data are seeded in that Compte Kete's « KYA démo »
organization — seeded as the app alone, then its screens speak to the center and the other apps —
and the person signed in is its owner. It then answers on `http://127.0.0.1:<port>`, the loopback
address the Compte Kete accepts for a client's return.


**Its thread at the center** (Kete Enterprise spec 098): a contract's thread is born at the center the first time it is opened, with its third party and project (« Fil du contrat »).
## Test

```bash
pnpm test
pnpm typecheck
```

## Settings

The currency of contracts is Kete's setting `kete.currency` (kete-core specs 115 and 117): as
Kete Commitments sets it for the organization, else as the organization set it in the Compte
Kete, else F CFA (`XOF`).

| Variable               | What it sets                                           |
| ---------------------- | ------------------------------------------------------ |
| `ENTERPRISE_API_URL`   | The center: projects and third parties                 |

Other apps reach `spending_check` at `/api/v1/capabilities/spending_check` with the person's
token; Kete Finance names this app's address in its `COMMITMENTS_API_URL`.
