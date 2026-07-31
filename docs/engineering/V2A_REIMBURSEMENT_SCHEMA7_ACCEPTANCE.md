# Money Moves V2A Phase 3A — Schema 7 Reimbursement Foundation Acceptance

## 1. Scope

This was an independent acceptance and hardening review of the schema-7 reimbursement foundation. The review covered the authoritative PRD, the approved reimbursement design, prior V2A acceptance reports, all production validators/callers, the schema-6-to-7 migration, encrypted persistence/recovery, synthetic fixtures, and browser regressions. The PRD requirements reviewed include REV-006, RMB-001 through RMB-005, INF-001/002, the canonical/logical models, migration rules, scenarios, invariants, and definition of done (`docs/Money_Moves_Product_Requirements_Document_v1.0.docx`, pages 10–16, 22–26, 31–32, 37, and 39–41).

No reimbursement screen, claim/payment/write-off API, Shared Expenses feature, refund link, reporting integration, import change, bank sync, Plaid code, or frontend framework was added. Reimbursements remain a product workflow marked **NEEDS IMPLEMENTATION** (`docs/engineering/IMPLEMENTATION_STATUS.md:14`).

Evidence labels in this report mean:

- **Production:** executable application behavior.
- **Verified:** directly inspected and exercised by automated or browser tests.
- **Test-only:** synthetic harness behavior, not a production API.
- **Assumption:** not proven against genuine user data.

## 2. Base revision reviewed

Base revision: `669f0a51eac05495fa0f06a140d91495d91708c4` (`v2a-phase3a-schema7-candidate`).

The acceptance changes are limited to defects in `js/domain/models.js`, `js/domain/migrations.js`, `js/services/allocationService.js`, and the V1-compatible destination projection in `js/state.js`; synthetic fixtures/tests; this report; and implementation-status documentation.

## 3. Decision

**ACCEPTED WITH LOW-RISK FOLLOW-UP.**

No Critical, High, or Medium defect remains open. The follow-up is low risk because the complete vault matrix used synthetic encrypted data as required; no genuine historical vault was supplied or inspected. The future repair workflow for intentionally unresolved schema-6 evidence is also not part of Phase 3A (`docs/engineering/V2A_REIMBURSEMENT_DESIGN_REVIEW.md:565-572`).

## 4. Primary acceptance-question answer

**PASS — verified with synthetic schema-6 evidence.** Every tested source claim now produces exactly one of:

1. one complete canonical claim plus every valid standalone allocation/payment relationship; or
2. one deterministic unresolved record and no canonical claim, claim-allocation link, payment link, or conversion audit assertion for that claim.

The migration gathers pointer, allocation, currency, repayment, capacity, cancellation, and collision findings before commit (`js/domain/migrations.js:462-587`), builds candidate records locally (`js/domain/migrations.js:589-613`), then commits them together only after collision checks (`js/domain/migrations.js:614-626`). Whole-state post-validation is mandatory before migrated state is returned (`js/domain/migrations.js:651-675`) and before persistence (`js/services/stateService.js:16-18,32-44`).

Unsupported facts are not promoted to payer identity, account, location, currency, refund, write-off, or canonical lifecycle status. Payer labels are copied only when present; malformed/unknown currencies become `null` in the target transaction only after exact compatibility capture and force `unknown_currency` (`js/domain/migrations.js:402-435,473-519`). No adjustment or refund relationship is created by migration (`js/domain/migrations.js:428-432`).

## 5. Implementation inventory

