# Money Moves Engineering Handoff

## Current repository state

- Repository: `/Users/aleenamilburn/Downloads/aleenas_money_moves`
- Branch: `main`
- Hosted correction preservation checkpoint: `c591368` (`Harden hosted storage correction candidate`)
- Desktop foundation candidate reviewed: `v2-desktop-foundation-candidate` (`99c04ee`, `Implement desktop-first Electron foundation`)
- Current domain schema: 7
- Desktop package version: `2.0.0-desktop.0`
- Founder direction: macOS-first Electron desktop app with one authoritative encrypted local vault per owner.

## Desktop foundation

The desktop implementation is **ACCEPTED WITH LOW-RISK FOLLOW-UPS**. Read `DESKTOP_FIRST_ARCHITECTURE_DECISION.md` and `V2_DESKTOP_FOUNDATION_ACCEPTANCE.md` first.

- `electron/main.js` owns lifecycle, single-instance behavior, a local application protocol, native dialogs, narrow IPC dispatch, and encrypted files.
- `electron/preload.cjs` exposes a frozen `moneyMovesDesktop` API only; no generic IPC, Node, filesystem, process, or Electron internals reach the renderer.
- `js/services/desktopVaultRepository.js` keeps encryption/decryption, schema migration, domain validation, and unlocked state in the renderer.
- `electron/localVaultRepository.js` stores only encrypted envelopes in `active.mmvault`, `previous.mmvault`, and `pending.mmvault`, with read-back verification, previous preservation, atomic promotion, permissions, and generation conflicts.
- Electron 43.3.0 / Forge 7.11.2 produce an unsigned ARM64 macOS app, DMG, and ZIP. `inspect:package` scans filesystem/ASAR content and the empty seed.

## Product boundaries

The local vault is live authority. Backup/export is manual and encrypted. Restore is explicit and conflict-protected. Existing browser users migrate only by exporting an encrypted backup and restoring it in Electron; there is no automatic localStorage/Vercel/Supabase migration or merge.

Hosted live vault sync is **DEFERRED / NOT ACCEPTED**. The historical Supabase code, migrations, reports, and setup guide are retained as research but are not in the Electron runtime. Encrypted cloud backup, Plaid, phone editing, multi-device editing, shared vaults, reimbursement UI, Shared Expenses, refunds, reporting redesign, automatic updates, signing, and notarization are not implemented.

## Validation evidence

- `CI=true pnpm run check`: passed.
- `CI=true pnpm run electron:test`: 23 passed, 0 failed.
- `CI=true pnpm test`: 163 passed, 0 failed.
- `CI=true pnpm run electron:package`: ARM64 macOS package passed.
- `CI=true pnpm run electron:make`: unsigned ARM64 DMG and ZIP passed.
- `CI=true pnpm run inspect:package`: passed (286 filesystem files and 25 ASAR entries scanned).
- Independent packaged-app and mounted-DMG synthetic acceptance runs passed create/unlock, CSV, bucket, allocation, persistence/relaunch, renderer-containment, and single-instance checks with no unexpected console/security warnings. See `V2_DESKTOP_FOUNDATION_ACCEPTANCE.md`.

## Recommended next task

Perform one manual native-dialog encrypted export → import → restore click-through on a beta Mac, then complete Developer ID signing/notarization readiness and a physical clean-Mac install. Do not begin cloud backup or Plaid before their separately approved phases.
