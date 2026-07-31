# Money Moves — V1 Codebase Audit

**Audit date:** 2026-07-31  
**Scope:** repository source, launch behavior, available validation commands, and the authoritative product requirements document (PRD). No production code was changed.

## Executive conclusion

Money Moves is currently a flat, localhost-served browser application with an encrypted `localStorage` vault and no backend, database, build system, or automated test suite. Per the authoritative status statement and the task brief, **only V1 is credited as implemented**. The repository contains V2-labelled UI, CSV, transaction, and bucket artifacts, but those are **non-creditable prototype/migration-reference code**, not evidence that any V2A requirement is implemented.

The most material risks before V2A work are: a clear-text financial seed bundle, a legacy-branded vault namespace that is still used for normal writes, a monolithic encrypted JSON state object, floating-point money, and no test or migration fixtures. The recommended path is a clean V2A foundation with a read-only V1 compatibility reader—not incremental expansion of the present state object.

### Authority and citation convention

- The requested `docs/Money_Moves_PRD_v1.0.docx` is absent. This audit used the only PRD present: `docs/Money_Moves_Product_Requirements_Document_v1.0.docx` (41 rendered pages; document control, §1; V2A scope, §8.1; status matrix, §19). Its status statement says only V1 is implemented.
- Code citations use `path:line` or `path:start-end`. `data.js` is a single physical line, so all seed findings necessarily cite `data.js:1`.
- **Verified** means directly observed in source or the localhost smoke test. **Inference/risk** is labelled as such. **Not implemented** means the authoritative PRD/task status prohibits treating a prototype as complete, even if related code exists.

## 1. Repository architecture inventory

| Area | Verified inventory | Evidence | V2 treatment |
|---|---|---|---|
| Runtime and delivery | Static browser application served only on `127.0.0.1`; the Python launcher opens a browser and uses `SimpleHTTPRequestHandler`. No backend API or database is present. | `start.py:12-30`; `index.html:248-249` | **Retain/refactor** the loopback launcher concept; replace static serving with the approved local-service/package lifecycle. |
| UI | One HTML document, one CSS file, and one imperative DOM controller with six screens. Navigation is client-side show/hide rather than routable views. | `index.html:34-249`; `app.css:1-74`; `js/app.js:72-79` | **Migrate visual reference only**; build new accessible components and routes. Do not make the current DOM controller the V2 financial UI foundation. |
| State and calculations | All mutable information is one in-memory JSON object. The state module mixes normalizers, migration-like seed merging, UI selectors, mutation, and financial calculations. | `js/state.js:54-165`, `207-304` | **Refactor/reimplement** as typed domain services, repositories, and selectors. Retain only well-tested utility ideas such as merchant normalization and week calculation. |
| Persistence | A single encrypted vault envelope is read/written in browser `localStorage`; every save encrypts the entire state object. | `js/vault.js:18-27`, `35-63`, `81-84`; `js/app.js:60-65` | **Migrate** V1 decryption only. Replace normal persistence with versioned, transactional normalized storage. |
| Cryptography | Web Crypto PBKDF2-SHA-256 (600,000 iterations) derives an AES-256-GCM key; fresh 16-byte salt on create/change and fresh 12-byte IV per encryption. | `js/vault.js:4-6`, `28-47`, `64-69`, `86-97` | **Retain as V1 compatibility**, then replace with the approved versioned V2 vault envelope and wrapped data key. |
| Data | `data.js` ships a complete seed state, including snapshot balances, named accounts, individual transactions, bucket assignments, and travel data, in clear text in the app bundle. | `data.js:1` | **Delete from production bundle** after creating a sanitized fixture and a separately versioned curated travel catalog. Treat as a potential sensitive-data exposure until confirmed otherwise. |
| Import prototype | Browser-only CSV parser accepts a small synonym set, makes an inferred flow decision, and imports immediately; it has no mapping UI, preview, or batch record. | `js/csv.js:1-100`; `js/app.js:286-301`; `index.html:137-142` | **Refactor/reimplement** as an import adapter with preview, mapping, validation, batch audit, and reconciliation. |
| V1/prototype migration | `upgradeState` changes an in-memory state shape and boot reads a legacy key into the seed object, but no versioned V1-to-V2 migration plan, manifest, report, or rollback exists. | `js/state.js:93-165`; `js/app.js:406-415`; `js/vault.js:70`, `116-120` | **Migrate/rewrite** as an explicit read-only V1 adapter plus atomic V2 migration. |
| Tests/tooling | No `package.json`, lockfile, test directory, test runner configuration, linter configuration, or CI configuration was found. | Root file inventory; source paths above | **Add** a reproducible build, test, lint, type-check, fixtures, and CI before substantive V2A work. |
| Documentation | README, security document, changelog, and version file describe the prototype as Version 2 and use obsolete product names. | `README.md:1-79`; `SECURITY.md:1-22`; `CHANGELOG.md:1-18`; `VERSION:1` | **Refactor** after migration behavior is defined; do not use their V2 claims as implementation evidence. |

### What the current code should become

