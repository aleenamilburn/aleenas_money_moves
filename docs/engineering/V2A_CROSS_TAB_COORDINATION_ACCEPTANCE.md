# Money Moves V2A Phase 3C Cross-Tab Coordination Acceptance

## 1. Scope

This independent review covers the schema-7 encrypted-vault coordination foundation, repository and state-service write contracts, rollback behavior, generic conflict handling, and claimed-allocation browser readiness. It does not accept or implement reimbursement product screens, claim or repayment UI, Shared Expenses navigation, reporting, refunds, import/sync changes, or Plaid.

Authoritative inputs were the Money Moves PRD, the approved reimbursement design and prior Phase 3A/3B/transaction-allocation acceptances, the Phase 3C implementation report, `IMPLEMENTATION_STATUS.md`, and `AGENTS.md`.

Unless a paragraph says **inference** or **not exercised**, statements below are verified from the cited production code, automated tests, or controlled browser execution.

## 2. Base revision reviewed

`dc4a8b7ae94eaa122678b126034065a89ee02300`

The worktree was clean before this review. Acceptance corrections are listed in section 18.

## 3. Decision

**ACCEPTED WITH LOW-RISK FOLLOW-UP**

The submitted implementation had one Critical exclusivity defect and was not acceptable as reviewed: its persisted Web Storage lease used a non-atomic read/write/read sequence. This review corrected that defect by placing the complete promotion critical section under an origin-wide exclusive Web Lock, while retaining the persisted lease for defensive ownership, expiry, and recovery checks (`js/vault.js:261-343`). The corrected implementation passed automated, deterministic adversarial, and real two-tab browser contention tests.

The remaining follow-ups are bounded operational/test-coverage risks, not known data-integrity defects: the browser stress used two separately controlled tabs rather than two separate browser processes/profiles, and production now fails closed if the Web Locks API is unavailable.

## 4. Primary exclusivity answer

**Verified after correction:** two writers that loaded the same active generation cannot both report successful commits.

- The origin-wide platform lock serializes the full lease/generation/temp/promotion sequence (`js/vault.js:266-285`, `js/vault.js:331-343`; lock name at `js/domain/constants.js:9`).
- A waiting writer still supplies its originally loaded generation. On entering the lock after a winner, the initial active-generation comparison rejects it with `VAULT_CONFLICT` (`js/vault.js:287-296`, `js/vault.js:255-259`).
- The writer verifies its lease and expected generation twice immediately before promotion, including after the final-check hook (`js/vault.js:306-317`). Storage events are advisory only (`js/app.js:724-734`).
- A conflict uses a stable generic error with no state or ciphertext (`js/vault.js:21-27`). Allocation, bucket, settings, and every reimbursement mutation restore a deep pre-operation snapshot when persistence throws (`js/services/allocationService.js:238-276`, `js/services/bucketService.js:283-297`, `js/app.js:110-121`, `js/services/reimbursementService.js:156-185`).

Automated 100-race result: **100 winners, 100 `VAULT_CONFLICT`, 0 other failures, 0 double successes**, with maximum platform-lock concurrency 1 and the final state deep-equal to the authoritative decrypted state (`test/vault-coordination.test.js:148-202`).

Controlled browser 100-race result: **100 winners, 100 `VAULT_CONFLICT`, 0 other failures, 0 double successes**. Final `stateRevision` was 1 for the repeatedly reinstalled single-race fixture, the final generation was valid and opaque, and the final schema-7 domain validated. The precise browser boundary is documented in section 16.

## 5. Coordination design