| Area | Production implementation | Acceptance result |
|---|---|---|
| Schema/version registration | `STATE_SCHEMA_VERSION = 7` (`js/domain/constants.js:1-3`); ordered migration registry and version loop (`js/domain/migrations.js:5-12,651-675`). | **Verified.** Future versions reject; schema 7 reruns unchanged. |
| Claim model | Strict target allowlist, payer label, currency, nullable due date/note, paired cancellation, timestamps, and legacy-field rejection (`js/domain/models.js:213-231`). | **Verified.** No payer/account/location extras accepted. |
| Claim-allocation model | Positive cents and stable references at entity level (`js/domain/models.js:234-240`), with cross-store ownership, expense, currency, amount, cardinality, and active-claim checks (`js/domain/models.js:503-526`). | **Verified.** One claim/many allocations and partial coverage work; one allocation/two claims fails. |
| Payment-link model | Approved source and paired void metadata (`js/domain/models.js:243-257`), plus inflow direction/type/currency/capacity/duplicate checks (`js/domain/models.js:528-550`). | **Verified.** Active duplicates fail; duplicate voided history is allowed and contributes zero. |
| Adjustment model | Only write-off/reversal shapes (`js/domain/models.js:260-274`), relationship, chronology, reversal, capacity, cancellation, and non-negative-balance rules (`js/domain/models.js:552-597`). | **Verified.** No transaction/cash record is generated. |
| Audit event | Strict field allowlist, source enum, timestamp, unique related IDs, and compact safe-integer cent facts (`js/domain/models.js:277-309`). | **Verified.** Invalid or unresolved legacy events remain only in encrypted compatibility evidence (`js/domain/migrations.js:378-393,397-423,634`). |
| Projections | Expected, received, effective write-off, remaining, derived status, and overdue (`js/domain/models.js:427-487`). | **Verified.** Pure, as-of aware, and independent of legacy status. |
| Compatibility stores | Full schema-6 claim/audit/pointer/currency snapshots plus deterministic unresolved records (`js/domain/migrations.js:360-423`). | **Verified.** Deprecated pointers are cleared only after capture (`js/domain/migrations.js:629`). |
| Authority | Canonical standalone reimbursement collections are validated together (`js/domain/models.js:600-627`); deprecated allocation pointers are invalid in schema 7 (`js/domain/models.js:497-500`). | **Verified.** Production scans found legacy embedded fields read only inside migration compatibility logic (`js/domain/migrations.js:353-370,407-410,480-487,522-523`). |
| Allocation guard | Saves consult canonical claim-allocation relationships and rollback on any error (`js/services/allocationService.js:237-274`). | **Verified.** No claim mutation API was introduced. |
| State service | Pre/post migration/domain validation precedes create, unlock, save, passphrase change, and restore persistence (`js/services/stateService.js:7-18,27-59`). | **Verified.** Invalid state never reaches the active vault. |
| Vault | V2 active record is authoritative; legacy is considered only when active/temporary V2 is absent (`js/vault.js:27-51`). AES-GCM/PBKDF2 compatibility and verified temporary promotion are retained (`js/vault.js:68-111,127-180`). | **Verified.** One active source, legacy recovery retained, atomic retry paths pass. |
| UI callers | Existing screens display reimbursable ownership but contain no claim workflow (`js/app.js:248,440-441`). | **Verified by source scan and browser smoke.** |

## 6. Findings and corrections

