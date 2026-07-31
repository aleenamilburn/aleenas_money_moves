# Money Moves V2A Transaction Allocations Implementation

Date: 2026-07-31  
Scope: V2A Phase 2 — transaction allocations and split editor  
Base revision reviewed: `a48d322`  
Result: Implemented; see `V2A_TRANSACTION_ALLOCATIONS_ACCEPTANCE.md` for acceptance.

## Requirements implemented

- A transaction can be represented by one, two, or three-or-more canonical allocations. Each row has a stable ID, parent bucket, optional child bucket, positive integer-cent amount, `mine` or `reimbursable` ownership, note, and timestamps (`js/services/allocationService.js:132-164`, `js/services/allocationService.js:201-222`).
- The service rejects missing buckets, invalid parent/child relationships, archived buckets newly selected, duplicate IDs, zero/invalid amounts, and any total that differs from the source transaction magnitude (`js/services/allocationService.js:167-199`).
- Drafts are isolated from canonical state. Save validates before mutation, replaces the set atomically, validates the whole domain, and restores the complete prior state if persistence fails (`js/services/allocationService.js:236-272`).
- Weekly Review and Bucket Detail expose allocation editing and allocation-level summaries without adding a screen or framework (`js/app.js:161-216`, `js/app.js:244-364`, `js/app.js:430-446`).
- Existing V1 assignment buttons retain their explicit review-completion behavior. A remembered merchant rule is applied only for a one-row allocation and cannot silently replace a split (`js/app.js:186-203`, `js/app.js:226-234`, `js/app.js:349-364`).
- Existing archived assignments stay visible and retainable; archived buckets are omitted from new choices (`js/app.js:277-287`, `js/app.js:303-316`).
- No Plaid, bank sync, transaction-import change, reimbursement matching, repayment linking, account enrichment, or location correction was added.

## Financial sign convention

Canonical transactions retain the foundation convention: outflows and transfers are negative source facts; inflows are positive. Allocations are always positive, unsigned magnitudes. Validation compares their sum with `abs(transaction.amountCents)`, so the direction exists only on the transaction and mixed allocation signs cannot occur (`js/services/allocationService.js:64-96`, `js/domain/models.js:224-236`).

Reimbursable allocations remain part of gross cash paid. They are not removed from cash-flow reporting and are not treated as repayment income.

## Allocation model and ownership

The existing allocation domain model remains authoritative. Phase 2 adds `mine` as the canonical user-facing ownership value while continuing to read the foundation-era `personal`, `shared`, and `excluded` values for encrypted-vault compatibility (`js/domain/models.js:12-15`, `js/domain/models.js:145-155`). The V5-to-V6 migration normalizes stored `personal` allocations to `mine` (`js/domain/migrations.js:209-214`). New UI and service writes permit only `mine` and `reimbursable`.

`mine` is personal spending. `reimbursable` is cash paid by the user that is expected from others. The editor explicitly says it is not yet linked to a repayment (`index.html:258-278`).

## V5-to-V6 migration

Schema version 6 registers `v2a-transaction-allocations` (`js/domain/constants.js:1-3`, `js/domain/migrations.js:5-11`). The migration:

- clones the input through the established migration runner and uses a deterministic timestamp;
- canonicalizes only uniquely traceable legacy transaction IDs;
- derives allocation IDs from transaction, parent, and child identity;
- preserves valid child assignments;
- gives an existing canonical allocation precedence;
- creates no allocation for aggregate-only monthly snapshots;
- records missing, duplicate, invalid, mismatched, or colliding cases in `legacyV1.unresolvedAllocationMigrations` without deleting their legacy rows; and
- validates before and after migration through the existing migration and persistence boundaries (`js/domain/migrations.js:188-284`, `js/domain/migrations.js:294-318`).

Repeated migration at schema 6 is a no-op and produces byte-equivalent state in the automated fixture.

## Authoritative calculation path

`canonicalAllocationRows` is the shared allocation-level projection (`js/services/allocationService.js:275-310`). `bucketLedgerRows` uses it first and includes a legacy assignment only when that transaction has no canonical allocation (`js/services/bucketService.js:219-223`). Bucket details, parent rollups, child totals, filters, and monthly summaries therefore sum allocation amounts exactly once (`js/services/bucketService.js:225-279`, `js/state.js:317-354`).

This preserves source-transaction traceability (`transactionId` plus `allocationId`), prevents legacy/canonical double counting, and leaves aggregate-only snapshots separate.

## UI workflow

The existing Weekly Review card shows the current allocation summary and an explicit edit action. The week's transaction list distinguishes unassigned, single, split, and reviewed transactions. Bucket Detail shows allocation amounts, ownership, source trace, and an edit action (`js/app.js:161-216`, `js/app.js:236-250`, `js/app.js:430-446`).

The overlay editor shows the original merchant, date, account display, amount, allocation rows, gross/mine/reimbursable totals, balance, add/remove/revert, Save, and Cancel (`index.html:258-278`, `js/app.js:253-364`). Save stays disabled for invalid drafts. Navigation, Escape, Lock, and page unload protect dirty drafts (`js/app.js:94-101`, `js/app.js:270-275`, `js/app.js:576-591`).