| Mechanism | Meaning and authority | Verified implementation |
|---|---|---|
| `stateRevision` | Optimistic concurrency inside the currently loaded canonical state; protects drafts against stale state mutations. | Reimbursement checks before mutation, validates before/after, and advances once before persistence (`js/services/reimbursementService.js:156-181`). Allocation and bucket wrappers follow the same revision-and-rollback shape (`js/services/allocationService.js:238-276`, `js/services/bucketService.js:283-297`). |
| `vaultGeneration` | Opaque identity of the authoritative encrypted envelope. Detects replacement outside the loaded session. | Validated/generated in `js/vault.js:85-110`; passed through repository and state service at `js/services/vaultRepository.js:13-29` and `js/services/stateService.js:34-75`. |
| Web Lock | **Primary write-exclusion authority** for this origin. It spans lease acquisition through promotion and cleanup. | `js/vault.js:261-285`, `js/vault.js:331-343`. Browser production fails closed without it (`js/vault.js:268-271`). |
| Persisted writer lease | Secondary crash/recovery and defensive owner/expiry record. It is not relied on as an atomic Web Storage mutex. | Acquire/renew/release at `js/vault.js:191-218`; owner rechecks at `js/vault.js:306-313`. |
| Owner token | Opaque per-attempt lease and temporary-record owner identity. | `js/vault.js:81-83`, `js/vault.js:198-207`, `js/vault.js:299-305`. |
| Temporary vault | Fully encrypted and decrypt-verified candidate carrying a pending-write marker. It is not authoritative while a valid active vault exists. | Write/verify at `js/vault.js:297-305`; active-first selection at `js/vault.js:113-130`. |
| Active vault | Authoritative encrypted record. Generation is embedded in the same JSON envelope promoted by one `setItem`, so active contents and generation do not have a separate update window. | Envelope at `js/vault.js:163-180`; promotion at `js/vault.js:314-322`. |

Missing, delayed, or throttled storage events cannot bypass these repository-level controls: the save path always acquires the platform lock and checks the active generation. A storage event only raises an early warning (`js/app.js:724-727`).

## 6. Generation contract

The generation is an opaque `mmvg:` UUID embedded in the outer encrypted-vault envelope, not a separate metadata key (`js/vault.js:17`, `js/vault.js:85-100`, `js/vault.js:163-180`). Because it is outside the AES-GCM ciphertext, it is not cryptographically authenticated; however, it is promoted atomically with the ciphertext in one active-record replacement. Valid same-origin metadata tampering can force a conflict/denial of service, but a loaded stale writer cannot silently overwrite the changed active record because it compares the complete current generation before promotion (`js/vault.js:255-259`, `js/vault.js:306-317`; adversarial test `test/vault-coordination.test.js:420-429`).

Verified contract:

- Fresh create produces one valid generation; unlock, backup, and projection do not advance it (`test/vault-coordination.test.js:58-73`).
- A generation-less V2 envelope unlocks without rewrite; its first coordinated save establishes a new generation (`test/vault-coordination.test.js:75-94`).
- Malformed generation metadata rejects without rewriting active storage (`test/vault-coordination.test.js:96-107`).
- Schema migration advances the vault generation once; repeated unlock at the current schema is read-only (`test/vault-coordination.test.js:109-118`).
- Each successful save, passphrase change, and restore promotes exactly one generated envelope (`js/vault.js:385-405`, `js/services/stateService.js:49-75`; tests at `test/vault-coordination.test.js:511-549`).
- Validation, encryption/storage failure, `STALE_STATE`, and `VAULT_CONFLICT` do not promote and therefore do not advance generation (`js/services/stateService.js:49-75`, `js/vault.js:287-343`; failure evidence at `test/vault-coordination.test.js:204-259`, `test/vault-coordination.test.js:579-606`).
- Generation values contain no financial or personal facts; successful active envelopes contain only the documented envelope fields (`test/vault-coordination.test.js:551-577`).

## 7. Lease review

Verified behavior after correction:

- One platform-lock holder enters the critical section at a time. A waiting writer cannot overlap promotion (`js/vault.js:266-285`).
- An unexpired persisted lease rejects the current holder rather than being stolen; expired and malformed leases can be replaced (`js/vault.js:198-207`; `test/vault-coordination.test.js:300-323`).
- Lease renewal verifies ownership before and after replacement (`js/vault.js:209-214`). Expiry during a paused write prevents renewal/promotion (`test/vault-coordination.test.js:404-418`).
- Owner mismatch, injected token collision, deleted lease, and replaced lease all fail closed without changing active storage (`test/vault-coordination.test.js:325-374`).
- Non-owner cleanup cannot delete the current owner’s lease; release checks the stored owner token (`js/vault.js:216-218`; asserted at `test/vault-coordination.test.js:325-349`).
- A thrown operation releases the Web Lock automatically when its request callback settles. The persisted lease is released in `finally` when execution continues (`js/vault.js:323-328`). **Inference:** abrupt process termination releases the browser-managed Web Lock, while the persisted lease may remain until expiry.
- Lease data is limited to version, opaque owner token, and expiry (`js/vault.js:198-205`). Raw platform/storage failures are converted to stable public errors without `cause` (`js/vault.js:21-45`, `js/vault.js:266-285`, `js/vault.js:331-342`; `test/vault-coordination.test.js:204-259`).

