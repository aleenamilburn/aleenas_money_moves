# Money Moves V2A Phase 3C — Cross-Tab Coordination Implementation

Date: 2026-07-31  
Status: IMPLEMENTED / AWAITING ACCEPTANCE  
Current state schema: 7

## Scope

This phase adds optimistic encrypted-vault generation checks, an expiring single-writer lease, rollback integration, generic conflict recovery, and test-only reimbursement fixture support. It does not add reimbursement product UI, Shared Expenses, reporting, refund relationships, import/sync changes, Plaid, or a frontend framework. Reimbursements remain **NEEDS IMPLEMENTATION** in `docs/engineering/IMPLEMENTATION_STATUS.md:15-19`.

The authoritative product name and existing V1/V2 compatibility identifiers remain unchanged. `Money Moves`, schema 7, the V2 active/temp keys, V1 recovery keys, and both AAD strings are declared in `js/domain/constants.js:1-14`. No compatibility key was renamed or deleted.

## Selected coordination design

The active V2 envelope now carries a non-sensitive `vaultGeneration`. New committed generations are opaque UUID values with an `mmvg:` prefix. Existing envelopes that lack the field receive a deterministic read token derived from SHA-256 of the exact serialized envelope; unlock does not rewrite them. A first successful coordinated write replaces that fallback token with a new opaque generation (`js/vault.js:75-101`, `js/vault.js:312-327`).

Every write also acquires a 15-second lease stored under `money-moves-vault-v2-write-lease`. The lease contains only a version, a strong random owner token, and an expiry. Acquisition, renewal, ownership verification, expired-lease recovery, and owner-scoped cleanup are implemented in `js/vault.js:55-73` and `js/vault.js:181-215`.

`localStorage` storage events are advisory only. The application shows an early generic warning when the active V2 key changes, but the repository generation comparison remains authoritative even if no event arrives (`js/app.js:721-730`, `js/services/vaultRepository.js:13-18`).

## Threat and interleaving model

The design protects cooperative Money Moves writers in independently loaded same-origin tabs from silent stale overwrites. It explicitly handles:

- stale generations before a temporary write, after a temporary write, and immediately before promotion;
- an active, replaced, malformed, expired, or abandoned lease;
- owner-token mismatch and injected collision tests;
- a writer that stops before promotion;
- an active vault changed without a received storage event;
- failure after a verified temporary write.

The expected generation is rechecked under an owned, unexpired lease immediately before active promotion (`js/vault.js:245-280`). The active V2 vault remains authoritative whenever it exists; verified V2 temporary state remains the recovery source only when no active V2 record exists (`js/vault.js:103-120`, `js/vault.js:217-242`).

Limitations are inherent to Web Storage: separate `localStorage` reads and writes are not a database transaction or true compare-and-swap. The lease, owner verification, short expiry, encrypted temporary verification, and final generation check are the safest small mechanism available without changing persistence technology. A malicious same-origin script or direct developer-tools mutation is outside the cooperative-tab threat model and can cause denial of service. See **Unresolved risks**.

## `vaultGeneration` contract

- `mmvg:none` represents no current vault only inside the coordination protocol.
- `mmvg:legacy-<digest>` represents the exact bytes of a readable existing envelope without generation metadata.
- `mmvg:<uuid>` represents a successfully promoted V2 active envelope.
- Missing generation metadata is accepted without rewrite; malformed metadata fails closed with `INVALID_VAULT_GENERATION` (`js/vault.js:29-35`, `js/vault.js:82-101`).
- Unlock, read, and backup do not advance generation (`js/vault.js:127-133`, `js/vault.js:312-321`, `js/vault.js:347-360`).
- Each successful create, save, restore, or passphrase re-encryption returns one newly promoted generation (`js/vault.js:299-344`, `js/services/stateService.js:29-75`).
- Failed writes do not advance the active generation and remove only the failed writer's temporary record (`js/vault.js:251-281`).
- Generation and pending-write metadata are outside the AES-GCM ciphertext and are not included in AAD. They contain no financial or personal values. Valid metadata tampering makes a loaded writer fail its generation check; malformed generation metadata blocks unlock. This metadata is coordination state, not authenticated financial state.

## `stateRevision` versus `vaultGeneration`

`stateRevision` serializes drafts within one loaded canonical state. `vaultGeneration` detects replacement of the encrypted active envelope by another writer.

