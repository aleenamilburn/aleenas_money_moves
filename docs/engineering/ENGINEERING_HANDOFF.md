# Money Moves Engineering Handoff

## Current repository state

- Repository: /Users/aleenamilburn/Downloads/aleenas_money_moves
- Branch: main
- Committed HEAD: 8a6db51569356312302a0babfdcff1c6456a43b6 (claudes changes)
- Remote: origin/main matched HEAD before the hosted hardening working tree began.
- Historical accepted checkpoint: 4c0eb5b (local cross-tab coordination).
- Current domain schema: 7.
- Git tags: none.
- Current worktree contains the hosted-storage hardening candidate and is intentionally uncommitted. Do not reset, clean, or discard it.

## Product decision

Money Moves supports one encrypted canonical financial vault accessible from the owner's MacBook and phone. Supabase hosts one opaque encrypted vault row per authenticated user; Google OAuth provides account access; browser-side AES-GCM/PBKDF2 remains the decryption boundary; Vercel is static hosting. Plaid remains deferred.

Hosted storage is an approved direction, not an accepted capability. The latest independent review decision is **NOT ACCEPTED** in V2A_HOSTED_STORAGE_ACCEPTANCE.md.

## What is implemented in the current candidate

- RLS-owned hosted vault adapter with conditional generation writes.
- Client-side encryption, encrypted backup/restore, passphrase change, and generic errors.
- Authenticated generation plus monotonic sequence in AES-GCM AAD.
- SQL migration 0002 for envelope/generation coherence, sequence progression, and explicit browser-role privileges.
- Per-device non-financial rollback checkpoint.
- Account-switch clearing of decrypted state.
- Explicit V1 encrypted-vault adoption and recovery download; no automatic overwrite or merge.
- Sanitized OAuth/session errors.
- Hosted fake RLS tests and a hosted synthetic browser harness.
- The retired Phase 3C lease fixture now points users to the hosted harness.
- Public data.js is now an empty migration-valid baseline; it no longer ships populated finance records before authentication.

## What is not accepted or verified

- The deployed Supabase project has not been proven to contain migration 0002.
- Live RLS policy/grant behavior has not been attacked with two synthetic users.
- OAuth creation, refresh, expiration, sign-out, and account switching have not been tested against Google/Supabase.
- The hardened candidate has not been deployed to Vercel.
- Real PostgREST CAS, ambiguous network responses, backup/restore, and independent browser-profile/device contention are unverified.
- A device with a prior local checkpoint detects a replay to an older sequence, but a fresh device cannot independently detect a malicious Supabase administrator replaying a complete old ciphertext row.

## Required next action

Do not begin V2B ingestion, Plaid, reimbursement UI, Shared Expenses, refunds, or reporting.

1. Preserve an encrypted backup.
2. Apply migrations 0001 and 0002 to an isolated Supabase test project.
3. Deploy this exact hardening candidate to a non-production Vercel deployment with an untracked config.js containing only the HTTPS Supabase base URL and anon/publishable key.
4. Use two synthetic Google/Supabase test identities to run the real acceptance matrix: cross-user RLS, forged owner, anonymous denial, Plaid denial, CAS race, timeout reconciliation, session lifecycle, local adoption, backup/restore, and two-profile/device behavior.
5. Decide whether Supabase administrators are trusted for ciphertext integrity/availability. If not, sponsor an independent anti-rollback anchor before claiming rollback protection.
6. Update the acceptance report with exact real evidence. Mark hosted storage accepted only if all blocking issues are resolved.

## Product and security invariants

- Do not transmit financial plaintext, passphrases, raw keys, or service-role keys.
- Keep RLS enabled on every user-data table.
- Keep plaid_secrets default-deny to browser roles.
- Do not auto-merge or auto-overwrite local and hosted vaults.
- Do not add hosted-vault deletion as a side effect of another phase.
- Preserve V1 local records and canonical IDs, allocations, reimbursements, audits, and stateRevision.
- Treat the hosted row as authoritative; offline edits must fail or be explicitly designed, never last-writer-wins.

## Validation baseline for the hardening candidate

- pnpm test: 140 passed, 0 failed.
- pnpm run check: passed.
- Python compilation with isolated cache: passed.
- Unstaged and staged git diff checks: passed.
- Local hosted-fake browser harness: primary save, stale conflict, opaque row shape, and clean console passed.
- Deployed HTTPS sign-in page: loaded with no console warnings/errors only. No real authenticated test was performed.

Read V2A_HOSTED_STORAGE_IMPLEMENTATION.md, V2A_HOSTED_STORAGE_ACCEPTANCE.md, HOSTED_STORAGE_SETUP.md, and AGENTS.md before continuing.
