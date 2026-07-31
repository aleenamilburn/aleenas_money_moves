# Money Moves V2A Phase 3: Reimbursement Design and Data-Integrity Review

Date: 2026-07-31  
Status: **REVIEWED — DESIGN ONLY**  
Product decisions: **APPROVED — 2026-07-31**  
Implementation status: **Reimbursements remain NEEDS IMPLEMENTATION**

This document is the implementation contract for the next reimbursement phase. It does not claim that reimbursement workflows are implemented. The review is grounded in the authoritative [Money Moves PRD](../Money_Moves_Product_Requirements_Document_v1.0.docx), especially pages 12, 15–16, 23–26, 31–32, 37, and 39–41, and in the current schema-6 repository.

## 1. Executive recommendation

Do not build reimbursement UI on the existing embedded `ReimbursementClaim` shape. Retain the current encrypted vault, transaction, bucket, and allocation foundations, but migrate reimbursement data to explicit relationship records before enabling any workflow.

The smallest reliable design is:

- An explicitly created `ReimbursementClaim` with a payer **label**, currency, due date, note, and durable cancellation metadata.
- A `ReimbursementClaimAllocation` entity that records exactly how many cents of an expense allocation are claimed. One claim may cover one or more allocations; one allocation may belong to at most one non-cancelled claim in V2A.
- A `ReimbursementPaymentLink` entity that records exactly how many cents of a reimbursement inflow are applied to a claim. A claim may receive many payments and one inflow may pay many claims.
- An append-only `ReimbursementAdjustment` entity for write-offs and their reversals. General balance-changing adjustments should not be enabled in V2A.
- Derived balances and statuses. `open`, `partially_paid`, `settled`, and `written_off` follow from link totals; overdue is a separate derived flag. Applied payments are capped at the remaining collectible amount, so an excess inflow remains unallocated rather than putting a claim into an `overpaid` state.
- Three distinct reporting lenses: cash movement by payment date, responsibility by source-expense allocation, and reimbursement activity by repayment date. A late repayment must not become earned income or negative spending in the repayment month.

Claim creation should be explicit. Marking an allocation `reimbursable` is useful ownership metadata, but it must not silently create a receivable or invent a payer. Repayment suggestions may be generated later, but every link must be confirmed by the user. This follows the PRD’s confirmation requirement (RMB-003 and D-010, pages 15 and 41).

No production reimbursement code, screens, fixtures, transaction import, or Plaid integration was added during this review.

## 2. Existing implementation audit

Severity meanings: **Critical** risks lost or contradictory financial facts; **High** can produce incorrect balances or unrecoverable ambiguity; **Medium** blocks a complete workflow or audit trail; **Low** is a clarity or maintainability concern.

| Severity | Verified finding | Evidence | Disposition |
|---|---|---|---|
| High | The existing claim embeds allocation IDs and repayment link fragments. It has no per-allocation claimed amount, payment-link identity, currency, source, reversal metadata, or closure reason. | `js/domain/models.js:158-183` | **Migrate/refactor.** Treat this shape as a schema-6 compatibility input. Replace embedded relationships with standalone link records; preserve the original record in migration metadata when conversion is ambiguous. |
| High | Cross-store validation confirms bidirectional allocation/claim pointers and verifies that repayment transactions are positive reimbursement inflows, but it does not cap claim amounts, require reimbursable ownership, prevent duplicate repayment links, reconcile stored status, enforce same currency, or limit payment use across claims. | `js/domain/models.js:239-323` | **Refactor.** Extend runtime validation with relationship, currency, availability, balance, and derived-status invariants before any reimbursement writes are enabled. |
| High | The stored status enum mixes lifecycle states with computed facts: `overdue` and `overpaid` can disagree with dates and totals. | `js/domain/models.js:15`, `js/domain/models.js:158-183` | **Migrate.** Preserve the legacy status in migration/audit metadata, then derive status and overdue from canonical facts. Do not copy a contradictory legacy status into the target status. |
| High | Schema 6 initializes the claim array but has no reimbursement-specific migration. The allocation migration creates `mine` allocations only and never creates claims or repayments. | `js/domain/migrations.js:5-10`, `js/domain/migrations.js:125-135`, `js/domain/migrations.js:209-283` | **Retain framework; add a later migration.** Use the deterministic clone/validate/idempotency framework at `js/domain/migrations.js:294-318`. Never infer a claim from a V1 `shared` or `excluded` value. |
| Medium | `auditEvents` is initialized but is not included in model collection validation. Reimbursement changes therefore have no enforced audit schema. | `js/domain/migrations.js:125-135`, `js/domain/models.js:239-249` | **Refactor.** Add a validated audit-event model before mutations. Events must contain actor/source, action, entity IDs, timestamp, reason where required, and before/after monetary facts. |
| High | Allocation editing deliberately rejects every transaction containing a claim-linked allocation. This prevents corruption today but cannot support the PRD’s post-claim edit workflows. | `js/services/allocationService.js:236-272` | **Retain until replacement exists; refactor later.** Replace the blanket guard with reimbursement-aware atomic reconciliation. Keep snapshot rollback and pre-persist domain validation. |
| Medium | Allocation drafts write only `mine` or `reimbursable`, preserve an existing claim pointer, and expose gross/mine/reimbursable totals. They do not create claims. | `js/services/allocationService.js:157-196`, `js/services/allocationService.js:203-222` | **Retain.** Explicit claim creation is the recommended contract. Move relationship persistence out of allocation records after schema migration. |
| High | Monthly income excludes `reimbursement` and `merchant_refund`, which is correct, but spending is gross expense allocation only. No expected, received, outstanding, realized-net, refund, or write-off measure exists. | `js/state.js:317-350` | **Retain gross calculation; add separate projections.** Do not overload `income`, `spend`, or `cashFlow` with reimbursement responsibility. |
| Medium | Bucket ledgers use canonical allocations first and V1 fallback rows only when no canonical transaction is present. They carry ownership and movement type but no claim/payment/refund projection. | `js/services/allocationService.js:275-310`, `js/services/bucketService.js:219-255` | **Retain/refactor.** Keep exact-once allocation selection, then join read-only reimbursement projections in the reporting layer. |
| Medium | The UI labels reimbursable allocations as “Not yet linked to a repayment,” allows Mine/Reimbursable editing, and offers allocation editing from weekly review and bucket detail. There is no claim or repayment workflow. | `js/app.js:236-250`, `js/app.js:289-347`, `js/app.js:430-446` | **Retain current behavior.** Add UI only after schema, service, calculations, and recovery tests pass. The label should later distinguish “not tracked” from “claim open.” |
| Medium | Existing tests prove only that a basic claim with one allocation and one reimbursement inflow passes current validation. They do not exercise partial payments, cross-claim payment availability, write-offs, cancellations, reversals, or reporting. | `test/models.test.js:103-130` | **Retain and expand later.** The existing fixture becomes a schema-6 migration input, not the complete target-contract test. |
| Medium | Foundation-era `personal`, `shared`, and `excluded` remain readable while new Phase 2 writes use `mine` or `reimbursable`. Their historical meaning is not sufficient to create receivables. | `js/domain/models.js:12-15`, `js/domain/migrations.js:209-214`, `js/services/allocationService.js:167-196` | **Retain/migrate conservatively.** `personal` may normalize to `mine`; preserve `shared` and `excluded` without fabricating a payer, claim, or collectible amount. Product confirmation is required before any later reinterpretation. |
| Low | Account and location data remain explicit or null in canonical projections. Nothing in the current reimbursement foundation fabricates them. | `js/domain/models.js:89-127`, `js/domain/models.js:326-342`, `js/services/allocationService.js:283-306` | **Retain.** Manual repayments may use a manual or explicit unknown account; payer labels must never be inferred from account or location data. |
| Low | State service validates around migration and before repository persistence; restore verifies/decrypts before migration and save. | `js/services/stateService.js:7-18`, `js/services/stateService.js:27-59` | **Retain.** Reimbursement services must mutate a clone, validate all monetary relationships, persist once through this boundary, and restore the in-memory snapshot on failure. |

