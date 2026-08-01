# Money Moves V2A Phase 3B Reimbursement Service Acceptance

Date: 2026-07-31  
Base revision reviewed: `4aadb518ecb3290af7186d741b6755709a413191` (`v2a-phase3b-reimbursement-service-candidate`)  
Decision: **ACCEPTED WITH LOW-RISK FOLLOW-UP**

## 1. Scope

This review independently verified the schema-7 atomic reimbursement service foundation against the Money Moves PRD, approved reimbursement design, Phase 3A acceptance, Phase 2 acceptance, implementation claim, repository instructions, production callers, vault boundary, and regression suite.

The accepted scope remains foundation-only. No reimbursement screen, Shared Expenses surface, reporting integration, refund relationship, suggestion UI, import change, bank sync, Plaid code, or frontend framework was added. Production navigation still exposes only the V1 screens (`js/app.js:94-101`; `index.html:41-63`), and the reimbursement service has no production UI caller (`js/services/reimbursementService.js:1-678`).

Affected PRD requirements are REV-006 and REV-008, RMB-001 through RMB-005, INF-001 and INF-002, plus the canonical reimbursement and data-integrity rules on PRD pages 12, 15-16, 23-26, 31-32, 37, and 39-41.

## 2. Decision

**ACCEPTED WITH LOW-RISK FOLLOW-UP.** No Critical, High, or Medium defect remains open. Two Medium defects in the candidate were corrected and covered by adversarial tests:

1. Payment-distribution drafts did not enforce the approved unique row-ID contract.
2. Safe persistence errors retained the raw storage/encryption exception through `Error.cause`.

The remaining follow-ups are Low because reimbursement UI does not exist: the claimed-allocation guard was verified automatically but could not be created through browser UI, and `stateRevision` is an in-memory stale-draft token rather than a cross-tab or multi-device compare-and-swap protocol.

## 3. Primary atomicity answer

**Verified for the production service and vault contract.** Every reimbursement mutation passes through one shared boundary that checks the expected revision, validates the current domain, snapshots the complete state, applies all canonical/audit facts, revalidates the complete domain, advances once, persists once, and restores the snapshot on any thrown failure (`js/services/reimbursementService.js:156-183`). The vault encrypts one complete state, writes a temporary record, decrypts that stored temporary record, promotes it to the active key, and removes the temporary record (`js/vault.js:80-111,147-150`). StateService validates/migrates before repository persistence and does not increment revision (`js/services/stateService.js:8-12,43-46`).

The accepted outcomes are therefore:

- Success: canonical records, audit events, `stateRevision`, and the encrypted vault persist together.
- Failure before active promotion: the complete in-memory snapshot is restored, the previous active vault remains unlockable, and no canonical/audit/revision fragment remains.

This conclusion assumes the production persistence callback preserves its documented contract: it resolves after one successful `StateService.save`, or rejects because that save failed. The current app callback does so (`js/app.js:82-88`). A caller that deliberately commits successfully and then throws would violate that callback contract; no production caller behaves that way.

## 4. Implementation inventory

| Component | Verified production responsibility | Disposition |
|---|---|---|
| `js/services/reimbursementService.js` | Drafts, stable errors, atomic mutations, compact audits, and pure projections (`js/services/reimbursementService.js:5-678`). | **Retain/refactor only through this boundary.** Corrected row identity and error privacy. |
| `js/services/stateRevision.js` | Deterministic initialization, validation, access, and one-step advance (`js/services/stateRevision.js:1-31`). | **Retain.** |
| `js/services/allocationService.js` | Full-snapshot rollback, claimed-allocation guard, whole-domain validation, one revision, one persist (`js/services/allocationService.js:238-276`). | **Retain.** Future claimed splits need separate atomic reconciliation. |
| `js/services/bucketService.js` | Persisted bucket changes validate, advance once, persist once, and roll back (`js/services/bucketService.js:277-297`). | **Retain.** |
| `js/services/stateService.js` | Migration/validation plus the single repository boundary; no second revision increment (`js/services/stateService.js:15-66`). | **Retain.** |
| `js/services/vaultRepository.js` | Thin, single-vault adapter around vault operations (`js/services/vaultRepository.js:1-35`). | **Retain.** |
| `js/domain/models.js` | Strict reimbursement shapes, whole-domain relationships, capacity, chronology, cancellation, and projections (`js/domain/models.js:213-309,416-627`). | **Retain.** |
| `js/domain/migrations.js` | Deterministic schema-6 conversion/unresolved preservation and revision initialization (`js/domain/migrations.js:380-641,652-680`). | **Retain.** No Phase 3B schema change required. |
| `js/vault.js` | One active V2 vault, legacy recovery precedence, AES-GCM persistence, verified temp promotion, backup/restore primitives (`js/vault.js:27-55,68-180`). | **Retain.** |
| `js/app.js` | V1 UI and save queue. It has no reimbursement mutation caller (`js/app.js:82-88,94-101`). | **Retain.** No screen added. |
| `test/reimbursement-service.test.js` | Service, rollback, error, encrypted-reload, and backup/restore acceptance (`test/reimbursement-service.test.js:1-884`). | **Expanded.** |

