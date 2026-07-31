# Money Moves V2A Phase 3A: Schema 7 Reimbursement Foundation

Date: 2026-07-31  
Status: **IMPLEMENTED AND REVIEWED**
Product workflow status: **Reimbursements remain NEEDS IMPLEMENTATION**

Independent acceptance: `V2A_REIMBURSEMENT_SCHEMA7_ACCEPTANCE.md`

## Scope

This phase implements the schema and integrity foundation approved in `V2A_REIMBURSEMENT_DESIGN_REVIEW.md`. It advances encrypted application state from schema 6 to schema 7 and adds canonical reimbursement entities, pure projections, whole-domain validation, deterministic migration, unresolved compatibility preservation, and tests.

It does not add reimbursement screens, claim or payment mutation services, matching suggestions, Shared Expenses, refund workflows, report widgets, transaction-import changes, bank syncing, Plaid, or a frontend framework. The existing guard against editing claim-linked allocations remains active.

Authoritative requirements applied: PRD REV-006, RMB-001–005, INF-001/002, canonical financial model §§11.3–11.8, logical data model §§12.1–12.4, test/definition-of-done §§17.1–17.3, scenarios A2/A3/A5 and Appendix B, and invariants D-007–D-010, D-013, D-015, D-016, and D-018.

## Approved product decisions applied

All 14 approved decisions are represented in this foundation:

- Claims are explicit; migration converts only existing schema-6 claim evidence and never infers a claim from ownership.
- One allocation may have at most one active claim link; one claim may have several allocation links.
- Claims retain a payer label only. The target validator rejects payer-entity, account, country, and location fields on claims.
- Reimbursable allocations without safely converted claims remain allocations, not receivables.
- Expected, received, written-off, remaining, status, and overdue values are pure projections; no reporting screen is changed here.
- Payment application is capped by claim expected amount and inflow availability. Excess remains unallocated because no target link is created for it.
- Write-offs and reversals are append-only records; write-offs create no transaction or cash movement.
- Linked allocations remain protected by the existing edit guard, now using canonical schema-7 links.
- Refunds remain a separate, deferred model and workflow.
- Unmatched reimbursement inflows remain transactions and are not converted into links.
- `shared` and `excluded` ownership remain readable and never create claims.
- Active reimbursement relationships require one known, matching currency; cross-currency links are invalid.
- No payment receipt is integrated into monthly spending or income calculations in this phase.

## Target schema

`STATE_SCHEMA_VERSION` is 7. The ordered migration registry adds exactly:

```text
from: 6
to:   7
id:   v2a-reimbursement-relationship-foundation
```

The canonical domain collections are:

- `reimbursementClaims`
- `reimbursementClaimAllocations`
- `reimbursementPaymentLinks`
- `reimbursementAdjustments`
- `auditEvents`

Missing collections initialize as empty arrays. Empty collections never produce inferred records. The vault namespace, AAD, AES-GCM, PBKDF2, key precedence, backup envelope, temporary-write behavior, and V1 recovery keys are unchanged.

## Entity models

### ReimbursementClaim

The authoritative claim contains stable ID, required payer label, required currency, nullable due date/note, paired nullable cancellation timestamp/reason, and created/updated timestamps. It does not contain authoritative `expectedAmountCents`, `status`, `allocationIds`, or embedded `repaymentLinks`; the schema-7 validator rejects those legacy authority fields.

No payer entity, contact, account, country, or location field is part of this model. Schema-6 payer label aliases are copied only when the source contains the text; nothing is generated.

### ReimbursementClaimAllocation

The standalone link contains ID, claim ID, allocation ID, positive integer cents, and timestamps. Whole-domain validation requires an existing non-cancelled claim, existing reimbursable allocation, expense outflow source transaction, amount no greater than the allocation, matching currency, and no other active claim link for that allocation. Archived buckets remain valid historical references.

### ReimbursementPaymentLink

The standalone link contains ID, claim ID, reimbursement inflow transaction ID, applied cents, one of the three approved sources, nullable note, paired nullable void timestamp/reason, and timestamps. Active links must use positive reimbursement inflows, match claim currency, stay within inflow availability across claims, and keep claim remaining non-negative. Duplicate claim/transaction/amount/active-state relationships are invalid. Voided links contribute zero received cents.