Wall-clock residual: clock movement backward can delay recovery from an abandoned persisted lease; movement forward can expire it early. Neither creates overlapping promotion because the browser-managed lock remains authoritative. A forward jump during an active write causes its secondary lease check to fail closed. There is no periodic renewal; renewal occurs after temporary decryption and before promotion (`js/vault.js:303-313`).

## 8. Interleaving results

Deterministic hooks cover platform-lock acquisition, before/after persisted lease acquisition, before/after initial generation check, before/after temporary write, after temporary verification, before promotion, before/after final generation check, after active promotion, and before temporary cleanup (`js/vault.js:266-321`). Encryption itself happens before the coordinated writer is called (`js/vault.js:385-388`), so an encryption pause does not hold the lock and cannot promote; the generation is still checked under the lock afterward.

Results:

- Scenario 1, two writers from G: platform lock serialized both; first promoted, second rejected G (`test/vault-coordination.test.js:148-202`).
- Scenario 2, active generation changed before temp write, after temp write, or immediately before promotion: stale writer rejected and owned temp removed (`test/vault-coordination.test.js:278-298`).
- Scenario 3, failure immediately after active promotion: active and temp carry the same new generation; unlock selects active and the next save cleans temp (`test/vault-coordination.test.js:376-402`).
- Scenario 4, lease expiry/ownership replacement after verification: resumed writer rejected and did not promote (`test/vault-coordination.test.js:351-418`). With the corrected platform lock, a legitimate B cannot acquire concurrently while A is paused; injected lease interference still proves the secondary owner checks fail closed.
- Scenario 5: two separately controlled same-origin tabs ran 100 races. This is real cross-tab execution but not separate-process/profile coverage; see section 16.

The scheduling tests do not rely solely on same-stack promise ordering: they use an exclusive-lock queue and explicit acquisition/release barriers (`test/helpers.js:19-42`, `test/vault-coordination.test.js:166-180`), plus controlled browser tabs.

## 9. Crash-state analysis

Generation is embedded in the active envelope. “Active generation” below therefore cannot diverge from the active ciphertext through a separate metadata update.

| Persistent state | Reachability and unlock/recovery result |
|---|---|
| active old / no temp / old generation | Normal pre-write state. Active unlocks; a writer must lock and match old generation. |
| active old / temp new / old generation | Reachable before promotion or after failure before promotion. Active wins (`js/vault.js:113-120`); temp is ignored while active is valid and is overwritten/cleaned by a later coordinated save. Prior active remains recoverable. |
| active old / temp new / new generation | “New generation” can exist in temp only. Active remains old and authoritative; stale promotion still requires current lease and old active-generation match. |
| active new / temp new / old generation | Unreachable: generation and ciphertext are fields in the same active JSON record promoted by one `setItem` (`js/vault.js:314-318`). |
| active new / temp new / new generation | Reachable if execution stops immediately after promotion. Active wins and is coherent; verified by `test/vault-coordination.test.js:376-402`. |
| active new / no temp / old generation | Unreachable for the same embedded-envelope reason. |
| active new / no temp / new generation | Normal committed state. |
| active malformed / temp valid | Active precedence reports corruption; there is no silent fallback that could mask damage (`js/vault.js:113-129`). Manual recovery evidence remains, but automatic selection does not replace malformed active. |
| active valid / temp malformed | Active wins. A later coordinated save can replace/remove temp without using it as authority. |
| abandoned lease with any state | Browser-managed Web Lock is released by callback/process termination (**platform semantic inference**). An unexpired persisted lease may temporarily block; expired/malformed leases recover (`test/vault-coordination.test.js:300-323`). It cannot authorize stale promotion by itself. |

