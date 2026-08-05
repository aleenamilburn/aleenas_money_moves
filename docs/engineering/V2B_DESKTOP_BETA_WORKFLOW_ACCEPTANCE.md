# Money Moves — V2B Desktop Beta Workflow Acceptance

**Verdict:** ACCEPTED WITH LOW-RISK FOLLOW-UPS
**Reviewed candidate:** `032f9f9` / `v2b-desktop-workflow-candidate`
**Accepted desktop foundation:** `v2-desktop-foundation-accepted` (`51d0642`)
**Review date:** 2026-08-05

## 1. Candidate and review independence

The review began with a clean working tree at `032f9f9`. It inspected the diff
from the accepted desktop foundation, schema and model code, bucket/allocation
services, review and Overview rendering, month hydration, CSS, package
configuration, generated app bundle, DMG, tests, and engineering records. It
did not treat the implementation report or founder PASS record as proof by
themselves.

The candidate's recorded 173-test result was reproduced as part of the broader
suite and then increased to 175 by acceptance tests added for the findings
below. No V1 data, Plaid, hosted-sync, travel, reimbursement UI, Shared
Expenses, refund, or phone-support feature was added.

## 2. Corrections made during review

1. **High — normal empty schema-7 vaults missed starter buckets.** Schema 3+
   creates `unknown-account` as a structural placeholder. The candidate counted
   it as user-data evidence, so a normal otherwise-empty schema-7 vault received
   no Housing, Food, or Transportation starters. Fresh-vault detection now
   ignores that placeholder and treats every other account as user data.
2. **High — non-bucket V1 content could be polluted with starters.** Debts,
   goals, travel data, scripture data, monthly history, and populated provider
   snapshots were absent from the candidate's fresh-vault check. They now block
   starter insertion, preserving non-empty V1 vaults exactly.
3. **High — partial classifications were accepted as financial semantics.** A
   schema-7 bucket carrying forward-looking `semanticType: 'income'` and
   `system: false` could become ordinary-but-income semantics. Schema-7 buckets
   now migrate as ordinary spending buckets; schema-8 validation permits the
   three special semantics only on their reserved, protected, top-level system
   IDs. A conflicting legacy reserved ID stops migration without altering the
   caller's source record.
4. **Medium — a parent-first choice could collapse an existing split.** The
   review flow now opens the Split/Allocation editor for a split transaction
   rather than replacing all of its allocation rows with one parent/child row.

The first three findings affected migration safety or accounting semantics and
were required for acceptance. No unresolved Critical or High issue remains.

## 3. Schema 8 and starter buckets

The migration remains clone-first, deterministic, and idempotent. It adds the
three protected classifications exactly once using stable IDs and never matches
user-visible names. Fresh inputs receive only editable top-level Housing, Food,
and Transportation starters; normal initialized-empty schema-7 inputs with only
`unknown-account` do so as well. Existing populated or legacy-content vaults do
not receive starters.

The acceptance tests cover empty and initialized-empty schema 7, populated
schema 7, V1 debt preservation, schema-8 rerun/idempotence, partial records,
reserved-ID collision failure, and protected classification validation. Existing
V1 migration, encrypted restore, passphrase, reimbursement, allocation,
compatibility, unknown-account, and null-location regression tests also passed.
No financial amount, transaction ID, allocation ID, bucket ID, audit fact, or
user-owned hierarchy is fabricated or renamed by the correction.

## 4. Classification and Overview findings

Income is an inflow and excluded from ordinary spending; Money Transfer is
excluded from income and spending; Debt Payment is tracked separately and
excluded from ordinary spending. Classification rows must be the one full
transaction allocation, so an ordinary-spending split cannot double count a
protected semantic. Protected classifications cannot be deleted, renamed,
retyped, archived, or given children. Similar user-created names remain ordinary
spending buckets.

Canonical allocation-ledger aggregation counts each allocation row once. A
parent receives direct allocations plus its immediate children; child rows are
not separately added to spending. Tests cover direct and child rows, split
amounts, multiple parents, special classifications, historical/current months,
exact integer cents, persistence, and no stale derived totals. Provider
category metadata remains preserved and cannot determine the chosen bucket
classification.

## 5. Weekly Review, month, and layout findings

Weekly Review exposes only active top-level parents. A parent with children
opens a focused chooser containing only immediate children; cancel and Escape
mutate nothing, and selecting a child persists its exact child ID. A direct
parent remains valid. The split safeguard added in this review preserves existing
split allocations by routing them to the editor.

Controlled-clock coverage confirms an August 2026 local clock selects
`2026-08`; null, zero, and invalid values do not surface January 1970; valid
historical selections persist; current and imported months sort safely. The
Split/Allocation control remains in its secondary action group. Source and
compact-width checks confirm wrapping, visible focus routing, no 720px
horizontal overflow, and no button overlap.

## 6. Packaged-app and DMG evidence

The acceptance build regenerated the unsigned ARM64 direct app, DMG, and ZIP.
`inspect:package` scanned 287 filesystem files and 42 ASAR entries with no
forbidden packaged content. The direct app and a newly read-only-mounted DMG
app both contain ARM64 executables; their `electron.icns` files have the same
SHA-256 (`92948f…3c530`). The DMG verified on attach and detached cleanly.

The candidate's recorded founder A–F matrix used disposable synthetic data and
records PASS for fresh vault, review/child assignment, rollups, persistence,
and encrypted native backup/restore. The review independently reproduced the
code, model, service, package, and focused Electron evidence underlying those
observations. Native dialog click-through and Finder/Dock/application-switcher
icon-cache appearance remain human-observation items, not accounting or
encrypted-vault integrity defects.

The bundle is ad-hoc signed only (`TeamIdentifier` absent), as expected for this
private-beta build. No unexpected Electron security regression was found in the
source, focused Electron security suite, or package scan.

## 7. Validation results

| Command | Result |
|---|---|
| `CI=true pnpm test` | 175 passed, 0 failed |
| `CI=true pnpm run electron:test` | 27 passed, 0 failed |
| `CI=true pnpm run check` | passed |
| `PYTHONPYCACHEPREFIX=/private/tmp/money_moves_pycache python3 -m py_compile start.py` | passed |
| `git diff --check` and `git diff --cached --check` | passed |
| `CI=true pnpm run electron:package` | ARM64 macOS app passed |
| `CI=true pnpm run electron:make` | unsigned ARM64 DMG and ZIP passed |
| `CI=true pnpm run inspect:package` | passed; 287 filesystem files and 42 ASAR entries |

## 8. Remaining low-risk follow-ups

- Perform the final native export → import → restore click-through and visual
  Finder/Dock/application-switcher icon-cache check on the intended beta Mac
  before broad distribution. The underlying native dialog and encrypted
  backup/restore boundaries are already covered by tests and founder observation.
- Complete Developer ID signing, hardened-runtime/notarization, and release
  distribution as a separately scoped release-readiness phase. This V2B
  acceptance unblocks that work; it does not claim it has been completed.

## 9. Scope disposition

V2B desktop-beta workflows are accepted. A separately approved Faith & Money
devotional phase may now be planned from this workflow gate. Plaid, cloud backup,
hosted live sync, travel work, shared vaults, reimbursement UI, refunds, and
phone support remain deferred and were not changed.
