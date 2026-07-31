# Money Moves V2A Phase 1 — Bucket Explorer Implementation

## Status

IMPLEMENTED. The Bucket Explorer and exactly two-level sub-buckets satisfy the Phase 1 acceptance criteria. This change does not add Plaid, transaction syncing/import changes, split editing, reimbursements, autonomous categorization, charts, or a new frontend framework.

The authoritative PRD is `docs/Money_Moves_Product_Requirements_Document_v1.0.docx`.

## Requirements implemented

- Existing V1 categories migrate to canonical top-level buckets without speculative children. Names, ordering, targets, archive state, identifiers, and legacy records remain preserved (`js/domain/migrations.js:113-159`).
- Schema 5 adds optional bucket descriptions and explicit archive timestamps through an idempotent 4-to-5 migration (`js/domain/constants.js:2`, `js/domain/migrations.js:4-8`, `js/domain/migrations.js:165-176`).
- Parent and child buckets support create, inline rename, stable reorder, archive/restore, and moving a child to another parent (`js/services/bucketService.js:91-170`, `js/app.js:190-239`).
- The domain permits exactly parent and child levels. Child-under-child, missing parents, self-parenting, cycles, duplicate IDs, and invalid allocation relationships are rejected by runtime validation (`js/domain/models.js:205-230`, `js/domain/models.js:240-306`).
- Sibling names are unique case-insensitively, while the same name can be used under different parents (`js/services/bucketService.js:32-38`).
- Deletion is deliberately unavailable. Referenced buckets produce a history-specific error, and even unreferenced buckets direct the caller to archive (`js/services/bucketService.js:173-185`).
- Archived buckets retain IDs and financial references, are hidden from normal assignment controls, can be shown in Bucket Explorer, and can be restored (`js/services/bucketService.js:155-170`, `js/state.js:244-246`, `index.html:164-166`).
- The Explorer shows selected-month totals, direct totals, targets, remaining amounts, child counts, child totals, active/archive state, and an empty state (`js/app.js:190-221`).
- Detail shows hierarchy path, rolled-up/direct totals, child totals, transaction count, date range, search, account/review/assignment filters, ledger rows, archive state, explicit unknown accounts, and location only when facts exist (`js/app.js:252-273`).
- Inline controls and visible focus indicators provide keyboard-accessible alternatives to drag and native dialogs (`app.css:11`, `app.css:68-69`).

## Architecture decisions

`js/services/bucketService.js` is the sole new bucket boundary. UI callers mutate canonical `domain.buckets` only through this service. The service maintains `review.buckets` as a compatibility projection so existing V1 review, reporting, and CSV workflows continue to work; it is not a second financial truth (`js/services/bucketService.js:59-78`).

The calculation path normalizes two compatible sources into traceable ledger rows:

1. Canonical `domain.allocations` joined to canonical transactions and accounts.
2. Legacy `review.transactions[].bucketId` assignments when no canonical transaction with that ID exists.

Canonical rows win by transaction ID, preventing double counting during gradual migration (`js/services/bucketService.js:190-233`). Provider categories never determine bucket assignment.

For a parent, rolled-up total is the sum of direct rows and rows assigned to every child, including archived children. Direct total filters the same ledger rows to the parent ID. A child query returns only rows assigned to that child. All filters are applied before totals and counts are calculated (`js/services/bucketService.js:235-266`). Each row includes its source and transaction/allocation trace.

Aggregate-only V1 category actuals stay in `legacyMonthlySnapshots`. When no traceable rows exist and no detail filter is active, the UI labels the preserved aggregate separately and does not fabricate transactions (`js/services/bucketService.js:257-265`, `js/app.js:266`).

Unknown account identity is rendered as `Unknown account`; absent state and country remain `null` in the service and render as an em dash. No account or location fact is inferred (`js/services/bucketService.js:203-225`, `js/app.js:269`).

