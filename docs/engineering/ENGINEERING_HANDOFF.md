# Money Moves Engineering Handoff

## Current repository state

- Repository: `/Users/aleenamilburn/Downloads/aleenas_money_moves`
- Branch: `main`
- Hosted correction preservation checkpoint: `c591368` (`Harden hosted storage correction candidate`)
- Desktop foundation candidate: `v2-desktop-foundation-candidate` (`Implement desktop-first Electron foundation`)
- Current domain schema: 7
- Desktop package version: `2.0.0-desktop.0`
- Founder direction: macOS-first Electron desktop app with one authoritative encrypted local vault per owner.

## Desktop foundation

The desktop implementation is **IMPLEMENTED / AWAITING ACCEPTANCE**. Read `DESKTOP_FIRST_ARCHITECTURE_DECISION.md` and `V2_DESKTOP_FOUNDATION_IMPLEMENTATION.md` first.

- `electron/main.js` owns lifecycle, single-instance behavior, a local application protocol, native dialogs, narrow IPC dispatch, and encrypted files.
- `electron/preload.js` exposes a frozen `moneyMovesDesktop` API only; no generic IPC, Node, filesystem, process, or Electron internals reach the renderer.
- `js/services/desktopVaultRepository.js` keeps encryption/decryption, schema migration, domain validation, and unlocked state in the renderer.
- `electron/localVaultRepository.js` stores only encrypted envelopes in `active.mmvault`, `previous.mmvault`, and `pending.mmvault`, with read-back verification, previous preservation, atomic promotion, permissions, and generation conflicts.
- Electron 43.3.0 / Forge 7.11.2 produce an unsigned ARM64 macOS app, DMG, and ZIP. `inspect:package` scans filesystem/ASAR content and the empty seed.

## Product boundaries

The local vault is live authority. Backup/export is manual and encrypted. Restore is explicit and conflict-protected. Existing browser users migrate only by exporting an encrypted backup and restoring it in Electron; there is no automatic localStorage/Vercel/Supabase migration or merge.

Hosted live vault sync is **DEFERRED / NOT ACCEPTED**. The historical Supabase code, migrations, reports, and setup guide are retained as research but are not in the Electron runtime. Encrypted cloud backup, Plaid, phone editing, multi-device editing, shared vaults, reimbursement UI, Shared Expenses, refunds, reporting redesign, automatic updates, signing, and notarization are not implemented.

## Validation evidence

- `CI=true pnpm run check`: passed.
- `CI=true pnpm run electron:test`: 8 passed, 0 failed.
- `CI=true pnpm test`: 148 passed, 0 failed.
- `CI=true pnpm run electron:package`: ARM64 macOS package passed.
- `CI=true pnpm run electron:make`: unsigned ARM64 DMG and ZIP passed.
- `CI=true pnpm run inspect:package`: passed (286 filesystem files and 66 ASAR entries scanned).
- Short isolated Forge development and packaged-app launch smoke checks completed with no console output after the custom-protocol fix. They are not an acceptance report.

## Recommended next task

Perform an independent desktop acceptance review with synthetic data: create/unlock/save/relaunch; allocation edit/relaunch; backup/restore; second-instance focus; stale generation; interrupted/pending/previous recovery states; dialog cancellation; invalid/oversize backup; console capture; and a clean-machine DMG install. Decide Apple signing/notarization readiness separately. Do not begin cloud backup or Plaid before this acceptance review.
