# Money Moves — V2 Desktop Foundation Implementation

**Status:** IMPLEMENTED / AWAITING ACCEPTANCE
**Base revision:** `c591368` (`Harden hosted storage correction candidate`)
**Implementation candidate:** `v2-desktop-foundation-candidate` (`Implement desktop-first Electron foundation`)
**Domain schema:** 7
**Desktop package:** `2.0.0-desktop.0`

## 1. Scope and hosted-candidate disposition

This phase packages Money Moves in Electron and makes an encrypted local file the authoritative vault for the desktop runtime. It preserves the existing renderer workflows, schema/migrations, canonical state, IDs, allocations, reimbursement service foundation, audit history, and V1 encrypted-backup compatibility.

The prior hosted correction was preserved separately at `c591368`. Hosted Supabase live-vault synchronization is retained as research but is **DEFERRED / NOT ACCEPTED** and is not loaded by the Electron runtime. The empty migration-valid `data.js` baseline remains in place.

## 2. Process architecture and security

`electron/main.js` owns Electron lifecycle, a single-instance lock, custom `money-moves://app` content protocol, native file dialogs, safe external Google-search opening, IPC sender validation, and encrypted envelope files. `electron/preload.js` exposes an immutable `window.moneyMovesDesktop` API with only vault inspection/read/create/save/restore/export/import and app version/platform/open-external methods. It does not expose `ipcRenderer`, generic invoke, filesystem paths, Node, Electron internals, process data, or shell access.

The renderer dynamically selects `js/services/desktopVaultRepository.js`; it continues to encrypt/decrypt, migrate, validate, and execute the existing financial services in memory. The desktop adapter does not import hosted Supabase code.

The production BrowserWindow uses `nodeIntegration: false`, context isolation, sandboxing, web security, no insecure content, no experimental features, and no webviews. CSP limits all application content to `self`; navigation, `window.open`, webviews, and permission requests are denied. The Forge fuses disable RunAsNode, NODE_OPTIONS, inspect arguments, extra file privileges, and non-ASAR application loads; cookie encryption and ASAR-integrity validation are enabled.

## 3. IPC and local vault contract

The local vault lives under Electron’s user-data directory:

```text
Money Moves/
  vault/
    active.mmvault
    previous.mmvault
    pending.mmvault
```

Only encrypted envelopes are written there. The repository validates public envelope shape/size but never decrypts state. On save/restore it serializes writes in-process, reads the active generation, rejects stale `expectedVaultGeneration` with `VAULT_CONFLICT`, writes and flushes `pending.mmvault`, byte-verifies it, preserves active ciphertext as `previous.mmvault`, atomically renames pending to active, and attempts a directory flush. Files are owner-only (`0600`); the directory is owner-only (`0700`) where supported.

`stateRevision` remains a domain-draft guard and advances only after successful financial mutations. `vaultGeneration` identifies each encrypted active-file replacement and changes for save, passphrase change, and restore. Backup/export and unlock/read do not change either. A failed write leaves active usable. A valid active vault is authoritative over pending/previous evidence; missing/corrupt active data is never silently rolled back.

## 4. Backup, restore, passphrase, and migration

Export uses a native save dialog and copies the encrypted active envelope as `.mmvault`; it does not decrypt it or accept a renderer-selected destination. Import uses a native open dialog, accepts a constrained `.mmvault` file, rejects links/oversize files, and returns an encrypted envelope to the renderer. The renderer verifies the passphrase, migrates and validates canonical state, then explicitly confirms replacement before conflict-protected restore.

Existing browser/hosted prototype users migrate through: encrypted browser backup export → Electron `.mmvault` import → local decrypt/migrate/validate → explicit restore. There is no automatic browser-localStorage/Vercel/Supabase import, no automatic merge, and no passphrase recovery.

## 5. Packaging and content controls

Electron 43.3.0 and Electron Forge 7.11.2 are pinned. Forge produces an ARM64 macOS app bundle, ZIP, and unsigned development DMG with ASAR enabled. The configured packager ignores browser test fixtures, hosted/supabase material, docs, source maps, personal/development cache folders, local configs, and sample files. `scripts/inspect-package.mjs` scans both emitted filesystem assets and `app.asar`, including the empty-seed check.

Future signing/notarization hooks are intentionally not configured with credentials. Add Developer ID signing, hardened runtime, entitlements, and notarization only in a release-readiness phase.

## 6. Files and tests

Key implementation files: `electron/main.js`, `electron/preload.js`, `electron/localVaultRepository.js`, `js/services/desktopVaultRepository.js`, `forge.config.js`, package scripts/configuration, package inspector, renderer CSP/runtime selection, and focused desktop tests.

Focused tests cover envelope validation, create/load/save, stale conflict, byte-verified promotion, prior-envelope preservation, failed promotion rollback, malformed pending evidence, non-automatic recovery, permissions, constrained import, renderer encryption/passphrase/generation behavior, V1 encrypted backup verification, IPC/preload shape, BrowserWindow security, CSP, protocol, fuse configuration, and asset exclusion. Existing browser/domain regression remains separately preserved.

Commands run during implementation:

```text
CI=true pnpm run check                         passed
CI=true pnpm run electron:test                 8 passed, 0 failed
CI=true pnpm test                              148 passed, 0 failed
PYTHONPYCACHEPREFIX=/private/tmp/money_moves_pycache python3 -m py_compile start.py  pending final rerun
CI=true pnpm run electron:package              passed (ARM64 macOS app)
CI=true pnpm run electron:make                 passed (unsigned DMG and ZIP)
CI=true pnpm run inspect:package               passed (286 files, 66 archive entries)
```

The controlled Forge development launch and packaged launch smoke checks loaded the app with isolated temporary Chromium profiles and emitted no Electron console error after the custom-protocol fix. This is not independent acceptance and does not replace the full manual workflow matrix.

## 7. Known limitations and acceptance recommendation

No Apple signing/notarization occurred. No automatic updates, cloud backup, live synchronization, phone editing, shared vaults, Plaid, external ingestion, reimbursement UI, Shared Expenses, refund workflow, or reporting redesign was added. The recovery UI is intentionally conservative: non-authoritative pending/previous files are not automatically promoted.

Acceptance review should perform the synthetic full Electron sequence: create/unlock/mutate/relaunch, allocation edit/relaunch, native backup/restore, second-launch focus, interrupted-write recovery, stale external generation, native dialog cancellation, file permissions, malformed/oversize backups, console capture, and a clean-machine DMG install. It should separately decide signing/notarization readiness and later encrypted cloud-backup semantics.
