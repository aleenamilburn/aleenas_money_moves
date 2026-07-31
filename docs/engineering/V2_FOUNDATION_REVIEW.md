# Money Moves V2 Foundation Review

Date: 2026-07-31

## Scope and outcome

This review covered the V2 foundation and every production caller of its state and vault boundary. It did not add a screen, Plaid, a transaction-import workflow, sub-bucket UI, split UI, or reimbursement UI.

Outcome: the foundation is suitable to retain as the V2 persistence and domain-model base. The review found several correctness gaps in the initial implementation; all were corrected and regression-tested. No open Critical or High-severity issue remains in the reviewed code.

Severity meanings: Critical = likely data loss or security boundary failure; High = migration/recovery correctness failure; Medium = data integrity or operational-recovery concern; Low = hardening/documentation concern.

### Review limits and assumptions

The verified findings are limited to this repository and its local test/browser environment. No real historical browser-vault export was available, so encrypted V1 compatibility is verified against a source-compatible AES-GCM/PBKDF2 fixture rather than an end-user vault. The caller review found no dynamic imports or production `localStorage` caller outside `js/vault.js`; an external, out-of-repository consumer of these ES modules was not available to inspect.

## Verified findings

### 1. V1 data and behavior are preserved

**Severity: High — resolved**

**Verified behavior.** `migrateState` clones its input before applying ordered steps, keeps the original V1 categories, stores a category copy in `legacyV1`, and produces labelled aggregate snapshots instead of fabricating normalized transaction history. The V2 canonical store begins with an explicit `unknown-account` and no synthetic V1 account or transaction records. See [js/domain/migrations.js](../../js/domain/migrations.js) lines 10-12, 72-76, 85-110, and 113-159.

The legacy UI adapter retains unknown transaction properties via `...raw`, preserves V1 categories, preferences, debts, goals, destinations, monthly history, and custom rule fields, and no longer injects seed accounts, recurring entries, transactions, or destinations into an existing user state. See [js/state.js](../../js/state.js) lines 69-88, 91-101, 130-159, and 173-190.

**Change made.** Removed the prior seed-transaction/provider-snapshot merge from existing vault hydration. An account omitted by a legacy transaction is now represented as the explicit `Unknown account`, never as a fabricated account name. See [js/state.js](../../js/state.js) lines 63-88 and 150-159.

**Test evidence.** [test/state-compatibility.test.js](../../test/state-compatibility.test.js) lines 24-91 verifies category retention, custom transaction data, destinations, rules, debts, goals, preferences, monthly history, no seed-data injection, deterministic hydration, and explicit unknown account handling.

### 2. Migrations are deterministic, non-mutating, and idempotent

**Severity: High — resolved**

**Verified behavior.** Migration steps are versioned 1→2→3→4 and record their IDs once. The migration clock is either caller-supplied or deterministically derived from the source snapshot date, with the epoch used when no date exists. Post-migration state is validated before being returned. See [js/domain/migrations.js](../../js/domain/migrations.js) lines 4-8, 27-37, 170-194.

The legacy UI hydration path now passes the same migration timestamp through transaction, rule, month, and week defaults. See [js/state.js](../../js/state.js) lines 91-93, 130-148, 161-185.

**Change made.** Replaced clock-dependent rule IDs, transaction timestamps, and selected-week fallback with deterministic values derived from the migration timestamp. See [js/state.js](../../js/state.js) lines 56-60, 130-136, and 169-171.

**Test evidence.** [test/migrations.test.js](../../test/migrations.test.js) lines 7-60 verifies source immutability, ordered migration IDs, idempotency, deterministic no-clock behavior, pre-migration rejection, and future-schema rejection. [test/state-compatibility.test.js](../../test/state-compatibility.test.js) lines 79-105 verifies deterministic legacy hydration including the no-transaction case.

### 3. There is one authoritative active vault

**Severity: High — resolved**

**Verified behavior.** Vault selection has a strict precedence order:

| Record | Role | Selection rule |
| --- | --- | --- |
| `money-moves-vault-v2` | Active V2 vault | Always authoritative when present, including when malformed. |
| `money-moves-vault-v2-temp` | Verified interrupted-write recovery | Used only when no V2 primary exists. |
| `verdant-vault-v1` | Legacy recovery source | Used only when no V2 record exists. |
| `verdant-vault-v1-temp` | Legacy interrupted-write recovery | Used only when no primary V1 or V2 record exists. |

This precedence is implemented in [js/vault.js](../../js/vault.js) lines 27-55. A malformed V2 primary throws rather than silently falling back to V1. All writes target only the V2 temporary and primary keys through the verified atomic routine; V1 keys are never write targets. See [js/vault.js](../../js/vault.js) lines 105-110 and 127-165.

**Change made.** Hardened malformed-current-vault handling, added V2 temporary-record recovery, added V1 temporary-record recovery, and removed the unused direct backup-install API that bypassed the repository/service path.