- Allocation, bucket, reimbursement, and direct V1-compatible mutations advance `stateRevision` once before persistence and restore a deep snapshot on failure (`js/services/allocationService.js:238-275`, `js/services/bucketService.js:283-297`, `js/services/reimbursementService.js:156-185`, `js/app.js:110-121`).
- Successful active promotion advances `vaultGeneration` once (`js/vault.js:251-275`).
- A `VAULT_CONFLICT` therefore rolls back the stale tab's canonical records, audit facts, relationships, and `stateRevision`, while the authoritative encrypted generation remains unchanged.
- Unlock, projections, and backup advance neither revision.
- Restore preserves the backup's `stateRevision` and rebases the restored active envelope to one new generation (`js/services/stateService.js:66-75`).
- Passphrase change re-encrypts the same canonical state, advances generation once, and does not advance `stateRevision` (`js/services/stateService.js:54-61`).

## Repository and service contracts

The repository remains the sole production boundary that knows the vault implementation. It now exposes generation reads and forwards coordination options for create, save, and passphrase change (`js/services/vaultRepository.js:3-40`). Production services and UI do not read or write generation or lease storage directly.

Effective contracts are:

```text
unlock(passphrase) -> { state, key, meta, vaultGeneration, ... }
save(state, key, meta, { expectedVaultGeneration })
  -> { state, meta, vaultGeneration, migration }
restore(raw, passphrase, { expectedVaultGeneration })
  -> { state, key, meta, vaultGeneration, migration, ... }
changePassphrase(state, current, next, { expectedVaultGeneration })
  -> { state, key, meta, vaultGeneration, migration }
```

Migration and full foundation validation happen before repository persistence for create, unlock migration, save, restore, and passphrase change (`js/services/stateService.js:8-20`, `js/services/stateService.js:29-75`). Existing schema migration remains the only unlock-time rewrite condition; merely lacking a generation does not trigger a write.

The stable conflict error is `VAULT_CONFLICT`, with only a generic message and operation name. It has no raw cause, state, ciphertext, credential, or business fields (`js/vault.js:20-27`). Reimbursement service mutations deliberately preserve this code while still deep-rolling back, instead of wrapping it as `PERSISTENCE_FAILED` or exposing a lower-level exception (`js/services/reimbursementService.js:156-185`). `STALE_STATE` remains the separate in-memory draft-revision error.

## Save and promotion ordering

For a state already validated by `stateService`, coordinated persistence performs:

1. Validate the expected generation token.
2. Acquire and verify the expiring owner lease.
3. Compare the active generation with the caller's expected generation.
4. Build a new opaque generation and owner-scoped pending-write marker.
5. Write the complete encrypted envelope to the V2 temporary key.
6. Read, decrypt, and verify that exact temporary envelope.
7. Renew and verify the lease.
8. Recheck lease ownership and active generation immediately before promotion.
9. Promote the verified envelope to the stable V2 active key, removing pending-write metadata.
10. Remove the temporary record, release the lease, and return the new generation.

The implementation is at `js/vault.js:251-281`. If active promotion throws after temporary verification, the verified temporary record is preserved for existing interrupted-write recovery. Other rejected writes remove only their owned temporary record.

## Backup, restore, and passphrase semantics

Backup exports the exact current encrypted envelope and is read-only (`js/vault.js:347-350`). Existing backup envelopes without generation remain verifiable through their deterministic digest token (`js/vault.js:353-360`).

Restore captures the expected active generation before asynchronous backup verification, verifies password/ciphertext and migrates/validates the recovered state, then performs a coordinated save. A stale restore is rejected without replacing active V2 data or deleting V1 evidence. Success preserves backup `stateRevision` and returns one new active generation (`js/services/stateService.js:66-75`).

Passphrase change first checks the expected active generation, verifies the current passphrase against the current ciphertext, derives a new key/salt, and performs a coordinated replacement. Success advances generation because the active envelope changed; canonical `stateRevision` is unchanged. A stale tab is rejected (`js/vault.js:330-344`).

V2 reset continues to remove only V2 active/temp/lease records. It never deletes V1 recovery keys (`js/vault.js:363-367`). AES-GCM, PBKDF2 at 600,000 iterations, and existing AAD selection remain intact (`js/vault.js:13-16`, `js/vault.js:141-178`).

## Generic conflict UX

A single generic banner offers **Keep editing** and **Reload vault**, with no reimbursement-specific language or controls (`index.html:63-67`). Keep editing hides the warning and preserves an allocation draft in memory; the next save still performs the authoritative generation comparison. Reload never silently merges state, asks before discarding a dirty allocation draft, clears the loaded key/state/generation, and requires passphrase unlock of the latest vault (`js/app.js:77-84`, `js/app.js:93-129`, `js/app.js:721-730`).

