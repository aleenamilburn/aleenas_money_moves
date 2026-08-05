# Money Moves V2B — Desktop Beta Workflow Corrections

Status: CANDIDATE READY / INDEPENDENT ACCEPTANCE PENDING
Date: 2026-08-05
Scope: desktop private-beta workflow correction only

## Purpose

This bounded phase corrects issues found in the desktop beta: first-use bucket guidance, classification of income/transfers/debt payments, parent-first weekly review, traceable parent totals on Overview, and invalid January 1970 month selection. It preserves the V1 data model, canonical transaction/allocation evidence, V2A reimbursement foundations, and the accepted local encrypted desktop vault.

It does not add Plaid, cloud sync, phone use, shared expenses, reimbursement UI, refunds, account/location correction, a new import adapter, or a change to the Electron security/vault boundary.

## Schema 8 and preserved data

Schema 8 adds `semanticType` (`spending`, `income`, `transfer`, or `debt_payment`) and `system` to canonical buckets. The migration is `v2b-desktop-beta-bucket-workflow` and is clone-first, deterministic, idempotent, and validated before and after migration.

The three protected system classifications use reserved stable IDs:

- `mm-system-income` — Income
- `mm-system-money-transfer` — Money Transfer
- `mm-system-debt-payment` — Debt Payment

They are added by ID, never by matching a user-visible name. An existing user bucket named “Income,” “Transfer,” or similar remains an ordinary `spending` bucket; it is not converted, renamed, or removed. System classifications cannot be deleted, converted, renamed, archived, or given child buckets.

### Exact fresh-vault detection

The three editable starter spending buckets—Housing, Food, and Transportation—are seeded only when the **original input before any migration step** has no user-data evidence:

- no records in any domain collection (accounts, transactions, buckets, allocations, reimbursement records, rules, audit records, or preserved snapshots);
- no legacy review transactions, buckets, or merchant rules;
- no V1 categories or preserved V1 categories/review buckets.

Any one of those records prevents starter seeding. This avoids inserting starter buckets into a previously used, restored, migrated, or otherwise non-empty vault. Re-running the migration or relaunching a schema-8 vault adds no duplicates. The protected system classifications are deliberately separate: they are added once to older vaults too so financial semantics are explicit without name-based conversion.

## Workflow behavior

- Weekly Review renders only active top-level parents as primary buttons. Selecting a parent with children opens a focused child chooser. Selecting a child is explicit; canceling the chooser leaves the transaction unchanged and creates no allocation or rule. Direct-parent assignments, exact children, and split allocations remain preserved.
- Allocation saves to a protected system classification classify the canonical transaction as `earned_income`, `internal_transfer`, or `debt_payment`. These classifications require one full transaction allocation and cannot be split with ordinary spending.
- Overview uses canonical parent buckets and the shared allocation ledger. A parent’s actual equals its direct allocations plus allocations to immediate children; each allocation row is counted once. Income and transfers are excluded from the ordinary spending plan. Debt payments are distinct and excluded from ordinary spending, while reducing cash flow/safe-to-spend separately.
- Empty Overview state now clearly says that no ordinary spending buckets exist, and a missing snapshot displays “No account snapshot available.”
- Month selection uses a local-clock `YYYY-MM` helper and strict month/date validation. A fresh or invalid selection becomes the local current month; an explicit valid historical selection persists. Migration timestamps may still use deterministic 1970 values internally, but they are no longer used as UI clock input or as a default selectable month.

## Automated evidence

`test/desktop-beta-workflow.test.js` covers:

- fresh-only starter seeding, idempotence, no duplicate systems, and no name-based conversion;
- protection of system classifications and editability of ordinary starters;
- parent-only review choices with explicit child-target behavior and no chooser side effect;
- direct-plus-child parent rollup, income/transfer/debt behavior, exact split restriction, and signed canonical classifications;
- controlled August 2026 local-clock hydration, valid historical month persistence, and absence of a migration-fallback 1970 month.

Existing V1 compatibility, bucket, allocation, reimbursement, hosted-storage research, desktop-vault, and Electron security tests remain part of the full suite.

## Acceptance still required

Before this phase is accepted, run the documented desktop manual matrix against a newly packaged application:

1. Create a fresh vault: exactly Housing, Food, Transportation, Income, Money Transfer, and Debt Payment appear; ordinary starters are editable.
2. Open a migrated or restored non-empty vault: no starters are injected; existing bucket names and history remain unchanged.
3. Import synthetic CSV records, assign a direct Food record and a Food child record, then confirm Food rolls both up on Overview after restart.
4. Select Food in Weekly Review, cancel its child chooser, verify no assignment changed; then choose a child and verify the exact child persists.
5. Classify synthetic income, transfer, and debt-payment records; verify their separate treatment in Overview after lock/unlock.
6. Confirm a fresh vault opens to the local current month, no January 1970 option appears merely from migration, and an explicit valid prior month remains selected after restart.

No acceptance decision, release tag, or distribution claim is made by this implementation record.

## Founder packaged manual matrix — 2026-08-05 finalization run

This matrix must be performed with the freshly generated app or mounted DMG,
using only disposable synthetic data and a test passphrase. No personal vault,
Application Support directory, or existing `/Applications` copy was changed by
the engineering run. Do not mark a row passed from automated coverage alone.