If no active record exists and a valid temp exists, unlock can select temp as recovery input (`js/vault.js:119-120`). Migration/persistence then uses the same validation and coordinated save path (`js/services/stateService.js:34-47`). A V1 active or V1 temp remains a later recovery source (`js/vault.js:121-129`) and is never deleted by V2 reset (`js/vault.js:424-429`).

## 10. Rollback results

Verified common-path rollback:

- Allocation mutations deep-restore all state on persistence conflict (`js/services/allocationService.js:238-276`); direct conflict test `test/vault-coordination.test.js:431-452`.
- Bucket create, rename, reorder, archive/restore, and child movement all enter the same rollback wrapper from production handlers (`js/app.js:449-468`, `js/services/bucketService.js:283-297`); direct conflict test `test/vault-coordination.test.js:453-465`.
- Claim creation, metadata/amount changes, cancellation, write-off/reversal, payment distribution/void, and manual repayment all route through `mutateAtomically` (`js/services/reimbursementService.js:156-185`, callers at `js/services/reimbursementService.js:285`, `315`, `355`, `390`, `425`, `445`, `552`, `569`, `595`). The wrapper restores the entire pre-operation state and preserves `VAULT_CONFLICT`; direct encrypted conflict evidence is at `test/vault-coordination.test.js:468-490`, with per-operation persistence rollback already covered in `test/reimbursement-service.test.js:131-178`, `273-286`, `421-446`, `632-676`, and `708-751`.
- Settings and other canonical mutations use a deep-snapshot wrapper (`js/app.js:110-121`); the settings handler uses it at `js/app.js:660-666`.
- Restore verifies/decrypts/migrates before coordinated save, and only swaps the live session after success (`js/services/stateService.js:66-75`, `js/app.js:695-709`). Passphrase change likewise swaps session key/meta/generation only after success (`js/app.js:668-683`).

For the shared mutation wrappers, a rejected operation deep-equals its prior snapshot: revision, audit events, transactions, relationships, buckets/allocations, and legacy compatibility fields all revert together. The stale session keeps its loaded generation until reload; it cannot retry successfully because repository generation comparison repeats on every write. The winning vault remains unlockable in the direct conflict tests.

## 11. StateRevision/generation matrix

| Operation result | `stateRevision` | `vaultGeneration` | Result |
|---|---:|---:|---|
| Successful financial mutation | +1 | new | Verified shared canonical wrapper (`js/app.js:110-121`). |
| Successful bucket mutation | +1 | new | Verified (`js/services/bucketService.js:283-297`). |
| Successful allocation mutation | +1 | new | Verified (`js/services/allocationService.js:238-276`). |
| Successful reimbursement mutation | +1 | new | Verified (`js/services/reimbursementService.js:156-185`). |
| Successful passphrase change | unchanged | new | Verified (`test/vault-coordination.test.js:525-549`). |
| Successful backup | unchanged | unchanged | Verified (`js/vault.js:408-412`; `test/vault-coordination.test.js:58-73`). |
| Successful restore | restored revision | new | Verified (`test/vault-coordination.test.js:511-523`). |
| Unlock | unchanged | unchanged | Verified (`js/vault.js:373-383`). |
| Projection/read | unchanged | unchanged | Verified by read-only APIs and full regression suite. |
| `STALE_STATE` | unchanged | unchanged | Verified by service validation occurring before mutation/persist (`js/services/reimbursementService.js:156-162`). |
| `VAULT_CONFLICT` | unchanged | unchanged | Verified deep rollback and unchanged active tests (`test/vault-coordination.test.js:431-509`). |
| Validation failure | unchanged | unchanged | Verified before-persist validation paths (`js/services/stateService.js:8-20`; service tests). |
| Persistence failure | unchanged | unchanged | Verified stable failure and rollback tests (`test/vault-coordination.test.js:234-259`, `579-606`). |

Reload/unlock returns the active generation (`js/vault.js:373-382`), and the app assigns it to the session (`js/app.js:677-679`, `js/app.js:702-705`). Two drafts can share `stateRevision`; only the one whose loaded generation still matches can persist.