## 5. Findings and corrections

| ID | Severity | Finding | Correction and evidence | Status |
|---|---|---|---|---|
| F-01 | Medium | Distribution rows had no identity, so duplicate row IDs could not be detected even though the approved workflow requires unique draft-row IDs. Candidate behavior was in `js/services/reimbursementService.js` at base lines 504-506. | Draft creation now assigns a strong UUID when an ID is absent; validation rejects empty and duplicate row IDs before duplicate-claim validation (`js/services/reimbursementService.js:499-536`). Added exact precedence/no-mutation coverage (`test/reimbursement-service.test.js:570-597`). | **Corrected.** |
| F-02 | Medium | `PERSISTENCE_FAILED` used `Error.cause`, exposing the raw storage/encryption exception to callers despite a safe top-level message. Candidate behavior was in `js/services/reimbursementService.js` at base lines 41-47 and 168-187. | Service errors no longer retain raw causes; persistence and unexpected failures expose only mapped messages/codes (`js/services/reimbursementService.js:43-49,170-182`). Synthetic raw-secret and encrypted verification failures prove no cause/raw message escapes and state/vault roll back (`test/reimbursement-service.test.js:599-630,707-742`). | **Corrected.** |
| F-03 | Low | The production UI has no way to create a claim-linked allocation, so the browser matrix could not exercise the disabled Split Editor state for such a record. | The authoritative canonical guard is verified in service code (`js/services/allocationService.js:246-250`) and automated tests (`test/reimbursement-schema7.test.js:528-557`). Browser testing did verify the unclaimed editor. | **Open follow-up before reimbursement UI.** |
| F-04 | Low | `stateRevision` prevents sequential stale drafts against one loaded state, but StateService does not compare the revision currently encrypted by another independent tab/device. | Same-state same-revision drafts are proven to serialize (`test/reimbursement-service.test.js:599-608`). This is acceptable for a UI-unused local foundation; add repository-level compare-and-swap or single-writer coordination before enabling reimbursement mutations in multiple tabs/devices. | **Open architectural follow-up.** |

No production reimbursement code, V1 data, schema-6 compatibility evidence, legacy recovery key, or existing screen was deleted.

## 6. Revision results

All 14 revision checks pass for the accepted single-loaded-state contract:

- Absent revision initializes to `0`; invalid or overflow revision rejects (`js/services/stateRevision.js:9-30`; `js/domain/migrations.js:652-680`; `test/reimbursement-service.test.js:351-357,624-629`).
- Every reimbursement operation advances inside the shared boundary exactly once (`js/services/reimbursementService.js:156-178`). Allocation and persisted bucket operations advance once inside their own rollback boundaries (`js/services/allocationService.js:238-276`; `js/services/bucketService.js:283-297`).
- Stale state is checked before domain/draft mutation or persistence (`js/services/reimbursementService.js:104-116,156-162`). Two drafts captured at one revision cannot both commit sequentially (`test/reimbursement-service.test.js:599-608`).
- Failed validation, ID creation, domain validation, revision advance, or persistence restores the prior revision with the full snapshot (`js/services/reimbursementService.js:162-183`; `test/reimbursement-service.test.js:599-673`).
- StateService validates revision but does not increment it (`js/services/stateService.js:8-12,43-46`). Repeated unlock does not rewrite an already-current vault (`test/vault-migration.test.js:206-218`).
- Revision survives immediate encrypted reload after every operation and survives backup/restore without an extra increment (`test/reimbursement-service.test.js:744-884`). Pure projections do not change it (`test/reimbursement-service.test.js:333-349`).
- A cancelled/discarded UI draft has no mutation API call; the browser Split Editor Cancel left no dialog or persisted change. This is verified production behavior, not an assumption.