| Current asset | Disposition | Reason |
|---|---|---|
| `start.py`, `start.sh`, `start.command`, `start.bat` | Retain/refactor | Loopback-only launch is aligned with the local-first model, but it needs process lifecycle, single-instance behavior, and a local-service entry point. Evidence: `start.py:12-38`. |
| `js/vault.js` | Migrate, then retire from normal writes | It is needed to read existing V1 vaults, but its normal key/namespace/envelope must not define V2 storage. Evidence: `js/vault.js:1-6`, `57-119`. |
| `js/state.js` | Reimplement; selectively retain utility test vectors | It uses amounts as JavaScript numbers and merges domain, state, and UI responsibilities. Evidence: `js/state.js:54-78`, `207-304`. |
| `js/csv.js` | Reimplement behind an import boundary | The parser is useful reference material only; it lacks the PRD import workflow. Evidence: `js/csv.js:57-100`. |
| `js/app.js`, `index.html`, `app.css` | Replace after preserving the V1 UI as reference | The imperative single-page controller cannot cleanly enforce V2A domain invariants and lacks most required screens. Evidence: `index.html:40-46`, `js/app.js:72-79`. |
| `data.js` | Remove from distributed product; extract sanitized fixtures/catalog | It exposes data before vault creation/unlock and combines user data with app seed/configuration. Evidence: `data.js:1`. |
| `sample-transactions.csv` | Retain as a sanitized fixture only after review | It should join a documented import-fixture library; it is not a test suite today. |
| `README.md`, `SECURITY.md`, `CHANGELOG.md`, `VERSION` | Rewrite | They contain obsolete branding and unsupported V2 claims. Evidence: `README.md:1-79`; `SECURITY.md:3`; `CHANGELOG.md:3-18`; `VERSION:1`. |

## 2. Implemented V1 capabilities

The following are the only capabilities credited as implemented. This classification follows the PRD’s V1-only status, even where the repository contains superficially more advanced prototype code.

| V1 capability | Verified behavior | Evidence | Disposition |
|---|---|---|---|
| Local-first browser launch | The launcher binds to loopback and served `index.html` successfully in the smoke test. | `start.py:12-30` | Retain/refactor. |
| Encrypted local vault | Vault creates and unlocks an authenticated AES-GCM encrypted JSON envelope in `localStorage`. | `js/vault.js:18-55`, `64-84`; `js/app.js:304-323` | Retain as V1 compatibility; harden/migrate for V2A. |
| Passphrase and session controls | Create, unlock, change passphrase, manual lock, configurable 5/15/30/60-minute inactivity lock, reset, backup export, and restore with passphrase decryption are wired to the UI. | `index.html:12-30`, `219-236`; `js/app.js:46-58`, `355-403`; `js/vault.js:86-120` | Retain/rework under V2 vault requirements. |
| Aggregate dashboard | Shows safe-to-spend, cash flow, static net-worth snapshot, review percentage, bucket target progress, and utilization priority. | `index.html:66-108`; `js/app.js:87-134`; `js/state.js:286-311` | Replace calculations with transaction-derived selectors. |
| Income/target settings | Stores a monthly-income baseline and editable bucket targets. | `index.html:152-163`, `231-236`; `js/app.js:174-195`, `349-354`; `js/state.js:239-279` | Migrate income baseline and targets; do not retain this state shape. |
| Travel rules, ranking, and visited places | Maintains departure/budget/day preferences, ranks three curated destinations, and saves/removes city/state history. | `data.js:1`; `index.html:165-185`; `js/app.js:198-228`; `js/state.js:314-329` | Migrate preferences and visited places; separate catalog from vault. |
| No live account integration | The app is static/browser-only and makes no bank API call. | `README.md:77-79`; `index.html:48-51`; `start.py:24` | Retain this boundary through V2A. Do not begin Plaid work. |

### Non-creditable prototype artifacts

The source includes CSV import, transaction-like records, bucket assignment, basic merchant rules, month selection, and V2 copy. These are **verified code artifacts**, but are not implemented V2A capabilities under the PRD/task status and must be re-specified, tested, and deliberately adopted before use:

- Transaction rows have an `amount`, string `account`, coarse `flow`, one `bucketId`, and `reviewStatus`; they do not meet the canonical transaction model. `js/state.js:54-78`.
- A CSV selection immediately parses and commits records, skipping duplicate fingerprints; it does not implement preview/mapping/reconciliation. `js/app.js:286-301`; `js/state.js:223-236`.
- A selected bucket immediately sets `reviewStatus` to `reviewed`; there is no audit event, undo, allocation, or claim model. `js/state.js:207-220`.
- The prototype itself calls the shipped data a `connected-snapshot`, but there is no integration code. `data.js:1`; `index.html:105-107`; `start.py:24`.

## 3. V2A gap analysis — every formal requirement

**Result:** all 69 formal V2A-relevant requirement IDs in PRD §§4, 10, and 14 remain **not implemented** for release-status purposes. “Prototype evidence” below describes only a starting point or a contradiction; it does not change that result. Plaid/V2B items are excluded from this matrix and are not proposed for implementation.