## 12. Restore results

- Verified concurrent restore: backup prepared, another writer replaced active, restore with the captured older generation rejected, newer active remained usable, and V1 evidence was unchanged (`test/vault-coordination.test.js:492-509`).
- Wrong password, malformed/unsupported backup, future/invalid state, interrupted write, and conflict checkpoints are covered by the existing vault migration/backup tests plus coordinated-save failure tests. Decrypt/migrate/validate occurs before persistence (`js/services/stateService.js:66-75`). Public app handling uses only a generic verification failure (`js/app.js:695-709`).
- Generation-less legacy envelopes derive a stable opaque generation from their raw encrypted record and are migrated only after successful unlock/save (`js/vault.js:97-110`, `js/vault.js:373-382`). Restore never installs the backup’s stale generation; repository save creates a fresh one (`js/services/stateService.js:66-75`, `js/vault.js:385-388`).
- A successful restore preserves the backup state revision and advances active generation once (`test/vault-coordination.test.js:511-523`). Legacy recovery keys are not deleted (`js/vault.js:424-429`).

Restoring an older valid backup is allowed after the user has reloaded/unlocked the current vault and begins restore with that current expected generation. The existing UI has file and passphrase confirmation, not an additional “older data” warning; that UX question is outside this foundation acceptance.

## 13. Passphrase results

- Current passphrase is verified against the current active record before re-encryption; the replacement uses the coordinated generation path (`js/vault.js:391-405`).
- Successful change preserves canonical state/revision, advances only vault generation, invalidates the old passphrase, and accepts the new passphrase (`test/vault-coordination.test.js:525-549`).
- Stale change rejects and leaves active ciphertext unchanged (`test/vault-coordination.test.js:525-537`). Failed promotion therefore leaves the old active vault/passphrase usable.
- V1 evidence is outside the V2 write path and is not removed (`js/vault.js:424-429`). Stable conflict/persistence errors omit passphrases and raw causes (`js/vault.js:21-45`, `test/vault-coordination.test.js:204-259`, `551-577`).

## 14. Conflict-UI results

Production uses the required generic message exactly (`js/vault.js:21-27`; `index.html:66-72`). The banner is an alert, programmatically focusable, and receives focus when newly shown (`index.html:66`, `js/app.js:124-129`). Dismiss hides the warning without claiming a save; reload locks the app and requests a fresh passphrase (`js/app.js:729-734`). Repository checks remain authoritative if the user retries without reload.

Controlled browser results:

- Allocation: two unlocked tabs opened the editor. The winner saved; the stale tab retained its unsaved note, focused the banner after the storage warning, and received a generic authoritative conflict on Save. No stale mutation persisted.
- Bucket: two tabs attempted different renames. Winner persisted; stale tab focused the banner, received conflict, rolled back its canonical bucket change, and after Reload/unlock displayed the winner.
- Reimbursement: the test harness executed same-generation reimbursement metadata commits; exactly one succeeded per race.
- Early storage warnings did not mutate/discard drafts. Console warning/error count was zero across the harness, claimed-allocation, allocation-conflict, and bucket-conflict tabs.

## 15. Claimed-allocation fixture results

The fixture is isolated under `test/browser/`, imported only by `test/browser/phase3c.html`, and has no production navigation, query-parameter hook, or hidden production control (`test/browser/phase3c.html:7-37`, `test/browser/phase3c-fixture.js:11-39`). It requires a runtime-supplied passphrase of at least 12 characters and contains only explicitly synthetic payer, merchant, account, bucket, and transaction values (`test/browser/phase3c-fixture.js:22-39`, `64-85`). It uses production migration, validation, state-service, and encryption code; it does not weaken validation.

Controlled browser verification:

1. Installed a valid encrypted schema-7 claim/allocation relationship.
2. Weekly Review rendered the claimed synthetic allocation.
3. Split/Edit opened, but Save was blocked with “Allocations linked to a reimbursement claim cannot be edited in this phase.” (`js/services/allocationService.js:247-250`).
4. Encrypted inspection before/after showed unchanged state revision, generation, and relationship; no draft note persisted.
5. Lock/unlock retained the relationship.
6. The unclaimed fixture remained editable in the separate allocation conflict scenario.
7. Console warnings/errors: 0.

