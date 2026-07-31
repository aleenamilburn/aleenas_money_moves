# Money Moves Implementation Status

Last updated: 2026-07-31

| Area | Status | Evidence |
|---|---|---|
| V1 user-facing workflows | IMPLEMENTED / PRESERVED | Existing navigation, weekly review, CSV, travel, debt/goals, settings, and encrypted vault tests pass. |
| V2 Foundation | IMPLEMENTED AND REVIEWED | `V2_FOUNDATION_REVIEW.md`; schema, migration, models, repository/service boundary, and vault compatibility. |
| Bucket Explorer | IMPLEMENTED AND ACCEPTED | `V2A_BUCKET_EXPLORER_ACCEPTANCE.md`; parent management, detail ledger, filters, archive safety, automated and browser acceptance passed. |
| Two-Level Sub-Buckets | IMPLEMENTED AND ACCEPTED | Exactly two levels; create, rename, reorder, move, archive/restore, rolled-up totals, validation, persistence, and browser acceptance passed. |
| Transaction Allocations and Split Editor | IMPLEMENTED AND ACCEPTED | `V2A_TRANSACTION_ALLOCATIONS_ACCEPTANCE.md`; schema 6 migration, canonical allocation calculations, split editor, rollback, automated and browser acceptance passed. |
| Reimbursements | NEEDS IMPLEMENTATION | Foundation models only; no user workflow or screens. |
| Account Enrichment UI | NEEDS IMPLEMENTATION | Unknown accounts remain explicit; no enrichment screen. |
| Location Correction UI | NEEDS IMPLEMENTATION | State/country facts display when present; no correction screen. |
| Plaid Sandbox | FUTURE / NOT IMPLEMENTED | No Plaid code, credentials, syncing, or sandbox flow. |

V2A Phases 1 and 2 do not change transaction import behavior and do not delete V1 user data. The current schema version is 6.
