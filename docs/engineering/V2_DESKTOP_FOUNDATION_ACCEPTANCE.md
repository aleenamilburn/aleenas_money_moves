# Money Moves — V2 Desktop Foundation Acceptance

**Verdict:** ACCEPTED WITH LOW-RISK FOLLOW-UPS
**Reviewed candidate:** `99c04ee` / `v2-desktop-foundation-candidate`
**Historical hosted correction preserved:** `c591368`
**Review date:** 2026-08-05

## 1. Candidate reviewed

This was an independent review of the candidate diff from `c591368` to
`99c04ee`, the resulting source tree, and regenerated ARM64 macOS artifacts.
It did not rely on the implementation report's claims or test counts.

The target is one Mac user's authoritative encrypted local vault, without
Plaid, live cloud synchronization, automatic cloud backup, shared vaults, or
phone access. Hosted Supabase code remains historical research and is not part
of the desktop runtime.

## 2. Review independence

The review inspected Electron main/preload code, renderer selection, local
vault persistence, encrypted-envelope validation, native backup IPC, lifecycle
controls, Forge configuration, actual fuse bytes, CSP/navigation policy, and
the final ASAR. It added adversarial failure cases and then reran the package,
DMG, and controlled packaged-app evidence.

Four implementation defects were found and corrected during acceptance:

1. **High — packaged preload unavailable.** Electron loaded the ESM
   `preload.js` as a sandboxed CommonJS preload, leaving
   `window.moneyMovesDesktop` absent in the packaged app and causing the
   renderer to select the browser path. The bridge is now `preload.cjs` and the
   packaged runtime proves the frozen desktop API is present.
2. **High — promotion did not recheck external replacement.** A valid external
   replacement between the initial read and rename could be overwritten. The
   repository now compares generation and exact active bytes both before prior
   rotation and before promotion; the adversarial test returns `VAULT_CONFLICT`
   and preserves the replacement.
3. **High — predictable temporary paths could be raced with a symlink.** Pending,
   prior staging, reads, imports, and export destinations now use no-follow or
   exclusive opens. Symlink substitution tests verify the outside target and
   active vault remain unchanged.
4. **Medium — ASAR contained non-runtime hosted/dev material and a fresh empty
   vault threw while rendering the debt goal cards.** Forge now excludes hosted
   modules, Supabase/development dependencies, scripts, docs, and config from
   ASAR; the package inspector enforces that boundary. Empty goal cards now
   render a safe setup state instead of dereferencing a missing bucket.

No unresolved Critical or High defect remains.

## 3. Security findings

- Actual packaged runtime containment: `process`, `require`, `electron`,
  filesystem globals, and environment access were all `undefined` in the
  renderer. The exposed bridge contains only frozen `vault` and `app` objects.
- `BrowserWindow` uses disabled Node integration, enabled context isolation,
  sandboxing, web security, no insecure content, no webviews, denied windows,
  denied navigation away from `money-moves://app`, and denied permissions.
- Main-process IPC validates the trusted custom-protocol sender, constrains
  envelope and generation shapes/sizes, exposes no generic invocation surface,
  and accepts no renderer-selected filesystem path. Native dialogs select
  backup paths.
- CSP is `default-src 'self'` with `script-src 'self'`, `style-src 'self'`,
  `connect-src 'self'`, no `unsafe-eval`, and no remote production content.
- The final binary fuses are: RunAsNode **disabled**, NODE_OPTIONS **disabled**,
  inspect arguments **disabled**, ASAR integrity **enabled**, only-load-app-from-
  ASAR **enabled**, extra file privileges **disabled**, and cookie encryption
  **enabled**.
- The regenerated ASAR has 25 entries and excludes test assets, hosted/Supabase
  modules, development dependencies, local configuration, scripts, docs, and
  populated seed data. It contains no financial seed records or secrets.
- Main-process errors are converted to stable product codes/messages. The main
  process receives encrypted envelopes only; passphrases and derived keys stay
  in renderer memory and are not written to the vault files or logs.

## 4. Vault persistence findings

The local repository writes owner-only encrypted envelope files beneath the
per-user vault directory. It writes and fsyncs a fresh pending file, verifies
the exact ciphertext bytes through a no-follow read, fsyncs the directory,
preserves the former active ciphertext through an exclusive staging rename,
rechecks active generation/bytes, atomically promotes pending, then fsyncs the
directory before reporting success.

The failure matrix covers creation, read/save, generation advancement,
overlapping saves, stale generation, write/flush/verification/rotation/rename/
directory-sync failures, permission denial, deterministic disk-full,
malformed/oversized files, corrupt active with prior evidence, valid/malformed
pending evidence, interrupted and repeated recovery, external active
replacement, symlink substitution, file modes, and exact-byte export. A
post-rename durability error deliberately reports failure rather than claiming
durability; the new authoritative ciphertext and preserved prior remain
available on relaunch.

Valid active data is always authoritative. Pending and previous ciphertext are
recovery evidence only and are never automatically promoted or selected by
timestamp. No plaintext temporary file is created.

## 5. Backup and restore findings

- Export reads validated active ciphertext and writes an exclusive `.mmvault`
  destination with owner-only permissions. The exact bytes are preserved; vault
  generation and state revision do not change.
- Import accepts only a regular, non-symlink `.mmvault` under the size cap and
  accepts compatible V1 encrypted envelopes for migration.
- Renderer verification decrypts before migration/validation. Wrong passphrase
  and malformed ciphertext return sanitized stable errors, leaving active data
  untouched.
- The normal renderer restore path verifies, migrates, validates, takes an
  expected-generation guard, and writes one new generation. Its UI requires
  explicit confirmation before calling that path. Restore preserves the backup
  state revision; generation advances.
