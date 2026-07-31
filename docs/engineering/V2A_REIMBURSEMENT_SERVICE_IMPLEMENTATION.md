# Money Moves V2A Reimbursement Service Implementation

Date: 2026-07-31  
Status: IMPLEMENTED / AWAITING ACCEPTANCE

## Scope

Phase 3B implements the schema-7 reimbursement mutation and calculation boundary. It adds no product screens, Shared Expenses navigation, dashboard/reporting integration, refund model, suggestion UI, transaction-import change, bank sync, or Plaid code. Reimbursements therefore remain `NEEDS IMPLEMENTATION` at the product-workflow level.

The implementation retains the accepted schema-7 authority model: standalone claims, claim-allocation relationships, payment links, append-only write-off adjustments, and compact audit events. The encrypted vault repository and schema version remain unchanged.

## Service API

`js/services/reimbursementService.js` owns reimbursement writes and calculations.

Draft and validation API:

- `createClaimDraft` and `validateClaimDraft`
- `createClaimMetadataDraft`
- `createClaimAmountsDraft` and `validateClaimAmountsDraft`
- `createWriteOffDraft`
- `createPaymentDistributionDraft` and `validatePaymentDistribution`
- `createManualRepaymentDraft`

Atomic mutation API:

- `createClaim`
- `updateClaimMetadata`
- `updateClaimAmounts`
- `cancelClaim`
- `createWriteOff`
- `reverseWriteOff`
- `applyPaymentDistribution`
- `voidPaymentLink`
- `recordManualRepayment`

Pure projection API:

- `projectClaim` and `projectClaims`
- `projectOpenClaims`, `projectSettledClaims`, and `projectCancelledClaims`
- `projectClaimsNeedingResolution`
- `projectInflowAvailability`
- `projectUnmatchedReimbursementInflows`
- `aggregateOutstandingReimbursement`

## State revision and stale drafts

`js/services/stateRevision.js` defines a non-negative safe-integer `stateRevision`. Migration deterministically initializes an absent revision to `0` without changing schema 7, preserves a valid existing revision, and rejects an invalid revision before canonical migration.

Every draft captures the current revision. Every atomic save checks the draft revision before validation or mutation and returns `STALE_STATE` when it differs. A stale request neither invokes persistence nor appends audit evidence. A successful reimbursement, allocation, or persisted bucket mutation advances the revision exactly once. Persistence failure restores the complete prior snapshot, including the prior revision.

`StateService` validates the revision alongside the canonical domain before encrypted persistence. It does not increment automatically, preventing double increments at service-owned mutation boundaries.

## Atomic mutation boundary

All reimbursement mutations use one transaction pattern:

1. Require one persistence callback and an exact expected revision.
2. Validate the current canonical domain.
3. Snapshot the complete state.
4. Revalidate the operation against current facts.
5. Apply all related records and grouped audit events in memory.
6. Validate the complete canonical domain.
7. Advance `stateRevision` once and persist once.
8. Restore the complete snapshot on validation, ID, encryption, storage, or persistence failure.

No operation persists an intermediate claim, link, adjustment, transaction, audit, or revision.

## Claim operations

Claim creation is explicit and requires one or more reimbursable expense allocations. Currency is derived exclusively from known source-transaction facts. Mixed or unknown currency, missing/non-reimbursable allocations, over-claiming, competing active claims, and blank payer labels reject without mutation. New user records use `crypto.randomUUID()` by default; injectable ID factories are limited to deterministic tests.

Metadata changes affect only payer label, nullable due date, nullable note, and update time. Audit evidence lists changed field names but does not copy payer labels or note contents.

Claimed-amount editing reuses relationship IDs where an allocation relationship continues, validates each source cap and currency, blocks deletion of the final active link, and rejects totals below received plus written-off cents with `CLAIM_AMOUNT_BELOW_SETTLED_FACTS`. It never silently changes payment links or write-offs. The existing allocation-service guard for claimed allocations remains active.

Cancellation requires an explicit reason, no active payment link, and zero net active write-off. The claim is retained with paired cancellation facts. Active claim-allocation relationships are removed as required by the accepted schema-7 representation, while their IDs and cents remain in grouped audit evidence. No cash or spending transaction is created.

