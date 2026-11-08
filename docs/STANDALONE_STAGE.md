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

Production commit and deployment verification are recorded after release below.