| ID | Requirement and gap | Relevant evidence / smallest next action |
|---|---|---|
| ID-001 | **Canonical naming — not implemented.** Normal launch, backup, storage, docs, and launcher still expose Aleena/Verdant names. | `index.html:8,38`; `js/vault.js:1-6,43`; `js/app.js:369-375`; rename through a verified one-time namespace migration. |
| OVR-001 | **Traceable metrics — not implemented.** Cards are not drill-down controls and read summary/snapshot values. | `js/app.js:87-134`; `js/state.js:286-304`; create report queries with drill-down references. |
| OVR-002 | **Core cards — not implemented.** Only four high-level cards exist; expected/realized/receivable/goal readiness coverage is absent. | `index.html:66-84`; add calculated overview DTO and complete card set. |
| OVR-003 | **Financial callouts — not implemented.** No backlog, inflow, duplicate, claim, import, or goal-shortfall callout model exists. | `index.html:66-108`; add report-derived actionable callouts. |
| REV-001 | **Review queue — not implemented.** Prototype filters only by selected week; it has no required filters/defer/resolution behavior. | `js/state.js:179-197`; `js/app.js:136-164`; build query/filter/defer service. |
| REV-002 | **Review context — not implemented.** UI displays date, merchant, magnitude, string account, coarse flow, and provider category; no normalized account, mask, pending state, or location. | `js/app.js:148-154`; add canonical context projection. |
| REV-003 | **Movement classification — not implemented.** Model accepts only `outflow`, `inflow`, `transfer`; no required movement taxonomy or classifier UI. | `js/state.js:54-78`; implement enum and validation. |
| REV-004 | **Bucket/sub-bucket assignment — not implemented.** There is one `bucketId`, no sub-bucket, search, or creation in review. | `js/state.js:58-75`, `207-220`; implement allocation editor and two-level picker. |
| REV-005 | **Split during review — not implemented.** There is no allocation entity, remaining total, percent input, or cent validation. | `js/state.js:60-78`; build allocation domain service first. |
| REV-006 | **Reimbursement action — not implemented.** No payer, due date, claim, or allocation link exists. | `js/state.js:54-78`; add claims and claim-allocation links. |
| REV-007 | **Merchant rules — not implemented.** Prototype rules only map an exact merchant key to one bucket. | `js/state.js:132-138`, `207-220`; add scoped, explainable suggestion actions and rule provenance. |
| REV-008 | **Completion and undo — not implemented.** Counts exist, but review is a destructive field mutation with no event snapshot or undo. | `js/state.js:184-197`, `207-220`; add review/audit events and reversible command. |
| TXN-001 | **Transaction browser — not implemented.** No transaction-list screen, search, sort, cross-month filters, or preserved list state exists. | `index.html:40-46`; add Transactions route and query state. |
| TXN-002 | **Transaction detail — not implemented.** No detail route/model for raw facts, links, history, notes, or audit. | `js/state.js:54-78`; add canonical record/detail projection. |
| TXN-003 | **Manual entry — not implemented.** The only input is CSV file selection; no manual-entry form or delete confirmation exists. | `index.html:137-142`; add manual transaction command. |
| TXN-004 | **Pending/posted lifecycle — not implemented.** No pending status or reconciliation link exists. | `js/state.js:54-78`; add source lifecycle and resolution queue. |
| BKT-001 | **Parent buckets — not implemented.** Prototype can add/rename/reorder/target but lacks archive and V2 history guarantees; status remains V2A gap. | `js/state.js:239-279`; add stable bucket records and archive policy. |
| BKT-002 | **Two-level sub-buckets — not implemented.** No `parent_id` or nesting constraint exists. | `js/state.js:239-256`; add a depth-one schema constraint. |
| BKT-003 | **Bucket drill-down — not implemented.** Bucket board has editing only; no allocation-level totals or filters. | `js/app.js:174-195`; add bucket report query and route. |
| BKT-004 | **Merge/archive — not implemented.** No safe merge, preview, or historical archive behavior exists. | `js/state.js:239-279`; implement transactional preview/merge/archive commands. |
| SPL-001 | **Allocation model — not implemented.** A transaction contains one `bucketId`, not stable allocation records. | `js/state.js:54-78`; add allocation table and exact-cent invariant. |
| SPL-002 | **Mixed-purpose purchases — not implemented.** One bucket assignment means no split contribution to reports. | `js/state.js:207-220`, `286-304`; add multi-allocation review UI. |
| SPL-003 | **Split templates — not implemented.** Rule records contain no template/action/version. | `js/state.js:132-138`; decide template policy, then add previewed suggestions. |
| RMB-001 | **Reimbursement claims — not implemented.** No claim data, status, payer, amount, due date, or link exists. | `js/state.js:54-78`; add claim/claim-allocation schema. |
| RMB-002 | **Repayment matching — not implemented.** No candidate matcher or user-confirmed repayment link exists. | `js/state.js:223-236`; add matcher plus allocation limits. |
| RMB-003 | **Shared Expenses center — not implemented.** No route or status views exist. | `index.html:40-46`; add claims query and screen. |
| RMB-004 | **Partial/under/overpayment — not implemented.** No claim balance arithmetic or adjustment audit exists. | `js/state.js:286-304`; add minor-unit claim calculations and audit events. |
| RMB-005 | **Reimbursement reporting — not implemented.** Summary only computes income/spend from flow/bucket fields. | `js/state.js:286-304`; add gross/expected/received/outstanding/realized selectors. |
| INF-001 | **Inflow classification — not implemented.** `flow` is too coarse; all reviewed non-pending inflows can count as income. | `js/state.js:57,72-76,286-291`; add movement types and unclassified exclusion. |
| INF-002 | **Refund links — not implemented.** No refund entity/link or report reversal mechanism exists. | `js/state.js:54-78`; add refund-link validation. |
| INF-003 | **Transfer matching — not implemented.** Transfer is merely a flow/bucket exclusion; no two-sided account or debt-payment link exists. | `js/state.js:47-52`, `286-294`; add transfer/debt link model. |
| ACT-001 | **Normalized accounts — not implemented.** Seed has snapshot account objects, while transactions use a display string rather than `account_id`. | `data.js:1`; `js/state.js:67-70`; add account table and explicit Unknown account. |
| ACT-002 | **Friendly names — not implemented.** No account settings or persistent ID-based rename exists. | `index.html:207-243`; add account command/settings. |
| ACT-003 | **Account context — not implemented.** Review shows only a string account; no institution/mask everywhere. | `js/app.js:148-154`; add account chip/detail projections. |
| LOC-001 | **State/country — not implemented.** Transaction records and CSV conversion have no location fields. | `js/csv.js:63-97`; `js/state.js:54-78`; add minimized location fields. |
| LOC-002 | **Location provenance — not implemented.** No source or override field exists. | `js/state.js:54-78`; add provenance and conflict policy. |
| LOC-003 | **Location edit/reporting — not implemented.** No location UI/filter/report exists. | `index.html:111-163`; add editing and filters after model exists. |
| RUL-001 | **Rule matching — not implemented.** Exact merchant-key lookup has no scope, precedence, conflict warning, or raw-source audit. | `js/state.js:18-24`, `57-59`, `132-138`; implement deterministic rule engine. |
| RUL-002 | **Rule actions — not implemented.** Rules only suggest bucket; current assignment can immediately mark reviewed. | `js/state.js:207-220`; separate suggestion from confirmation. |
| RUL-003 | **Rule management — not implemented.** UI only renders merchant/bucket; no conditions, counts, last-used, edit/test/disable. | `js/app.js:165-171`; create rule-management route. |
| DEB-001 | **Debt summary — not implemented.** Prototype reads snapshot balance/limit/APR/due date; no normalized active debt-account configuration or complete fields. | `data.js:1`; `js/app.js:230-259`; implement account-backed debt projection. |
| DEB-002 | **Payoff priority — not implemented.** Utilization-first sorting is fixed; no APR/smallest/manual strategy selection. | `js/state.js:307-311`; add stored strategy selector. |
| DEB-003 | **Debt payment classification — not implemented.** No payment-link model prevents/diagnoses double counting. | `js/state.js:286-294`; add transaction links/invariants. |
| GOL-001 | **Emergency goal — not implemented.** “Emergency” is a protected bucket only, with no target date, funding accounts, contribution/withdrawal history, or progress method. | `data.js:1`; `js/app.js:248-254`; add goal entity. |
| GOL-002 | **Travel fund — not implemented.** Travel target is a bucket and ranking is separate; no fund readiness or trip-budget link exists. | `js/state.js:314-321`; `js/app.js:203-228`; add travel-fund goal and readiness selector. |
| GOL-003 | **Protected goals — not implemented.** A prototype flag reduces a simplified safe-to-spend value, but no explicit goal/bucket explanation or V2 calculation model exists. | `js/state.js:296-303`; implement documented protected-reserve selector. |
| TRV-001 | **Travel rules migration — not implemented.** Seed fields and display copy resemble the rules, but no V1-to-V2 preference migration is implemented. | `data.js:1`; `index.html:165-168`; add migration mapping. |
| TRV-002 | **Visited places — not implemented.** Prototype supports city/state history, but V2 persistence/migration and revisit choice are absent. | `js/state.js:324-329`; `js/app.js:221-227`; migrate into stable `VisitedPlace` records. |
| TRV-003 | **Ranked destinations — not implemented.** Prototype shows three ranked candidates, but omits travel-fund readiness and a formal as-of/source treatment. | `js/app.js:203-220`; add catalog/version/readiness projection. |
| TRV-004 | **Trip plan/budget — not implemented.** No trip entity, dates, planned categories, funding, or status exists. | `index.html:165-186`; add one-off trip-plan model. |
| RPT-001 | **Gross/net views — not implemented.** No report route or reimbursement/refund-aware selector exists. | `js/state.js:286-304`; implement report service from allocations/links. |
| RPT-002 | **Report dimensions — not implemented.** No query model supports the required filters/dimensions. | `index.html:40-46`; add report query DTOs and indexes. |
| RPT-003 | **Monthly comparison — not implemented.** Month selector has no legacy snapshot labelling or V2-versus-V1 comparison. | `js/state.js:168-172`, `282-304`; add legacy snapshot entity and comparison report. |
| SET-001 | **Vault controls — partially present but not V2A-complete.** V1 has controls; there is no separate maintenance/reset model or V2 storage behavior. | `js/app.js:355-403`; `js/vault.js:86-120`; retain controls behind new vault service. |
| SET-002 | **Versioned backup manifest — not implemented.** Envelope has basic version/timestamps/KDF/cipher fields, but no V2 schema/app/integrity manifest before encryption. | `js/vault.js:41-48`, `104-114`; design and validate manifest first. |
| SET-003 | **Account/import settings — not implemented.** Only income, scripture, lock duration, and primitive CSV sign setting exist. | `index.html:231-236`; `data.js:1`; add account, mapping, currency, and privacy settings. |
| SET-004 | **Diagnostics — not implemented.** No diagnostic screen/data counts/save/backup/import/migration health exists. | `index.html:207-243`; add secrets-free diagnostics projection. |
| IMP-001 | **CSV workflow — not implemented.** Parser has fixed header aliases and commits immediately; no mapping, preview, isolated error review, or account mapping. | `js/csv.js:57-100`; `js/app.js:286-301`; implement staged import batch. |
| IMP-002 | **Duplicate detection — not implemented.** Prototype uses ID/fingerprint but silently skips duplicates; it lacks provider-ID precedence explanation, candidate review, and reviewed-data protection. | `js/state.js:47-52`, `223-236`; add idempotent reconciliation workflow. |
| IMP-003 | **Plain exports — not implemented.** Only encrypted raw-vault backup export exists. | `js/vault.js:99-102`; `js/app.js:369-376`; add confirmed CSV/JSON exports with stable IDs. |
| UX-001 | **Global search — not implemented.** No search control or local index/query exists. | `index.html:40-46`; implement local search with match-field disclosure. |
| UX-002 | **Accessible interaction — not implemented/untested.** Buttons/labels and move controls help, but no focus styles, route semantics, chart alternatives, or accessibility test coverage exist. | `index.html:152-163`; `app.css:10-16`; add accessibility acceptance tests. |
| UX-003 | **Empty/loading/error behavior — not implemented.** A completed-week message and generic import count exist, but no comprehensive local processing/error/coverage states. | `index.html:121-142`; `js/app.js:286-301`; define screen-state contracts. |
| AGT-001 | **Suggestion-only automation — not implemented.** Basic rule suggestions exist, but duplicate/transfer/claim suggestions, rationale, confidence, preview, bulk undo, and audit are absent. | `js/state.js:57-59`, `207-220`; add suggestion objects and approval commands. |
| AGT-002 | **User corrections precedence — not implemented.** Raw/source/user fields are not separated and no conflict history exists. | `js/state.js:54-78`; enforce source-versus-user tables and audit log. |
| SEC-001 | **No remote analytics — partially verified, not complete.** CSP limits app connections and no analytics code was found; external Google search is available for travel research, though it sends destination query text rather than financial data. | `index.html:7,184`; `js/app.js:198-220`; preserve no-financial-data boundary and test it. |
| SEC-002 | **Location minimization — not implemented.** No V2 location model/provenance/export policy exists. | `js/csv.js:63-97`; add only region/country fields and encrypted raw-source policy. |
| SEC-003 | **Plain-export warning — not implemented.** No plain export exists, therefore no explicit warning/confirmation exists. | `js/vault.js:99-102`; implement warning gate with exports. |
| SEC-004 | **Threat-model documentation — partially present but not V2A-complete.** SECURITY.md documents basic limitations, but stale branding and V2 claims make it unsuitable as V2 documentation. | `SECURITY.md:1-22`; `README.md:57-79`; rewrite after architecture decision. |