### ReimbursementAdjustment

The append-only adjustment permits only `write_off` and `write_off_reversal`. It requires positive cents, reason, effective timestamp, created timestamp, and correct reversal reference semantics. Whole-domain validation enforces collectible remaining, same-claim reversal, reversal amount limits, chronology, and one reversal per write-off. Migration creates no adjustments.

### AuditEvent

Audit events now participate in domain collection validation. Required fields are ID, entity type/ID, action, related entity IDs, occurrence timestamp, approved source, nullable reason, compact monetary facts, and nullable operation group ID. Monetary facts may contain safe integer `*Cents` fields only. Unknown top-level fields are rejected so full transaction/provider payloads, merchant descriptions, payer notes, account details, and locations cannot be copied into the audit record.

Schema-6 audit events that already meet this contract remain active. Every original event is also retained in schema-6 compatibility evidence. Invalid legacy event shapes are not promoted into the active collection.

## Relationship invariants

Whole-domain validation now enforces:

- required target collections and unique IDs;
- relationship-ID uniqueness across canonical reimbursement collections;
- existing claim, allocation, transaction, and adjustment references;
- reimbursable ownership and expense-outflow direction for claimed allocations;
- positive reimbursement direction/type for payment links;
- link amount boundaries and same-currency relationships;
- one active claim per allocation and at least one allocation link per active claim;
- inflow availability across claims;
- payment plus active write-off totals no greater than expected;
- valid write-off/reversal limits and cancellation restrictions;
- no negative remaining claim balance;
- no duplicate active or voided payment relationship fingerprints;
- validated audit-event structure.

Validation messages use IDs and invariant names, not payer labels, transaction descriptions, or notes.

## Currency rules

Active claims require a three-letter uppercase currency. Claim-allocation currency is derived from the allocation's source transaction; payment currency is the inflow transaction currency. Every active relationship must match exactly. Schema 7 implements no currency conversion.

Canonical transaction currency now permits explicit `null` so an unknown schema-6 transaction can remain preserved without inventing USD or invalidating unrelated data. A null or malformed currency prevents that transaction from participating in an active reimbursement relationship and produces `unknown_currency` migration evidence. Account currency remains required.

## Pure projections

`projectReimbursementClaim(domain, claimId, {asOf})` is read-only and derives:

```text
expectedAmountCents = sum(claim-allocation amountCents)
receivedAmountCents = sum(non-voided payment-link appliedAmountCents)
writtenOffAmountCents = sum(write_off amountCents)
                      - sum(valid write_off_reversal amountCents)
remainingAmountCents = expectedAmountCents
                     - receivedAmountCents
                     - writtenOffAmountCents
```

Negative remaining is invalid. Status is derived as `cancelled`, `open`, `partially_paid`, `settled`, or `written_off`. Overdue is a pure comparison of claim due date, explicit `asOf` date, and positive remaining cents. No projection mutates state or feeds a screen/report in Phase 3A.

## Migration algorithm

1. Clone the source state and resolve the existing deterministic migration timestamp.
2. Run base schema-6 validation for accounts, transactions, buckets, allocations, rules, and hierarchy. Legacy reimbursement inconsistencies are allowed through this phase specifically so they can be preserved with reason codes.
3. Snapshot complete schema-6 claims, embedded repayment fragments, allocation pointer facts, legacy statuses, and audit events under `legacyFoundation.reimbursementSchema6`.
4. Initialize clean canonical schema-7 reimbursement collections.
5. Process source claims in stable claim-ID/source-index order.
6. Validate every fact for one claim—including all source allocation links and all repayment fragments—in temporary structures.
7. Commit the claim and all generated relationships only when the entire claim is safe. Otherwise commit no canonical fact for that claim and write one deterministic unresolved record.
8. Allocate a source allocation and inflow capacity only after that whole claim commits. This makes duplicate-allocation and shared-inflow resolution deterministic across claims.
9. Clear deprecated `allocation.reimbursementClaimId` authority after its exact source value is snapshotted. Target claims never retain embedded allocation IDs, repayment fragments, expected amount, or status.
10. Sort generated claims and links by deterministic IDs, append the migration ID once, validate the schema-7 domain, and persist only through the existing state-service/repository boundary.

