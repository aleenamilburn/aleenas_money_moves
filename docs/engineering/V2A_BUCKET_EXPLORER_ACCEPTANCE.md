# Money Moves V2A Phase 1 Acceptance Review

**Review date:** 2026-07-31  
**Base revision reviewed:** `350d26c0fe3b29f1fd8c26f5504f714f8f713155` (`v2a-phase1-bucket-explorer-candidate`)  
**Decision:** **ACCEPTED WITH LOW-RISK FOLLOW-UP**

The Bucket Explorer and two-level sub-bucket implementation is accepted. Automated, encrypted-vault, static-validation, Python syntax, and browser acceptance checks pass after the narrowly scoped corrections listed below. No new product workflow, transaction import, Plaid integration, split editor, or reimbursement UI was added.

The one follow-up is operational rather than a known code defect: no genuine historical V1 encrypted vault was available in the accessible workspace or adjacent Downloads search. Acceptance therefore used the repository's structurally representative V1 encrypted fixture plus a synthetic encrypted browser vault. A redacted copy of a genuine V1 vault should be exercised before rollout to that specific data population.

## Evidence handling and authoritative specification

- The authoritative specification reviewed was `docs/Money_Moves_Product_Requirements_Document_v1.0.docx`. Its Bucket Explorer requirements cover parent management, exactly two hierarchy levels, drill-down, and safe lifecycle behavior. The document was rendered and visually reviewed in full (41 pages).
- Stale documentation references to the former PRD filename were corrected in `docs/engineering/V1_CODEBASE_AUDIT.md` and `docs/engineering/V2A_BUCKET_EXPLORER_IMPLEMENTATION.md`. No code behavior changed for this correction.
- A filename/signature search found **zero genuine historical V1 encrypted-vault candidates**. The search did not print file paths or contents. No genuine vault was decrypted, copied, modified, or deleted, and no decrypted user-data artifact was written to disk.
- Browser results and this report intentionally contain only structural counts and pass/fail facts. Merchant names, transaction descriptions, account identifiers, and browser-vault financial amounts are omitted.

## Acceptance matrix

| Area | Result | Verified evidence | Classification |
|---|---|---|---|
| V1 source preservation | PASS | Migration clones input, retains original categories and review buckets in `legacyV1`, and acceptance tests compare the source before/after (`js/domain/migrations.js:73-90`, `test/bucket-acceptance.test.js:50-81`). | Verified |
| Deterministic/idempotent migration | PASS | A fixed migration timestamp produces an identical second migration; no speculative child buckets appear (`js/domain/migrations.js:194-218`, `test/bucket-acceptance.test.js:50-81`). | Verified |
| Parent/child depth | PASS | Model and service validation reject orphan parents, grandchildren, sibling-name collisions, invalid identifiers, and cycles (`js/domain/models.js:128-219`, `js/services/bucketService.js:96-159`, `test/bucket-acceptance.test.js:185-211`). | Verified |
| Authoritative totals | PASS | Canonical allocations take precedence; legacy-only and canonical-only transactions are each represented once; direct and child assignments roll up correctly (`js/services/bucketService.js:198-279`, `test/bucket-acceptance.test.js:83-128`). | Verified |
| Compatibility projection | PASS | Every bucket mutation synchronizes `review.buckets`; encrypted reload retains the projection (`js/services/bucketService.js:96-183`, `test/bucket-acceptance.test.js:130-157`). | Verified |
| Archive safety | PASS | Archive hides assignment choices but retains allocations/history; restore makes the item available again (`js/services/bucketService.js:160-183`, `test/bucket-acceptance.test.js:121-126`). | Verified |
| Persistence rollback | PASS | Failed save restores canonical and compatibility state in place, including partially applied reorder, while the prior encrypted vault remains unlockable (`js/services/bucketService.js:301-314`, `js/app.js:243-252`, `test/bucket-acceptance.test.js:159-183`). | Verified |
| Encrypted-vault compatibility | PASS | V1 fixture unlock/migrate/recovery, wrong password, corruption, interruption, invalid state, failed restore, repeated migration, and single-active-vault behavior remain covered (`test/vault-migration.test.js:17-198`, `js/vault.js:97-184`, `js/services/stateService.js:54-64`). | Verified with fixture |
| Account/location absence | PASS | Missing account renders as `Unknown account`; missing state/country remains null in the model and renders as an em dash, with no inferred geography (`js/services/bucketService.js:198-236`, `js/domain/models.js:87-126`). | Verified automatically; location rendering also observed in browser |
| Canonical branding | PASS | Repository scan found obsolete production strings only in the four immutable V1 vault keys/AAD constants required to decrypt recovery data (`js/domain/constants.js:8-12`). Other matches are compatibility tests or historical engineering records. | Verified |
| Browser interaction | PASS | Create, rename, reorder, move, archive/restore, detail navigation, filters, empty states, lock/unlock persistence, keyboard-visible focus CSS, and named controls passed with zero console errors/warnings. | Verified with synthetic encrypted browser vault |