**Test evidence.** [test/vault-migration.test.js](../../test/vault-migration.test.js) lines 97-141 verifies malformed V2 precedence, interrupted V1→V2 write recovery, and repeated unlocks reading only V2 without rewriting it. Lines 58-84 verify V1 temporary and plaintext recovery paths.

### 4. The legacy vault remains a recovery source but is not active after migration

**Severity: High — resolved**

**Verified behavior.** A successful V1 decrypt returns `needsVaultMigration`; the service validates and writes the migrated state to V2. Subsequent reads select V2 first, while `clearVault` deletes only V2 records and leaves V1 unchanged. See [js/vault.js](../../js/vault.js) lines 136-150 and 183-187; [js/services/stateService.js](../../js/services/stateService.js) lines 32-39 and 54-62.

**Change made.** The old plaintext V1 state key is now a usable recovery source at first setup, rather than merely being attached to the seed object. The app passes it through the validated create path and keeps the plaintext original in place. See [js/app.js](../../js/app.js) lines 27, 311-321, and 411-421; [js/services/stateService.js](../../js/services/stateService.js) lines 27-30.

**Test evidence.** [test/vault-migration.test.js](../../test/vault-migration.test.js) lines 17-29, 45-84, and 176-188 verify that legacy encrypted, legacy temporary, and legacy plaintext data remain intact while V2 becomes the active record.

### 5. Failure paths validate before persistence and preserve the current vault

**Severity: High — resolved**

**Verified behavior.** The migration framework validates a supplied canonical domain before mutation and validates again after migration. The service validates before every create, unlock migration write, save, passphrase change, and restore persistence operation. See [js/domain/migrations.js](../../js/domain/migrations.js) lines 39-45 and 170-194; [js/services/stateService.js](../../js/services/stateService.js) lines 7-18 and 27-59.

Wrong passwords fail while decrypting, before the service can call `save`. Invalid decrypted domain state and invalid saves are rejected before the V2 record changes. Backup restore verifies/decrypts and migrates before it writes. See [js/vault.js](../../js/vault.js) lines 136-150 and 174-180; [js/services/stateService.js](../../js/services/stateService.js) lines 54-59.

**Test evidence.** [test/vault-migration.test.js](../../test/vault-migration.test.js) lines 31-43, 86-95, 136-174 verify failed restore, V1 and V2 wrong-password non-write behavior, invalid decrypted state rejection, and invalid-save non-overwrite behavior.

### 6. Domain model supports the required foundation relationships

**Severity: Medium — resolved**

**Verified behavior.**

- `Account` has a stable internal ID, optional external source identity, institution fields, explicit source, and nullable balance: [js/domain/models.js](../../js/domain/models.js) lines 87-101.
- `Transaction` has account identity, integer cents, lifecycle/state enums, nullable state/region/country metadata, and a `manualOverrides` object: [js/domain/models.js](../../js/domain/models.js) lines 104-125.
- Parent/child buckets are bounded to two levels and allocation sub-buckets must be children of their selected parent bucket: [js/domain/models.js](../../js/domain/models.js) lines 128-151, 200-217, and 276-283.
- Allocations must exactly cover a transaction whenever allocations exist: [js/domain/models.js](../../js/domain/models.js) lines 220-232 and 268-274.
- Reimbursement claims have allocation links and linked repayment transaction IDs; linked repayments must be reimbursement inflows: [js/domain/models.js](../../js/domain/models.js) lines 154-179 and 285-309.
- Merchant-rule action targets are runtime-validated against existing buckets: [js/domain/models.js](../../js/domain/models.js) lines 182-192 and 310-314.

**Change made.** Added external account identity and manual-override fields; enforced duplicate IDs, allocation totals, sub-bucket parentage, bidirectional reimbursement links, reimbursement-inflow links, and merchant-rule target references.

**Test evidence.** [test/models.test.js](../../test/models.test.js) lines 35-108 verifies every model, invalid monetary data, bucket depth, allocation totals, cross-collection references, linked reimbursement inflows, and merchant-rule target integrity.

### 7. Missing account and location data are not fabricated

**Severity: Medium — resolved**

**Verified behavior.** The migration creates only the explicit system `unknown-account`; it does not map static snapshot totals to invented accounts or convert V1 aggregate data into canonical transactions. See [js/domain/migrations.js](../../js/domain/migrations.js) lines 113-159 and [js/domain/models.js](../../js/domain/models.js) lines 320-336.

The transaction model leaves `locationRegion`, `locationCountry`, and `locationSource` nullable. Legacy transaction normalization preserves raw fields and uses the explicit `Unknown account` label only when no account is present. See [js/domain/models.js](../../js/domain/models.js) lines 104-125 and [js/state.js](../../js/state.js) lines 63-88.

