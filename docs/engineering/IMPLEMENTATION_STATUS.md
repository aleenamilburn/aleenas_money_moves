# Money Moves Implementation Status

Last updated: 2026-07-31

| Area | Status | Evidence |
|---|---|---|
| V1 user-facing workflows | IMPLEMENTED / PRESERVED | Existing navigation, weekly review, CSV, travel, debt/goals, settings, and encrypted vault tests pass. |
| V2 Foundation | IMPLEMENTED AND REVIEWED | `V2_FOUNDATION_REVIEW.md`; schema, migration, models, repository/service boundary, and vault compatibility. |
| Bucket Explorer | IMPLEMENTED | `V2A_BUCKET_EXPLORER_IMPLEMENTATION.md`; parent management, detail ledger, filters, archive safety, automated and browser tests. |
| Sub-buckets | IMPLEMENTED | Exactly two levels; create, rename, reorder, move, archive/restore, rolled-up totals, validation, and persistence tests. |
| Split Transactions | NEEDS IMPLEMENTATION | No split editor or split workflow exists. |
| Reimbursements | NEEDS IMPLEMENTATION | Foundation models only; no user workflow or screens. |
| Account Enrichment UI | NEEDS IMPLEMENTATION | Unknown accounts remain explicit; no enrichment screen. |
| Location Enrichment UI | NEEDS IMPLEMENTATION | State/country facts display when present; no enrichment screen. |
| Plaid Sandbox | FUTURE / NOT IMPLEMENTED | No Plaid code, credentials, syncing, or sandbox flow. |

V2A Phase 1 does not change transaction import behavior and does not destructively convert V1 user data. The current schema version is 5.
