# Faith & Money Devotionals — Implementation Candidate

## Product decision and scope

Money Moves now has a complete offline Faith & Money devotional candidate: a curated local library, encrypted optional journaling, deterministic progression, an Overview card, focused reader, and library/history. This is an implementation candidate, not an acceptance report.

Base revision: `fa83670` (`v2b-desktop-workflow-accepted`). The implementation moves the canonical vault from schema 8 to schema 9 and does not change the accepted financial workflows. Excluded: Plaid, travel recommendations, cloud backup, live sync, phone support, shared vaults, reimbursement UI, runtime AI generation, remote devotional content, and third-party editor dependencies.

## Content ownership and Bible decision

All twelve reflections and prompts are original Money Moves writing. No pastor, sermon, ministry, book, article, or published devotional material was copied or imitated. The static module uses only the World English Bible (`WEB`), a public-domain translation; see the [WEB copyright notice](https://ebible.org/engwebp/copyright.htm). Quotations are stored with the `World English Bible (WEB), public domain.` attribution and the validator rejects remote/executable content and named-pastor attribution.

The static library is `js/content/faithMoneyDevotionals.js`. It is versioned, deterministic, inspectable, contains no user writing, and has exactly three prompts per devotional.

| # | Title | Primary passage |
|---|---|---|
| 1 | What Sits on the Throne? | Matthew 6:24 |
| 2 | Faithful With What Is Here | 1 Corinthians 4:2 |
| 3 | Enough for Today | 1 Timothy 6:6–8 |
| 4 | A Freely Chosen Gift | 2 Corinthians 9:7–8 |
| 5 | Truth Without Shame | Proverbs 22:7 |
| 6 | Today Has Enough to Carry | Matthew 6:34 |
| 7 | More Than Possessions | Luke 12:15 |
| 8 | Plans With Open Hands | Proverbs 21:5 |
| 9 | The Same Person in Small Things | Luke 16:10 |
| 10 | Your Own Faithful Work | Galatians 6:4–5 |
| 11 | Enough Grace for Good Work | 2 Corinthians 9:8 |
| 12 | A Path You Do Not Have to See | Proverbs 3:5–6 |

## Schema, migration, and privacy

Schema 9 adds only `domain.devotionalState`: the active ID, rotation timestamps, completed/saved IDs, and one journal entry per devotional. Each entry has a stable ID, responses keyed by static prompt ID, private notes, timestamps, completion state, and the content version at first save. Static content is not copied into the vault.

The deterministic `8 → 9` migration creates an empty valid progression beginning with `faith-money-mammon`; it does not fabricate responses or completions and preserves accounts, transactions, allocations, buckets, reimbursements, V1 compatibility data, history, goals, debts, travel, provider data, and metadata. It is idempotent. A malformed pre-existing devotional state fails validation before migration.

Responses and notes are plain text only, bounded to 10,000 and 20,000 characters respectively. They are validated before persistence, live only in the canonical encrypted vault/encrypted backups, are never logged, placed in settings, filenames, static assets, or public errors, and are removed from renderer memory on lock/sign-out. The Electron main process continues to receive only encrypted envelopes.

## Experience and mutation contract

The Overview Faith & Money card shows the current title, WEB reference/excerpt, and current/in-progress/completed status, with an explicit reader action. The reader presents Scripture, the original reflection, three optional prompts, optional notes, save, saved/unsaved status, completion, continuation, and return to Overview. Leaving a dirty reader, switching devotional, signing out, locking, reloading after conflict, or closing the window prompts before discarding unsaved text. Escape has no devotional-discard behavior.

The library shows current, in-progress, completed, saved, and not-started states for all twelve devotionals. Users can reopen prior entries and edit their encrypted responses. Progression never uses dates, randomness, or cloud state: the active devotional remains active until completion, then the user explicitly continues to the next static sequence; after #12 the library remains available.

`js/services/devotionalService.js` validates expected revisions, library/prompt IDs, duplicate prompt answers, limits, and current domain state. Successful mutations advance `stateRevision` once and persist through the existing `StateService` callback; failed persistence restores the full prior state. Service errors are stable and omit journal text.

## Tests and candidate validation

Key implementation files are the content/service, schema/model/migration modules, reader UI, and package validation scripts. New focused tests are `test/devotional-content.test.js` and `test/devotional-service.test.js`; existing schema expectations were updated in migration/hosted/reimbursement tests.

- `CI=true pnpm test` — 182 passed, 0 failed.
- `CI=true pnpm run electron:test` — 27 passed, 0 failed.
- `CI=true pnpm run check`; `python3 -m py_compile start.py`; `git diff --check`; `CI=true pnpm run content:validate` — passed.
- `CI=true pnpm run electron:package` — passed (ARM64 app).
- `CI=true pnpm run electron:make` — passed (unsigned ARM64 DMG and ZIP).
- `CI=true pnpm run inspect:package` — passed (287 filesystem files and 45 ASAR entries scanned).

## Packaged evidence and limitations

The direct ARM64 bundle and mounted read-only DMG were built. Their `app.asar` hashes matched exactly (`72b95412f52da992d16008a01705b911698e2b02a35f343f391b31567431a683`), and package inspection found no packaged tests, docs, browser configuration/vault modules, source maps, or unsafe icon metadata.

The completed isolated synthetic core matrix used disposable profiles only. In the direct bundle it created a schema-9 vault, showed the Overview Faith & Money card, opened the first reader, saved one synthetic response, restarted to the locked-vault screen, unlocked with the same synthetic passphrase, and showed the saved in-progress state. It then marked #1 complete, advanced to #2, and reopened #1 from history with the saved response visible. Financial records remained empty in that synthetic vault. In the mounted read-only DMG, a fresh schema-9 vault, the Overview card, the full first reader (scripture and reflection), all-twelve library, and private prompt controls rendered correctly. No user-facing renderer or main-process error was observed.

The existing encrypted backup UI was opened through its native save dialog during the direct-bundle run, but a full native-dialog export/change/restore round trip was not repeated for this devotional candidate. The encrypted envelope/backup repository regression suite passed; an independent acceptance run must still exercise that end-to-end user path, compact-width behavior, dirty-navigation confirmation, and console/log privacy. This remains a candidate checkpoint only: no acceptance decision or accepted tag is made here.

## Recommended independent acceptance review

Independently repeat the synthetic matrix with emphasis on the outstanding native-dialog backup/change/restore path and confirmation that financial data is unchanged. Then verify content ownership/WEB quotations, migration of schema-8 backups, encrypted envelope opacity, error privacy, dirty-navigation warnings, keyboard flow, compact layout, and package contents before accepting or creating an accepted tag.