No existing production reimbursement workflow should be deleted now. The eventual schema migration may stop writing the embedded `allocation.reimbursementClaimId`, `claim.allocationIds`, and `claim.repaymentLinks` fields only after every schema-6 vault is safely converted or preserved as unresolved migration evidence. User data must never be discarded merely because it is ambiguous.

## 3. Domain model

All money is integer cents. Every participating transaction, allocation, claim, and link must have the same three-letter currency. V2A performs no foreign-exchange conversion.

### ReimbursementClaim

| Field | Contract |
|---|---|
| `id` | Stable, non-empty ID. |
| `payerLabel` | Required user-entered text. It is not an identity assertion. |
| `currency` | Required ISO currency; copied only from selected source allocations when they all agree. |
| `dueDate` | Nullable calendar date. No default may be fabricated. |
| `note` | Nullable user text. |
| `cancelledAt`, `cancellationReason` | Nullable together; cancellation is permitted only under the rules in section 5. |
| `createdAt`, `updatedAt` | ISO-compatible timestamps. |

`expectedAmountCents` is **derived** as the sum of active `ReimbursementClaimAllocation.amountCents`. It should not be a separately editable source of truth. The API may expose it in claim projections.

V2A should keep `payerLabel`; it should not add a payer entity. A payer entity introduces merge, identity, contact, deletion, and privacy semantics without a current requirement. A later schema can add an optional payer ID while preserving labels as historical snapshots.

### ReimbursementClaimAllocation

| Field | Contract |
|---|---|
| `id` | Stable link ID. |
| `claimId` | Existing claim. |
| `allocationId` | Existing expense allocation. |
| `amountCents` | Positive integer, no more than the source allocation’s amount. |
| `createdAt`, `updatedAt` | ISO-compatible timestamps. |

One claim may cover many allocations. An allocation may have zero or one active claim link in V2A. This avoids double-counting a receivable while supporting a single payer’s share across several expenses. A source allocation may be only partly claimed; its unclaimed portion remains the user’s expected responsibility.

### ReimbursementPaymentLink

| Field | Contract |
|---|---|
| `id` | Stable link ID, required for edit/reversal/audit. |
| `claimId` | Existing, non-cancelled claim. |
| `inflowTransactionId` | Existing positive transaction classified `reimbursement`. |
| `appliedAmountCents` | Positive integer; capped by both claim remaining and inflow available. |
| `source` | `user_linked`, `suggestion_confirmed`, or `migrated_foundation`. Never `automatic`. |
| `note` | Nullable user text. |
| `voidedAt`, `voidReason` | Nullable together; void instead of hard deletion. |
| `createdAt`, `updatedAt` | ISO-compatible timestamps. |

The same inflow may have links to multiple claims, provided the sum of active links does not exceed the inflow. The remainder stays visibly unallocated. A claim may have multiple links for partial repayments.

### ReimbursementAdjustment

| Field | Contract |
|---|---|
| `id`, `claimId` | Stable ID and existing claim. |
| `type` | `write_off` in initial V2A; schema may reserve `write_off_reversal`. No generic free-form balance mutation. |
| `amountCents` | Positive integer no greater than collectible remaining at creation. |
| `reason` | Required user-entered text. |
| `effectiveAt` | Required date/time used for responsibility activity. |
| `reversesAdjustmentId` | Nullable; required for a reversal and must target an active write-off. |
| `createdAt` | ISO-compatible timestamp; records are append-only. |

An adjustment record is justified because overwriting a claim balance loses who absorbed a debt and when. Keeping adjustment types narrow is less complex and safer than a generic ledger.

### AuditEvent

Reimbursement mutations require a validated append-only event containing `id`, `entityType`, `entityId`, `action`, related IDs, `occurredAt`, `source` (`user`, `migration`, or `reconciliation`), an optional reason, and compact before/after monetary facts. Full payer notes or imported transaction payloads should not be duplicated into audit events.

### Entities deliberately deferred

- `Payer`: retain a label in V2A.
- `RefundLink`: specified in section 9, but should be implemented as a separate integrity phase before refund-aware reporting is released.
- Inflow allocations: V2A can distribute a reimbursement inflow among claims; mixed-purpose inflows remain unsupported and must stay unresolved rather than guessed.
- Disputes, reminders, contact details, and messaging: not needed for the accounting contract.

## 4. Entity relationships

```text
Expense Transaction 1 ── 1..n Allocation
Allocation 1 ── 0..1 active ReimbursementClaimAllocation
ReimbursementClaim 1 ── 1..n ReimbursementClaimAllocation

Reimbursement Inflow 1 ── 0..n ReimbursementPaymentLink
ReimbursementClaim 1 ── 0..n ReimbursementPaymentLink
ReimbursementClaim 1 ── 0..n ReimbursementAdjustment

Merchant Refund Inflow 1 ── 0..n RefundLink ── 1 Allocation   (deferred)
```

Relationship invariants:

1. Claim allocations reference negative expense transactions only and use `reimbursable` ownership.
2. One allocation has at most one active claim allocation link. Historical cancelled-claim references live in audit/migration records, not competing active links.
3. Claim expected cents equal its active claim-allocation link sum.
4. Payment links reference positive `reimbursement` movements; refund links reference positive `merchant_refund` movements. These types are not interchangeable.
5. Active payment-link totals may not exceed either the claim’s collectible remaining at the time of the mutation or the inflow’s available cents across all claims.
6. All related records use the same currency; no implied conversion is allowed.
7. Bucket archive status does not invalidate historical links. Hard deletion of a referenced allocation, transaction, claim, link, or adjustment is prohibited.
8. Source account, location, payer identity, and repayment match remain null/unknown unless supplied by source data or confirmed by the user.