| ID | Severity | Original behavior and risk | Correction | Tests/result |
|---|---|---|---|---|
| F-01 | High | A one-sided legacy pointer or generated relationship-ID collision could either promote unsupported claim facts or fail the whole migration instead of preserving the affected claim. Financial risk: fabricated receivable or blocked recovery. | Both pointer directions now require agreement; every source claim ID reserves the relationship namespace; candidate relationships commit only after collision checks (`js/domain/migrations.js:455-487,558-625`). | Whole-claim pointer, malformed fragment, real FNV collision, competing allocation, and claim-ID/link-ID collision cases pass (`test/reimbursement-schema7.test.js:295-333`). |
| F-02 | Medium | Generated unresolved/payment identities could depend on source-array or object-key order. Risk: non-repeatable evidence and capacity winner selection. | Stable object serialization, semantic sorting, stable occurrences, claim-ID ordering, and final collection sorting govern output (`js/domain/migrations.js:37-68,445-459,527-534,629-634`). | Reordered claims, allocations, transactions, allocation IDs, and repayments are byte-equivalent for canonical/unresolved outputs (`test/reimbursement-schema7.test.js:335-365`). |
| F-03 | Medium | Malformed schema-6 transaction currency could be rejected before migration or normalized without exact source evidence. Recovery risk: unrepairable currency ambiguity. | Legacy prevalidation permits malformed currency only as migration input; exact field presence/value is snapshotted before target normalization; no USD default is used (`js/domain/models.js:173-181,600-626`; `js/domain/migrations.js:402-435,506-513`). | Lowercase `usd` remains exact in compatibility, becomes target `null`, and yields `unknown_currency` with no claim (`test/reimbursement-schema7.test.js:166-176`). |
| F-04 | Medium | Malformed audit collections/events, or migration assertions tied to unresolved evidence, could be silently dropped or remain active. Recovery/privacy risk: lost evidence or false conversion assertion. | Raw audit evidence is captured before initialization; only structurally valid events unrelated to unresolved migration entities stay active (`js/domain/migrations.js:378-423,634`). | Invalid object-shaped audit data and unsafe events survive exactly in compatibility while active audit remains empty (`test/reimbursement-schema7.test.js:486-515`). |
| F-05 | Medium | Target claims rejected known schema-6 authority fields but allowed other unknown payer/account/location-like fields. Risk: accidental fabricated identity or second source of truth. | Target claim fields now use an exact allowlist (`js/domain/models.js:213-230`). | Identity, institution, account, state, and country extras all reject (`test/reimbursement-schema7.test.js:215-229`). |
| F-06 | Medium | Deprecated `allocation.reimbursementClaimId` could influence edit guards or coexist with canonical authority. Risk: false block, bypass, or dual-source behavior. | Schema 7 rejects non-null deprecated pointers; allocation saves always persist `null`; edit guards use only canonical relationships (`js/domain/models.js:497-500`; `js/services/allocationService.js:203-223,245-249`). | Claimed edit blocks; unclaimed edit succeeds; deprecated pointer cannot trigger/bypass authority (`test/reimbursement-schema7.test.js:528-557`). |
| F-07 | Medium | As-of projections did not consistently filter payment/effective adjustment dates, and reversal effective chronology was incomplete. Risk: historically inaccurate personal-cost views. | Received/payment and write-off facts are filtered by effective date; reversal creation/effective chronology and deterministic capacity order are enforced (`js/domain/models.js:427-466,552-595`). | Before/after payment and write-off dates, purity, and invalid reversal chronology pass (`test/reimbursement-schema7.test.js:387-458`). |
| F-08 | Low | Duplicate detection treated voided historical payment links like active authority. Risk: rejecting valid correction history. | Only identical active relationships are duplicates; paired voided records remain history and count as zero (`js/domain/models.js:528-545`). | Two identical voided records validate and project zero received (`test/reimbursement-schema7.test.js:256-293`). |
| F-09 | Low | Browser smoke found a preserved V1 destination without `bestMonths` caused `rankedDestinations` to throw. Regression risk: Travel screen failure after otherwise safe vault migration. | Ranking now treats missing optional ranking metadata conservatively as neutral rather than fabricating it (`js/state.js:360-376`). | Regression test passes (`test/state-compatibility.test.js:44-50`); final Travel smoke has zero warnings/errors. |
| F-10 | Informational | Recovery tests asserted failure but did not always prove the prior active vault was still usable afterward. | Acceptance tests now unlock the preserved vault after wrong-password, corrupted-ciphertext, failed restore, and failed temporary-verification paths (`test/vault-migration.test.js:32-45,88-125,277-300`). | All vault recovery tests pass. No production change required. |

All findings are resolved in this change set. There is no hidden material defect delegated to compatibility storage.

## 7. Safe versus unresolved fixture counts

The independent headline matrix produces **8 safe canonical conversions** and **19 unresolved records** (`test/reimbursement-schema7.test.js:120-164`). The 19 count includes two unresolved records from the duplicate-identifier fixture. Additional adversarial acceptance fixtures for one-sided pointers, malformed repayment fragments, generated-ID collisions, allocation competition, reordered arrays, and audit corruption are deliberately outside that headline count (`test/reimbursement-schema7.test.js:295-365,502-515`).

This count corrects the candidate implementation report's pre-hardening total. It is a **test-only synthetic count**, not an estimate of user data.

## 8. All-or-nothing conversion evidence

- Missing allocations, pointer disagreement, one-sided pointers, non-reimbursable ownership, ambiguous multi-allocation totals, missing/wrong repayment transactions, invalid/duplicate/over-capacity repayments, mixed/unknown currency, duplicate claims, and generated-ID collisions all produce unresolved evidence (`js/domain/migrations.js:462-587,613-617`; `test/reimbursement-schema7.test.js:120-176,295-333`).
- Unsafe-fixture assertions require zero canonical claims, claim-allocation links, and payment links, one or more expected unresolved records, the expected reason code, and a valid target domain (`test/reimbursement-schema7.test.js:134-144`).
- Audit filtering prevents a migration event from falsely asserting conversion for an unresolved claim, allocation, or repayment (`js/domain/migrations.js:378-393`; `test/reimbursement-schema7.test.js:502-515`).
- Original claims, relevant allocation-side pointers, repayment fragments, status, timestamps, notes, and source schema remain in compatibility records (`js/domain/migrations.js:360-375,396-423`).
- Cancellation is not inferred from status alone. Only complete timestamp/reason evidence with no payment links becomes canonical cancellation (`js/domain/migrations.js:589-605`; `test/reimbursement-schema7.test.js:178-197`). A safe cancelled claim intentionally has no active allocation links; original expected/allocation facts remain in the encrypted schema-6 snapshot.

