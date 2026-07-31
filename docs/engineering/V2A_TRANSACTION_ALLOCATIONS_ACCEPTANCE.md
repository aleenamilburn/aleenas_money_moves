# Money Moves V2A Transaction Allocations Acceptance

Date: 2026-07-31  
Scope: V2A Phase 2 — transaction allocations and split editor  
Base revision reviewed: `a48d322` plus the working-tree Phase 2 change set  
Decision: **IMPLEMENTED AND ACCEPTED**

## Review findings

No blocking or high-severity defect remains in the reviewed scope. The implementation preserves encrypted V1/V2 vault compatibility, keeps incomplete edits outside canonical state, validates exact integer-cent balance before mutation and again at the domain/persistence boundary, and uses canonical allocation rows as the primary calculation source.

| Severity | Finding | Resolution / evidence |
|---|---|---|
| High | None open. | V1/vault compatibility, rollback, and double-count protection pass automated and browser checks. |
| Medium | Whole-editor input re-render detached active controls. | Fixed with in-place validation and deferred dependent-selector render (`js/app.js:320-331`); browser retest passed. |
| Medium | Monthly child allocation was not exposed under its parent key for parent-level consumers. | Fixed without changing gross spend; parent and child actuals are asserted (`js/state.js:332-342`, `test/allocation-service.test.js:130-132`). |
| Low | Non-array service input could throw instead of validate. | Fixed and regression tested (`js/services/allocationService.js:167-199`, `test/allocation-service.test.js:87-103`). |
| Informational | Legacy account labels may exist without canonical identity. | Canonical ID remains `unknown-account`; the label is display-only (`js/services/allocationService.js:275-307`). |

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Single canonical allocation | PASS | V5-to-V6 migration and save tests. |
| 2 | Two allocations | PASS | Service and browser balanced-split tests. |
| 3 | Parent/child split | PASS | Service total test and browser child allocation. |
| 4 | Three or more allocations | PASS | Three-row save test. |
| 5 | Exact total required | PASS | `validateAllocationDraft` exact-cent balance (`js/services/allocationService.js:167-199`). |
| 6 | Under-allocation blocked | PASS | Automated exact message and browser disabled Save. |
| 7 | Over-allocation blocked | PASS | Automated exact message and browser disabled Save. |
| 8 | Zero blocked | PASS | Model and draft tests. |
| 9 | Invalid parent/child blocked | PASS | Draft and domain tests. |
| 10 | Stable IDs on edit | PASS | Retained-ID assertion. |
| 11 | Removing allocation preserves transaction | PASS | Replacement-set test. |
| 12 | Cancel does not mutate canonical state | PASS | Draft isolation test and browser cancel verification. |
| 13 | Save failure restores prior set | PASS | Simulated persistence failure plus encrypted reload. |
| 14 | Bucket totals use allocation amounts | PASS | $7/$5 service and browser totals. |
| 15 | Canonical precedence prevents legacy double count | PASS | Shared ledger path and existing acceptance suite. |
| 16 | Parent rollup correct | PASS | Parent/child query assertions and browser. |
| 17 | Child total correct | PASS | Child query assertion and browser. |
| 18 | Archived history visible | PASS | Automated and browser archived-child checks. |
| 19 | Archived hidden from new choices | PASS | Service rejection and browser option inspection. |
| 20 | Mine ownership | PASS | Model, service, UI, and browser. |
| 21 | Reimbursable ownership | PASS | Model, service, UI, and browser. |
| 22 | Gross/mine/reimbursable totals | PASS | Exact 1234/700/534 assertion and editor totals. |
| 23 | Reimbursable does not imply repayment | PASS | Explicit UI copy; no claim/link creation (`index.html:271`). |
| 24 | Weekly Review summaries | PASS | Shared summary function and browser display. |
| 25 | Merchant rules do not replace splits | PASS | Save/reload test; rule application limited to one row (`js/app.js:226-234`). |
| 26 | Deterministic V1 migration | PASS | Stable FNV-derived ID and fixture assertion. |
| 27 | Aggregate snapshots stay aggregate-only | PASS | Migration assertion; no fabricated row. |
| 28 | Migration idempotent/non-mutating | PASS | Deep input/output assertions. |
| 29 | Lock/unlock preserves allocations | PASS | Encrypted service test and browser twice. |
| 30 | V1 and Bucket Explorer preserved | PASS | Full 48-test suite and browser rollups. |
| 31 | No Plaid/reimbursement linking added | PASS | Scope scan; only pre-existing foundation claim model and defensive linked-allocation guard remain. |
| 32 | Automated and browser tests pass | PASS | Commands and evidence below. |

