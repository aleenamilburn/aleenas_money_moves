MONEY MOVES ENGINEERING HANDOFF (UPDATED)

This handoff is intended for any capable repository coding agent, including
Codex, Claude Cowork, or a human engineer. It supersedes the prior handoff
that led with Phase 3C cross-tab coordination. Everything in that handoff's
sections 1, 2, 5, 7, and 8 (product summary, authoritative documents,
non-negotiable invariants, Plaid readiness, scope discipline) remains in force
and is not repeated in full below except where this update changes it.

Do not assume this summary is perfectly current. Begin by inspecting the
repository, git history, working tree, tests, and engineering documentation.
Resolve discrepancies in favor of the repository and the newest accepted
engineering report.

Repository:

/Users/aleenamilburn/Downloads/aleenas_money_moves

Product name:

Money Moves

Do not rename legacy storage or encryption identifiers merely because they
contain the former Verdant name. Those identifiers may be required for V1
vault recovery.

==================================================
1. WHAT CHANGED SINCE THE LAST HANDOFF
==================================================

The last handoff asked for one decision: whether Phase 3C (cross-tab write
coordination) had completed independent acceptance, and if so, which of two
paths to take next -- reimbursement product workflow, or fastest-safe-path
toward Plaid.

Since then, in order:

1. Phase 3C acceptance was confirmed. `docs/engineering/V2A_CROSS_TAB_COORDINATION_ACCEPTANCE.md`
   exists, is complete, and its decision is ACCEPTED WITH LOW-RISK FOLLOW-UP.
   Committed at `4c0eb5b` (v2a-phase3c-cross-tab-accepted).

2. Product owner chose Path A (reimbursement product workflow first) and
   decomposed it into three independently-accepted sub-phases: 4A (claim
   creation + read projection), 4B (allocation-to-claim linking), 4C
   (repayment recording). A blocking finding surfaced before any code was
   written: 4A and 4B as split could not both be true, because schema-7
   forbids an active claim with zero allocation links -- a claim cannot be
   "created" without also being "linked." Three resolution options were
   presented; **no resolution was chosen, because the product owner
   interrupted to raise a separate, higher-priority decision (item 3).
   Phase 4 has not been implemented. No 4A/4B/4C code exists anywhere in
   this repository.**

3. **Product owner made an architecture decision that supersedes local-first
   storage:** move the encrypted vault off `localStorage` entirely, onto a
   Postgres row hosted by Supabase, reached directly from the browser and
   served via Vercel. Rationale given: remove the `localStorage` size
   ceiling and unblock Plaid, while reusing the existing tested client-side
   encryption code unchanged (rejected: a plaintext relational schema, and
   field-level hybrid encryption -- both would have meant redesigning the
   data model).

4. That migration was implemented as a full candidate in this session. It
   is **complete, tested, and passing -- but has not been committed, and has
   not been independently accepted.** It sits in the working tree right now.
   This is the most important fact for whoever picks this up next: **do not
   assume this repository's committed history reflects hosted storage.** It
   does not yet. HEAD is still the Phase 3C acceptance commit.

Reimbursement Phase 4 is paused, not abandoned. It was paused specifically
because building UI on top of the local-storage vault contract while a
storage-architecture change was actively being decided would have meant
throwing that UI work away. Resume it only after hosted storage is committed
and accepted -- see section 6.

==================================================
2. REPOSITORY STATE RIGHT NOW -- READ BEFORE TOUCHING ANYTHING
==================================================

Run `git status` and `git log` yourself; do not trust a stale copy of this
section. As of this writing:

- HEAD: `4c0eb5b649a3b30e9d03c978c9b6a66f1623a408` (v2a-phase3c-cross-tab-accepted)
- Branch: `main`, 2 commits ahead of `origin/main` (both unpushed)
- **No git tags exist anywhere in this repository's history.** Every
  "accepted"/"candidate" marker you see in `git log` is a commit *message*
  convention, not an immutable tag. Do not assume tag-based tooling works here.
- **Working tree is dirty with a complete, uncommitted hosted-storage candidate.**
  `git status --porcelain` shows roughly a dozen modified files, a dozen new
  files, and two deleted test files. None of it is staged or committed. The
  product owner asked for a report before committing; that report was
  delivered but the commit itself has not yet been authorized as of this
  handoff. **Read `docs/engineering/V2A_HOSTED_STORAGE_IMPLEMENTATION.md`
  before deciding what to do with this working tree** -- it is the
  implementation report for everything currently uncommitted, including a
  full list of deviations from the original spec and their rationale.