All existing direct canonical mutations now use snapshot/rollback and one `stateRevision` advance. Allocation and bucket services retain their existing service-level rollback. Create/unlock update the caller generation, and restore/passphrase flows supply their loaded generation (`js/app.js:600-705`).

## Claimed-allocation browser fixture

`test/browser/phase3c.html:1-42` is a standalone test-only harness and is not linked from production navigation. `test/browser/phase3c-fixture.js:11-93` builds encrypted schema-7 claimed and unclaimed fixtures using generic synthetic values, no committed passphrase, and no real payer, account, merchant, location, or financial data. Test-only service sessions and controlled interleaving hooks are isolated in `test/browser/phase3c-fixture.js:95-180`.

The production guard remains in the allocation service: any allocation referenced by canonical `reimbursementClaimAllocations` rejects with `CLAIM_LINKED` before mutation (`js/services/allocationService.js:238-250`).

## Files changed

Phase 3C production and documentation delta:

- `js/domain/constants.js` — stable V2 write-lease key.
- `js/vault.js` — generation validation/fallback, coordinated write, lease, conflict errors, restore/passphrase support.
- `js/services/vaultRepository.js` — repository generation and coordination boundary.
- `js/services/stateService.js` — validation plus generation-aware create/unlock/save/restore/passphrase contracts.
- `js/services/reimbursementService.js` — preserve `VAULT_CONFLICT` through atomic rollback without exposing causes.
- `js/app.js`, `index.html`, `app.css` — generation ownership, direct-mutation rollback, and minimal generic conflict banner/reload flow.
- `test/vault-coordination.test.js` — 20 coordination, rollback, compatibility, restore, passphrase, and privacy tests.
- `test/browser/phase3c.html`, `test/browser/phase3c-fixture.js` — synthetic controlled-browser harness.
- `docs/engineering/IMPLEMENTATION_STATUS.md` — Phase 3C marked implemented/awaiting acceptance; reimbursement and Plaid statuses preserved.
- This implementation report.

The worktree also retains the previously completed and reviewed Phase 3B acceptance changes in `test/reimbursement-service.test.js` and `docs/engineering/V2A_REIMBURSEMENT_SERVICE_ACCEPTANCE.md`; those are not product-scope expansion by Phase 3C.

## Automated tests added

The 20 new cases in `test/vault-coordination.test.js:60-430` cover:

- fresh, absent, deterministic legacy, valid, and malformed generation metadata;
- schema-6-to-7 single migration write and schema-7 idempotent unlock;
- matching, stale, repeated-stale, two-writer, and three-writer sequences;
- conflict before temp write, after temp write, and before promotion;
- active, malformed, expired, abandoned, mismatched-owner, collided-owner, and mid-write-expiry lease behavior;
- missed storage events with authoritative rejection;
- allocation, bucket, and reimbursement deep rollback;
- stale and successful restore semantics plus preserved V1 evidence;
- stale and successful passphrase changes;
- error/metadata privacy and failed-write active/temp/generation invariants.

All prior 126 tests remain in the same suite and pass, including wrong-password, corrupted ciphertext, interrupted migration, invalid state, failed restore, V1 recovery, schema-7 reload, and claimed-allocation compatibility tests.

## Command results

| Command | Result |
|---|---|
| `pnpm test` | PASS — 146 tests, 146 passed, 0 failed, 0 skipped; 3,536.817333 ms. |
| `pnpm run check` | PASS — syntax checks for production JavaScript completed successfully. |
| `node --check test/browser/phase3c-fixture.js` | PASS. |
| `python3 -m py_compile start.py` | PASS. |
| `git diff --check` | PASS — no whitespace errors. |

## Controlled browser evidence

The browser checks used two simultaneously controlled tabs on `http://127.0.0.1:18990` with synthetic encrypted state and DOM verification.