## Migration and preservation assessment

The migration is registered only for V5-to-V6 and uses deterministic IDs (`js/domain/migrations.js:5-11`, `js/domain/migrations.js:209-284`). The migration runner clones its input, applies a deterministic timestamp, validates pre/post state, and becomes a no-op at version 6 (`js/domain/migrations.js:294-318`). Traceable V1 rows remain in `review.transactions`; custom provider metadata and source facts are not edited by allocation saves. Legacy aggregates remain in `domain.legacyMonthlySnapshots` and never generate transactions or allocations.

Ambiguous assignments are not discarded: they stay available through compatibility fields and are recorded in `legacyV1.unresolvedAllocationMigrations` (`js/domain/migrations.js:188-207`). Existing foundation-era allocation ownership remains readable, with `personal` normalized to `mine` during the schema migration.

## Calculation and persistence assessment

The service stores positive integer-cent allocation magnitudes against signed canonical transactions. It rejects invalid totals before mutation, validates each replacement allocation and the full domain after mutation, then invokes persistence. Any failure restores the complete prior state object (`js/services/allocationService.js:167-222`, `js/services/allocationService.js:236-272`). StateService remains the encrypted persistence/validation boundary.

The shared canonical projection is consumed by Bucket Explorer and monthly summaries. A canonical transaction suppresses its legacy bucket fallback, so single and split allocations are counted exactly once (`js/services/allocationService.js:275-310`, `js/services/bucketService.js:219-223`, `js/state.js:317-354`).

Unknown account and location facts are not fabricated. Canonical migrations use `unknown-account` unless a valid canonical account ID already exists, location stays `null`, and any V1 account label is presentation-only.

## Automated results

| Command | Result |
|---|---|
| `pnpm test` | PASS — 48 passed, 0 failed, 0 skipped. |
| `pnpm run check` | PASS. |
| `python3 -m py_compile start.py` | PASS; generated bytecode removed. |
| `git diff --check` | PASS. |

The 48-test suite includes allocation-specific coverage plus existing V1 hydration, migration, domain relationship, active/legacy vault, interrupted migration, wrong password, corrupted vault, invalid save, Bucket Explorer, rollback, and encrypted reload tests.

## Browser acceptance results

All 17 requested browser steps passed against a local encrypted vault containing synthetic data:

1. Created/unlocked vault and opened a transaction.
2. Built two allocations using a parent/child bucket and a second parent bucket.
3. Marked the second allocation Reimbursable.
4. Verified under and over totals blocked Save with exact currency messages.
5. Saved a balanced split and verified Weekly Review lines/status.
6. Verified parent rollup, child total, and second-bucket total used allocation amounts.
7. Changed a local draft, invoked Cancel, and verified stored values remained unchanged from another clean tab.
8. Edited and saved new values.
9. Archived the referenced child; history and parent rollup remained, while a new row did not offer the archived child.
10. Locked/unlocked twice; allocations, ownership, review state, and totals persisted.
11. Confirmed dialog semantics, labels for all 16 controls, live validation, focus styling, keyboard actions, and no drag dependency.
12. Found zero unexpected console warnings or errors.

## Changes made during acceptance hardening

- Prevented allocation-field focus loss caused by synchronous full-editor rendering (`js/app.js:320-331`).
- Preserved useful V1 account display text without converting it into canonical identity (`js/services/allocationService.js:294-298`).
- Made malformed non-array draft input fail validation cleanly and added a regression assertion (`js/services/allocationService.js:167-199`, `test/allocation-service.test.js:87-103`).
- Added the child allocation amount to the monthly parent-key projection while retaining one cash-spend increment (`js/state.js:332-342`).

## Unresolved risks

- Ambiguous or system-bucket legacy assignments intentionally remain on the compatibility path until an explicit resolution workflow exists. Data is preserved and cases are recorded.
- Foundation-era `shared` and `excluded` ownership values remain valid for vault compatibility but cannot be newly selected in Phase 2. A later migration must not reinterpret them without product direction.
- Claim-linked allocations are deliberately read-only in this editor. Reimbursement design must specify safe relationship updates before that restriction changes.
- Browser acceptance used synthetic rather than historical user financial data. Automated fixtures exercise V1 encrypted-vault compatibility and migration failure modes without risking user data.

These are non-blocking for the defined Phase 2 scope. Phase 2 is accepted.