- A compatible V1 encrypted backup is covered by the adapter test.

The repository-level native-dialog boundary is covered by focused tests and the
packaged runtime bridge uses the native dialog methods. The full macOS UI
automation attempt reached the save panel but could not complete a selection in
this environment, so one manual native export → import → restore click-through
on a beta Mac remains a low-risk release checklist item. This is an evidence
gap, not a known integrity defect.

## 6. Passphrase findings

Correct passphrase unlock, wrong-passphrase sanitization, V1 verification,
generation advancement on save/passphrase change, and unchanged state revision
on passphrase change are covered by the desktop adapter and full regression
tests. Persistence failures occur before a successful key transition is
reported; the old active envelope remains unlockable. No sensitive key or
passphrase persistence was found.

## 7. Lifecycle findings

`app.requestSingleInstanceLock()` is active before window creation. A controlled
packaged run launched a second process while the first was unlocked; the second
exited and the existing process remained open. Generation checks still reject
stale writes independently of the single-instance guard. The controlled run
also closed, relaunched, unlocked, and read the encrypted vault from an isolated
user-data directory.

Abnormal-write states are represented by pending/previous evidence and covered
by deterministic interruption tests. There is no automatic recovery rollback.

## 8. Product regression findings

Using only synthetic data in the real packaged renderer, the review exercised
first-vault creation/unlock; Overview, Weekly Review, Bucket Explorer, Travel,
Debt & goals, and Settings navigation; CSV import; account provenance in the
allocation editor; bucket creation; a reviewed allocation; split-editor opening;
unknown-account fallback; close/relaunch persistence; and state-revision-backed
save behavior. No renderer or main-process console/security warning occurred in
the successful controlled runs.

Existing domain and V1 regression tests preserve canonical transaction,
allocation, reimbursement service, unknown-account, null-location, migration,
and revision invariants. No Plaid or hosted live-vault runtime path was added.

## 9. Packaged-app and DMG evidence

- Regenerated ARM64 app: `out/Money Moves-darwin-arm64/Money Moves.app`.
- Regenerated DMG: `out/make/Money Moves-2.0.0-desktop.0-arm64.dmg`.
- Regenerated ZIP: `out/make/zip/darwin/arm64/Money Moves-darwin-arm64-2.0.0-desktop.0.zip`.
- The DMG verified and mounted read-only at `/Volumes/Money Moves 1`, containing
  `Money Moves.app` and an Applications alias. The mounted app, outside the
  source tree, passed the same isolated create/import/bucket/allocation/relaunch/
  single-instance matrix, then the image detached cleanly.
- Build is ARM64 and ad-hoc signed by Electron only (`TeamIdentifier=not set`):
  it is unsigned for distribution and not notarized. This is expected for this
  engineering phase and is not an acceptance blocker.

## 10. Failure-injection evidence

Test-only constructor hooks are main-process-internal and inaccessible to the
production renderer. They inject pending write, file flush, verification,
previous rotation, promotion rename, permission, disk-full, and directory-sync
errors without weakening the packaged IPC contract. The focused desktop suite
also covers interrupted promotion/recovery, malformed evidence, conflicts,
symlinks, oversize input, and exact ciphertext export.

## 11. Exact validation results

| Command | Result |
|---|---|
| `pnpm test` | Environment-only non-interactive pnpm guard; no tests ran. |
| `CI=true pnpm test` | Passed: **163** tests, 0 failures. |
| `CI=true pnpm run electron:test` | Passed: **23** tests, 0 failures. |
| `CI=true pnpm run check` | Passed. |
| `PYTHONPYCACHEPREFIX=/private/tmp/money_moves_pycache python3 -m py_compile start.py` | Passed. |
| `git diff --check` | Passed. |
| `CI=true pnpm run electron:package` | Passed: ARM64 macOS app. |
| `CI=true pnpm run electron:make` | Passed: unsigned ARM64 DMG and ZIP. |
| `CI=true pnpm run inspect:package` | Passed: 286 filesystem files and 25 ASAR entries scanned. |
| Controlled packaged-app matrix | Passed from both `out/` and mounted DMG with synthetic data; no unexpected console/security warnings. |

## 12. Corrections made

- Converted the Electron preload to CommonJS (`preload.cjs`) and retained a
  narrow, immutable bridge.
- Hardened local vault promotion and path handling, including durable directory
  synchronization and adversarial conflict/symlink defenses.
- Added deterministic failure injection and persistence coverage.
- Removed hosted/development material from the distributed ASAR and enforced it
  in package inspection.
- Made a newly created empty vault render all preserved screens safely.

No data migration was added. Existing V1 encrypted backup compatibility and
schema-7 canonical state are preserved.

## 13. Remaining risks

1. One human native-dialog export/import/restore click-through remains before
   broad beta distribution because OS UI automation did not complete the save
   selection in this environment.
2. Developer ID signing, hardened-runtime release settings, and notarization
   remain a release-readiness task; do not present this development DMG as a
   generally installable public build.
3. A mounted-DMG run is strong packaging evidence but not a physical clean-Mac
   installation test.

These are low-risk follow-ups. They do not leave a known confidentiality,
atomicity, rollback, renderer-containment, or packaged-runtime defect.

## 14. Final verdict

**ACCEPTED WITH LOW-RISK FOLLOW-UPS**

Apple signing/notarization preparation may begin after the manual native-dialog
check. Plaid remains blocked until its separately scoped future backend phase;
encrypted cloud backup, live sync, phone/shared-vault access, and automatic
updates remain out of scope.
