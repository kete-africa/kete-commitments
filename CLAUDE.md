# Kete Commitments — project context

> The single place where this app's context lives. `AGENTS.md` points here.

## What this app is

What the company signed, behind Kete Enterprise: contracts with clients, suppliers and funders,
their **obligations and dates**, the **retentions and bonds** to recover, and a funder's **rules of
spending** — which other apps ask before they commit money (`spending_check`). One of the four
generic apps of the doctrine (D-048). Projects and third parties are the center's (D-047).

What it never does: read a contract by itself (a model reading it is kete-core's step E4), keep
money, decide an expense — it says whether a funder allows it, and why not.

Product names are in English (Kete Commitments, Kete Finance, Kete Enterprise); the words on its
screens are in the language of who reads them.

## Read before any action

1. The Kete doctrine (`kete-africa/kete`): `docs/PRINCIPES.md`, `docs/CONCEPTION.md`,
   `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md` (D-047, D-048).
2. `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/decisions/`, each feature's `README.md` and
   its spec (`specs/`).

## Layout

```
kete.json          the manifest: product, version, events, identity card
src/routes.ts      every address, once: English files, French addresses
src/features/
  contracts/       contracts, obligations, retentions and bonds, a funder's rules, the check
src/platform/      the wiring, no business rule
db/migrations.ts   every table with its row-level security, in order
db/demo/           the demonstration's data, written through the app's own gestures
messages/          fr.json, en.json: no hard-coded string
specs/             one folder per step: what changes, what stays for later, the proof
tests/             every surface under the same rules
```

## Rules

- Every obligation, retention, bond and rule carries the passage it comes from, as written.
- `spending_check` is a reading: it never throws a refusal, it answers allowed or the refusals,
  each with its agreement and its passage. Every agreement funding a project must allow an
  expense.
- Who keeps the contracts writes them; anyone who spends may ask the check.
- Every gesture is a named command, every capability declares its autonomy: an agent prepares, a
  person decides.
- Every table carries `organization_id` and its RLS policy in the same migration.
- No vendor name in a feature's domain or application layer; no hard-coded user-visible string;
  no secret in a file, a message or a commit; a behavior change ships with its documentation and
  its diagram.

## Branches

```
main       production — the human gesture only
dev        integration
NNN-slug   one step, branched from dev, with its spec in specs/NNN-slug
```