## V1 migration and data reconciliation

The acceptance fixture is synthetic but structurally exercises legacy custom fields and all requested retained collections.

| Data | Before migration | After migration | Result |
|---|---:|---:|---|
| Categories / canonical top-level buckets | 3 | 3 | Exact one-for-one preservation |
| Transactions | 2 | 2 legacy records retained | Exact preservation |
| Merchant rules | 1 | 1 | Exact preservation |
| Destinations | 0 | 0 | Exact preservation |
| Debts | 1 | 1 | Exact preservation |
| Goals | 1 | 1 | Exact preservation |
| Monthly records | 1 | 1 | Exact preservation |
| Custom category, transaction, and rule fields | Present | Present in legacy snapshot | Exact preservation |
| Bucket order/archive state | Present | Preserved | Exact preservation |
| Speculative children | 0 | 0 | None fabricated |

Synthetic financial reconciliation was exact: the aggregate category snapshot remained **$165.00**, and the traceable assigned transaction ledger remained **$12.34**, with no rounding difference. A category with a **$45.00** aggregate-only snapshot correctly retained that snapshot while showing zero fabricated transaction rows. The difference between snapshot totals and traceable ledger totals is therefore an explicit source-data limitation, not migration loss.

A separate regression case covers V1 states containing both categories and additional user-created `review.buckets`. Migration now unions the original collections, deduplicates by identifier, retains custom fields, and excludes seed-only hydration buckets (`js/domain/migrations.js:73-97`, `test/state-compatibility.test.js:109-128`).

## Calculation and interaction findings

- **Authoritative path:** `bucketLedgerRows` builds a deduplicated transaction ledger, preferring canonical allocations when present and using legacy category data only when canonical data is absent (`js/services/bucketService.js:198-253`). `queryBucketDetail` applies assignment, account, review-status, date, and search filters before summing visible rows (`js/services/bucketService.js:255-279`).
- **Parent/child rollup:** parent totals include direct allocations and all child allocations; child totals include only that child. Archiving a child does not erase its historical allocations (`test/bucket-acceptance.test.js:102-126`).
- **Unassigned:** canonical and legacy unassigned transactions are returned once and expose unknown accounts explicitly (`js/services/bucketService.js:281-299`).
- **Browser reconciliation:** for a populated parent, displayed transaction count equaled visible row count and the exact visible-row sum equaled the displayed metric. The same equality held for account, review-status, and date filters. A nonmatching search and a child-assignment filter with no matches produced explicit zero/empty states.
- **Accessibility:** the Bucket Explorer contained 144 buttons in the exercised state, all with accessible names; no drag-only controls were present; keyboard focus styles include a visible outline. Child rows expose no add-child control.

## Defects found and corrections made

### High — original V1 review buckets could be omitted

When a V1 state contained `categories`, migration selected those categories and could omit additional user-created `review.buckets`. Migration now snapshots the original review collection and forms a stable, deduplicated union while still excluding review buckets injected later only for compatibility hydration (`js/domain/migrations.js:73-97`). Regression coverage is at `test/state-compatibility.test.js:109-128`.

**Disposition:** migrated/refactored and retained; no V1 data is deleted.

