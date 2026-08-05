# Money Moves — Hosted Encrypted Storage Implementation and Hardening

**Status:** IMPLEMENTED / AWAITING CORRECTION AND INDEPENDENT ACCEPTANCE

**Committed base:** `8a6db51569356312302a0babfdcff1c6456a43b6` (`claudes changes`)

**Historical accepted checkpoint:** `4c0eb5b649a3b30e9d03c978c9b6a66f1623a408`
(`v2a-phase3c-cross-tab-accepted`). The old persisted local writer lease is
historical; it is not the hosted write authority.

## Scope

Money Moves uses one RLS-owned Supabase `vaults` row per authenticated user. The
row contains an encrypted JSON envelope, not decomposed financial records. Google
OAuth establishes the account session. The browser derives the AES-256-GCM key with
PBKDF2-SHA-256; no passphrase, key, or decrypted financial state is sent to
Supabase or Vercel.

This hardening pass does not add Plaid, ingestion, institution mapping, bank sync,
reimbursement UI, Shared Expenses, refunds, reporting, hosted deletion, or a
custom vault API.

## Current data flow

```text
Google OAuth session
  -> Supabase Auth session JWT (browser account access only)
  -> RLS-scoped vault row read for auth.uid()
  -> client derives non-extractable key and decrypts locally
  -> validated canonical state in memory
  -> AES-GCM encrypts a full replacement envelope
       AAD = product/version + vault generation + vault sequence
  -> atomic UPDATE where user_id = auth.uid() and generation = expected
  -> one replacement ciphertext row and new generation
  -> second device reloads and unlocks that authoritative row
```

The hosted row is authoritative. There is no V2 decrypted or encrypted financial
cache. A browser-local, user-scoped checkpoint contains only the latest observed
generation and monotonic sequence; it is a rollback alarm, not financial data or a
write authority.

## Hosted metadata

Plaintext hosted fields are limited to `user_id`, `generation`, `created_at`,
`updated_at`, and the encrypted-envelope shape: envelope/product/schema versions,
timestamps, PBKDF2 parameters and salt, AES-GCM IV/AAD/ciphertext, generation, and
sequence. This reveals operational timing and cryptographic compatibility data, but
not transaction descriptions, accounts, notes, payer information, allocations,
reimbursements, totals, or raw keys.

## Write and generation contract

`stateRevision` advances once per successful financial/domain mutation before one
save attempt. It protects stale in-memory drafts.

`vaultGeneration` changes once per successful hosted envelope replacement. The
database enforces the expected generation in the write predicate. A write from two
devices at one original generation can therefore produce one success and one
`VAULT_CONFLICT`.

`vaultSequence` begins at 1 and advances exactly once for a hardened hosted write.
It is embedded in the AES-GCM AAD with `vaultGeneration`. The new SQL trigger
requires the row generation to match the envelope generation and the sequence to
advance exactly once. A malformed acknowledgement is reconciled by an RLS-scoped
read before success is reported.

Passphrase change leaves `stateRevision` unchanged but advances generation and
sequence. Backup is read-only. Restore validates/decrypts first, preserves the
backup state revision, and writes at the current hosted sequence using the expected
generation.

## Authentication and ownership

- One signed-in user owns one vault, via `vaults.user_id` as the primary key.
- No sharing, public access, anonymous access, client-selected owner substitution,
  or hosted delete action exists.
- RLS policies restrict select, insert, and update to `auth.uid() = user_id`.
- `plaid_secrets` is a future-only, default-deny table. Browser roles receive no
  policy or privilege.
- A locked vault can remain signed in; signing out clears the decrypted in-memory
  state. A same-user token refresh does not lock a vault. An identity change clears
  decrypted state before routing the new user.

## Local transition and portability

Existing V1 records remain untouched. A signed-in user with no hosted vault now
sees an explicit choice:

- create a new empty hosted vault while retaining the local record; or
- enter the local-vault passphrase to validate/migrate it locally and upload one
  new encrypted hosted copy.

The app never automatically merges or overwrites divergent local and hosted
records. If a hosted vault exists, adoption stops with a conflict and preserves both
copies. The user can download the encrypted local recovery record. A corrupt local
record does not block an existing hosted vault from opening.

Encrypted backup export reads the authoritative hosted envelope. Restore validates
and decrypts locally before a generation-protected replacement. Forgotten
passphrases remain unrecoverable by design.

## Corrections in this working candidate

| Finding | Correction |
|---|---|
| Generation was a mutable envelope hint. | Bind generation and sequence into AES-GCM AAD; reject outer/inner mismatch; add per-user checkpoint rollback alarm. |
| Server acknowledgement was accepted if merely non-empty. | Require exactly one returned attempted generation; otherwise reconcile with an authoritative read. |
| Database did not constrain envelope/generation coherence. | Add `0002_hosted_vault_integrity.sql` trigger, constraint, and browser-role grants/revokes. |
| Account switching could retain user A's unlocked state under user B. | Clear all decrypted state on identity change; preserve it only for same-user refresh. |
| Local V1 recovery was unreachable in the product. | Add explicit adoption, conflict, and encrypted-download flows; no automatic merge/import. |
| OAuth errors were displayed verbatim. | Convert provider/session diagnostics to stable generic errors. |
| Browser fixture targeted retired lease constants. | Retire it and add `test/browser/hosted-storage.html`, a hosted fake-CAS fixture. |
| Public bootstrap contained populated finance seed data. | Replace `data.js` with an empty migration-valid baseline; existing local and hosted vaults are untouched. |

## Deployment order

1. Keep a current encrypted backup.
2. Apply `0001_hosted_vault.sql` and `0002_hosted_vault_integrity.sql` to an
   isolated test project.
3. Deploy this static application with an untracked `js/config.js` containing the
   HTTPS Supabase project base URL and anon/publishable key.
4. Reload old clients. Legacy candidate envelopes migrate to the hardened envelope
   on their next verified unlock/save; older open application builds fail safely
   rather than bypassing the new sequence trigger.
5. Run the real-Supabase acceptance matrix with synthetic identities before any
   production financial data.

## Remaining acceptance limits

This document is not an acceptance report. The repository has no live two-user RLS
evidence, OAuth lifecycle evidence, deployed hardened build, applied `0002`
migration evidence, or real multi-profile/device contention evidence. A browser
local checkpoint detects a rollback only on a device that previously observed the
newer sequence; a fresh device cannot independently detect a malicious storage
administrator replaying a complete older row. This is a material trust-boundary
decision recorded in the acceptance report.