## 9. Determinism and idempotency evidence

**Verified:** migration clones its input (`js/domain/migrations.js:651-653`); stable serialization sorts object keys and semantically unordered embedded arrays (`js/domain/migrations.js:37-68`); claims and repayments use explicit stable order (`js/domain/migrations.js:445-459,527-534`); generated target and unresolved collections are sorted (`js/domain/migrations.js:629-634`). With the same input/timestamp, output is deeply equal; source-array reorder does not change semantic output (`test/reimbursement-schema7.test.js:81-95,335-365`).

Migration history is appended only when an ID is absent (`js/domain/migrations.js:661-669`), and schema-7 input has no migration step to rerun. Future schema versions reject before mutation (`js/domain/migrations.js:651-658`; `test/reimbursement-schema7.test.js:211-213`). Repeated encrypted unlock selects the active V2 record and does not rewrite it (`js/vault.js:34-51`; `js/services/stateService.js:32-39`; `test/vault-migration.test.js:206-218`). Competing claims are ordered by stable claim ID/semantic key, so the same safe claim wins inflow capacity deterministically (`js/domain/migrations.js:445-459,576-580`; `test/reimbursement-schema7.test.js:147-155`).

## 10. Compatibility preservation evidence

The encrypted compatibility snapshot records source schema, migration timestamp, original claims, allocation pointers, exact transaction currency facts, and raw audit evidence (`js/domain/migrations.js:396-423`). Each unresolved record adds the complete original claim, relevant bidirectional pointer facts, repayment fragments, legacy status, sorted reason codes, and source schema (`js/domain/migrations.js:360-375`). If a preexisting reimbursement snapshot exists, it is retained separately before the actual schema-6 source snapshot is written (`js/domain/migrations.js:412-423`).

Deprecated pointers are nulled only after all claims are processed and evidence is captured (`js/domain/migrations.js:629`). Active projections read only canonical standalone collections (`js/domain/models.js:440-466`); unresolved evidence cannot join totals. Malformed audit and currency evidence is preserved rather than removed (`test/reimbursement-schema7.test.js:166-176,502-515`). Synthetic encrypted lock/unlock preserves canonical relationships and the schema-6 compatibility snapshot (`test/vault-migration.test.js:220-239`).

Validation errors identify structural paths/IDs but do not log transaction descriptions, payer labels, notes, accounts, or location facts. No production `console` statement was added. **Assumption:** exact preservation for every historical shape is bounded by the synthetic fixture set; no personal vault was used.

## 11. Domain-validation results

- **Claims:** stable ID/timestamps, non-empty payer label, uppercase currency, explicit nullable due date/note/cancellation fields, paired cancellation, strict target field allowlist, no legacy authority (`js/domain/models.js:213-231`). Active claims require at least one link; cancelled claims require none and cannot have active payments/write-offs (`js/domain/models.js:523-526,570-577`).
- **Claim allocations:** existing claim/allocation, reimbursable ownership, expense outflow, matching known currency, positive safe cents, amount cap, and one active claim per allocation (`js/domain/models.js:503-520`). One claim/many links and partial allocation coverage are valid; an active zero-expected claim is invalid because it cannot exist without a positive link (`js/domain/models.js:234-240,523-526`). Archived buckets remain valid historical references because link validation requires allocation/bucket integrity, not bucket activity.
- **Payments:** existing positive reimbursement inflow, matching currency, approved source, paired void metadata, active duplicate rejection, inflow capacity across claims, and non-negative claim remaining (`js/domain/models.js:243-257,528-550,570-573`). Overpayment is rejected at claim capacity; excess inflow remains unallocated. No `overpaid` status exists.
- **Adjustments:** only `write_off` and `write_off_reversal`; positive cents, reason, effective/created timestamps, target/same-claim/amount/chronology/single-reversal constraints, collectible capacity, and no negative remaining (`js/domain/models.js:260-274,552-597`). The model is append-only by representation; there is no mutation service in this phase.
- **Audit:** strict compact target shape and approved source (`js/domain/models.js:277-309`). Audit IDs are unique within audit events but may equal an unrelated transaction/bucket ID; only reimbursement relationship entities share a collision namespace (`js/domain/models.js:365-381,416-425`; `test/reimbursement-schema7.test.js:486-500`).