## 7. Claim-operation results

**Verified.** Claim creation is explicit only; there is no automatic caller. It supports one/many allocations and partial claimed cents, derives a single known currency from expense transactions, requires reimbursable ownership and a payer label, caps each amount, and blocks competing claims (`js/services/reimbursementService.js:195-243,256-304`). IDs default to `crypto.randomUUID`, audit events share one operation group, persistence occurs once, and no payer/account/location is inferred (`js/services/reimbursementService.js:126-153,282-303`).

Metadata edits change only the allowed metadata, update time, audit, and revision; audit stores changed field names rather than payer/note values (`js/services/reimbursementService.js:307-323`). Amount edits retain continuing relationship IDs, allocate strong IDs only to new links, remove only omitted links, require at least one link, preserve payments/adjustments, enforce caps/currency, and keep expected cents at least received plus written off (`js/services/reimbursementService.js:326-378`).

Mid-claim ID collision, competing claim, mixed currency, stale revision, invalid draft, full-domain failure, and persistence failure all deep-equal the prior state (`test/reimbursement-service.test.js:128-196,421-445,632-640`).

## 8. Payment results

**Verified.** Only positive, known-currency `movementType: reimbursement` inflows are eligible (`js/services/reimbursementService.js:467-488`). Distribution validates a non-automatic source, unique strong row IDs, unique claims, active same-currency claims, positive safe cents, duplicate active links, per-claim capacity, and aggregate inflow capacity (`js/services/reimbursementService.js:499-547`). One inflow may fund several claims, several inflows may fund one claim, exact/partial settlements derive correctly, and excess remains `availableAmountCents`; no overpaid status exists (`js/services/reimbursementService.js:549-563,629-678`).

All links and compact audit events are created under one operation group and one persist/revision boundary. Duplicate row ID, duplicate claim, duplicate active link, stale availability, second-row ID collision, and post-construction persistence failure commit nothing (`test/reimbursement-service.test.js:235-286,485-504,570-597,641-654,744-858`).

Void requires one active link and a reason, retains the original inflow and link history, pairs void metadata, restores claim/inflow availability, may reopen a claim, and leaves unrelated links untouched (`js/services/reimbursementService.js:566-580`; `test/reimbursement-service.test.js:289-300,506-521`).

## 9. Write-off and cancellation results

**Verified.** Write-offs require positive cents, reason, explicit effective timestamp, and collectible remaining; they append an adjustment/audit and never a transaction (`js/services/reimbursementService.js:413-439`). Reversals target a same-claim write-off, permit one capped reversal, enforce created/effective chronology, append rather than overwrite, and recompute status (`js/services/reimbursementService.js:442-465`; `js/domain/models.js:552-597`). Whole-domain validation rejects any reversal/write-off combination that would make later facts inconsistent (`js/domain/models.js:570-597`).

Cancellation requires an active claim, reason, no active payment, and zero net active write-off. It creates no transaction, retains the claim, removes active claim-allocation rows per the accepted schema-7 representation, and emits one relationship event per removed ID/cents plus a summary expected-cent event (`js/services/reimbursementService.js:381-410`). That audit is sufficient to reconstruct removed relationship IDs and cents without copying the cancellation reason into audit. Compatibility evidence is outside the mutated collections and remains unchanged. Rollback restores the claim and all links (`test/reimbursement-service.test.js:199-233,447-483,744-858`).

## 10. Manual-repayment results

