# Money Moves V2A Hosted Storage Acceptance

## Decision

**REJECTED / NEEDS CORRECTION**

The hosted encrypted-storage candidate is directionally consistent with the
product owner's approved multi-device architecture, and its local/fake-client
regression suite passes. It is not acceptable for commit, deployment, or status
promotion because the required real-infrastructure evidence is absent and the
current launch flow does not make the full-rewrite/no-import consequence visible
to the user.

`IMPLEMENTATION_STATUS.md` was intentionally not updated. No production code,
tests, staging, reset, discard, or commit was performed by this review.

## Base revision and repository state

The candidate declares base revision `4c0eb5b649a3b30e9d03c978c9b6a66f1623a408`
(`v2a-phase3c-cross-tab-accepted`). The repository confirms:

- `HEAD` is still `4c0eb5b` on `main`.
- `main` is two commits ahead of `origin/main`; no remote-only commits exist.
- No hosted-storage candidate commit exists, despite the handoff describing one.
- No Git tag objects exist.
- The working tree contains the hosted-storage production files, SQL migration,
  candidate tests, candidate documentation, two staged test deletions, and
  unrelated tracked `.DS_Store`/`node_modules` changes.
- `js/config.js` exists locally but contains no configured project URL; no
  Supabase, Vercel, or Plaid environment configuration was present.

## Review evidence

### Local regression evidence — passed

| Command | Result |
|---|---|
| `pnpm test` | 125 passed, 0 failed |
| `pnpm run check` | Passed |
| `PYTHONPYCACHEPREFIX=/private/tmp/money_moves_pycache python3 -m py_compile start.py` | Passed |
| `git diff --check` | Passed |
| `git diff --cached --check` | Passed |
| Hosted/V1 targeted tests | 15 passed, 0 failed |
| Migration, compatibility, reimbursement, allocation, and bucket targets | 104 passed, 0 failed |

The fake-client suite covers conditional-write outcomes, network-failure
reconciliation, rollback, error privacy, generation shape, authentication
failure, and a 100-iteration race property. The implementation report's test
inventory is inaccurate: the executable hosted-storage file contains 11 tests,
not 13; the V1 recovery file contains 4.

### Browser evidence — partial only

A fresh static-browser load rendered the `notConfiguredPanel` with no console
warnings or errors. The page did not contain visible `local`, `import`, or
`discard` language. This verifies asset loading and the empty-configuration
state only; it does not verify authentication, persistence, lock/unlock, or
multi-device behavior.

### Real infrastructure — not available

No isolated Supabase project, Google OAuth client, Vercel deployment, real
authenticated sessions, or deployed HTTPS endpoint was available. Consequently,
the following required questions remain unverified:

- Google OAuth creation, refresh, callback, sign-out, and locked-but-signed-in
  behavior.
- Cross-user RLS read/insert/update isolation.
- Actual RLS default-deny behavior for `plaid_secrets`.
- TLS and deployed-origin behavior.
- Real PostgREST conditional-update row-count semantics.
- Lost-response reconciliation against a real network boundary.
- Concurrent writes from two independent browser profiles/devices.
- Real hosted backup/restore and recovery behavior.

## Findings

### H-01 — Real Supabase/RLS/OAuth/Vercel acceptance is unavailable

The candidate's own implementation report explicitly states that all hosted
tests use `test/hostedVaultFake.js` and that no real project exists. The SQL file
declares RLS and policies, but declarations are not evidence that a deployed
project enforces them. This alone blocks acceptance of a hosted financial vault.

### H-02 — Full-rewrite/no-import behavior is not visible or intentional in the UI

The approved product decision says existing local data is not imported and the
hosted vault starts clean. The current boot flow ignores local V1 state and
routes to configuration/sign-in, but the visible panels contain no warning,
confirmation, recovery instruction, or explicit no-import statement. A user can
reasonably interpret the absence of their old data as a defect or data loss.

Required correction: add an approved first-launch disclosure and confirmation,
or document an explicit product decision that the UI warning is intentionally
not required. The former is recommended.

### H-03 — Required independent multi-device evidence is missing

