# Money Moves V2A Hosted Encrypted Storage Acceptance

## 1. Scope

Independent review and hardening of hosted encrypted-vault persistence only. Plaid, ingestion, bank sync, reimbursement UI, Shared Expenses, refunds, and reporting are excluded.

## 2. Base revision reviewed

Committed candidate: 8a6db51569356312302a0babfdcff1c6456a43b6 on main. Historical accepted local coordination checkpoint: 4c0eb5b. The corrections described here are an uncommitted working-tree candidate.

## 3. Prior rejection reasons

The prior review lacked real Supabase, RLS, OAuth, Vercel, and independent-device evidence; had no usable local adoption flow; retained a stale lease browser fixture; forwarded OAuth diagnostics; and left status documents stale.

## 4. Final decision

**NOT ACCEPTED**

Live RLS, OAuth, deployed compare-and-swap, and independent-device evidence are absent. A fresh device also cannot detect a malicious Supabase administrator replaying a complete older row without an independent trust anchor.

## 5. Executive product outcome

Hosted encrypted multi-device storage remains the product direction, but it must not be called accepted or used for production financial data yet.

## 6. Hosted architecture

One public.vaults row is selected through auth.uid(). The browser decrypts and validates only in memory, encrypts one replacement envelope, then conditionally updates by expected generation. The hosted row is authoritative; Web Locks and BroadcastChannel are advisory only.

## 7. Encryption and privacy boundary

Code review verifies PBKDF2-SHA-256 at 600,000 iterations and AES-256-GCM. New envelopes authenticate generation and monotonic sequence in AAD. Supabase receives owner UUID, timing/KDF/envelope metadata, opaque generation/sequence, and ciphertext—not financial plaintext, keys, or passphrases. Synthetic tests confirm no fixture financial plaintext in envelopes or errors.

Encryption does not protect against malicious code in an unlocked browser. A privileged Supabase administrator can destroy data and can replay a complete old row to a fresh device unless an independent trusted checkpoint or ledger is introduced.

## 8. Authentication and ownership

Google OAuth through Supabase Auth is the account layer. One user owns one vault; there is no sharing, anonymous access, or hosted delete UI. Identity change now clears decrypted state; same-user refresh does not. OAuth errors are sanitized. Real provider lifecycle evidence is missing.

## 9. RLS results

SQL declares self-only vault policies and default-deny plaid_secrets. The new migration removes anonymous vault privileges, grants browser users only select/insert/update on vaults, and removes browser privileges from plaid_secrets. Fake adversarial tests cover cross-user read, forged owner insert, update/delete denial, and Plaid denial.

Unverified: deployed policies/grants, duplicate rows, expired/malformed JWTs, enumeration, and real Postgres behavior.

## 10. Atomic concurrency results

The write is one PostgREST UPDATE filtered by owner and expected generation. A success response must contain exactly the attempted generation; otherwise the client performs one authoritative read. Synthetic 100-race tests yield one winner per original generation. Real PostgREST and timeout semantics are unverified.

## 11. Multi-device results

The hosted-fake browser harness performed a primary sequence-1-to-2 write and a stale write that returned VAULT_CONFLICT; its encrypted row exposed no plaintext financial keys and its console was clean. It is not two independent browser profiles/devices or real Supabase evidence.

## 12. Network and retry results

Fake tests cover failure before apply, failure after apply, malformed success responses, conflict, and reconciliation. Ambiguous writes are never blindly retried: the client reads the authoritative row once. Offline writes fail rather than merge. Real offline, 5xx, rate-limit, token-refresh, and delayed-response testing remains open.

## 13. Cache and authority model

There is no V2 local financial cache. A browser-local, user-scoped checkpoint stores only generation and sequence, detecting a lower/equal-different replay on a device that previously saw the newer vault. It is not a global anti-rollback authority.

## 14. Local-to-hosted migration

When no hosted row exists, explicit adoption validates and migrates an encrypted V1 record locally, then creates one hosted vault while retaining the local record. If a hosted row exists, adoption refuses to overwrite either side. Corrupt local recovery does not block hosted unlock. Unit coverage passes; real browser evidence is pending.