**Verified.** One operation creates one positive manual reimbursement transaction, one payment link, and two grouped compact audit events (`js/services/reimbursementService.js:583-626`). It enforces claim capacity, date normalization, existing same-currency account or `unknown-account`, and claim currency. Merchant, region, country, location source, and provider category remain null; `manualOverrides.reimbursementEntry` records manual authority. The movement is reimbursement, never earned income (`js/services/reimbursementService.js:599-624`).

Transaction-, link-, and audit-ID collisions plus persistence/encryption failures leave neither record, audit, nor revision (`test/reimbursement-service.test.js:302-331,632-673,707-742`). Immediate encrypted reload preserves the exact transaction/link (`test/reimbursement-service.test.js:744-858`).

## 11. Projection results

**Verified.** Expected, received, written off, remaining, derived status, and overdue are computed from canonical relationships without storing status (`js/domain/models.js:440-487`). Payment dates and adjustment effective dates honor an explicit valid `asOf`; invalid dates reject. Open, settled/written-off, cancelled, needs-resolution, unmatched-inflow, and aggregate-outstanding projections are pure (`js/services/reimbursementService.js:629-678`).

Voided links are excluded, write-off reversals subtract from written-off cents, cancelled claims are consistently separated, and unresolved compatibility records expose no authoritative expected cents and never enter totals (`test/reimbursement-schema7.test.js:387-484,517-526`; `test/reimbursement-service.test.js:333-349`). Unmatched reimbursement inflows remain reimbursement transactions and are never automatically linked or classified as earned income (`js/services/reimbursementService.js:663-668`).

Assumption: calling projections without `asOf` means current authoritative facts. Any historical/temporal view must pass an explicit `YYYY-MM-DD` value; the service validates such values (`js/domain/models.js:476-487`; `js/services/reimbursementService.js:480-488`).

## 12. Audit and privacy results

**Verified.** User-generated events use `source: user`, strong IDs, operation groups, related entity IDs, and only safe-integer `*Cents` monetary facts (`js/services/reimbursementService.js:126-153`; `js/domain/models.js:277-309`). Approved summary actions and relationship-level actions cover every claim, link, amount, cancellation, payment, void, write-off/reversal, and manual-transaction mutation (`js/services/reimbursementService.js:299-302,368-376,405-408,435-436,460-461,557-558,578,623-624`).

Audit tests prove payer labels, payer notes, merchant/account/location/provider details are absent; stale and failed operations append no orphan event (`test/reimbursement-service.test.js:540-568,599-742`). Cancellation evidence includes removed relationship IDs and exact cents without copying its descriptive reason (`js/services/reimbursementService.js:400-408`).

## 13. Error-contract results

**Verified after correction.** The complete required code set plus service-specific codes is declared at `js/services/reimbursementService.js:5-41`. Additional codes are `INVALID_CLAIM_AMOUNT`, `FINAL_CLAIM_ALLOCATION_REQUIRED`, `DUPLICATE_PAYMENT_CLAIM`, `DUPLICATE_PAYMENT_ROW`, `INVALID_PAYMENT_ROW`, `DUPLICATE_PAYMENT_LINK`, `WRITE_OFF_NOT_FOUND`, `WRITE_OFF_ALREADY_REVERSED`, `INVALID_ADJUSTMENT_CHRONOLOGY`, `INVALID_REASON`, `INVALID_DATE`, and `INVALID_OPERATION`.

Stale-state precedence occurs before draft/domain-side mutation (`js/services/reimbursementService.js:104-124,156-162`). Messages contain record IDs and safe cents, not payer/merchant/note/account/location values. Persistence maps consistently to `PERSISTENCE_FAILED`, and raw encryption/storage exceptions are no longer retained (`js/services/reimbursementService.js:43-49,170-182`; `test/reimbursement-service.test.js:599-622,707-742`). Domain-invalid details contain validator field/relationship errors, not copied financial descriptions (`js/services/reimbursementService.js:119-123`; `js/domain/models.js:365-627`).

All required and additional codes are exercised across `test/reimbursement-service.test.js:94-742`; deterministic precedence is explicitly verified for stale-before-invalid, duplicate-row-before-duplicate-claim, and duplicate-link-before-capacity.