Low-risk packaging note: the fixture is unreachable from production UI, but a static deployment that publishes the repository’s entire `test/` tree could expose the synthetic harness URL. Deployment packaging should exclude `test/`; the fixture contains no production secret or real user data.

## 16. Multi-process stress boundary and results

**Boundary:** no claim of true multi-process or separate-profile coverage is made. The strongest available browser execution used two separately controlled tabs sharing one real browser origin and `localStorage`, plus explicit same-generation coordination. The automated stress used an in-memory implementation of the same exclusive-lock queue with explicit barriers (`test/helpers.js:19-42`).

Browser reimbursement-metadata race totals over 100 iterations:

- successful winners: **100**
- `VAULT_CONFLICT`: **100**
- other failures: **0**
- double successes from one original generation: **0**
- lost updates: **0 observed**
- final generation: **valid opaque `mmvg:` token**
- final state revision: **1** (fixture reset before each one-mutation race)
- final domain validity: **valid schema 7**

Automated 100-race totals were identical, with final revision equal to initial +100 and final decrypted state exactly matching the reported winner (`test/vault-coordination.test.js:148-202`). Allocation and bucket contention, passphrase versus stale state, and restore versus financial state are separately exercised by `test/vault-coordination.test.js:431-549` and the controlled browser scenarios.

## 17. Security/privacy results

- Active-envelope coordination metadata is limited to opaque generation plus existing version/product/schema/timestamps/KDF/cipher envelope fields; financial state remains AES-GCM ciphertext (`js/vault.js:163-180`). Temporary pending metadata contains only version, owner token, and prior opaque generation (`js/vault.js:297-305`).
- Lease metadata contains only version, owner token, and expiry (`js/vault.js:198-205`). Storage events inspect only the storage key; their value payload is not logged or rendered (`js/app.js:724-727`).
- Conflict and persistence errors expose stable generic text/code/operation only and no `cause` (`js/vault.js:21-45`). Tests prove raw lock/storage text, passphrase, payer label, note, and ciphertext field names are absent from public errors/metadata (`test/vault-coordination.test.js:204-259`, `551-577`).
- No generation, lease, ciphertext, financial, account, payer, merchant, location, passphrase, or key is put in URLs, history, conflict UI, or production console by this feature. Production logs only a generic save failure object on non-conflict errors (`js/app.js:95-107`); those errors are now sanitized at the vault boundary.

## 18. Findings and corrections

| Severity | Finding and original consequence | Correction and final evidence |
|---|---|---|
| **Critical — corrected** | At the base revision, `acquireWriteLease` read, wrote, then reread Web Storage (`js/vault.js` at base revision lines 188-197) and `writeCoordinated` trusted that lease through promotion (base lines 251-281). Those operations are individually atomic but the sequence is not. Under adversarial pauses, A and B could both read no lease, each later install/verify its own owner, and a paused writer could resume after its last generation check. Both could report success from G. | Added the origin-wide exclusive platform lock around the complete critical section (`js/vault.js:261-343`; name `js/domain/constants.js:9`). Added a second owner+generation verification after the final-check hook (`js/vault.js:309-317`). Added 100-race lock stress and fail-closed platform tests (`test/vault-coordination.test.js:148-232`). Final result: 0 double successes in automated and controlled browser stress. |
| **Medium — corrected** | Raw Web Storage/crypto/lock-manager exceptions could escape the vault layer, potentially exposing browser/storage internals in UI or logs. | Added `VaultPersistenceError` and sanitized platform acquisition failure (`js/vault.js:38-45`, `266-285`, `331-342`). Added tests at `test/vault-coordination.test.js:204-259` and updated legacy failure assertions in `test/vault-migration.test.js`. |
| **Low — corrected** | The generic conflict banner was visually shown but was not programmatically focusable and focus did not move to it. | Added `tabindex="-1"` (`index.html:66`) and one-time focus on reveal (`js/app.js:124-129`). Controlled browser allocation and bucket conflicts verified focus and draft retention. |
| **Low — open follow-up** | Browser contention was two real tabs, not two separate browser processes/profiles. | Automated scheduling plus real-tab execution gives strong coverage, but an independent-profile/process stress run remains recommended. No failure was observed. |
| **Low — open follow-up** | Production requires Web Locks and fails closed if unavailable. | This protects data integrity (`js/vault.js:268-271`) but may prevent saving in an unsupported/disabled browser. Confirm the supported browser matrix and provide an explicit compatibility message if such browsers are in scope. |
| **Informational** | Generation is envelope metadata, not authenticated ciphertext. | Same-origin valid-format tampering can cause denial of service/conflict, but cannot make a stale expected generation match a different current generation without deliberate exact-token rollback of the entire storage threat boundary. Local malicious script/storage control is outside this local-vault concurrency model. |