### Supporting V2A foundation gaps

These PRD requirements are mandatory foundations for the formal matrix above, not optional implementation details.

| Foundation | Verified gap | Evidence | Required disposition |
|---|---|---|---|
| Canonical minor-unit, signed money model | Transactions use positive magnitude `Number`s, derive a separate `flow`, and calculations use floating point. Raw amount/sign are not preserved. | `js/csv.js:44-48`, `79-97`; `js/state.js:54-78`, `286-304` | Create an integer-cent signed convention before imports/reports. |
| Source facts separated from user meaning | One transaction object mixes source-like values with `bucketId` and review state. | `js/state.js:60-77` | Create immutable source records/fields and separate user interpretation, links, and audit events. |
| Normalized relational persistence | State is one encrypted JSON payload; every change rewrites it. | `js/vault.js:35-63`; `js/app.js:60-65` | Use normalized tables with database transactions and versioned migrations. |
| Local-service boundary | There is only static-file serving; all vault and financial logic runs in UI code. | `start.py:24`; `js/app.js:1-18` | Introduce an approved localhost-only domain/database service; no Plaid endpoints in V2A. |
| V1 migration semantics | Existing `upgradeState` merges seed data and deletes `categories`; it does not create legacy snapshots or migration reporting. | `js/state.js:93-165` | Implement PRD §16 mapping, validation, atomic commit, rollback, and report. |