- If you were told to implement Phase 4, or anything else, and you find this
  dirty tree, do not discard it and do not assume it is scratch work. Ask the
  product owner what to do with it before running any destructive git command.

==================================================
3. AUTHORITATIVE DOCUMENTS (UPDATED LIST)
==================================================

Everything from the prior handoff's list, plus, newest first:

- `docs/engineering/V2A_HOSTED_STORAGE_IMPLEMENTATION.md` -- implementation
  report for the uncommitted hosted-storage candidate. Read this first if
  the working tree is still dirty when you arrive.
- `docs/engineering/HOSTED_STORAGE_SETUP.md` -- the account/credential setup
  steps (Supabase project, Google Cloud OAuth client, Vercel deploy) that
  only a human with account-creation authority can perform. No coding agent
  can complete these steps. If hosted storage is to actually run anywhere,
  a human must work through this document first.
- `supabase/migrations/0001_hosted_vault.sql` -- the schema this phase
  depends on (`vaults`, `plaid_secrets`, both RLS-enabled). Not yet applied
  to any real Supabase project, because no real Supabase project exists yet.
- `docs/engineering/V2A_CROSS_TAB_COORDINATION_ACCEPTANCE.md` -- still the
  newest *accepted* engineering report as of committed history, though it
  now describes a coordination mechanism (persisted write-lease + Web Lock
  as primary authority) that the uncommitted candidate intentionally
  retires. If hosted storage is accepted and committed, this document's
  description of the coordination mechanism becomes historical, not current
  -- do not use it to reason about how writes are coordinated going forward.
- `docs/engineering/IMPLEMENTATION_STATUS.md` -- **not yet updated** for
  hosted storage. Per this project's own process rule, it should only be
  updated after an independent acceptance pass, which has not happened.

==================================================
4. LAST KNOWN IMPLEMENTATION STATUS (COMMITTED HISTORY)
==================================================

Everything the prior handoff listed as accepted remains accepted and
committed; nothing below reflects the uncommitted candidate.

Accepted and committed:

- V1 user-facing workflows: IMPLEMENTED / PRESERVED
- V2 Foundation: IMPLEMENTED AND REVIEWED
- Bucket Explorer, Two-Level Sub-Buckets: IMPLEMENTED AND ACCEPTED
- Transaction Allocations and Split Editor: IMPLEMENTED AND ACCEPTED
- Reimbursement Design: REVIEWED (design only, no code)
- Reimbursement Schema Foundation (schema 7): IMPLEMENTED AND REVIEWED
- Reimbursement Service Foundation: IMPLEMENTED AND REVIEWED
- Cross-Tab Write Coordination: IMPLEMENTED AND ACCEPTED (against
  `localStorage` -- see section 3's note on this becoming historical)

Candidate, uncommitted, unaccepted:

- Hosted Storage Migration (this session): full candidate implementation
  complete, 125/125 tests passing, `pnpm run check` passing, browser-verified
  for the sign-in and not-configured states. **Not committed. Not accepted.**

Still unimplemented:

- Reimbursement product workflow (paused mid-scoping -- see section 1, item 2)
- Shared Expenses UI
- Reimbursement reporting
- Refund relationships
- Account Enrichment UI
- Location Correction UI
- Plaid Sandbox
- Hosted-vault deletion (deliberately not built this phase; the existing
  "erase vault" control now only signs out of the browser -- see the
  implementation report, section 3.6, for why)

Last known schema version: 7 (unchanged by the hosted-storage work; storage
location and domain schema are orthogonal).

==================================================
5. CURRENT ARCHITECTURE (WHAT CHANGES ONCE THE CANDIDATE LANDS)
==================================================

If the uncommitted candidate is accepted and committed, the financial flow
becomes:

Google sign-in (Supabase Auth)
-> authenticated session (JWT, standard `localStorage`-persisted session --
   this is an account-access token, not vault key material; see below)
-> encrypted vault row fetched via RLS-enforced PostgREST call
   (`js/services/hostedVaultStorage.js`)
-> versioned migration (unchanged, `js/domain/migrations.js`)
-> validated canonical domain (unchanged)
-> service mutation boundary (unchanged)
-> one atomic conditional write (`UPDATE ... WHERE generation = $expected`,
   row-count as the success signal -- replaces the old lease + temp-vault
   promotion sequence)
-> UI projections (unchanged)

New modules: `js/services/supabaseClient.js`, `js/services/authService.js`,
`js/services/hostedVaultStorage.js`, `js/vendor/supabase-js/index.mjs`
(vendored, self-contained -- no CDN dependency, no bundler added to the
project). `js/vault.js` was substantially rewritten; its V1-recovery
functions are untouched, its V2 functions now route through
`hostedVaultStorage.js` instead of `localStorage`.

Two mechanisms from the prior architecture are gone, not adapted, if this
candidate lands:

- The persisted write-lease and temp-vault promotion dance. Superseded by
  the database's own atomic conditional write. The Web Lock remains, but
  only as a same-device optimization, per the product owner's own decision.
- Automatic V1-to-V2 storage migration inside `unlock()`. Local V1 data is
  still never deleted and is still readable via `readLocalV1Record()` /
  `readLegacyState()`, but nothing automatically blends it into a new
  hosted vault -- this was an explicit product decision ("discard, no
  import"), not an oversight. Do not reintroduce automatic migration
  without a new, explicit product-owner decision, since it was deliberately
  removed once already.

==================================================
6. IMMEDIATE NEXT ACTION
==================================================

First, resolve the uncommitted candidate. It cannot sit indefinitely:

1. Read `docs/engineering/V2A_HOSTED_STORAGE_IMPLEMENTATION.md` in full,
   including its "deviations from the prompt" section -- several real
   architectural choices were made (no custom backend API, retired
   persisted lease, deleted rather than adapted two test files, repurposed
   the "erase vault" control) that need product-owner sign-off if they
   have not already gotten it in conversation.
2. If accepted: commit as instructed
   (`v2a-hosted-storage-candidate`), then run the independent acceptance
   pass this project's process requires before touching
   `IMPLEMENTATION_STATUS.md`. That acceptance pass should prioritize the
   one thing nothing in this repository can yet verify: behavior against a
   **real** Supabase project, not the hand-built fake the candidate's tests
   run against. `docs/engineering/HOSTED_STORAGE_SETUP.md` is the
   prerequisite for that -- it requires a human to create real accounts.
3. If rejected or changed: do not silently discard the working tree.
   Confirm with the product owner what to keep.

Only after hosted storage is committed and accepted should Phase 4
(reimbursement UI) resume -- restarting from the blocking finding already
identified: 4A cannot be pure read-only while also satisfying the original
DoD, and a claim cannot exist without an allocation link. That finding does
not change based on storage location and does not need to be re-derived;
pick up from the three resolution options already on the table, or ask the
product owner for a fourth.

Do not begin Plaid work, Shared Expenses, refund relationships, or
reimbursement reporting before both of the above are settled.

==================================================
7. NON-NEGOTIABLE INVARIANTS (CARRIED FORWARD, PLUS NEW ONES)
==================================================

Everything from the prior handoff's invariant list still applies verbatim.
In addition, specific to hosted storage:

- The decryption key must never leave the client in usable form, hosted
  storage or not. `deriveKey()` produces a non-extractable `CryptoKey`;
  do not change that, and do not add any code path that could serialize,
  export, or transmit key material.
- Row-Level Security must remain enabled on every table holding user data,
  even opaque ciphertext. Do not disable it "temporarily" for debugging
  against a real project.
- The `plaid_secrets` table must remain unreachable from the
  `authenticated`/`anon` roles. Do not add a client-facing policy to it
  without a separately approved security design -- this was deliberate, not
  an oversight, precisely because Plaid tokens must never reach browser code.
- Do not reintroduce automatic V1-to-V2 migration-on-unlock without a new,
  explicit product-owner decision (see section 5).
- Do not implement hosted-vault deletion as a side effect of another task.
  It is a separate, more consequential action than anything built so far.

==================================================
8. VALIDATION COMMANDS (UNCHANGED)
==================================================

`pnpm test`, `pnpm run check`, `python3 -m py_compile start.py`,
`git diff --check` remain the required minimum. As of this handoff, against
the dirty working tree described in section 2: 125 tests pass, `check`
passes, `py_compile` passes, `git diff --check` passes on both unstaged and
staged content. These numbers will change the moment anyone commits,
reverts, or continues work -- re-run them, do not cite this handoff's
numbers as current.
