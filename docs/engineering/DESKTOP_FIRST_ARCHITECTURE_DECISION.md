# Money Moves — Desktop-First Architecture Decision

**Decision date:** 2026-08-05
**Status:** Accepted founder direction; implementation foundation awaiting independent acceptance

## Decision

Money Moves private beta is a macOS-first Electron desktop application with one authoritative encrypted local vault per user. The local vault is the live source of truth. The beta has no hosted live transaction database, automatic sync, multi-device editing, phone editing, shared vaults, or automatic cloud backup.

```text
Money Moves desktop app
        ↓
authoritative encrypted local vault
        ↓
manual encrypted .mmvault backup
        ↓
future optional encrypted cloud backup
        ↓
future trusted Plaid backend
```

## Rationale and scope

The beta needs dependable offline personal-finance workflows, simple ownership, and a smaller security/operational boundary than a live synchronization system. This decision preserves existing financial-domain work: schema 7, migrations, canonical IDs, buckets/sub-buckets, allocations, reimbursement services, audit history, manual overrides, unknown-account/null-location semantics, and integer-cent accounting.

The Electron main process owns lifecycle, native dialogs, and encrypted file persistence. The renderer retains unlocked state in memory, domain services, migration/validation, and encryption/decryption. A narrow preload bridge is the only renderer-to-main boundary.

## Deferred hosted direction

The Supabase/Vercel implementation, migrations, tests, and reports remain in the repository as historical research. Its status is **DEFERRED / NOT ACCEPTED**. The Electron production runtime does not import its hosted adapter, configure Supabase, authenticate with OAuth, or treat a remote row as vault authority.

Future cloud backup may receive only an encrypted envelope. It must preserve local authority, be explicit, avoid state merging, and never make a local financial save depend on network availability.

## Privacy and recovery model

The vault directory contains encrypted envelopes only. `active.mmvault` is authoritative; `pending.mmvault` and `previous.mmvault` are recovery evidence, never newer authority simply because of timestamps. A valid active vault wins over pending/previous evidence. Missing or corrupt active data is not silently rolled back; users retain their files and restore an explicit encrypted backup.

There is no passphrase recovery. A forgotten passphrase can permanently prevent access to both the vault and encrypted backup. Manual export copies ciphertext without decrypting it and does not change financial state, `stateRevision`, or `vaultGeneration`.

## Private-beta platforms and limits

The beta target is Apple-silicon macOS, distributed as an unsigned development DMG. Windows packaging, Mac App Store distribution, production signing, hardened-runtime entitlements, notarization, automatic updates, and phone access are not part of this phase.

Plaid remains future work. Its eventual shape is Electron → trusted backend → provider ingestion/reconciliation → canonical source records → local encrypted vault. No renderer receives a Plaid secret, service-role credential, or long-lived provider token.

## Reconsideration triggers

Reconsider cloud backup after independent desktop acceptance and a written encrypted-backup threat/recovery design. Reconsider live sync only after product demand justifies explicit conflict/merge semantics, independent security review, backend operations, multi-device acceptance tests, and a revised founder decision. Reconsider Plaid only with an accepted trusted-backend design.