## 4. Obsolete Verdant and Aleena's Money Moves branding map

| Location | Verified obsolete text/behavior | Risk | Required action |
|---|---|---|---|
| `index.html:8,14,38,57` | Browser title, AM mark, visible Aleena’s brand, and “Monthly Snapshot.” | User-visible normal-launch violation. | Replace with Money Moves during the V2 migration release. |
| `README.md:1,8,33,68` | Aleena’s branding, an `aleenas_money_moves` folder reference, and unsupported Version 2 claims. | Incorrect user instructions and packaging name. | Rewrite for actual V1/V2A behavior; rename distributed package only after migration plan exists. |
| `SECURITY.md:3` | “Aleena’s Money Moves.” | Inconsistent threat documentation. | Rewrite to Money Moves. |
| `CHANGELOG.md:3-18` and `VERSION:1` | Version `2.0.0` and claims that V2 work/migration already exist. | Can cause false implementation claims and risky migration assumptions. | Preserve only as historical note or replace with accurate release history. |
| `start.py:2,21,28` | Launcher docstring/help/console use Aleena’s name. | User-facing normal launch violation. | Rename with the launcher refactor. |
| `js/app.js:374` | Download filename is `aleenas-money-moves-backup-...`. | User-facing exported filename violation. | Migrate to Money Moves backup naming after read compatibility is in place. |
| `data.js:1` | App name is Aleena’s Money Moves and version is `2.0.0`. | Stale metadata plus sensitive clear-text seed. | Remove production seed; move curated, non-user catalog data into versioned app assets. |
| `js/vault.js:1-6,43,121` | Normal current vault key, temp key, legacy key, AAD, metadata, and exported constant use Verdant/Aleena names. | **High:** legacy values are not merely read-only; normal create/save writes `verdant-vault-v1`. | Keep exact constants only in a V1 reader; write V2 only under a Money Moves namespace after verification. |