The migration remains clone-first, deterministic for the same input/timestamp, idempotent after reaching schema 7, and rejecting of future schemas. Persistence failure leaves the active encrypted vault intact; V1 recovery sources remain untouched.

## Safe-conversion criteria

A single-allocation claim converts only when its payer label, positive expected cents, timestamps, allocation reference/pointer, reimbursable ownership, expense source, and currency are safe and expected cents do not exceed allocation cents. Its generated link uses the legacy expected cents.

A multi-allocation claim converts only when every allocation is valid/reimbursable, every pointer is consistent, currencies are known and identical, no allocation is already committed to another active claim, and full allocation cents sum exactly to legacy expected cents. Each generated link uses the full allocation amount. No partial distribution is guessed.

Embedded payment fragments convert only with a safely converted claim, existing positive reimbursement inflow, matching known currency, positive integer applied cents, no duplicate/collision, claim capacity, and inflow capacity. Generated IDs include stable claim ID, transaction ID, amount, and occurrence index; source is `migrated_foundation`.

Legacy stored status never drives monetary facts. A legacy cancellation becomes canonical only with a valid cancellation timestamp and reason and no converted payment or adjustment. Invalid or contradictory status remains compatibility evidence while monetary relationships determine the active projection.

## Unresolved preservation

`legacyFoundation.unresolvedReimbursementClaims` remains encrypted with the vault. Every unresolved record contains:

- deterministic unresolved ID and ordered reason codes;
- the complete original claim;
- relevant original allocation-pointer facts;
- original embedded repayment fragments;
- legacy status;
- migration timestamp and source schema version.

The synthetic fixture matrix verifies the following reason codes:

- `allocation_not_reimbursable`
- `allocation_pointer_mismatch`
- `ambiguous_multi_allocation_distribution`
- `duplicate_claim_id`
- `duplicate_repayment`
- `expected_exceeds_allocation`
- `invalid_repayment_amount`
- `invalid_repayment_direction`
- `missing_allocation`
- `missing_repayment_transaction`
- `mixed_currency`
- `repayment_exceeds_claim`
- `repayment_exceeds_inflow`
- `repayment_not_reimbursement`
- `unknown_currency`

The implementation also defines safe reason paths for malformed claims, invalid timestamps, missing allocation transactions, non-expense allocation sources, duplicate allocation claims, and deterministic relationship-ID collision.

Across the acceptance-hardened independent synthetic fixture matrix, 8 claims convert safely and 19 claim records are preserved unresolved. The cross-claim inflow-capacity fixture deterministically converts the first safe claim and preserves the second whole; no fixture creates partial canonical facts for an unsafe claim.

Unresolved records are not canonical receivables and do not participate in projections or validation totals.

## Legacy-field strategy

The implementation uses compatibility strategy A from the design review:

- Complete schema-6 reimbursement evidence is retained under `legacyFoundation.reimbursementSchema6`.
- Ambiguous records are additionally indexed under `legacyFoundation.unresolvedReimbursementClaims` with repair reasons.
- Clean schema-7 relationships are the only active source for validation and projections.
- Deprecated allocation claim pointers are nulled only after snapshot preservation.
- `personal` continues to normalize under the existing migration; `shared` and `excluded` remain readable and create no claims.

No schema-6 reimbursement information needed for recovery is deleted.

## Files changed

| File | Change |
|---|---|
| `js/domain/constants.js` | Advances the canonical schema version to 7. |
| `js/domain/models.js` | Adds schema-7 entities, projections, nullable unknown transaction currency, audit validation, and whole-domain reimbursement invariants. |
| `js/domain/migrations.js` | Registers and implements deterministic schema-6-to-7 reimbursement conversion and unresolved preservation. |
| `js/services/allocationService.js` | Extends the existing read-only safety guard to canonical claim-allocation links. No reimbursement mutation API. |
| `test/fixtures/schema6-reimbursements.js` | Adds synthetic schema-6 safe, ambiguous, malformed, currency, payment, status, ownership, audit, duplicate, and future-version fixtures. |
| `test/reimbursement-schema7.test.js` | Adds schema-7 model, relationship, projection, migration, unresolved, audit, compatibility, and guard tests. |
| `test/models.test.js` | Updates foundation fixtures to canonical schema-7 entities and collections. |
| `test/migrations.test.js` | Verifies the new ordered migration ID in the complete V1-to-current path. |
| `test/vault-migration.test.js` | Adds encrypted schema-6 migration, reload, interrupted write, and invalid schema-7 save coverage. |
| `docs/engineering/IMPLEMENTATION_STATUS.md` | Records schema foundation as implemented and awaiting a separate acceptance review. |
| `docs/engineering/V2A_REIMBURSEMENT_SCHEMA7_IMPLEMENTATION.md` | This implementation record. |