These strengthen the current partial relationship checks at `js/domain/models.js:291-315` without changing the exact-allocation invariant already enforced at `js/domain/models.js:224-237`.

## 5. Claim lifecycle

Canonical status is a projection, not a freely stored enum:

| Derived status | Rule |
|---|---|
| `cancelled` | `cancelledAt` is set. No active payment links or write-offs may remain. |
| `open` | Active, received = 0, remaining > 0. A partial write-off is shown as a separate fact. |
| `partially_paid` | Active, received > 0, remaining > 0. |
| `settled` | Active, remaining = 0, written off = 0. |
| `written_off` | Active, remaining = 0, written off > 0. This includes claims partly repaid and then written off. |

`isOverdue = dueDate < asOfDate && remainingAmountCents > 0`. Overdue is an overlay, not a mutually exclusive status. `overpaid` is not a target status because the service will not apply excess cents. `disputed` is deferred; a note does not change balances.

Allowed transitions:

```text
open ──payment──> partially_paid ──payment──> settled
  │                    │
  └──write-off─────────┴──────────────> written_off
  └──cancel (no payments/write-offs)──> cancelled

settled/written_off ──void or reverse audited fact──> recalculated open/partially_paid
```

- **Cancellation** means the claim was created in error or no longer represents a debt. It requires all payments to be unlinked and all adjustments reversed first. It does not convert remaining responsibility to the user.
- **Write-off** means a valid debt will not be collected. It requires a reason and converts the written-off portion to personal responsibility on the write-off effective date.
- **Reopening** is not a status button. Voiding a mistaken payment link or reversing a write-off recomputes the status from remaining facts.
- **Deletion** is not permitted. Cancel, void, or reverse with an audit record.

## 6. Payment-link lifecycle

1. A positive transaction is explicitly classified as `reimbursement`; this classification alone creates no link.
2. The service may return ranked suggestions using amount, date, payer label text, and open claims, but it must return reasons and confidence without writing state.
3. The user confirms one or more claim distributions. Each applied amount is validated against claim remaining, inflow available, currency, and source state.
4. The service writes payment links and audit events atomically, validates the full domain, and persists once through the state service boundary (`js/services/stateService.js:41-44`).
5. A correction voids a link with a reason; it never erases the link. Claim status and all projections recompute.
6. If an inflow is reversed or removed, reconciliation voids or marks its links inactive, restores claim remaining, creates audit events, and flags the transaction/claims for resolution. It must not silently retain received amounts.
7. An unmatched reimbursement inflow remains a reimbursement inflow with `availableAmountCents > 0`. It is excluded from earned income by the existing income rule (`js/state.js:322-330`) and appears in a “needs linking” queue once that workflow exists.

Manual repayment is represented by a normal canonical transaction with `source: manual`, a positive amount, `movementType: reimbursement`, explicit currency/date, and either a selected account or the existing explicit unknown-account sentinel. It then follows the same link lifecycle. No special off-ledger repayment record is allowed.

Suggested service interface:

```text
buildRepaymentSuggestions(state, inflowTransactionId) -> suggestion[]
createPaymentDistributionDraft(state, inflowTransactionId) -> draft
validatePaymentDistribution(state, draft) -> validation
applyPaymentDistribution(state, draft, persist) -> links
voidPaymentLink(state, linkId, reason, persist) -> projection
```

## 7. Accounting formulas

For claim `c` at time `t`:

```text
expected(c)   = sum(active claim-allocation link cents)
received(c,t) = sum(active payment-link cents with effective transaction date <= t)
writtenOff(c,t) = sum(active write-off cents with effectiveAt <= t)
remaining(c,t) = max(0, expected(c) - received(c,t) - writtenOff(c,t))
```

Service validation enforces `received + writtenOff <= expected`; the `max` is defensive, not permission to over-apply.

For a bucket and its child buckets:

```text
gross spend
  = expense allocation cents
    - linked merchant-refund cents attributable to those allocations

tracked expected personal spend
  = gross expense allocation cents
    - active claim-allocation cents
    + written-off claim cents
    - refund cents already included above

realized net personal spend, as of t
  = gross expense allocation cents
    - received reimbursement cents attributed through claim allocations
    - linked merchant-refund cents

outstanding receivable, as of t
  = sum(remaining claim cents)
```

Until a claim is explicitly created, a `reimbursable` allocation remains **untracked expected-from-others metadata**. It should be shown separately and is included in personal responsibility for conservative planning. This avoids creating a receivable without a payer or confirmation.

When one claim spans several allocations, each payment is attributed in stable claim-allocation order using a deterministic waterfall unless the user explicitly distributes it. The final allocation receives any residual cent. The service must persist or reproducibly derive the attribution so bucket totals do not change with array ordering.

Cash flow is independent:

```text
cash activity = signed transactions by transaction date
earned income excludes reimbursement and merchant_refund
```

The existing `monthSummary` gross expense and earned-income exclusions should be retained (`js/state.js:317-350`). New reimbursement measures should be separate projection fields rather than changing the meaning of existing `income` or `spend` without a product decision.

## 8. Timing examples

### Example A: expense and full repayment in different months

- July 20: Dining expense is $100; $50 Mine and $50 Reimbursable. The user explicitly creates a $50 claim.
- July cash activity: -$100. July gross spend: $100. Tracked expected personal spend: $50. Outstanding receivable: $50. Realized net personal spend as of July 31: $100 because no cash has returned.
- August 3: $50 reimbursement inflow is confirmed and linked.
- August cash activity: +$50 reimbursement; earned income: $0; August spending: $0 from this event.
- The source-expense view for July, **as of August 3**, shows realized net personal spend $50 and links to the August receipt. A historical “as of July 31” view remains $100 realized and $50 outstanding.

### Example B: partial payment, then write-off

- July expense/claim: expected $80. July 31 received $30: remaining $50, status `partially_paid`, realized net $50 below gross, expected responsibility excludes the collectible $50.
- September 1: user writes off the remaining $50 with a reason. Remaining becomes $0; status `written_off`; expected personal responsibility increases by $50 on September 1. Cash does not move.
- The original expense drill-down shows gross $80, received $30, written off $50, net personal $50, with dates. A September responsibility-activity view shows the $50 write-off; it must not silently rewrite a closed July snapshot.

### Example C: $60 inflow for a $50 remaining claim