**Test evidence.** [test/state-compatibility.test.js](../../test/state-compatibility.test.js) lines 43-76 and 79-105 verifies no seed accounts/locations are inserted and that absent account data becomes explicit unknown rather than a fabricated identity.

### 8. Branding is canonical in production/user-facing code

**Severity: Low — resolved**

**Verified behavior.** The product string is defined as `Money Moves` and V2 metadata uses the new product name and new vault keys. See [js/domain/constants.js](../../js/domain/constants.js) lines 1-7 and [js/vault.js](../../js/vault.js) lines 80-94. The UI title/branding was browser-tested as `Money Moves`.

The only production matches for `Verdant`/`Aleena` are the V1 key names and AES-GCM additional authenticated data needed to decrypt old encrypted data: [js/domain/constants.js](../../js/domain/constants.js) lines 8-13. They are backward-compatibility identifiers, not user-facing branding.

## Changes made during this review

1. Made migration time and legacy hydration deterministic.
2. Prevented seed sample accounts, transactions, recurring items, and destinations from being inserted into an existing user vault.
3. Added strict active-vault precedence, malformed-V2 refusal, and temporary-record recovery.
4. Preserved and migrated the plaintext V1 recovery state through the normal create/service boundary.
5. Added pre- and post-migration validation plus pre-persistence rejection coverage.
6. Strengthened domain relationship validation for accounts, buckets, allocations, claims, repayments, and merchant rules.
7. Removed the unused direct backup installation bypass so callers use the repository/service boundary.
8. Added a missing-scripture render guard so a preserved empty V1 scripture list does not break the unchanged overview screen. See [js/app.js](../../js/app.js) lines 118-124.

## Tests added or expanded

- `test/migrations.test.js`: deterministic no-clock migration and invalid pre-migration state.
- `test/models.test.js`: complete relationship validation, child buckets, allocation total, linked reimbursement inflow, and merchant-rule target checks.
- `test/state-compatibility.test.js`: custom V1 data retention, no seed-data injection, deterministic unkeyed rule/transaction hydration, and deterministic empty-week behavior.
- `test/vault-migration.test.js`: legacy temporary vault, plaintext recovery, V1/V2 wrong passwords, malformed V2 precedence, interrupted migration, invalid decrypted state, invalid save, and repeated V2 unlock.

## Commands run and results

| Command | Result |
| --- | --- |
| `pnpm test` | Initial shell attempt could not find `pnpm` on PATH. |
| `/Users/aleenamilburn/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm test` | Passed: 25 tests, 0 failed. |
| `/Users/aleenamilburn/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm run check` | Passed: all reviewed JavaScript files parsed successfully. |
| `PYTHONPYCACHEPREFIX=/private/tmp/money_moves_pycache /Users/aleenamilburn/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m py_compile start.py` | Passed. |
| Local browser smoke test at `http://127.0.0.1:18891/` and `http://127.0.0.1:18892/` | Passed: canonical title/branding, create vault, lock, correct unlock, unchanged V1 navigation, and no console errors. The expected wrong-password UI message was also exercised before correct unlock. |
| `rg` production-source checks for Plaid, obsolete branding, and `localStorage` callers | No Plaid match; legacy branding appears only in compatibility constants; direct browser-storage access is confined to `js/vault.js`. |

## Unresolved risks

1. **Medium — localStorage quota/interruption recovery is bounded by browser storage.** The atomic writer intentionally holds a V2 temporary copy before replacing the primary record ([js/vault.js](../../js/vault.js) lines 105-110). A quota failure preserves the existing primary/legacy source and a valid temporary record is recoverable, but users need sufficient space for the temporary ciphertext.
2. **Medium — corrupt-primary recovery is intentionally conservative.** A malformed active V2 record refuses automatic V1 fallback to prevent overwriting the current vault ([js/vault.js](../../js/vault.js) lines 34-50). Recovery currently requires restoring an encrypted backup or deliberately clearing only V2; the UI gives a generic damaged-vault message rather than a guided recovery flow. No new screen was added in this task.
3. **Low — compatibility testing uses a source-compatible V1 envelope fixture.** The test encrypts the documented V1 AES-GCM/PBKDF2 shape ([test/helpers.js](../../test/helpers.js) lines 46-66). Before shipping broadly, add a fixture exported by a real prior V1 browser vault if one can be obtained safely.
4. **Low — the foundation models are intentionally not yet connected to new V2 workflows.** They validate future parent/child buckets, allocations, claims, repayment links, source account identities, location metadata, and manual overrides, but this review intentionally did not add the corresponding UI or transaction workflow.

## Scope confirmation

No Plaid code, Plaid calls, transaction-import workflow, sub-bucket UI, split UI, reimbursement UI, or new product screens were added. The pre-existing V1 CSV controls remain untouched in [js/app.js](../../js/app.js) lines 292-307 and 335-338.