## 14. Failure-injection results

| Injection point | Result and evidence |
|---|---|
| Stale check / invalid draft | No persistence, audit, record, or revision (`test/reimbursement-service.test.js:128-153,400-445,599-608`). |
| Claim/link/transaction/audit ID generation | Mid-operation collisions deep-equal prior state (`test/reimbursement-service.test.js:632-673`). |
| Full-domain validation / revision overflow | Duplicate transaction and maximum revision roll back every collection (`test/reimbursement-service.test.js:624-673`). |
| Persistence callback / encryption / temporary verification | Safe `PERSISTENCE_FAILED`; prior state and active encrypted vault remain exact and unlockable (`test/reimbursement-service.test.js:707-742`). |
| Temporary write / active promotion / interrupted migration | Existing vault tests retain the prior active vault and recovery source (`test/vault-migration.test.js:141-164,241-261,277-300`). |
| Wrong password / corrupted vault / invalid state / failed restore | No active or legacy recovery overwrite (`test/vault-migration.test.js:32-45,88-139,166-204,264-275`). |
| Restore | Backup is verified/migrated before replacement (`js/services/stateService.js:56-61`); failed restore leaves active V2 untouched (`test/vault-migration.test.js:32-45`). |

After each practical injection, the state or encrypted record is compared to its exact prior value. Legacy schema-6 evidence remains outside operation-owned mutation and survives the encrypted matrix.

## 15. Encrypted-reload results

**Verified after every operation, not only at sequence end.** The matrix reloads immediately after claim creation, metadata edit, amount increase, amount decrease, partial payment, full payment, one inflow split across claims, void, partial write-off, reversal, full write-off, cancellation, and manual repayment (`test/reimbursement-service.test.js:744-858`).

Every reload deep-compares the complete state and therefore covers revision, claims, claim-allocation links, payment links, adjustments, transactions, audit events, compatibility evidence, and projections. It also asserts one persistence call, one revision increment, domain validity, and unresolved-evidence survival at each step (`test/reimbursement-service.test.js:760-778`). Backup/restore returns to the exact prior revision and facts with no increment (`test/reimbursement-service.test.js:860-884`).

## 16. Regression results

The prior 94-test baseline and the 25 candidate tests remain passing. Seven acceptance tests were added, yielding 126 total tests. Passing coverage includes V1 hydration and custom state, Travel, vault create/unlock, wrong password/corruption/interruption/restore, Weekly Review calculations, Bucket Explorer, sub-buckets, unclaimed Split Editor behavior, claimed-allocation guard, CSV normalization, monthly calculations, bucket totals, merchant rules, unknown accounts, null locations, canonical branding, schema migration, and legacy recovery.

Branding search found no obsolete product text in production code or user-facing markup. The only Verdant strings are required stable V1 vault/storage/AAD identifiers (`js/domain/constants.js:8-12`). `merchant_refund` remains only a reserved movement enum, not a refund-link implementation (`js/domain/models.js:6-10`). No Plaid module, credential, import change, bank sync, reimbursement screen, Shared Expenses screen, or reporting integration exists.

## 17. Browser results

Interactive DOM acceptance used synthetic input against `http://127.0.0.1:18990/`:

| Scenario | Result |
|---|---|
| Fresh vault | **PASS.** Created an encrypted vault with a synthetic passphrase. |
| Existing schema-7 unlock | **PASS.** Locked and unlocked the newly existing schema-7 vault twice. |
| Overview | **PASS.** Heading, month, totals, spending plan, and account snapshot rendered. |
| Weekly Review | **PASS.** Inbox and transaction allocation entry rendered. |
| Unclaimed Split Editor | **PASS.** Opened; exact amount/ownership/balance displayed; Cancel removed the dialog without save. |
| Claim-linked allocation guard | **AUTOMATED PASS / BROWSER NOT EXERCISED.** No production reimbursement workflow can create the needed browser state; see F-03. |
| Bucket Explorer | **PASS.** Parent cards, totals, targets, archive/reorder controls rendered. |
| Travel | **PASS.** Rankings and visited-city controls rendered. |
| Lock/unlock and persistence | **PASS.** Added synthetic `Testville, TS`, locked/unlocked, and observed exactly one persisted marker. |
| No reimbursement workflow | **PASS.** Exact `Reimbursements` and `Shared Expenses` element counts were zero. |
| Console | **PASS.** Zero warning/error entries after the workflow. |

