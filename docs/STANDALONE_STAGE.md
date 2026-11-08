# Standalone Stage

Open **Admin → Stage → Standalone Stage**. Create a stage with an optional title, or reopen a saved stage. **Discussion Stage** keeps the existing discussion selection and session controls. Standalone stages are separate database records; creating one never creates a discussion, nickname reservation, contribution or ballot.

Each stage has a stable admin identifier and a public projector link at `/stage/CODE`. The saved-stage list shows the 50 most recently updated stages; older stages remain accessible through their saved admin/projector links. Saved announcements and prompts persist across refreshes. Existing shared editors provide announcements, editable spotlight prompts, reflections with optional countdowns, and visual atmospheres.

## Presentation and voting

Announcements, reflections and voting can temporarily cover a prior presentation. Returning restores one previous valid presentation. Expired timed content resolves server-side, including after projector refresh, without relying on a browser timer to establish authoritative state. **Clear stage** clears the current presentation and return history while preserving saved announcements, prompts and the atmosphere.

Choose an existing voting event and open **Voting presentation controls** to select its question, QR invitation, live results or final reveal using the existing voting administration component. **Project voting event** attaches that event to the standalone stage. Attachment itself does not change the event's settings, votes or publication state. Drafts must be opened before attachment; archived events cannot be projected. Event-status changes made in the embedded controls synchronize to the selector.

The independent Voting Room and every stage attached to the same event follow that event's authoritative presentation. Explicitly changing a question, chart or result-publication setting therefore updates the shared event, rather than making a separate copy. Hidden results remain protected by the existing public voting API; no new vote aggregation or result-visibility system is introduced.

## Synchronization and privacy

- `/admin/stages` and `/admin/stages/UUID` require the existing server-side admin authentication and authorization. Changes require a matching stage revision. A stale moderator receives a conflict and refreshed state; local editor drafts remain available.
- Public `/stages/CODE` responses contain only the title, code, revision, atmosphere and currently eligible overlay. Saved drafts, prompt libraries, return history, audit metadata and unrelated discussion content are omitted.
- The projector uses serialized, abortable polling every 2.5 seconds while visible. It accepts authoritative expiry/restoration updates at the same revision and rejects older revisions. Normal polling does not remount unchanged text. This is polling, not push or a projector heartbeat.
- Admin state polls every four seconds, with serialized voting-event refreshes every six seconds. Connection failures are displayed; no action is retried automatically as a blind write.
- Fullscreen, reduced motion, the existing atmospheric lighting, rotating Emblem and native cursor fallback are preserved. Long content scrolls inside the presentation area rather than covering the header or controls.
- Operational changes create protected `standalone_*` activity records, correctly identified as standalone stage activity. Clearing a stage never clears activity or event history.

## Database and recovery

Migration `009_standalone_stages.sql` adds only `standalone_stages`, its stable-code uniqueness constraint, update-order index and migration-ledger entry. Existing discussion, contribution, nickname, polling, voting, queue and activity rows are not rewritten or deleted. Fresh schema includes the same table.

Back up production and restore the export privately before applying migration 009. Compare every existing column value, check restored SQLite integrity and foreign keys, and confirm the remote ledger before retrying. Never reset D1. Application rollback can leave this additive table intact; retain the round-aware voting API introduced by the previous release.

## Verification and release

Feature tests cover titleless creation, saved-stage reuse, discussion isolation, saved prompt editing, announcement projection, timed and untimed reflection restoration, clearing, stale moderator conflicts, public response privacy, voting attachment, live/hidden/final results, projector refresh/reconnection, stale responses, fullscreen and input-safe shortcuts.

Layout/accessibility checks cover 320px mobile and 1280×720, 1366×768, 1920×1080, 2560×1440 and 3840×2160 projectors with maximum-length announcement text. Existing discussion controls and workflows are also regression-tested. Synthetic screenshots and sanitized verification are stored in `artifacts/standalone-stage/`; raw database exports and production browser logs stay outside the repository.

Lint, all 47 unit tests and migration tests 004–009 passed. The selected regression suite passed 74 E2E cases across 13 specs, followed by eight focused standalone checks against the final build. Both runs had zero skipped or flaky cases. Visual comparisons of the existing application passed without updating baselines; new mobile/projector screenshots were also inspected. `cf-build` and `cf-bundle` passed, including the compiled standalone proxy/projector and private build-artifact guards. Public-asset scanning found no private configuration values in 78 files.

The fresh production export restored with SQLite integrity `ok` and zero foreign-key violations. Rehearsing migration 009 preserved every existing column value across 23 existing data tables. It found five closed discussions, 24 contributions, no voting events/votes and 101 activity records. Raw evidence remains owner-only outside the repository; sanitized results are in `artifacts/standalone-stage/`.

## Production release — 2026-11-08

Deployed runtime commit: `9412f111ab7d8deb6e5a24f99f5865c0bdf2206b`.

- Production: https://spill-it-4rw.pages.dev
- Pages deployment: `7f7577db-37e6-408d-901e-73979abbfbfe`.
- API deployment: `42007957-1b2b-43a8-be17-98a0e5511983`, version `c9de97ba-b77d-449c-98a1-237827c64e29`.
- Ready blank projector: https://spill-it-4rw.pages.dev/stage/FATNP2XC

An immediate predeployment backup completed at 18:39 UTC and matched the restored rehearsal byte-for-byte: SHA-256 `8fa9746ca4e3453e38c55d1eacd8f4e61a01f193b89c4b4fbdbccb125e04cf30`, 81,720 bytes. Private file: `~/Library/Application Support/SPILL/backups/standalone-stage-20261108T181941Z/immediate-predeploy.sql`. Initial export attempts returned HTTP 429; a later retry after backoff succeeded. No safeguard was skipped.

Migration 009 applied successfully and appears in the remote ledger. The post-migration export matched every existing column value across all 23 pre-existing data tables. Restored integrity was `ok`, with zero foreign-key violations.

Production verification created one blank, reusable standalone stage with no title. It confirmed saved-state refresh, public response privacy, the dedicated branded projector, fullscreen, reduced motion, projector refresh and standalone activity identification. Discussion Stage and original session-based announcement/prompt/reflection/atmosphere controls remained available, and their presentation snapshot was identical before and after verification. Six deployed static assets returned 200, private build paths returned 404, and the browser recorded zero page errors or unexpected write attempts.

The final data comparison preserved all pre-existing values, including the original 101 activity entries. Final counts: **five closed discussions, 24 contributions, zero voting events/votes, one standalone stage and 102 activity entries**. The single additional activity entry records creation of the blank stage; no existing event, vote or contribution was modified or deleted.

Additional disposable checks after release verified an actual two-request moderator race: one change succeeded, one conflicted, the winning content persisted and exactly one audit entry was appended. The final five-case lifecycle rerun also passed atmosphere switching, countdown display, saved-prompt editing and restoration. Production verification used only blank-stage creation; projection writes and voting lifecycle checks used isolated data.

Machine-readable release evidence: [production-release.json](../artifacts/standalone-stage/production-release.json). Eight preserved source fingerprints establish that existing shared controls, the original session route, Discussion Stage component, Room View and voting modules remain byte-identical. The existing Stage page gains only mode selection and its independent standalone branch.