### Medium — failed bucket persistence lacked a directly testable transaction boundary

The UI restored state after save failure, but the behavior was coupled to the screen handler. `applyBucketChangeWithRollback` now snapshots the whole state, validates after mutation, awaits persistence, and restores the same state object on any error (`js/services/bucketService.js:301-314`, `js/app.js:243-252`). Tests cover a failed create and a partially applied reorder and confirm the previous encrypted vault remains valid (`test/bucket-acceptance.test.js:159-183`).

**Disposition:** refactored; existing V1 persistence behavior retained.

### Medium — allocation parent identity was not constrained to a parent bucket

An allocation could previously use a child identifier as `bucketId`, allowing the record to fall outside its expected parent rollup. Domain validation now requires `bucketId` to identify a top-level parent and uses `subBucketId` for the optional child (`js/domain/models.js:280-287`, `test/models.test.js:90-101`).

**Disposition:** hardened; malformed state is rejected before persistence.

### Low — obsolete PRD filename remained in engineering documentation

The two stale references were replaced with the authoritative filename. Backward-compatible storage identifiers were not renamed.

**Disposition:** corrected documentation; no production compatibility identifier deleted.

## Failure recovery and validation

- Validation runs before accepting a migrated domain, after migration, and immediately before bucket persistence (`js/domain/migrations.js:194-229`, `js/services/bucketService.js:301-314`).
- Wrong-password and corrupted-ciphertext attempts fail without writing an active vault. Interrupted legacy migration leaves the legacy recovery source intact. Successful migration activates only the Money Moves vault; subsequent unlocks do not read or write the legacy record (`js/vault.js:97-184`, `test/vault-migration.test.js:17-198`).
- Failed restore and future/invalid schema imports leave the current encrypted vault unchanged (`js/services/stateService.js:54-64`, `test/vault-migration.test.js:31-45`, `test/vault-migration.test.js:143-183`).
- Repeated migration is idempotent and does not introduce new children or reorder buckets (`test/migrations.test.js:24-31`, `test/bucket-acceptance.test.js:50-81`).

## Tests added or strengthened

- Added `test/bucket-acceptance.test.js` with five end-to-end service-level acceptance cases covering migration reconciliation, calculations/filters, compatibility projection plus encrypted reload, persistence rollback, and malformed hierarchy/state rejection.
- Added V1 review-bucket preservation and seed-exclusion coverage in `test/state-compatibility.test.js:109-128`.
- Added top-level allocation-parent validation coverage in `test/models.test.js:90-101`.
- Existing vault migration/recovery and V1 compatibility suites remain part of the full run.

## Commands run and results

| Command | Result |
|---|---|
| `pnpm test` | PASS — 37 tests, 0 failures |
| `pnpm run check` | PASS |
| `python3 -m py_compile start.py` | PASS |
| `git diff --check` | PASS |
| Browser acceptance against `python3 -m http.server 8765 --bind 127.0.0.1` | PASS — two encrypted-vault sessions, zero console errors/warnings |

No separate scripted browser-test target exists in `package.json`; the available browser smoke and acceptance coverage was therefore run interactively against the local server.

The Python bytecode artifact generated by `py_compile` was removed after validation; no production data was changed by validation.

## Unresolved risks and follow-up

1. **Low — genuine historical vault coverage.** No genuine V1 encrypted vault was available. Before rollout to a historical-vault cohort, repeat the same acceptance procedure using a redacted copy, compare only aggregate counts/totals and custom-field presence, and destroy any temporary decrypted material immediately.
2. **Low — aggregate-only historical totals.** V1 category snapshots can contain totals without transaction-level provenance. The UI deliberately preserves and labels that aggregate rather than inventing ledger rows. Future allocation editing must continue to distinguish these two sources.
3. **Deferred by scope.** Transaction allocation/split editing, reimbursements, account enrichment, location correction, and Plaid remain unimplemented. Their absence is not an acceptance failure for V2A Phase 1.

No other known acceptance blocker remains. Production rollout should retain the legacy vault recovery record and must not rename its backward-compatibility storage key.