Canonical account identity is never inferred: absent identity remains `unknown-account`. A legacy account label may be shown as compatibility display text, but it does not replace or fabricate the canonical ID (`js/services/allocationService.js:64-96`, `js/services/allocationService.js:275-307`, `js/app.js:291-301`). Missing location fields remain `null` and render as an em dash in Bucket Detail (`js/app.js:441`).

## Files changed

| File | Disposition | Purpose |
|---|---|---|
| `js/services/allocationService.js` | Added | Drafts, validation, deterministic IDs, atomic save/rollback, totals, summaries, shared ledger projection. |
| `js/domain/constants.js` | Retained and extended | Schema version 6. |
| `js/domain/migrations.js` | Retained and extended | Deterministic V5-to-V6 traceable-assignment migration and unresolved records. |
| `js/domain/models.js` | Retained and extended | Phase 2 ownership compatibility. |
| `js/services/bucketService.js` | Refactored | Consumes the shared canonical allocation projection. |
| `js/state.js` | Refactored | Monthly totals now use allocation-level amounts. |
| `js/app.js`, `index.html`, `app.css` | Extended | Existing-screen split workflow and accessible overlay. |
| `package.json` | Extended | Syntax-check coverage for the new service. |
| `test/allocation-service.test.js` | Added | Phase 2 migration, validation, calculation, rollback, vault, and compatibility tests. |
| `test/migrations.test.js`, `test/bucket-service.test.js`, `test/bucket-acceptance.test.js` | Updated | Schema 6 expectation and explicit test-fixture isolation from the new migration. |

No production file was deleted.

## Tests added

Eleven allocation-focused tests cover integer cents, model ownership, deterministic/non-mutating/idempotent migration, one allocation, child migration, ambiguous preservation, aggregate exclusion, invalid drafts, stable IDs, two/three rows, removal, cancel isolation, exact parent/child and ownership totals, canonical precedence, archived history, persistence rollback, encrypted reload, merchant-rule non-overwrite, unassigned transactions, and inflow sign handling (`test/allocation-service.test.js:26-230`). Existing V1 foundation, encrypted-vault, and Bucket Explorer suites remain in the 48-test run.

## Commands and results

| Command | Result |
|---|---|
| `pnpm test` | PASS — 48 tests, 0 failures. |
| `pnpm run check` | PASS — all listed JavaScript files parse, including `allocationService.js`. |
| `python3 -m py_compile start.py` | PASS. Generated bytecode was removed after validation. |
| `git diff --check` | PASS. |
| Available browser smoke/acceptance workflow | PASS — required workflow completed; no unexpected console warnings or errors. |

## Browser evidence

Testing used synthetic financial data in a local encrypted vault. It did not expose or alter a historical user vault.

- Created and unlocked an encrypted vault; opened a review transaction.
- Created a child bucket, then made a two-row split using both a parent/child assignment and a second parent assignment.
- Confirmed `$1.00 remains to be allocated.` and `Allocations exceed the transaction by $1.00.` blocked Save.
- Saved a balanced $12 split: $7 Mine to the child and $5 Reimbursable to another bucket.
- Verified Weekly Review showed `Split allocation · Reviewed` and both allocation lines.
- Verified the parent rollup increased by $7, its child by $7, and the second bucket by exactly $5.
- Edited a draft, invoked Cancel, and verified a clean tab still read the stored $7/$5 state; the direct service test separately proves draft isolation.
- Saved a later $8/$4 edit, archived the referenced child, and verified history remained visible and rolled up while the archived child was absent from a newly added row's choices.
- Locked and unlocked twice and verified allocations, ownership, review state, and totals persisted.
- Inspected the open editor: 16 controls, no unnamed controls, no drag-only behavior, dialog semantics present, live validation present, visible-focus CSS present.
- Console inspection found zero unexpected warnings or errors.

## Defects found and corrected

1. Re-rendering the whole editor synchronously on every input detached active form controls. Validation now refreshes in place, with dependent bucket options re-rendered after the selection event completes (`js/app.js:320-331`).
2. Canonical unknown-account identity initially lost useful V1 display context. The projection now keeps the ID explicitly unknown while using the legacy label only as presentation text (`js/services/allocationService.js:294-298`).
3. A malformed non-array draft could throw before returning validation errors. The allocation boundary now treats it as an empty invalid draft (`js/services/allocationService.js:167-199`).
4. Monthly child allocations were keyed only to the child, so parent-level overview and goal consumers could miss their rollup. Monthly actuals now expose both child and parent keys while counting cash spend only once (`js/state.js:332-342`).

## Limitations and deferred work

- Foundation reimbursement-claim structures remain readable, but Phase 2 creates no claims or repayment links. Claim-linked allocations are deliberately not editable in this phase to avoid corrupting a future relationship (`js/services/allocationService.js:243-246`).
- Ambiguous or system-bucket V1 assignments remain on the compatibility path and receive an unresolved-migration record; they require a later explicit user-resolution workflow.
- The editor uses an overlay inside existing screens and does not add keyboard row reordering or a split-equally convenience action; neither is required for Phase 2.
- Large weekly lists are rendered in full; pagination/virtualization is deferred unless real usage demonstrates a performance need.

## Recommended next task

Perform a narrowly scoped design and data-integrity review for reimbursements before adding any claim or repayment-linking UI. It should define claim lifecycle, partial/over payments, write-offs, editing rules for linked allocations, and cash-flow/reporting semantics before production code changes.
