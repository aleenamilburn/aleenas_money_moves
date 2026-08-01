# Money Moves Implementation Status

Last updated: 2026-07-31

| Area | Status | Evidence |
|---|---|---|
| V1 user-facing workflows | IMPLEMENTED / PRESERVED | Existing navigation, weekly review, CSV, travel, debt/goals, settings, and encrypted vault tests pass. |
| V2 Foundation | IMPLEMENTED AND REVIEWED | `V2_FOUNDATION_REVIEW.md`; schema, migration, models, repository/service boundary, and vault compatibility. |
| Bucket Explorer | IMPLEMENTED AND ACCEPTED | `V2A_BUCKET_EXPLORER_ACCEPTANCE.md`; parent management, detail ledger, filters, archive safety, automated and browser acceptance passed. |
| Two-Level Sub-Buckets | IMPLEMENTED AND ACCEPTED | Exactly two levels; create, rename, reorder, move, archive/restore, rolled-up totals, validation, persistence, and browser acceptance passed. |
| Transaction Allocations and Split Editor | IMPLEMENTED AND ACCEPTED | `V2A_TRANSACTION_ALLOCATIONS_ACCEPTANCE.md`; schema 6 migration, canonical allocation calculations, split editor, rollback, automated and browser acceptance passed. |
| Reimbursement Design | REVIEWED | `V2A_REIMBURSEMENT_DESIGN_REVIEW.md`; all 14 product decisions approved and recorded; target entities, lifecycle, accounting, migration, service, UI workflow, validation, test, security, and acceptance contracts reviewed. No production implementation. |
| Reimbursement Schema Foundation | IMPLEMENTED AND REVIEWED | `V2A_REIMBURSEMENT_SCHEMA7_ACCEPTANCE.md`; independent all-or-nothing migration, validation, compatibility, authority, encrypted-vault, recovery, regression, and browser acceptance passed. |
| Reimbursement Service Foundation | IMPLEMENTED AND REVIEWED | `V2A_REIMBURSEMENT_SERVICE_ACCEPTANCE.md`; atomic claim, payment-link, write-off/reversal, cancellation, manual-repayment, projection, audit, revision, rollback, encrypted reload, and browser regression acceptance passed. No product workflow or screens. |
| Cross-Tab Write Coordination | IMPLEMENTED / AWAITING ACCEPTANCE | `V2A_CROSS_TAB_COORDINATION_IMPLEMENTATION.md`; opaque vault generations, expiring single-writer lease, repository compare-before-promotion, generic conflict recovery, rollback, adversarial automation, and controlled two-tab browser checks implemented. |
| Reimbursements | NEEDS IMPLEMENTATION | Schema and service foundations only; no user workflow, screens, or reporting integration. |
| Account Enrichment UI | NEEDS IMPLEMENTATION | Unknown accounts remain explicit; no enrichment screen. |
| Location Correction UI | NEEDS IMPLEMENTATION | State/country facts display when present; no correction screen. |
| Plaid Sandbox | FUTURE / NOT IMPLEMENTED | No Plaid code, credentials, syncing, or sandbox flow. |

V2A Phases 1 and 2 do not change transaction import behavior and do not delete V1 user data. The current schema version is 7. Phase 3A adds the reviewed reimbursement schema foundation; Phase 3B adds the independently reviewed atomic service foundation; Phase 3C adds cross-tab encrypted-vault coordination and remains awaiting independent acceptance. Reimbursements remain unimplemented at the product-workflow level.