- **Claimed allocation:** the Split Editor exposed “Allocations linked to a reimbursement claim cannot be edited in this phase.” No draft persisted; `stateRevision` stayed 0, `vaultGeneration` stayed unchanged, and the claim/allocation relationship survived lock/unlock.
- **Allocation conflict:** both tabs loaded the same initial generation. Tab A saved ownership. Tab B retained an unsaved note after the advisory banner, then received `VAULT_CONFLICT`; encrypted revision/generation and Tab A's winner remained authoritative. After reload, the intended note was reapplied and saved at revision 3.
- **Bucket conflict:** Tab A renamed the synthetic bucket. Tab B displayed the generic storage-event warning, attempted a stale rename, received the generic conflict in the Bucket Explorer status, and rolled back. Reload showed Tab A's name; retry then saved Tab B's intended name. Encrypted inspection reported `Synthetic bucket B`.
- **Reimbursement-service conflict:** two test-only service sessions loaded revision 0 and the same generation. Writer A committed one payer-label change at revision 1. Writer B returned `VAULT_CONFLICT`; its session rolled back to revision 0 with the original payer label, while encrypted inspection retained Writer A's claim, relationship, and label.
- **Abandoned writer:** an expired synthetic lease was replaced and a later safe write succeeded at revision 2 with one new generation.
- **Temporary-write conflict:** a synthetic active-generation change immediately before promotion returned `VAULT_CONFLICT`; encrypted inspection reported the newer active generation and `temporaryPresent:false`.
- **Regression:** fresh vault create, primary navigation (Overview, Weekly Review, Bucket Explorer, Travel, Settings), and lock/unlock passed. Existing-vault unlock, unclaimed Split Editor save, claimed Split Editor guard, and generic reload flow passed. Backup/restore and passphrase paths were covered by automated encrypted-vault tests; browser upload/dialog automation was not necessary for those already deterministic service contracts.
- **Scope/console:** DOM inspection found no Reimbursements, Shared Expenses, or Plaid workflow. Controlled harness, both application tabs, and fresh-vault smoke tab each reported zero warnings/errors.
- Synthetic fixtures and the smoke vault were removed after testing; browser test tabs were closed.

## Defects found and changes made

1. The active encrypted envelope previously had no externally comparable version, permitting independent loaded tabs to overwrite one another. Added opaque generations plus lease-protected compare-before-promotion.
2. Direct V1-compatible app mutations persisted without uniformly advancing `stateRevision` or restoring their in-memory mutation after a persistence conflict. Routed these mutations through `applyCanonicalChange` (`js/app.js:110-121`, `js/app.js:624-663`).
3. Reimbursement atomic operations wrapped persistence conflicts as a generic service failure, hiding the distinction from future UI. Preserved `VAULT_CONFLICT` while retaining full snapshot rollback and Phase 3B error privacy (`js/services/reimbursementService.js:156-185`).
4. Current screens lacked a generic stale-vault recovery path. Added the minimal non-domain-specific banner and explicit lock/reload behavior (`index.html:63-67`, `js/app.js:721-730`).

No unresolved functional defect was reproduced after these changes and validations.

## Unresolved risks and limitations

- Web Storage does not provide a true multi-record transaction or atomic compare-and-swap. The lease plus owner/generation rechecks materially narrows interleavings and passed controlled/adversarial coverage, but cannot provide the formal guarantees of IndexedDB transactions or a platform lock combined with transactional storage. Independent acceptance should stress real multi-process scheduling.
- `vaultGeneration`, lease, and temporary pending-write metadata are intentionally unencrypted and are not authenticated by AES-GCM AAD to preserve existing backup/AAD compatibility. They contain no business data. Malformed metadata fails closed; valid same-origin tampering can force conflicts or denial of service. It cannot decrypt the vault.
- Storage events do not fire in the writing tab and delivery is not guaranteed before an attempted write. They remain advisory by design; correctness depends on the repository check.
- The existing allocation summary phrase “Not yet linked to a repayment” is not claim-aware. The production mutation guard is correct, and changing reimbursement-facing product language is outside Phase 3C.
- Backup/restore browser file-picker coverage was not repeated because the available controlled browser path would add dialog/upload complexity without strengthening the tested repository guarantees. Automated encrypted restore coverage includes successful restore, failed verification, stale conflict, legacy evidence, and revision/generation semantics.

## Recommended independent acceptance review

1. Review `writeCoordinated` and attempt adversarial two-process scheduling around the final lease/generation check and active `setItem`.
2. Re-run all 146 automated tests and the two-tab allocation, bucket, and test-only reimbursement scenarios.
3. Inspect raw active/temp/lease envelopes to confirm only approved non-sensitive coordination fields exist.
4. Repeat V2-without-generation, V1 primary/temp recovery, wrong-password, corrupted-ciphertext, restore, and passphrase cases.
5. Confirm the production navigation exposes no test harness or reimbursement workflow and that implementation status remains awaiting acceptance.

Do not mark this phase accepted from this implementation report. Acceptance should be recorded only in a separate independent review.