Changes were narrowly limited to coordination correctness, safe errors, generic conflict accessibility, test infrastructure/tests, and acceptance/status documentation. No product workflow was added.

## 19. Regression results

Final automated result: **151/151 tests passed, 0 failed** (prior reported baseline: 146). The five added tests cover the platform-lock 100-race invariant, missing/failing platform lock, sanitized storage failure, lease deletion/replacement after temp verification, and crash after active promotion.

The full suite retained V1 creation/unlock/migration and legacy recovery; wrong password and corrupt/interrupted vault behavior; backup/restore and passphrase behavior; Weekly Review; Bucket Explorer/two-level buckets; allocations and merchant rules; monthly and Travel calculations; unknown accounts/null locations; and Money Moves branding. Existing V1 identifiers remain only as compatibility constants (`js/domain/constants.js:10-14`), and V1 records are not deleted (`js/vault.js:424-429`).

Search and code review found no reimbursement product screen, Shared Expenses navigation/reporting, refund-link workflow, import/sync change, bank integration, or Plaid code added by this phase. Reimbursement remains service/domain foundation only.

## 20. Commands

| Command or validation | Result |
|---|---|
| `node --test test/vault-coordination.test.js test/vault-migration.test.js` (pre-hardening checkpoint) | 36 passed, 0 failed. |
| `node --test test/vault-coordination.test.js` (after added tests) | 25 passed, 0 failed. |
| First `pnpm test` after hardening | 151 total: 149 passed, 2 failed. Both failures were obsolete assertions expecting injected raw storage error text; production invariants passed. Assertions were corrected to require `VAULT_PERSISTENCE_FAILED` and absence of raw text. |
| Final `pnpm test` | 151 passed, 0 failed. |
| `pnpm run check` | Passed. |
| `python3 -m py_compile start.py` | Passed. |
| `git diff --check` | Passed. |
| `python3 start.py --port 19050` | Local browser server started and stopped successfully. |
| Browser smoke/regression execution | Claimed allocation, unclaimed allocation, generic allocation conflict, bucket conflict/reload, reimbursement harness, and console checks passed. |
| Controlled two-tab stress | 100 winners, 100 conflicts, 0 other failures, 0 double successes. |

## 21. Unresolved risks

1. Run the same 100-race matrix in two independently controlled browser processes/profiles sharing the same origin storage if the test infrastructure can provide a genuinely shared profile. Current evidence is two tabs plus deterministic barriers.
2. Confirm Web Locks support in the product’s browser support policy. Current production behavior intentionally rejects writes rather than weakening exclusivity when the API is absent.
3. Exclude `test/browser/` from production packaging. The fixture is synthetic and unreachable from navigation, but a publish-all static host could serve its direct path.
4. Wall-clock skew can delay recovery from an abandoned persisted lease or force a current write to fail closed; it cannot create overlapping promotion while the platform lock is authoritative.

No unresolved Critical, High, or Medium issue remains in Phase 3C scope.

## 22. Recommended next phase

Phase 3C is sufficiently hardened for the next approved reimbursement UI-readiness phase. Before adding product workflow, retain the current repository write contract, route every new mutation through the existing atomic reimbursement service, keep claimed allocation editing blocked except through atomic reconciliation, and add UI acceptance tests against real encrypted state. Do not begin Plaid, import/sync changes, refund relationships, or unrelated reporting as part of that work.