The initial new-tab binding reported a session mismatch. Following the supported recovery path, the controlled blank tab was reacquired by its listed ID and navigated successfully. This was an environment control issue, not an application failure; all PASS claims above are backed by subsequent DOM interaction.

## 18. Commands

| Command/check | Result |
|---|---|
| `pnpm test` | **PASS** — 126 tests, 126 passed, 0 failed/cancelled/skipped/todo; Node duration 2858.192417 ms. |
| `pnpm run check` | **PASS** — all listed production JavaScript modules parsed. |
| `python3 -m py_compile start.py` | **PASS** — generated cache removed after validation. |
| `git diff --check` | **PASS**. |
| `node --test test/reimbursement-service.test.js` | **PASS** — 31 service tests, 31 passed. |
| In-app browser DOM smoke | **PASS with the one documented claim-guard limitation** — fresh/existing vault, navigation, editor cancel, persistence, hidden-workflow, and console checks completed. |
| Branding/scope searches | **PASS** — obsolete strings limited to stable V1 compatibility identifiers; no Plaid/reimbursement UI/refund-link implementation. |

## 19. Changes made

- `js/services/reimbursementService.js`
  - Added strong payment draft row IDs.
  - Added `DUPLICATE_PAYMENT_ROW` and `INVALID_PAYMENT_ROW` validation.
  - Removed raw persistence/unexpected exception retention from public service errors.
- `test/reimbursement-service.test.js`
  - Added duplicate/missing row-ID and precedence tests.
  - Added same-revision serialization, revision-overflow, raw-error privacy, and deep rollback tests.
  - Added claim/distribution/manual transaction-link-audit ID collision tests.
  - Added missing/cancelled/chronology/error-code coverage.
  - Added real encrypted temporary-verification failure rollback.
  - Added immediate encrypted reload after every acceptance-matrix mutation.
  - Added encrypted backup/restore revision preservation.
- `docs/engineering/V2A_REIMBURSEMENT_SERVICE_ACCEPTANCE.md`
  - Added this independent acceptance record.
- `docs/engineering/IMPLEMENTATION_STATUS.md`
  - Updated Phase 3B foundation status only; reimbursement workflows remain unimplemented.

No migration or schema version was added. Schema remains 7.

## 20. Unresolved risks

1. **Low — browser fixture gap.** The claimed-allocation guard has automated production-code coverage but no DOM state because claim creation UI is intentionally absent (`js/services/allocationService.js:246-250`; `test/reimbursement-schema7.test.js:528-557`). Add a synthetic browser fixture when reimbursement UI work begins.
2. **Low — independent-tab concurrency.** `stateRevision` serializes drafts within one loaded state but is not encrypted-vault compare-and-swap across independent tabs/devices (`js/services/stateRevision.js:9-30`; `js/services/stateService.js:43-46`). Add single-writer/CAS coordination before exposing mutation UI in environments where simultaneous writers are supported.
3. **Low — persistence callback contract.** Atomic rollback assumes a rejecting callback did not already return from a successful active-vault promotion. The production callback meets this contract (`js/app.js:82-88`; `js/vault.js:105-111,147-150`). Keep future callers on StateService rather than wrapping a successful commit with later fallible work.
4. **Intentional product gap.** There is still no reimbursement workflow, reporting integration, refund model, suggestions, import change, sync, or Plaid. These are not Phase 3B defects.

## 21. Recommended next phase

Proceed only to the separately scoped reimbursement workflow phase. Before enabling user mutations, add a synthetic browser fixture for claimed-allocation protection and decide whether the supported deployment needs cross-tab single-writer/CAS enforcement. Then build explicit claim/payment/write-off UI on the accepted service boundary. Keep reporting, merchant refunds, import/sync, and Plaid in their separately approved phases.