- The confirmation draft may apply at most $50.
- The remaining $10 stays visibly unallocated on the reimbursement inflow. It may later be linked to another claim or explicitly reclassified.
- No claim becomes `overpaid`; no $10 adjustment or earned income is invented.

Recommended report lenses:

| View | Date basis | Purpose |
|---|---|---|
| Cash activity | Transaction posting/display date | What entered or left accounts. |
| Expense responsibility | Source allocation date, with selectable as-of date | Gross, expected personal, realized net, refunds, and outstanding tied to what was purchased. |
| Reimbursement activity | Payment-link or write-off effective date | Collections, unmatched inflows, and responsibility changes during a period. |

## 9. Refund distinction

A merchant refund is not a reimbursement. It reverses all or part of the original purchase; a reimbursement is payment by another responsible party. The existing movement types already distinguish them (`js/domain/models.js:6-10`), but there is no refund relationship model.

The eventual `RefundLink` should contain `id`, `refundTransactionId`, `allocationId`, `amountCents`, currency, source/confirmation metadata, void metadata, and timestamps. It should follow the same no-guessing and availability rules as payment links.

| Scenario | Required handling |
|---|---|
| Full merchant refund before repayment | Reduce gross expense to zero. Reduce/cancel affected claim allocation links atomically; no receivable remains. |
| Partial refund before repayment | Allocate refund cents to original allocations. Reduce claim expected only by the portion applied to claimed cents; leave other allocation responsibility intact. |
| Refund after partial/full reimbursement | Recompute entitlement. If received reimbursement would exceed adjusted expected, require explicit resolution: unlink/reallocate a payer payment or record a separate payer obligation. Never silently turn the excess into income or a negative claim. |
| Chargeback/card-dispute credit | Classify as `merchant_refund` with source metadata such as `dispute_credit`; link to the original allocation after confirmation. |
| Cashback/rewards | Classify as the appropriate other inflow, not a merchant refund, unless the user explicitly confirms a source-purchase reversal supported by the product policy. |

Refund-aware reporting must not ship until these interactions and tests exist. INF-001/002 and the PRD financial examples (pages 16, 23–24, and 39) require original-transaction traceability and exact non-duplicated measures.

## 10. Allocation-editing rules

All linked edits are one atomic transaction: build a draft, validate the future transaction/allocations/claim links/payment availability, display consequences, write audit events, validate the full domain, persist once, or restore the complete prior state. The current rollback pattern at `js/services/allocationService.js:236-272` should be retained.

| Edit | Before any repayment | After partial/full repayment |
|---|---|---|
| Change claimed amount | Allowed if positive, within allocation, and confirmed. Updates claim expected. | Allowed only when new expected is at least received + written off. Otherwise the user must first void/reallocate payments or reverse write-offs. |
| Mine → Reimbursable | Allowed; does not auto-create a claim. | Allowed only for the unlinked portion. |
| Reimbursable → Mine | Allowed after cancelling/unlinking the affected claim portion. | Block while received or written-off facts depend on it; require explicit resolution workflow. |
| Change bucket/child | Allowed; claim link follows the stable allocation ID. | Allowed with consequence confirmation; historical payment facts remain, reporting attribution updates and audit records the move. |
| Split a linked allocation | Allowed only if claim cents are explicitly redistributed among the replacement allocations and totals reconcile. | Same, but distributions cannot invalidate received/write-off totals. |
| Merge linked allocations | Allowed only when currency, transaction, ownership, and active-claim compatibility permit; rewrite link targets atomically. | Same constraints plus payment/write-off reconciliation. |
| Delete allocation/source transaction | No hard deletion while referenced. Cancel/unlink first, or retain a tombstone. | Prohibited. A provider removal/reversal marks the claim `needs_resolution` in a separate integrity flag and preserves evidence. |
| Edit pending transaction amount | Rebalance allocations and claim links in one draft. | If the reduced magnitude cannot cover received/write-off facts, retain the last valid facts and require resolution. |
| Archive source bucket | Allowed. | Allowed. Historical calculations and links remain valid; archived status only affects future selection. |

`needs_resolution` is an integrity/review flag on the affected transaction or claim projection, not a monetary lifecycle status. It blocks new payment links but preserves prior facts.

## 11. Migration plan

Proposed target schema: **7**, subject to implementation review. The migration must use the existing deterministic, clone-first, pre/post-validation runner (`js/domain/migrations.js:294-318`) and the state service’s validate-before-save boundary (`js/services/stateService.js:16-18`, `js/services/stateService.js:32-44`).

1. Add empty `reimbursementClaimAllocations`, `reimbursementPaymentLinks`, and `reimbursementAdjustments` collections, plus validated audit-event support.
2. Copy each schema-6 claim to a migration work item; never mutate the input object.
3. Copy payer label, note, due date, and timestamps exactly. Derive currency only when every referenced expense and repayment transaction has one identical known currency. Otherwise preserve as unresolved—do not assume USD.
4. Convert allocation relationships only when the cents are unambiguous:
   - One referenced allocation: its link may use `expectedAmountCents` only when that amount is positive, does not exceed the allocation, ownership is `reimbursable`, and both legacy pointers agree.
   - Multiple referenced allocations: convert only when full allocation amounts sum exactly to `expectedAmountCents`. Otherwise no per-allocation split can be truthfully inferred.
5. Convert each embedded repayment fragment to a stable standalone ID derived from claim ID, transaction ID, amount, and its stable occurrence index. Validate positive reimbursement movement, currency, duplicate/availability constraints, and total not exceeding expected.
6. Recompute status from canonical facts. Preserve the old stored status in migration metadata for forensic comparison; do not trust it as accounting input.
7. If any claim is ambiguous or invalid, preserve its entire original claim and related allocation-pointer facts under `legacyFoundation.unresolvedReimbursementClaims`, with a deterministic reason code. Do not create partial canonical facts that imply an invented balance.
8. In schema 7, stop using `allocation.reimbursementClaimId` and embedded claim arrays as active relationships. Preserve the source facts in the encrypted migrated state until a later, separately reviewed cleanup migration.
9. Sort generated records by deterministic ID before validation so output is byte-stable for identical input and timestamp.
10. Validate pre-migration state, every converted relationship, post-migration domain, repeat-run equality, and future-schema rejection. Persist the V2 vault only after success; the existing legacy-vault recovery behavior remains unchanged.

Legacy `shared` and `excluded` allocations are not claims. Preserve them as compatibility values and surface them for explicit review. Never invent payer labels, claimed cents, account identity, state, country, repayment links, refunds, or write-offs.

Rollback behavior: any conversion or persistence failure leaves the active encrypted vault unchanged and leaves the in-memory state at its pre-operation snapshot. The unresolved-record path is for truthfully ambiguous but structurally readable data; it is not a way to suppress validation failures.

## 12. Service architecture

Recommended ownership:

| Module | Responsibility |
|---|---|
| `js/services/reimbursementService.js` | Claim/payment/write-off drafts, formulas, suggestions, mutation validation, status projections, audit-event construction, snapshot rollback. |
| `js/services/allocationService.js` | Exact transaction allocation drafts. Delegates linked-edit policy and reconciliation; does not directly edit reimbursement collections. |
| `js/services/bucketService.js` | Joins read-only reimbursement/refund projections into bucket detail; never owns claim balances. |
| `js/state.js` or a future reporting service | Composes gross, cash, expected, realized, outstanding, and as-of views from service projections. |
| `js/services/stateService.js` | Final migration/validation and single encrypted persistence boundary. |
| `js/domain/models.js` | Shape and whole-domain invariants only; no UI decisions. |
| `js/domain/migrations.js` | Schema conversion and unresolved preservation only; no product automation. |
| `js/app.js` | Draft state, confirmation, rendering, and errors; no accounting formulas. |

Cross-domain allocation edits should use one reimbursement-aware orchestration function rather than one service persisting and then calling another. The persist callback occurs once after all in-memory collections validate. This preserves the current all-or-nothing allocation behavior (`js/services/allocationService.js:240-271`) and the repository boundary (`js/services/stateService.js:41-44`).

Read projections should be pure and accept an explicit `asOf` date. They must not update status merely because a claim became overdue.

## 13. UI workflows

These are future workflows, not current UI. Each begins from existing or PRD-specified surfaces and uses explicit confirmation.

### W1. Mark an allocation reimbursable without creating a claim

- **Entry/fields:** Split Editor ownership control; select `Reimbursable`, optional allocation note.
- **Validation/confirmation:** Existing allocation totals must balance. Explain “This marks responsibility but does not track a payer.” Normal Save confirmation is sufficient.
- **Transition/calculation:** Allocation becomes reimbursable; no claim status. Gross unchanged; untracked expected-from-others increases, conservative personal responsibility remains unchanged.
- **Cancel/error/audit:** Cancel restores draft. Persistence failure restores the full prior snapshot. Audit the ownership change, not a claim.

### W2. Create a claim from one reimbursable allocation

- **Entry/fields:** “Track reimbursement” action after allocation save or from allocation detail; payer label, claimed amount (default selected allocation cents), due date optional, note optional.
- **Validation/confirmation:** Positive amount ≤ allocation; unclaimed by another active claim; currency known; payer label required. Confirmation shows expected personal and outstanding effects.
- **Transition/calculation:** New claim `open`; claim-allocation link created. Gross unchanged; tracked expected personal falls by claimed cents; outstanding rises equally.
- **Cancel/error/audit:** Cancel creates nothing. Any validation/persist failure creates nothing. Audit claim and link creation.

### W3. Create one claim from several allocations

- **Entry/fields:** Shared Expenses action “Add expenses”; payer label, selected reimbursable allocations, claimed cents per allocation, due date/note.
- **Validation/confirmation:** Same currency, each link positive and within allocation, no competing active claim. Confirm itemized total.
- **Transition/calculation:** One `open` claim with multiple claim-allocation links; measures update per source allocation/bucket.
- **Cancel/error/audit:** Draft is disposable; atomic failure restores all collections. One event group references every created link.

### W4. Change payer label, due date, or note

- **Entry/fields:** Claim detail Edit; label, nullable due date, note.
- **Validation/confirmation:** Label non-empty, date valid. No monetary confirmation unless cents change.
- **Transition/calculation:** Status recalculates overdue flag only; monetary measures unchanged.
- **Cancel/error/audit:** Cancel discards. Save failure preserves prior metadata. Audit old/new fields without duplicating sensitive note text.

### W5. Increase or decrease an unpaid claim

- **Entry/fields:** Claim detail Edit amount or source allocation edit; per-allocation claimed cents.
- **Validation/confirmation:** Sum positive, within source allocations, and ≥ received + written off. Confirm responsibility/outstanding delta.
- **Transition/calculation:** Claim remains/recomputes `open`; expected and outstanding change; gross/cash unchanged.
- **Cancel/error/audit:** Invalid draft names the blocking allocation. Atomic rollback on failure. Audit per-link before/after cents.

### W6. Split or move an unpaid claimed allocation

- **Entry/fields:** Split Editor; replacement allocations plus explicit distribution of claimed cents.
- **Validation/confirmation:** Allocation total equals transaction magnitude and claim-link totals remain exact. Confirm bucket/report attribution changes.
- **Transition/calculation:** Stable claim preserved; links retargeted atomically; totals remain, bucket attribution may change.
- **Cancel/error/audit:** Cancel retains original rows. No partial replacement on error. Audit allocation and claim-link mapping.

### W7. Classify an unmatched inflow as reimbursement

- **Entry/fields:** Weekly review inflow action; movement type, date/account facts remain from transaction, optional note.
- **Validation/confirmation:** Positive amount and currency; no claim is selected yet. Confirm it will be excluded from earned income and await linking.
- **Transition/calculation:** Transaction movement becomes `reimbursement`; no claim changes; unallocated reimbursement amount equals transaction amount.
- **Cancel/error/audit:** Cancel leaves classification unchanged. Failed save rolls back. Audit manual override/classification source.

### W8. Accept a suggested full repayment match

- **Entry/fields:** Unmatched inflow or claim detail; selected suggestion and applied amount.
- **Validation/confirmation:** Claim active, currency equal, amount ≤ claim remaining and inflow available. Show reasons/confidence and require Confirm.
- **Transition/calculation:** Payment link created; claim becomes `settled`; received rises, remaining falls, realized net updates at source allocation, cash stays on inflow date.
- **Cancel/error/audit:** Dismiss suggestion writes nothing. Stale suggestion revalidates and errors safely. Audit suggestion and user confirmation.

### W9. Apply one inflow partially to a claim

- **Entry/fields:** Inflow distribution editor; claim and applied cents.
- **Validation/confirmation:** Positive and within both availabilities. Confirm remaining claim and inflow amounts.
- **Transition/calculation:** Link created; claim `partially_paid`; received/remaining update by applied cents.
- **Cancel/error/audit:** No link on cancel. Roll back on failure. Audit exact applied amount.

### W10. Split one inflow across several claims

- **Entry/fields:** Inflow distribution editor; rows of claim and amount.
- **Validation/confirmation:** Unique row IDs, same currency, row caps, row sum ≤ inflow; confirmation itemizes claims and leftover.
- **Transition/calculation:** Several links created atomically; each claim status recalculates; unallocated inflow remainder remains visible.
- **Cancel/error/audit:** Any invalid row blocks the whole save. Persistence failure restores every claim/link. Audit one operation group plus each link.

### W11. Record a manual repayment