Bucket mutations are validated before persistence. State service validation remains the final pre-persistence boundary. A failed bucket save restores the in-memory snapshot and reports that no change was saved (`js/app.js:243-255`, `js/services/stateService.js:8-14`, `js/services/stateService.js:39-43`). Encrypted vault keys, AAD, and precedence behavior were not changed.

## Files changed

- `js/services/bucketService.js` — canonical bucket operations and unified ledger queries.
- `js/domain/constants.js` — schema version 5.
- `js/domain/migrations.js` — archive/description migration and V1 field preservation.
- `js/domain/models.js` — archive/description validation.
- `js/state.js` — archived buckets excluded from assignment controls by default.
- `js/app.js`, `index.html`, `app.css` — Bucket Explorer and detail UI only.
- `package.json` — syntax validation includes the bucket service.
- `test/bucket-service.test.js`, `test/fixtures/v1-buckets.json` — V2A behavior and realistic V1 fixture.
- Existing migration, model, compatibility, and vault tests — schema 5 expectations and hierarchy coverage.

## Migration

Migration `v2a-bucket-explorer-fields` advances schema 4 to 5. It adds `description: null` and `archivedAt` only when absent, derives inactive state consistently, and does not rewrite existing values (`js/domain/migrations.js:165-176`). Migration still clones the input, uses deterministic timestamps, records migration IDs once, validates before and after, and is a no-op at the current schema (`js/domain/migrations.js:11-13`, `js/domain/migrations.js:186-209`).

The realistic V1 fixture includes multiple categories, custom order, a category without transactions, archived category data, custom transaction/category/rule fields, an unassigned transaction, debts, goals, preferences, and monthly metadata (`test/fixtures/v1-buckets.json`).

## Tests added

`test/bucket-service.test.js` verifies:

- V1 migration, ordering, targets, archive state, and preservation of custom data.
- Parent/child creation, duplicate sibling rejection, maximum depth, stable IDs, rename, reorder, and child moves.
- Canonical-over-legacy precedence, parent direct/rolled-up totals, child totals, filters, search, and trace metadata.
- Archive history, referenced deletion rejection, explicit unknown account, and null location.
- Encrypted save/reload of hierarchy and archive state.

`test/models.test.js` also covers cycle/depth rejection and duplicate IDs. Existing migration tests verify non-mutation, deterministic output, idempotency, and validation. Existing vault tests verify wrong-password, corruption, interrupted write, invalid state, failed restore, and repeated migration behavior.

## Commands and results

- `pnpm test` — PASS; 30 tests, 30 passed, 0 failed.
- `pnpm run check` — PASS; all listed JavaScript files passed `node --check`.
- `python3 -m py_compile start.py` — PASS.
- Browser smoke test at `http://127.0.0.1:8765/` — PASS.

Browser evidence:

- Created an encrypted vault.
- Created `Smoke Parent` with a $250 target and two child buckets with $75 and $25 targets.
- Renamed parent and child inline without changing their identities.
- Reordered the parent and reordered `Smoke Child Two` before the renamed child.
- Opened parent detail and observed rolled-up, direct, child-total, and ledger sections.
- Archived and restored the child through the inline confirmation flow.
- Locked and unlocked twice; the renamed parent, both children, restored state, and child order persisted.
- Repeated the final unlock in a clean tab; browser console contained 0 warnings and 0 errors.

The local smoke-test server was stopped after verification.

## Known limitations and deferred work

- V1 aggregate-only snapshots cannot provide transaction-level drill-down; they are explicitly labeled instead.
- Bucket Detail filters are session UI state and are not persisted.
- Moving an archived child requires restoring it first through the normal active-parent workflow.
- Explicit bulk reassignment/merge is not implemented; archive is the only removal path.
- Editing allocations, splitting transactions, importing/syncing transactions, reimbursements, enrichment UIs, charts, and Plaid remain outside this phase.

## Recommended next task

Perform a focused acceptance review of V2A Phase 1 against real encrypted V1 backups. After acceptance, implement the next PRD-approved allocation workflow as a separate, reviewable phase; do not begin Plaid until V2A acceptance is complete.
