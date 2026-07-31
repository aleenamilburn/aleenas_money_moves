# Money Moves Engineering Instructions

## Source of truth

The authoritative product specification is:

- `docs/Money_Moves_PRD_v1.0.docx`
- `docs/engineering/V1_CODEBASE_AUDIT.md`

Only V1 is currently implemented. Never describe a proposed feature as implemented
unless its acceptance criteria are covered by passing tests.

## Product invariants

1. The product name is Money Moves.
2. Provider categories are reference metadata, not user-owned truth.
3. Plaid and CSV are ingestion adapters.
4. All imported records normalize into one canonical transaction model.
5. Transactions retain their original source data for auditability.
6. User overrides are never silently overwritten.
7. Bucket totals must be traceable to transaction allocations.
8. Allocation amounts must equal the transaction amount.
9. Reimbursements are not earned income.
10. Internal transfers are not spending or income.
11. Unknown account and location data remain explicitly unknown.
12. Automation may suggest actions but may not silently review transactions.
13. Financial data remains encrypted at rest.
14. Live Plaid integration is out of scope until V2A is accepted.

## Change discipline

For every implementation task:

- read the relevant PRD section;
- state the affected requirements;
- preserve or migrate existing V1 data;
- add or update tests;
- run all applicable validation commands;
- document any acceptance criterion not completed;
- avoid unrelated changes.

## Completion report

Every task must report:

- files changed;
- requirements implemented;
- migrations added;
- tests added;
- commands run;
- results;
- known limitations;
- recommended next task.