# Faith & Money Devotionals — Final V2C Acceptance

## Verdict

**ACCEPTED WITH LOW-RISK FOLLOW-UPS**

Acceptance date: 2026-08-05. Accepted base: `fa83670` (`v2b-desktop-workflow-accepted`). Candidate reviewed: `682a5c0` (`v2c-faith-money-devotionals-candidate`). Domain schema: 9.

## Requirements and corrections

The accepted scope is the original offline twelve-item Faith & Money library, WEB quotations and attribution, exactly three prompts per item, encrypted optional responses and notes, deterministic completion/progression, schema 8→9 migration, Overview/reader/history UI, and the existing manual encrypted desktop backup/restore path. Financial state, user overrides, canonical allocations, local encrypted authority, sandboxing, context isolation, narrow IPC, and atomic persistence remain unchanged.

Independent review verified unique stable IDs and sequence, non-overlapping primary passages, static original content, bounded plain-text journals, and rejection of altered attribution, duplicate identifiers/prompts/passages, remote content, markup, malformed content, invalid progression, and repeated completion. Migration is clone-first, preserves financial and compatibility state, and is idempotent. Successful devotional mutations advance `stateRevision` once; validation and persistence failures roll back without exposing journal text.

The pre-existing correction set also makes native import results explicitly `cancelled` or `selected`, passes an encrypted envelope rather than a path to the renderer, maps selected-file read failures correctly, sanitizes visible errors, and coordinates selection → passphrase → explicit confirmation → validated atomic replacement while blocking overlapping restore actions.

The independent matrix found and corrected one High defect: after a successful restore the reader retained the superseded pre-restore devotional draft in renderer memory. Successful restore now clears the in-memory devotional draft before re-rendering, and a UI contract regression test covers that authority change.

## Validation evidence

- `CI=true pnpm test`: 198 passed; 0 failed, skipped, cancelled, or todo.
- `CI=true pnpm run electron:test`: 38 passed; 0 failed, skipped, cancelled, or todo.
- `CI=true pnpm run check`, `python3 -m py_compile start.py`, `git diff --check`, and `CI=true pnpm run content:validate`: passed.
- Fresh `electron:package`, `electron:make`, and `inspect:package`: passed; unsigned ARM64 app, DMG, and ZIP created; 286 filesystem files and 46 ASAR entries scanned.
- Direct and mounted-DMG ASAR SHA-256: `1ee5b596a90d75dfd590498b0acd850db4e746044c9b36bf9280d83b87cd2436`; byte-identical. Active `electron/preload.cjs` and corrected IPC/restore modules were present.
- Package lists excluded tests, docs, local config, Plaid, hosted-vault, Supabase, and browser-vault modules. Synthetic journal strings were absent from artifacts, profile files, logs, messages, and diagnostics.

## Native restore matrices

The direct packaged app and the freshly mounted read-only DMG app each used a separate disposable `/private/tmp` profile. Each created a schema-9 vault, saved `BACKUP STATE ALPHA` and `ALPHA PRIVATE NOTE`, exported through the real native save panel, advanced to devotional 2 with `CURRENT STATE BETA`, and selected the fresh Alpha backup through the real native open panel.

In both apps the passphrase request was reached. A wrong passphrase left devotional 2/Beta authoritative and showed only the bounded non-mutating error. The correct passphrase was followed by explicit replacement confirmation. Alpha response/note returned, devotional 1 became current/in-progress, devotional 2 returned to not-started, and empty synthetic financial totals remained unchanged. After quit/relaunch with the same disposable profile, unlock showed Alpha as authoritative. Native selection cancellation was visible, made no mutation, and did not request a passphrase. Malformed, unsupported-extension, missing/read-failure, oversize, symlink, validation, conflict, and atomic-failure cases passed focused repository/coordinator tests.

At the supported compact desktop width, the Overview devotional card did not overlap other content, Overview and reader had no horizontal overflow, the library unpinned into the single-column layout, and dirty navigation was blocked. Labels, live status text, title focus hooks, and keyboard-safe native controls remain present. CSV, starter/protected buckets, Weekly Review child choice, allocations/splits, Overview rollups, current month, encrypted vault, passphrase change, single instance, and packaging regressions passed the full suite.

## Remaining low-risk follow-ups

Signing, notarization, and Finder/Dock/application-switcher appearance remain release operations, not V2C correctness defects. A release-Mac human visual pass may supplement the automated supported-width checks. Architecture planning for V3 may begin; implementation of Plaid, cloud backup/sync, phone/shared-vault, or travel scope still requires its own approval and acceptance.

The founder's existing vault, Desktop backup, and installed `/Applications` app were not accessed, selected, modified, or deleted. Only disposable synthetic profiles and backups were used and removed after validation.