- **Entry/fields:** Claim action “Record repayment”; amount, date, account or explicit Unknown, optional note.
- **Validation/confirmation:** Positive, same currency, amount ≤ remaining; confirm that a manual inflow transaction and link will be created.
- **Transition/calculation:** Manual reimbursement transaction plus payment link written atomically; cash and claim projections update on their respective date bases.
- **Cancel/error/audit:** Cancel creates neither record. If either record fails, neither persists. Audit manual source and link.

### W12. Handle an overpayment-sized inflow

- **Entry/fields:** Distribution editor for inflow larger than claim remaining.
- **Validation/confirmation:** Applied amount is capped at remaining. UI explicitly shows excess unallocated and offers other eligible claims.
- **Transition/calculation:** Claim settles; excess remains on inflow, excluded from earned income until explicitly reclassified.
- **Cancel/error/audit:** User may cancel the entire draft. Attempts to over-apply are validation errors. Audit only confirmed links.

### W13. Void or correct a repayment link

- **Entry/fields:** Claim/inflow link detail; replacement amount or Void, required reason.
- **Validation/confirmation:** Revalidate downstream write-offs and claim availability. Confirm status and balance reversal.
- **Transition/calculation:** Old link voided; optional replacement link created; claim may reopen. Cash transaction is unchanged.
- **Cancel/error/audit:** Cancel changes nothing. Atomic failure preserves old active link. Audit reason and before/after link facts.

### W14. Write off all or part of a claim

- **Entry/fields:** Claim action “Write off”; amount default remaining, required reason, effective date.
- **Validation/confirmation:** Positive ≤ remaining; confirm that responsibility transfers to the user and cash does not move.
- **Transition/calculation:** Adjustment appended; remaining falls; status becomes `written_off` if zero, otherwise remains open/partially paid; expected personal responsibility rises on effective date.
- **Cancel/error/audit:** Cancel writes nothing. Failure leaves claim unchanged. Adjustment itself is the audit fact plus an operation event.

### W15. Cancel a claim created in error

- **Entry/fields:** Claim action Cancel; required reason.
- **Validation/confirmation:** No active payments or write-offs; user must resolve them first. Confirm outstanding tracking will be removed without a write-off.
- **Transition/calculation:** `cancelledAt` set; active claim allocation links cease contributing. Conservative personal responsibility includes the formerly claimed cents.
- **Cancel/error/audit:** Back keeps claim active. Failure rolls back. Audit cancellation reason; do not delete claim.

### W16. Edit a claimed allocation after repayment

- **Entry/fields:** Split Editor from weekly or bucket detail; allocation/bucket/ownership changes and claim-link redistribution.
- **Validation/confirmation:** Future expected must cover received + written off, ownership must remain compatible, totals/currency exact. Confirm historical attribution changes.
- **Transition/calculation:** Valid edits persist atomically; received cash facts remain; source-bucket realized and expected projections update.
- **Cancel/error/audit:** Blocking error offers link correction, not data loss. Cancel/restored persistence failure retains all prior facts. Audit grouped edit.

### W17. Link a merchant refund before repayment

- **Entry/fields:** Refund transaction review; original allocation(s), refund cents per allocation.
- **Validation/confirmation:** Movement `merchant_refund`, same currency, available refund ≤ inflow and original gross, claim expected remains ≥ received + written off. Confirm claim reduction.
- **Transition/calculation:** Refund links and compatible claim-link reductions persist atomically; gross, expected, realized, outstanding update; earned income unchanged.
- **Cancel/error/audit:** Ambiguous allocation stays unmatched. Invalid interactions require resolution. Audit refund and claim consequences.

### W18. Reconcile a reversed inflow or removed source transaction

- **Entry/fields:** Integrity queue opened by import/reconciliation; affected transaction, links, claims, suggested recovery actions.
- **Validation/confirmation:** System may mark resolution-needed automatically but must require confirmation before replacement/reclassification. Preserve original IDs and facts.
- **Transition/calculation:** Reversed repayment links stop contributing and claims reopen; removed expense sources keep tombstones and block new claim activity until resolved.
- **Cancel/error/audit:** User may defer resolution; state remains valid and flagged. Failed reconciliation restores prior active facts. Audit provider status, automated flag, and confirmed resolution separately.

Every future screen needs loading, empty, stale-state, validation, persistence-failure, and retry states. No workflow may treat a suggested payer, source transaction, account, location, or amount split as confirmed data.

## 14. Validation matrix

| Layer | Required checks | Failure behavior |
|---|---|---|
| Entity | IDs, timestamps, enum values, ISO currency, nullable fields, safe integer cents, required reasons | Reject draft; no state mutation. |
| Claim allocation | Existing active claim/allocation; expense movement; reimbursable ownership; same currency; positive amount ≤ allocation; at most one active claim per allocation | Block create/edit and identify the conflicting record. |
| Payment link | Existing active claim and positive reimbursement inflow; same currency; positive; unique ID; active-link sum ≤ inflow; amount ≤ claim remaining | Block whole distribution; preserve unmatched inflow. |
| Adjustment | Existing claim; allowed type; positive amount ≤ remaining; required reason/effective date; valid reversal target | Reject; do not rewrite claim balance. |
| Lifecycle | Cancellation has no active payments/write-offs; derived status equals facts; overdue is derived; no hard deletion | Reject invalid domain before persistence. |
| Reporting | No double counting; reimbursement/refund excluded from income; cash uses transaction date; responsibility uses source links and as-of; stable residual-cent attribution | Fail tests/build; do not silently omit unresolved records. |
| Migration | Pre/post domain validity; deterministic IDs/order/time; idempotent rerun; no input mutation; ambiguous claims preserved; future versions rejected | Leave active vault unchanged and report actionable reason. |
| Persistence | Full reimbursement-aware validation before save; one active vault/repository; rollback on encrypt/storage error; restore verifies before replacement | Restore in-memory snapshot and retain prior encrypted vault. |
| Unknown data | No inferred payer/account/location/currency/refund/source match; manual override source recorded | Preserve null/unknown and require confirmation. |

## 15. Test strategy

### Automated domain and service tests

- Accept every target entity and reject unsafe money, timestamps, currency, IDs, duplicate links, missing references, non-expense claims, non-reimbursement payments, and fabricated fields.
- Verify one claim/many allocations, partial allocation coverage, one inflow/many claims, many payments/one claim, residual-cent attribution, same-currency enforcement, and cross-claim inflow availability.
- Verify every lifecycle transition, partial and full write-off, write-off reversal, cancellation restrictions, link void/replacement, overdue overlay, and derived-status consistency.
- Verify overpayment attempts are rejected and excess inflow remains unallocated.
- Verify allocation edits before and after repayment, split/merge, bucket moves, archives, pending amount changes, source reversal/removal, and full snapshot rollback.
- Verify full and partial refund interactions, reimbursement-before-refund conflicts, dispute credits, and rewards not treated as refunds before refund-aware reporting ships.
- Verify the three timing views with PRD examples, including cross-month receipt, late write-off, earned income exclusion, gross/expected/realized/outstanding formulas, and no negative repayment-month spend.