## Payment distribution

A payment distribution is a disposable draft for one positive, known-currency reimbursement inflow. It may distribute positive cents across one or more unique active same-currency claims. Validation enforces per-claim remaining capacity, aggregate inflow availability across all active links, and active-link duplicate detection. Excess inflow remains in `availableAmountCents`; no overpaid status or adjustment is invented.

Application creates one strong-ID payment link and one compact audit event per confirmed row under one `operationGroupId`, validates all rows again against current state, persists once, and returns updated claim and inflow projections. Link source is limited to explicit `user_linked` or `suggestion_confirmed` input.

Voiding preserves the original link, pairs `voidedAt` with the required reason, leaves the inflow transaction unchanged, and recomputes claim/inflow projections. Corrections remain an explicit later replacement distribution.

## Write-offs and reversals

Write-offs require positive cents, an explicit reason, and an explicit effective timestamp. The pure draft helper may default only the amount to collectible remaining. A write-off appends an adjustment and no transaction, so it creates no cash movement.

Reversal appends a `write_off_reversal` referencing an existing write-off on the same claim. Amount caps, single-reversal authority, created/effective chronology, full-domain validation, audit grouping, stale checks, and rollback are enforced. Stored status is never mutated; lifecycle status remains derived from relationships.

## Manual repayments

`recordManualRepayment` atomically creates one positive canonical manual transaction and one payment link. The transaction uses the claim currency, `movementType: reimbursement`, a selected existing same-currency account or the approved `unknown-account` sentinel, and a user-supplied calendar date or timestamp normalized to its UTC calendar date. Merchant and location fields remain null; no identity or geography is inferred. Failure creates neither record.

Because the transaction is classified as reimbursement rather than `earned_income`, existing income calculations continue to exclude it. Reporting screens are deliberately unchanged.

## Projection behavior

Claim and inflow projections are pure. Temporal projections require an explicit valid `asOf` calendar date and use source transaction dates and adjustment effective dates. They expose expected, received, written-off, remaining, overdue, applied, available, unmatched-inflow, and aggregate-outstanding facts without storing status.

Legacy unresolved claims are exposed only as `needs_resolution` evidence with stable IDs and reason codes. The service does not invent authoritative expected cents for unresolved schema-6 data, and unresolved records are excluded from totals.

## Audit contract

Successful user operations write `source: user` audit events with related entity IDs, optional safe-integer `*Cents` facts, and strong operation group IDs. Approved summary actions include:

- `claim_created`
- `claim_metadata_updated`
- `claim_amounts_updated`
- `claim_cancelled`
- `write_off_created`
- `write_off_reversed`
- `payment_linked`
- `payment_link_voided`
- `manual_repayment_created`

Relationship-level events supplement the summary actions when claim-allocation history changes. Audit records do not copy payer labels, payer notes, merchant descriptions, account details, location, or provider payloads. Failed and stale operations append no events.

## Error contract

The stable required service codes are:

`STALE_STATE`, `CLAIM_NOT_FOUND`, `CLAIM_CANCELLED`, `CLAIM_ALREADY_CANCELLED`, `INVALID_PAYER_LABEL`, `INVALID_CURRENCY`, `MIXED_CURRENCY`, `ALLOCATION_NOT_FOUND`, `ALLOCATION_NOT_REIMBURSABLE`, `ALLOCATION_ALREADY_CLAIMED`, `CLAIM_AMOUNT_EXCEEDS_ALLOCATION`, `CLAIM_AMOUNT_BELOW_SETTLED_FACTS`, `PAYMENT_NOT_FOUND`, `PAYMENT_ALREADY_VOIDED`, `INVALID_REIMBURSEMENT_INFLOW`, `PAYMENT_EXCEEDS_CLAIM`, `PAYMENT_EXCEEDS_INFLOW`, `WRITE_OFF_EXCEEDS_REMAINING`, `ACTIVE_PAYMENTS_PREVENT_CANCELLATION`, `ACTIVE_WRITE_OFFS_PREVENT_CANCELLATION`, `INVALID_ACCOUNT`, `PERSISTENCE_FAILED`, and `DOMAIN_INVALID`.