## 5. Persistence and encryption assessment

### Verified controls

- AES-256-GCM is used with a fresh random 12-byte IV on every encryption. `js/vault.js:35-48`.
- PBKDF2-SHA-256 with 600,000 iterations and a random 16-byte salt derives a non-extractable Web Crypto AES key. `js/vault.js:28-33`, `64-69`.
- The passphrase is not stored in the visible state; app references are cleared when locking. `js/vault.js:18-27`; `js/app.js:46-58`.
- Backups export the encrypted envelope, and restore decrypts/authenticates before calling the install function. `js/vault.js:99-114`; `js/app.js:379-390`.
- The app’s CSP disallows remote scripts and restricts connects to self. `index.html:7`. No analytics dependency was found in the source inventory.

### Gaps and risk assessment

| Severity | Finding | Evidence | Assessment and required response |
|---|---|---|---|
| Critical | Clear-text financial seed in the application bundle | `data.js:1`; loaded before vault state in `js/app.js:13` | **Verified.** Encryption does not protect information shipped in JavaScript. Confirm whether this is authorized synthetic data; otherwise remove it from distribution and rotate/review exposure as appropriate. |
| High | Old Verdant namespace is the active normal namespace | `js/vault.js:1-6`, `57-83` | **Verified.** This violates the PRD’s naming/migration rule and complicates safe detection. Write V2 only to a new namespace after verified conversion. |
| High | Monolithic storage and no schema migration/rollback | `js/vault.js:35-63`; `js/state.js:93-165` | **Verified.** Browser `localStorage` writes cannot provide the required normalized database transactions, migration journal, or reliable rollback. Replace as part of V2 foundation. |
| High | No V2 per-vault data key or versioned KDF policy | `js/vault.js:28-48` | **Verified.** V1 derives the encryption key directly from passphrase; it does not implement the PRD’s wrapped random data key or a versioned KDF envelope. Decide the V2 encryption architecture before storage work. |
| Medium | “Atomic” write has limited crash recovery | `js/vault.js:57-63`; `js/vault.js:18-22` | **Inference from code.** A temp record is verified then copied, but startup ignores any surviving temp record. The operation is not an atomic multi-key transaction. Use database transactions plus restore/migration journal. |
| Medium | Key clearing is reference clearing, not a guarantee of immediate memory erasure | `js/app.js:46-50`; `js/vault.js:121` | **Verified behavior; security limitation inferred.** JavaScript GC/Web Crypto lifecycle cannot prove key zeroization. Document platform limits and minimize key lifetime. |
| Medium | Backup format validation is narrow | `js/vault.js:104-114` | **Verified.** It checks `version` and cipher name and relies on AES-GCM authentication, but lacks V2 manifest validation, app/schema compatibility checks, and a restore report. |
| Medium | Static snapshot/source provenance is unclear | `data.js:1`; `README.md:29` | **Verified contradiction.** The repo claims a connected-account snapshot yet has no integration; the source and authorization of those records are not auditable. Treat all such values as V1 legacy snapshots, never as V2 canonical account/transaction facts. |
| Low | `style-src 'unsafe-inline'` weakens CSP style policy | `index.html:7` | **Verified.** Not the primary financial-data risk, but revisit during the UI rebuild. |

## 6. Proposed target folder structure

This is a proposed V2A structure, subject to the PRD architecture decisions. It intentionally has no Plaid client, secret store, sync endpoint, or integration implementation.