No vault cryptography/namespace file, UI file, CSV/import file, bucket/report calculation, or Plaid integration was changed.

## Tests added

The suite expands from 48 to 83 tests. New coverage includes:

- empty, safe single, safe multi, and safe payment migrations;
- deterministic IDs/order/timestamps, source non-mutation, idempotency, migration history, and future-version rejection;
- unresolved all-or-nothing conversion for allocation, pointer, ownership, currency, payment, capacity, status, and duplicate defects;
- exact legacy snapshot and unrelated V1/V2 state preservation;
- claim, claim-allocation, payment-link, adjustment, reversal, and audit-event validation;
- open, partially paid, settled, written-off, cancelled, and overdue projections;
- voided-payment exclusion, over-application rejection, reversal uniqueness, and negative-remaining rejection;
- schema-7 linked-allocation guard behavior;
- encrypted schema-6 unlock/migration, schema-7 reload, interrupted write recovery, legacy source preservation, and invalid-save protection;
- all pre-existing V1, Bucket Explorer, two-level sub-bucket, allocation/split, state compatibility, and vault tests.

All fixture values are synthetic.

## Validation commands and results

| Command/check | Result |
|---|---|
| `pnpm test` | **PASS** — 83 tests passed; 0 failed, skipped, cancelled, or todo. |
| `pnpm run check` | **PASS** — all configured production JavaScript syntax checks exited 0. |
| `python3 -m py_compile start.py` | **PASS** — exited 0. |
| `git diff --check` | **PASS** — no whitespace errors. |
| Available browser regression smoke checks | **PASS** — a fresh schema-7 vault was created, locked, and unlocked on an isolated origin; an encrypted synthetic schema-6 vault unlocked and migrated, then Overview, Weekly review, the allocation editor, and Buckets & rules rendered; locking and unlocking the migrated vault again succeeded; no reimbursement/Shared Expenses workflow appeared; browser warnings/errors: 0. |

## Limitations and deferred work

- No production API creates, edits, cancels, pays, voids, writes off, or suggests a claim.
- No reimbursement or Shared Expenses UI exists.
- No refund-link model or workflow is implemented.
- No reimbursement values are integrated into monthly summaries, bucket reports, expected-personal views, realized-cost views, or dashboard widgets.
- No inflow matching or transaction-import behavior is added.
- No cross-currency claims or conversion are supported.
- Safe migrated cancellations retain their cancellation facts but have no active claim-allocation links; original expected/allocation evidence remains in the compatibility snapshot.
- Ambiguous records require a future repair/review workflow before they can become canonical receivables.
- Existing audit events are promoted only when they already satisfy the schema-7 audit contract; all originals remain in compatibility evidence.

## Known risks

1. Deterministic FNV-1a-derived relationship IDs are checked for collision and fail safe into unresolved evidence, but a later storage engine may choose stronger native IDs for newly created records.
2. Transaction currency is nullable for preservation, so every future reimbursement mutation path must continue enforcing known matching currency before creating a relationship.
3. The local app can have stale drafts in multiple tabs. Future mutation services must revalidate the latest state immediately before persistence.
4. Compatibility snapshots duplicate a small amount of reimbursement/audit data inside the encrypted state. This is intentional recovery evidence but increases vault size.
5. No genuine historical schema-6 reimbursement vault is available; coverage uses exhaustive synthetic shapes based on the shipped schema-6 validator and encrypted envelope.

## Recommended next phase

Perform the separate V2A Phase 3A acceptance review. It should inspect this migration and validator implementation independently, rerun the complete automated and browser/vault recovery suite, challenge malformed and cross-claim cases, and create `V2A_REIMBURSEMENT_SCHEMA7_ACCEPTANCE.md` only if all acceptance evidence passes.

Do not begin reimbursement mutation services or UI until the schema foundation is accepted.