## 15. Recovery and portability

Encrypted backup export is read-only; local encrypted recovery can be downloaded; restore validates/decrypts before a generation-protected replacement. Forgotten passphrases remain unrecoverable. Hosted outage/account-loss/corrupt-record recovery has no live evidence.

## 16. Passphrase results

Synthetic tests show passphrase change verifies the old passphrase, keeps stateRevision, and advances generation/sequence. Real expiry, timeout, sign-out, and conflicting-change testing remains open.

## 17. Backup and restore results

Synthetic tests show backup is read-only and restore preserves the backup revision while rebasing on the current hosted sequence. Real hosted restore/conflict evidence is outstanding.

## 18. Browser results

The deployed HTTPS sign-in page loaded with no console warnings/errors. The new local hosted-fake harness loaded, created a synthetic vault, completed one write, rejected a stale write, and emitted no warnings/errors. The deployed site has not received this hardening candidate, and no authenticated flow ran.

## 19. Real Supabase test boundary

No two synthetic authenticated users or safe test credentials were available. No real Supabase mutation, RLS adversarial test, OAuth lifecycle, candidate deployment, or real device contention was performed. This blocks acceptance.

## 20. Security findings

| ID | Severity | Original behavior and consequence | Disposition |
|---|---|---|---|
| H-01 | Critical | Older ciphertext could be replayed silently; generation was unauthenticated. | Partially corrected; fresh-device administrator replay remains open. |
| H-02 | High | Account switch could expose user A's unlocked state to user B. | Corrected and unit tested. |
| H-03 | High | V1 recovery could not be intentionally adopted to hosted storage. | Corrected and unit tested. |
| H-04 | High | Live RLS/OAuth/CAS/device behavior lacked evidence. | Open; blocks acceptance. |
| H-05 | High | A malformed non-empty write response could look successful. | Corrected and unit tested. |
| H-06 | Critical | Vercel's public bundle included populated bootstrap finance data before authentication. | Corrected in this candidate; deployed site still needs replacement. |
| M-01 | Medium | OAuth diagnostics could reach the UI. | Corrected and unit tested. |
| M-02 | Medium | Browser fixture used retired lease constants. | Retired and replaced. |
| M-03 | Medium | Handoff/status contradicted repository history. | Corrected in this candidate. |

## 21. Corrections made

Generation/sequence AAD binding; checkpoint alarm; SQL integrity trigger and privileges; response validation; account-switch clearing; explicit V1 adoption and encrypted recovery download; sanitized auth errors; configuration validation; fake RLS tests; hosted synthetic browser harness; and an empty public bootstrap seed.

## 22. Regression results

pnpm test: **140 passed, 0 failed**. Existing allocation, bucket, reimbursement, V1 compatibility/recovery, state-revision, hosted fake, and new hardening tests passed. pnpm run check passed.

## 23. Exact commands

    pnpm test
    pnpm run check
    PYTHONPYCACHEPREFIX=/private/tmp/money_moves_pycache python3 -m py_compile start.py
    git diff --check
    git diff --cached --check
    node --test test/hosted-vault-hardening.test.js

The synthetic browser harness was served at 127.0.0.1:4173 and exercised through test/browser/hosted-storage.html. The deployed page inspected was https://moneymovements.vercel.app/.

## 24. Remaining risks

Do not apply migration 0002 to production without an encrypted backup and immediate hardened-client deployment. Real RLS/CAS/OAuth/device evidence is absent. The product must either trust Supabase administrators for ciphertext integrity/availability or fund an independent anti-rollback anchor; the per-device checkpoint cannot make a stronger promise.

## 25. Recommended next phase

Do not begin V2B or Plaid. Apply the migrations to an isolated test project, deploy this candidate, create two synthetic accounts, and repeat the real RLS/OAuth/CAS/backup/restore/device matrix. Decide the administrator-replay and recovery promise before final hosted-storage acceptance.