Additional narrow codes cover invalid amounts/operations, missing final claim links, duplicate distribution claims/links, write-off targets/reversals, reasons, and chronology. Messages contain record IDs and safe cent amounts only; they do not contain payer, note, merchant, account-detail, or location values.

## Files changed

- `js/services/reimbursementService.js` — service API, transaction boundary, projections, audits, and errors.
- `js/services/stateRevision.js` — revision initialization, access, and increment.
- `js/domain/migrations.js` — deterministic revision initialization and pre-migration validation.
- `js/services/stateService.js` — revision validation before encrypted persistence.
- `js/services/allocationService.js` — one revision increment inside the existing atomic allocation boundary.
- `js/services/bucketService.js` — one revision increment inside the persisted bucket boundary.
- `package.json` — syntax-check coverage for the new production modules.
- `test/reimbursement-service.test.js` — Phase 3B domain/service, rollback, projection, audit, and encrypted reload coverage.
- `test/allocation-service.test.js` and `test/bucket-acceptance.test.js` — revision regression assertions.
- `docs/engineering/IMPLEMENTATION_STATUS.md` — Phase 3B status.
- `docs/engineering/V2A_REIMBURSEMENT_SERVICE_IMPLEMENTATION.md` — this record.

No UI, import, CSV, reporting, refund, navigation, Shared Expenses, or Plaid file changed.

## Tests and command results

| Command or check | Result |
|---|---|
| `pnpm test` | PASS — 119 tests, 119 passed, 0 failed. This includes the previous 94-test baseline plus 24 reimbursement-service tests and one bucket revision acceptance test. |
| `pnpm run check` | PASS — syntax validation succeeded for all listed production modules, including both new services. |
| `python3 -m py_compile start.py` | PASS. The generated cache artifact was removed after validation. |
| `git diff --check` | PASS in the final validation run. |
| Sequential encrypted service-operation reload | PASS — all mutation families persisted/reloaded; revision `10`, canonical relationships, adjustments, audit evidence, and legacy unresolved evidence survived. |
| Existing wrong-password, corruption, interrupted-write, failed-restore, previous-vault, V1 Travel, Weekly Review, Bucket Explorer, Split Editor, claim guard, CSV, monthly, and vault tests | PASS within the 119-test suite. |
| Local server asset smoke | PASS — `start.py --port 18888` served `index.html` and every requested production module successfully; only optional `favicon.ico` returned 404. |
| Interactive browser regression | BLOCKED BY TEST ENVIRONMENT — the in-app browser loaded the local app bundle, but its control session did not retain the new tab for DOM interaction. No browser workflow pass is claimed. |

## Defects found and corrected during implementation

1. Early service drafts initially validated before checking revision. The shared boundary now rejects stale state first, without validation-side work, mutation, audit, or persistence.
2. An exact repeated payment relationship initially surfaced the secondary remaining-capacity error. Duplicate-link detection now has deterministic precedence.
3. Initial audit action spellings did not match the approved Phase 3B vocabulary. Summary actions and grouping now use the accepted names.
4. Initial write-off logic allowed a missing effective date to fall back to operation time. The final service requires the user-confirmed effective timestamp.

## Limitations and unresolved risks

- The service is intentionally unused by production UI until a separately accepted workflow phase.
- There is no linked allocation split/merge orchestration; `allocationService` continues to block claimed allocation edits.
- There is no refund-link model or refund-aware accounting.
- There is no matching/suggestion engine; `suggestion_confirmed` is only a validated explicit source enum for a future confirmed workflow.
- There is no reporting integration for expected versus realized personal cost.
- Local state revision prevents stale drafts within service-owned canonical boundaries. It is not a multi-device synchronization protocol.
- Interactive browser acceptance remains outstanding because browser control failed after the local app loaded. A separate acceptance review must rerun the listed fresh/existing vault and navigation scenarios.

## Recommended acceptance review

Perform an independent Phase 3B review before changing the service status to reviewed. Re-exercise every error code and rollback path, inspect audit payloads for sensitive data, verify exact revision behavior across all canonical callers, reload every mutation from an encrypted vault, and complete the browser regression matrix. Keep reimbursements marked `NEEDS IMPLEMENTATION` until the later UI and reporting phases are separately implemented and accepted.