```text
money-moves/
  apps/
    local-web/
      src/
        app/                 # routes, shell, accessibility primitives
        features/
          overview/
          transactions/
          review/
          buckets/
          reimbursements/
          debt-goals/
          travel/
          settings/
        components/
        styles/
      public/
  services/
    local-api/
      app/
        api/                 # localhost-only HTTP boundary
        domain/              # cents, invariants, calculations, commands
        repositories/        # transactions, accounts, claims, rules, etc.
        imports/             # CSV adapters, mapping, preview, dedupe
        reports/             # overview and drill-down query definitions
        vault/               # key wrapping, backup/restore, lock lifecycle
        migrations/          # database migration runner and V1 adapter
        diagnostics/
      db/
        migrations/
  packages/
    contracts/               # typed request/response and domain contracts
    fixtures/                # sanitized V1 vaults and CSV variants only
  tests/
    unit/
    property/
    integration/
    e2e/
    security/
  docs/
    engineering/
      adr/
      migration/
      test-vectors/
```

The V1 code should remain archived/read-only during migration development. The only intentional V1-to-V2 runtime dependency should be a narrowly scoped compatibility module under `services/local-api/app/migrations/`, not the UI or report code.

## 7. Migration-risk assessment

| Risk | Level | Evidence | Mitigation / acceptance condition |
|---|---|---|---|
| Ambiguous source baseline | High | `data.js:1` contains prototype transaction-like data while authoritative status says V1 is aggregate-only. | Define supported V1 envelope/state versions from synthetic fixtures; classify any unknown shape as a blocking migration error, never as canonical history. |
| Legacy names are current write paths | High | `js/vault.js:1-6,57-83` | V1 reader only; write new V2 namespace only after verify; retain old key until next clean launch. |
| Aggregate values could be misrepresented as ledger history | High | `js/state.js:286-304`; `data.js:1` | Migrate targets/income/preferences separately; store actuals/balances as labelled `LegacyMonthlySnapshot`/`LegacyBalanceSnapshot`, with no false drill-down. |
| Clear-text seed may be personal/production data | Critical | `data.js:1`; `README.md:29` | Obtain data-classification decision before publishing/repackaging. Remove/de-identify and use synthetic fixtures. |
| Floating amounts produce reconciliation drift | High | `js/csv.js:44-48`; `js/state.js:67`, `286-304` | Convert only explicit, validated values to integer cents; property-test rounding and totals. |
| Account identity is lossy | High | `js/state.js:67-70`; imported account is a display string in `js/csv.js:71-96` | Do not invent account IDs/masks. Migrate snapshots separately; require user mapping/Unknown account for transactions. |
| Prototype state upgrade silently reshapes data | High | `js/state.js:93-165` | Do not reuse it as migration. Build a pure, versioned conversion plan with before/after counts/totals and rollback. |
| No test fixture/automated regression protection | High | No test/config files in inventory | Add sanitized V1 vault fixtures, malformed CSV corpus, migration E2E, and backup tamper tests before migration release. |
| Backup restore can overwrite active vault | Medium | `js/app.js:379-390`; `js/vault.js:112-114` | Validate into temporary store, show manifest/report, then atomically switch; preserve previous vault until a verified next launch. |
| Brand rename can strand existing vaults | Medium | `js/vault.js:1-6`; `js/app.js:374` | Detect legacy exact keys, explain migration, and test backup/restore across old and new namespaces. |

## 8. Phased implementation plan — small, reviewable tasks

Each task below should have a focused review and tests before the next task. None includes Plaid.

1. **Freeze and baseline V1.** Tag/archive the current source, record the active legacy keys/envelope, remove personal data from future test artifacts, and create a sanitized V1 fixture. Do not alter user vaults.
2. **Approve the architecture ADRs.** Decide frontend/runtime packaging, local-service platform support, V2 encryption/database design, signed-cent convention, and migration support policy. Produce ADRs before schema coding.
3. **Create the testable skeleton.** Add reproducible package/tooling, test runner, formatter/linter/type checking, local-service health endpoint, and CI. Prove loopback-only binding.
4. **Implement vault primitives.** Add versioned V2 manifest, passphrase-wrapped random data key, lock lifecycle, encrypted backup validation, temporary restore, and tamper tests. Keep this independent of product records.
5. **Build V1 read compatibility.** Implement a pure V1 envelope reader and conversion-plan preview; add fixtures for valid, wrong-passphrase, malformed, and legacy-key states.
6. **Create database and migrations.** Add normalized schema/migrations for accounts, source transactions, user interpretations, audit events, import batches, and legacy snapshots; test atomic upgrade/rollback.
7. **Implement canonical accounts and manual transactions.** Use integer cents, required Unknown account, source/user field separation, movement-type enum, and audit event. Deliver CRUD plus unit/property tests.
8. **Implement staged CSV import.** Add mapping, sign convention selection, preview, row errors, account mapping, duplicate candidates, idempotent commit, and batch audit. Do not add provider sync.
9. **Implement buckets, sub-buckets, and allocations.** Add parent-depth constraint, targets/order/archive/merge preview, exact-cent split validation, allocation drill-down, and referential-integrity tests.
10. **Implement Weekly Review.** Add queue filters/context, explicit confirmation, defer, user-correction precedence, immediate undo, and accessible split editor.
11. **Implement claims, refunds, transfers, and debt-payment links.** Add repayment/refund/transfer models, matching suggestions requiring confirmation, write-off/overpayment handling, and calculation test vectors.
12. **Implement reports and Overview.** Build gross/expected/realized/outstanding selectors, safe-to-spend policy, drill-down query references, coverage labels, callouts, report dimensions, and legacy snapshot labelling.
13. **Implement debt, goals, and travel migration.** Add strategy and goal records, trip plans, V1 preference/visited-place migration, catalog as-of/source metadata, and no automatic funds movement.
14. **Harden settings, migration, and release docs.** Complete diagnostics, account/import settings, Money Moves rename, V1 conversion UI/report, backup/restore E2E, accessibility audit, and release checklist.