| Section | Required founder observation | Result | Evidence / next action |
|---|---|---|---|
| A — startup and month | The app reaches a usable Create/Unlock screen; local current month is selected; no stuck splash, `null`, or January 1970 UI. | **PASS — founder confirmed** | The founder reported the functional correction working. Automated local-clock coverage and current direct/DMG synthetic startup checks remain consistent with that observation. |
| B — fresh vault | Create an empty vault; exactly Housing, Food, Transportation, Income, Money Transfer, and Debt Payment appear; the three protected classifications cannot be removed; restart does not duplicate any bucket. | **PASS — founder confirmed** | The founder confirmed the workflow. Schema-8 migration and protection/idempotence coverage pass. |
| C — review and child assignment | Import a five-row synthetic CSV; Weekly Review initially offers parents only; add two children under one parent; choose one explicitly and confirm it persists after restart. | **PASS — founder confirmed** | The founder confirmed the workflow. Parent-first review and no-side-effect chooser coverage pass; the current packaged synthetic check rendered six parent choices. |
| D — Overview semantics | Verify a parent's actual is direct allocations plus child allocations exactly once; Income and Money Transfer are outside ordinary spending; Debt Payment is visibly distinct. | **PASS — founder confirmed** | The founder confirmed the workflow. Allocation-ledger rollup and classification coverage pass. |
| E — persistence | Lock/quit/relaunch/unlock; verify selected month, buckets, assignments, and Overview totals remain intact. | **PASS — founder confirmed** | The founder confirmed the workflow. Encrypted save/reload regression coverage passes. |
| F — encrypted backup restore | Export encrypted backup through the native dialog; intentionally change the synthetic state; import/restore the backup through the native dialog; verify the prior authoritative state returns and persists after another relaunch. | **PASS — founder confirmed** | The founder confirmed the workflow. Existing native encrypted backup/restore regression coverage remains green. |
| Founder-approved icon | The transparent founder-approved icon appears consistently in the runtime and packaged app. | **PASS — approved source and packaged asset verified** | The canonical PNG and regenerated ICNS were verified in the direct app, DMG, and ZIP. Finder/Dock/application-switcher cache appearance was not re-observed in this final spacing run. |

### Artifact and icon observations already verified

- `CI=true pnpm test`: **173 passed**, 0 failed; `CI=true pnpm run electron:test`:
  **27 passed**, 0 failed; `CI=true pnpm run check`, Python compilation, and
  staged/unstaged `git diff --check` passed.
- Fresh unsigned ARM64 direct app, DMG, and ZIP were made under `out/`.
  `CI=true pnpm run inspect:package` passed with **286 filesystem files** and
  **42 ASAR entries** before the final layout rebuild; the final layout rebuild
  passed with **287 filesystem files** and **42 ASAR entries**.
- The canonical founder PNG is a self-contained transparent 2000-pixel RGBA
  image, sanitized of C2PA, EXIF, and text metadata. Its derived PNGs are
  exactly 16, 32, 64, 128, 256, 512, and 1024 pixels; its ICNS includes each
  corresponding macOS representation.
- The direct app bundle, a read-only mounted DMG app, and an extracted ZIP app
  each contained a byte-identical canonical ICNS. Finder, Dock, mounted-DMG
  Finder, ZIP Finder, and application-switcher icon rendering are deliberately
  left for founder visual confirmation because macOS icon caching is outside
  this automated check. If an old icon persists, first quit the old application
  and reopen the new generated app; do not conclude that the bundle is wrong
  until its `Contents/Resources/electron.icns` is checked.

### Final Weekly Review spacing correction

The root cause was structural: `#editCurrentAllocation` followed the
two-column `#reviewBucketChoices` grid directly, with no action wrapper, gap,
or primary/secondary grouping. Its full-width treatment could make the button
appear visually merged with the final bucket-choice row.

The correction adds `.review-transaction-actions` as an explicit action group,
with a 20px separation from the preceding content and a 16px group gap. The
Split/Allocation control now lives in a distinct `.review-secondary-actions`
flex row with a top border and 14px inset. At regular desktop width it remains
a bounded 15rem minimum-width secondary button; at the compact supported
breakpoint it wraps safely and fills its own row. The compact app-shell grid
also now uses `minmax(0,1fr)`, preventing intrinsic child widths from creating
horizontal overflow at a 720px viewport.

The direct package and the read-only mounted-DMG package were each checked with
five synthetic CSV rows. At 720px, the measured viewport scroll width remained
720px, the bucket choices became one column, the Split/Allocation button filled
only its secondary row, and no choice/button rectangles overlapped. The button
opened the split editor with focus and canceled without mutating the synthetic
transaction. No unexpected renderer or main-process error was observed during
these launches.

The founder confirmed that the A–F functional matrix passed. The transparent
founder icon source is approved and the regenerated app/DMG/ZIP icon assets
were verified; Finder/Dock/application-switcher cache rendering was not
re-observed in this final spacing run.

### Acceptance boundary

The V2B candidate is ready for its bounded candidate commit and candidate tag,
but remains **INDEPENDENT ACCEPTANCE PENDING**. This founder matrix and package
evidence do not constitute independent acceptance. Signing/notarization,
Plaid, cloud backup, live sync, phone support, shared-vault work, and unrelated
product scope remain out of this candidate.