The hosted test named `cross-device conflict` drives two fake clients
sequentially. The 100-race test uses a shared module-level fake client and does
not establish two independent browser profiles or processes. These tests are
useful unit properties but do not satisfy the required two-context/device
acceptance boundary.

### H-04 — Deployment configuration is not an acceptance-ready artifact

`js/config.js` is gitignored and empty locally. The setup document describes
manual file-based deployment but the repository contains no deterministic Vercel
configuration or build step that supplies the public Supabase configuration.
A real HTTPS deployment must prove that the application receives configuration
without committing the anon key or any service-role credential.

### M-01 — The retained Phase 3C browser fixture is stale

`test/browser/phase3c-fixture.js` still references retired local-storage
constants and temp/lease behavior. It does not validate the hosted design and
must be replaced or clearly retired with an equivalent hosted browser fixture.

### M-02 — OAuth error messages need privacy review

`authService.js` forwards Supabase/identity-provider error messages into
`AuthServiceError`, and the sign-in handler displays that message. The hosted
candidate's privacy tests cover vault conflict/persistence errors, not a real
OAuth failure response. Sanitize this path or provide evidence that provider
errors cannot expose secrets, URLs, tokens, or raw implementation details.

### M-03 — Legacy migration coverage was intentionally removed

The candidate deletes `test/vault-migration.test.js` and replaces automatic V1
migration with manual recovery primitives. This is consistent with the newly
approved full-rewrite decision only if that decision is documented as a formal
product/PRD amendment and the user-facing no-import behavior is accepted.

## Criterion disposition

| Criterion | Disposition |
|---|---|
| Client-side AES-GCM/PBKDF2 boundary | Code review and fake tests pass; real deployment unverified |
| Opaque encrypted vault row | SQL/code shape is plausible; real Postgres verification missing |
| Google OAuth lifecycle | Not tested against a real IdP |
| RLS isolation | Declared in SQL; not tested against a real project |
| `plaid_secrets` browser denial | Declared by zero-policy SQL; not tested against real RLS |
| Conditional writes/conflicts | Fake-client tests pass; real PostgREST unverified |
| Lost-response reconciliation | Fake-client test passes; real network behavior unverified |
| Independent device/profile contention | Not accepted; no real browser evidence |
| Failed-write rollback | Fake-client and encrypted reload tests pass |
| Backup/restore | Existing local/fake regression evidence passes; hosted deployment unverified |
| Error/privacy boundary | Vault errors pass tests; OAuth path needs review |
| No accidental hosted deletion | No delete policy and UI signs out; code review passes |
| No-import behavior visible to users | **Fails** |
| Vercel/TLS deployment | Not available |

## Required corrections before re-review

1. Provision an isolated Supabase project, Google OAuth configuration, and
   HTTPS Vercel deployment using synthetic data only.
2. Apply `supabase/migrations/0001_hosted_vault.sql` and verify RLS in the
   dashboard and through authenticated cross-user tests.
3. Provide deterministic deployment configuration for `js/config.js` without
   committing service-role or other secret credentials.
4. Add and browser-test the explicit full-rewrite/no-import disclosure.
5. Run real OAuth lifecycle tests, including sign-out and locked-but-signed-in.
6. Run real two-profile/device contention and lost-response tests.
7. Replace or retire the stale Phase 3C browser fixture and restore an accepted
   hosted browser fixture.
8. Sanitize or independently verify OAuth error privacy.
9. Re-run the full validation baseline and produce a new independent acceptance
   report. Only then update `IMPLEMENTATION_STATUS.md`, commit the candidate,
   and create an actual acceptance tag.

## Deferred scope

Reimbursement Step A, bucketing navigation, Shared Expenses mutations, refund
relationships, reporting, Plaid Sandbox, and Plaid token-handling backend work
remain deferred until hosted storage is accepted. The empty `plaid_secrets`
placeholder must remain default-deny and must not be used by browser code.

## Review conclusion

The local candidate is technically promising and its fake-client regression
evidence is useful, but the required trust boundary is external to this
repository and has not been exercised. Decision: **REJECTED / NEEDS
CORRECTION**. Re-review is appropriate after the real infrastructure and the
user-facing no-import behavior exist.