## 9. Test strategy

The repository currently has no automated tests; this strategy is required before claiming any V2A feature complete. It aligns with PRD §17 and Appendix D.

| Layer | Required coverage |
|---|---|
| Unit/domain | Integer-cent parsing, signed normalization, month/date policy, allocation sum/residual cent, bucket depth, claim balances, refund caps, transfer/debt exclusion, safe-to-spend inputs, rule precedence. |
| Property/invariant | Random split/percentage combinations, repeated partial payments/overpayments, source refreshes, and migration values must preserve all invariants. |
| Database/migration | Forward/rollback migrations, atomic writes, archive/merge references, audit events, V1 plan/commit/rollback, unknown-shape rejection. |
| Import | Institution CSV variants, mapped columns, signs, missing fields, malformed rows, duplicate candidates, idempotent re-import, reviewed-record protection. |
| Vault/security | Locked-state access, bad passphrase, tampered backup, manifest compatibility, temporary restore failure, key lifecycle, loopback/origin controls, no sensitive data in diagnostics/plain export confirmations. |
| UI/accessibility | Keyboard review and bucket reorder alternatives, focus visibility, screen-reader labels, split editor totals, filters, empty/loading/error states, undo, drill-down return state. |
| End-to-end | Clean profile: V1 fixture → migration preview → V2 vault → CSV/manual review → split/claim/refund/transfer → report drill-down → encrypted backup/restore. |
| Manual release gate | Confirm Money Moves branding only; verify no clear-text financial fixture in packaged assets; compare migration counts/totals; restore into a clean local profile. |

## 10. Questions that genuinely block implementation

1. Which supported runtime/package target is approved: a local Python service with a browser UI, a desktop wrapper, or another packaging model? This determines the local-service lifecycle and database deployment.
2. Which V2 encrypted-storage design is approved: SQLCipher or application-level encryption over SQLite, and is Argon2id available on every supported platform? This blocks the vault/database/migration foundation.
3. Is the PRD’s recommended canonical sign convention approved: positive inflow, negative outflow, stored in integer cents? This blocks import, reporting, transfer, and migration logic.
4. What is the approved safe-to-spend formula and default presentation when planning, cash coverage, debt commitments, protected goals, buffer, and outstanding reimbursements conflict? This blocks the Overview contract.
5. Which personal-spend measure is the Overview default: expected responsibility or cash-realized cost? This blocks metric labels and acceptance tests.
6. Are split templates fixed-dollar, percentage-based, or both? This blocks the merchant-rule action model.
7. Should encrypted raw provider location beyond state/country be retained for audit, and if so, what export/redaction rule applies? This blocks the source schema and privacy policy.
8. Is historical re-bucketing allowed after V2 launch, and what preview/audit/undo policy is required? This blocks rule-management semantics.
9. Will goal progress be balance-based, contribution-based, or configurable per goal? This blocks goals and safe-to-spend calculations.
10. What exact V1 vault shapes/keys must be supported, and can a sanitized fixture for each be supplied? The observed `verdant-vault-v1` envelope and `schemaVersion:3` seed conflict with the V1-only baseline; conversion cannot safely be inferred. Evidence: `js/vault.js:1-6`; `data.js:1`.
11. Is the financial/account/transaction data embedded in `data.js` authorized synthetic fixture data, or is it personal/production data? This blocks any safe package/release work because it currently ships unencrypted. Evidence: `data.js:1`.

## Validation commands run

No existing test or validation command was available: the repository has no package manifest, test directory, test-runner configuration, linter configuration, or CI configuration.

| Command / check | Result |
|---|---|
| `rg --files` search for test directories and package/test/lint configs | **No matches.** No project-defined test command exists. |
| Bundled Node `--input-type=module --check` for `js/app.js`, `js/csv.js`, `js/state.js`, and `js/vault.js`; Node `--check` for `data.js` | **Passed.** No syntax errors. |
| Bundled Python `-m py_compile start.py` with cache redirected outside the workspace | **Passed.** |
| Read-only pure-module smoke check: parse one valid and one invalid CSV row, then add a transaction and verify `monthSummary` | **Passed:** “CSV normalization and month summary.” This is a narrow audit smoke check, not a repository test suite. |
| `start.py --port 18080` localhost smoke attempt | **Did not run:** port unavailable in the sandbox environment; no production failure was diagnosed or fixed. |
| Retried `start.py --port 18888`, fetched `http://127.0.0.1:18888/index.html`, then terminated the test server | **Passed:** HTTP 200, 13,927-byte HTML response. The fetched stale title is expected from the verified branding gap (`index.html:8`), not a new failure. |

The PRD was rendered to 41 PNG pages and visually inspected during this audit; no content/layout defect affected its use as the source of truth.