### Migration, vault, and compatibility tests

- Schema-6 empty claim collection; safe one-allocation claim; safe multi-allocation full-sum claim; partial ambiguous multi-allocation claim; duplicate embedded repayments; over-applied repayment; mixed currency; missing references; legacy contradictory status.
- Exact repeat migration equality, no input mutation, deterministic timestamps/IDs/order, unresolved-record idempotency, and rejection of future schemas.
- Wrong password, corrupted vault, interrupted temp write, failed final promotion, invalid pre/post state, failed restore, failed encryption/storage, and repeated unlock after migration. The prior active V2 vault and legacy recovery vault must remain untouched on failure.
- Reload encrypted schema 7 and confirm claims, links, adjustments, audit events, legacy unresolved records, V1 custom transaction fields/categories/rules/debts/goals/destinations/preferences/monthly data, and schema-6 compatibility evidence survive exactly.
- Preserve current V1 behavior, Bucket Explorer, allocation editing for unclaimed transactions, and current tests. The active-vault guarantees documented by `js/services/stateService.js:27-59` remain mandatory.

### Browser smoke and acceptance scenarios

- Create, edit, partially pay, fully pay, split a payment, write off, cancel, and correct a claim with page reload after each save.
- Confirm every consequence dialog, validation message, cancel path, empty state, stale draft, and simulated persistence failure.
- Confirm weekly review, Split Editor, bucket detail, monthly overview, backup/restore, vault lock/unlock, and V1 CSV behavior are unchanged where reimbursement is not involved.
- Confirm unmatched reimbursement inflows are not income; late repayments appear in reimbursement activity and update source-expense realized net without negative repayment-month spend.
- Confirm unknown account/location and payer label remain explicit and no matching suggestion writes without confirmation.

Tests should use synthetic fixtures only. No production-like personal transactions, payer names, vault passphrases, or provider payloads belong in the repository.

## 16. Security considerations

- All claims, payer labels, notes, payment links, write-off reasons, and audit records remain inside the existing encrypted vault. No second store or unencrypted reimbursement cache is permitted.
- Do not include payer labels, notes, merchant details, or amounts in local-storage keys, URLs, console logs, thrown stack metadata intended for telemetry, or browser history.
- Use the existing repository/state-service boundary so there is one active vault and verified restore behavior (`js/services/stateService.js:13-64`).
- Suggestions operate locally on decrypted in-memory state and are non-mutating until confirmation. No third-party identity lookup is required.
- Audit events should retain the least content needed to reconstruct monetary changes; they should reference records instead of copying full transaction payloads.
- Manual repayment entry must not invent an account. Use a user-selected account or explicit unknown account. Location remains null unless sourced or manually overridden (`js/domain/models.js:106-127`, `js/domain/models.js:326-342`).
- Import/reconciliation failures must not expose decrypted state in error text. Corrupt or wrong-password behavior remains indistinguishable at the UI level where appropriate.
- No Plaid code, credentials, sync, or network matching is part of this design.

## 17. Decision table

The following product decisions were approved on 2026-07-31 and are now implementation requirements, not open questions.

| Decision | Approved V2A contract | Status | Why |
|---|---|---:|---|
| Claim creation | Explicit “Track reimbursement”; never automatic from ownership | **APPROVED** | Defines when a receivable becomes authoritative and affects planning. |
| Allocation-to-claim cardinality | One allocation may belong to at most one active claim | **APPROVED** | Prevents double-counting a receivable. |
| Claim-to-allocation cardinality | One claim may cover multiple allocations | **APPROVED** | Supports the PRD's multi-expense claim workflow. |
| Payer representation | Required payer label; no payer entity in V2A | **APPROVED** | Least privacy/identity complexity and lossless future migration. |
| Untracked reimbursable allocation | Do not create a claim; include conservatively in personal responsibility and show separately as untracked expected-from-others | **APPROVED** | Ownership metadata alone has no confirmed payer or due amount. |
| Expected, realized, and cash presentation | Budget screens lead with expected personal spending; cash screens lead with actual cash movement; expense detail shows expected and realized values | **APPROVED** | Resolves PRD ADR-006 without conflating responsibility and cash. |
| Overpayment | Cap claim application at remaining; keep excess inflow visibly unallocated | **APPROVED** | Avoids invented adjustments and hidden income classification. |
| Write-off | Append a reasoned adjustment; convert to personal responsibility on its effective date; create no cash movement | **APPROVED** | Preserves timing and auditability. |
| Linked allocation edits | Permit only through atomic reconciliation; never leave allocations, claims, payments, or adjustments partially updated | **APPROVED** | Protects cross-entity integrity and rollback behavior. |
| Refund interaction | Use a separate `RefundLink` model and reconcile its source-allocation and claim effects explicitly | **APPROVED** | Merchant refunds reverse purchases; reimbursements settle another party's responsibility. |
| Unmatched reimbursement inflow | Exclude from earned income and keep unresolved until the user confirms a link or reclassification | **APPROVED** | Prevents guessed income and repayment matches. |
| Legacy `shared`/`excluded` | Preserve exactly; never infer claims, payer labels, or collectible amounts | **APPROVED** | Existing meaning is insufficient for a collectible claim. |
| Multiple currencies | Reject cross-currency claims and payment links in V2A | **APPROVED** | No exchange-rate source or realized-FX policy exists. |
| Late repayment reporting | Update the original expense's as-of personal-cost view; show reimbursement activity, never negative spending, in the receipt month | **APPROVED** | Preserves source responsibility and receipt-period cash activity. |

## 18. Open risks

The product-decision blockers identified in the original review are resolved by the approvals in section 17. The remaining risks are engineering or future-scope concerns:

1. **Ambiguous schema-6 claims:** the current embedded model has no per-allocation cents. Safe migration is impossible for some multi-allocation records. The unresolved encrypted compatibility record is intentional; a repair UI or documented manual recovery path will eventually be needed.
2. **Refund dependency:** realized net is incomplete without refund links. Do not label a report “net spend” if it only subtracts reimbursements.
3. **Mixed-purpose inflows:** without general inflow allocations, a payment partly reimbursement and partly another inflow cannot be fully classified. V2A keeps the residual unresolved under the approved unmatched-inflow policy.
4. **Imported transaction reversals:** current sources are manual/CSV/migration, but pending/removed statuses already exist (`js/domain/models.js:4-5`, `js/domain/models.js:106-127`). Reconciliation policy must be complete before future sync.
5. **Historical restatement:** the approved as-of projections are safe, but closed-period snapshots and tax/accounting exports are not defined. UI language must not imply immutable accounting periods.
6. **Audit growth and privacy:** append-only facts increase vault size and retain payer labels/reasons. Retention and redaction rules are not yet specified.
7. **Legacy ownership:** `shared` could mean several things and `excluded` may represent non-spend. The approved policy preserves both and prohibits automatic conversion.
8. **Concurrency/stale drafts:** the app is local, but two tabs can still create stale distributions. Revalidate against the latest decrypted state immediately before save and reject stale versions.
9. **No implemented workflow yet:** the current claim-linked edit guard is safe but coarse (`js/services/allocationService.js:243-247`). Removing it before atomic reconciliation exists would be a regression.

## 19. Proposed implementation phases

Each phase should be a small reviewable change set; no phase starts Plaid or transaction import.

0. **Product decisions — COMPLETE.** The approved contracts are recorded in section 17.
1. **Schema-7 models and migration.** Add standalone link/adjustment/audit validators, deterministic safe conversion, unresolved preservation, idempotency, and encrypted-vault migration tests. No UI and no reimbursement mutations.
2. **Pure reimbursement projections.** Implement formulas, derived status/overdue, inflow availability, deterministic attribution, and timing tests. Wire nothing user-facing.
3. **Claim lifecycle service.** Create/edit/cancel/write-off/reverse operations with grouped audit events, full-domain validation, one persistence call, and rollback tests. Keep existing UI unchanged.
4. **Allocation reconciliation.** Replace the blanket linked-allocation guard with atomic claim-aware edit plans. Add service and regression tests before exposing controls.
5. **Payment-link service.** Add unmatched-inflow drafts, manual repayment transactions, suggestion generation, confirmation, distributions, void/correction, reversal handling, and vault reload tests. Suggestions remain read-only.
6. **Minimal coherent UI.** Add Track Reimbursement from Split Editor, claim detail/status, and confirmed payment distribution using the existing application style. Include cancel/error/stale states and browser tests. Do not add unrelated screens.
7. **Refund domain phase.** Implement RefundLink, claim/refund conflict resolution, calculations, migration defaults, and tests before refund-aware net reporting.
8. **Reporting integration.** Add clearly named gross, expected, realized, outstanding, and reimbursement-activity projections with drill-down traces and approved date semantics.
9. **Acceptance and hardening.** Run full automated/browser/vault recovery suites, accessibility checks, manual PRD scenarios, and production-branding scan; update status only after evidence passes.

## 20. Proposed acceptance criteria

Phase 3 implementation is acceptable only when all applicable criteria pass:

1. Schema 7 is deterministic, idempotent, clone-first, pre/post validated, and rejects future schemas.
2. Every safely convertible schema-6 claim preserves payer label, note, dates, allocation IDs, repayment transaction IDs, amounts, timestamps, and legacy status evidence.
3. Every ambiguous claim is preserved encrypted with a deterministic unresolved reason; no cents, currency, payer, account, location, or link are fabricated.
4. V1 state and all schema-6 non-reimbursement data survive migration byte-equivalently where the migration does not intentionally normalize a field.
5. The active-vault and encrypted legacy recovery guarantees remain unchanged on success and every tested failure.
6. Claims use standalone allocation/payment links and append-only adjustments/audit events; embedded relationships are not active sources of truth.
7. One allocation cannot contribute to two active claims, and no claimed cents exceed its allocation.
8. Payment links cannot exceed claim remaining or inflow availability across claims.
9. Cross-currency relationships are rejected and unknown currency is never defaulted during claim migration.
10. Claim status and overdue are derived from authoritative facts and cannot contradict totals/dates.
11. Partial payment, full settlement, write-off, reversal, cancellation, correction, and overpayment-sized inflow scenarios produce exact cent results.
12. Excess inflow remains unallocated; no claim overpayment, adjustment, or earned income is invented.
13. Reimbursements and merchant refunds never count as earned income.
14. Late repayment does not create negative spending in the repayment month; all cash, source-expense, and reimbursement-activity views trace to exact transactions and links.
15. Marking an allocation reimbursable does not automatically create a claim or payer.
16. Every match suggestion is non-mutating and every payment/refund link requires confirmation.
17. Manual repayment creates a canonical manual reimbursement inflow and link atomically, using a selected or explicitly unknown account.
18. Linked allocation edits reconcile every affected record atomically and restore the full snapshot on any validation or persistence failure.
19. Referenced records are cancelled, voided, reversed, or tombstoned—not hard-deleted.
20. Archived buckets retain history and do not invalidate claims or calculations.
21. Full/partial refunds and refund-after-reimbursement conflicts pass before net-spend reporting claims refund completeness.
22. Payer labels, notes, and audit reasons remain inside the encrypted vault and are absent from storage keys, URLs, and logs.
23. Empty, loading, stale, cancel, invalid, persistence-failure, and retry states pass browser acceptance.
24. Existing V1 workflows, Bucket Explorer, two-level buckets, unclaimed allocation editing, vault lock/unlock, backup/restore, and branding continue to pass.
25. `pnpm test`, `pnpm run check`, `python3 -m py_compile start.py`, the available browser smoke tests, and `git diff --check` all pass for the implementation change set.

## Review validation

| Command/check | Result |
|---|---|
| `pnpm test` | **PASS** — 48 tests, 48 passed, 0 failed, 0 skipped, 0 cancelled. Duration reported by Node: 1655.803125 ms. |
| `pnpm run check` | **PASS** — all nine configured JavaScript syntax checks exited 0. |
| `python3 -m py_compile start.py` | **PASS** — exited 0 with no output. The generated bytecode artifact was removed after validation. |
| `git diff --check` | **PASS** — exited 0 with no output before and after the final documentation update. |
| `python3 start.py --port 18893` | Initial sandboxed bind reported the port unavailable; the approved local-server rerun **PASS** — the app served on `http://127.0.0.1:18893/` and stopped cleanly after the smoke test. This was an environment restriction, not a diagnosed application failure. |
| Available browser smoke workflow | **PASS** — with a fresh synthetic encrypted vault: canonical `Money Moves` title/branding; vault creation; Weekly Review navigation; Split Editor open and cancel without a save; Bucket Explorer navigation; lock/unlock persistence; 0 console warnings and 0 console errors. The server’s only 404 was the optional `favicon.ico`; it produced no console issue and did not affect the app. |

No separate scripted browser-test target exists in `package.json` (`package.json:6-9`), so the available browser coverage was run interactively against the loopback server. No production files or tests were changed by this review; only this design document and `docs/engineering/IMPLEMENTATION_STATUS.md` are in scope.