Validation happens before migration, after migration, before save, and before restore promotion (`js/domain/migrations.js:651-675`; `js/services/stateService.js:16-18,41-59`).

## 12. Projection results

`projectReimbursementClaim` derives expected from claim-allocation cents, received from non-voided payment cents effective by transaction date, written off from effective write-offs minus valid reversals, and remaining as the exact difference (`js/domain/models.js:440-466`). Status is derived—cancelled, written off/settled, partially paid, or open—and overdue requires an explicit valid `asOf` (`js/domain/models.js:469-487`).

Verified scenarios: open, partial, settled, written off, cancelled, overdue, voided payment, full/partial write-off, reversal, before/after due/payment/effective dates, and negative remaining rejection (`test/reimbursement-schema7.test.js:256-293,367-484`). Projection tests deep-compare the input before/after to prove purity (`test/reimbursement-schema7.test.js:387-395,431-449`). Legacy status and unresolved records are ignored (`test/reimbursement-schema7.test.js:178-192,517-526`). A valid active zero-expected claim is structurally impossible; a valid cancelled claim projects zero/cancelled by design.

## 13. Currency results

Transactions may retain explicit `null` currency, while accounts retain their existing required currency contract. Active claim relationships require a known exact claim/transaction currency match (`js/domain/models.js:503-518,530-539`). Migration never defaults to USD; absent or malformed expense/payment currency yields `unknown_currency`, and multiple known currencies yield `mixed_currency` (`js/domain/migrations.js:402-435,489-513,543-550`). Cross-currency relationships therefore fail safely into encrypted unresolved evidence.

Existing V1/allocation data without currency remains usable outside reimbursement relationships, including the V1 compatibility suite (`test/state-compatibility.test.js:24-119`) and allocation tests. The malformed-currency acceptance test proves exact source preservation before target `null` normalization (`test/reimbursement-schema7.test.js:166-176`).

## 14. Authority/deprecated-field review

The authoritative collections are `reimbursementClaims`, `reimbursementClaimAllocations`, `reimbursementPaymentLinks`, and `reimbursementAdjustments` (`js/domain/models.js:600-627`). Expected, received, write-off, remaining, and status projections read only those collections (`js/domain/models.js:440-487`). Non-null `allocation.reimbursementClaimId` is a schema-7 validation error (`js/domain/models.js:497-500`).

Production-source search found embedded `claim.allocationIds`, `claim.repaymentLinks`, stored legacy status, and allocation-side claim pointers read only inside schema-6 migration/evidence code (`js/domain/migrations.js:353-375,407-410,480-487,522-523,590-605`). Compatibility snapshots are never read by projections. No caller calculates a reimbursement balance from both legacy and canonical sources. No payer identity, account, state, country, location, refund, or matching source is fabricated.

## 15. Allocation-guard results

The edit guard derives linked allocation IDs only from canonical claim-allocation relationships (`js/services/allocationService.js:245-249`). Linked edits reject with `CLAIM_LINKED`; any failure restores the complete in-memory state snapshot (`js/services/allocationService.js:237-274`). Persisted schema-7 allocations explicitly clear the deprecated pointer (`js/services/allocationService.js:203-223`).

Verified: canonical claimed allocation edits block, unclaimed edits remain enabled, unresolved compatibility alone does not participate in the guard, and deprecated pointers neither bypass nor falsely trigger it (`test/reimbursement-schema7.test.js:528-557`). Encrypted schema-7 relationship preservation across repeated unlock keeps the guard's authoritative input intact (`test/vault-migration.test.js:220-239`). No claim, payment, adjustment, cancellation, or write-off mutation method exists.

## 16. Vault and recovery results

The vault has one selection order: active V2, valid V2 temporary, V1 primary, then V1 temporary (`js/vault.js:27-51`). Once a V2 active record exists, V1 is not read. V1 keys remain recovery sources and are never deleted by V2 clear (`js/vault.js:183-187`). Writes encrypt to the V2 temporary key, decrypt-verify it, promote to active V2, then remove temporary (`js/vault.js:80-111`).

Synthetic automated tests verified:

- schema-6 encrypted vault → schema 7 with 1 claim, 1 allocation link, 1 payment link, compatibility evidence, and exact second unlock (`test/vault-migration.test.js:220-239`);
- wrong password and corrupted ciphertext do not fall back, rewrite, or delete recovery data, and the restored prior vault remains usable (`test/vault-migration.test.js:88-125`);
- malformed active target, invalid decrypted state, invalid save, and future restore fail before overwrite (`test/vault-migration.test.js:32-45,127-139,166-204,264-275`);
- interrupted active promotion leaves the schema-6 active record plus verified temp and succeeds on retry (`test/vault-migration.test.js:241-262`);
- failed temporary ciphertext verification leaves the previous active vault usable (`test/vault-migration.test.js:277-300`);
- repeated migration uses only active V2 and does not rewrite it (`test/vault-migration.test.js:206-218`).

No decrypted transaction description or payer label is emitted by vault code (`js/vault.js:97-103`) or tests. **Test-only:** storage failure injection replaces synthetic `localStorage` methods; no genuine vault was accessed.

## 17. Regression results

The final 94-test suite verifies prior V1 hydration, encrypted vault creation/unlock, CSV-related state behavior, Weekly Review, buckets/two-level hierarchy, allocation editor and rollback, bucket/monthly totals, merchant-rule protection, explicit unknown accounts, null location fields, and Money Moves branding. Existing V1 destination objects without ranking metadata now render safely (`js/state.js:360-376`; `test/state-compatibility.test.js:44-50`).

Browser smoke verified fresh schema-7 vault creation, synthetic schema-6 migration, Overview, Weekly Review, Split Editor open/cancel, Bucket Explorer, Travel, lock/unlock persistence, and zero console warnings/errors. No Track Reimbursement, Shared Expenses, refund-link, or other reimbursement workflow appeared. Source scans found no Plaid implementation. Obsolete Verdant strings remain only as required V1 storage/AAD compatibility identifiers (`js/domain/constants.js:6-13`); user-facing product name remains Money Moves.

## 18. Commands and results

| Command/check | Result |
|---|---|
| `node --test test/state-compatibility.test.js` | PASS: 6/6 targeted compatibility tests. |
| `pnpm test` | PASS: 94 tests, 94 passed, 0 failed/cancelled/skipped/todo; duration 2900.187625 ms. |
| `pnpm run check` | PASS: syntax checks for application, state, vault, domain, and service modules. |
| `python3 -m py_compile start.py` | PASS; generated bytecode was removed afterward. |
| `git diff --check` | PASS before documentation finalization and PASS again after it. |
| `rg` production scans for Plaid, new reimbursement workflows, deprecated authority, and obsolete branding | PASS: no Plaid/workflow implementation; deprecated reimbursement fields are migration-only; Verdant remains only in compatibility constants. |
| Temporary `python3 -m http.server 18896/18897/18898 --bind 127.0.0.1` plus in-app browser smoke | Initial smoke exposed F-09; final isolated reruns PASS with zero warnings/errors. All temporary servers/tabs were stopped/closed and the synthetic fixture page was removed. |

## 19. Unresolved risks

1. **Low — synthetic coverage boundary.** The fixture matrix is broad, but no product-owner-provided historical vault was available. Per instruction, no genuine personal vault was used. A read-only encrypted-copy rehearsal remains advisable before a future production release if a sanitized representative vault becomes available.
2. **Low — intentional repair backlog.** Ambiguous schema-6 records remain encrypted and deterministic but have no repair UI/service. This is the safe Phase 3A outcome, not data loss (`docs/engineering/V2A_REIMBURSEMENT_DESIGN_REVIEW.md:565-567`).
3. **Low — deterministic legacy IDs.** Migration uses checked deterministic FNV-derived IDs. Collisions now fail the affected claim safely into unresolved evidence, but future user-created entities should use strong native IDs (`docs/engineering/V2A_REIMBURSEMENT_SCHEMA7_IMPLEMENTATION.md:252-253`).
4. **Low — future mutation discipline.** Transaction currency is nullable for preservation. Every future reimbursement write path must continue full-domain validation and known same-currency enforcement before one atomic persistence call (`js/services/stateService.js:41-49`; `js/domain/models.js:503-550`).

No unresolved risk permits a reimbursement workflow to be marked implemented.

## 20. Recommended next phase

Proceed only to the next separately approved reimbursement phase: an atomic domain/service layer for explicit claim lifecycle operations, payment linking, voids, cancellation, write-off/reversal, audit grouping, stale-state checks, and rollback tests. Keep UI, reporting, refund links, import changes, Shared Expenses, and Plaid out of that service phase unless separately authorized.

The Reimbursement Schema Foundation may now be marked **IMPLEMENTED AND REVIEWED**. The Reimbursements product workflow must remain **NEEDS IMPLEMENTATION**.
