# Standalone stage polish and usability

This release adds stage management, improves the standalone projector, and makes shared stage actions give explicit server-confirmed feedback. Discussion Mode, the original session-based controls, voting records and presentation backends remain in place.

## Administrator workflow

In **Admin → Stage → Standalone Stage**, each saved stage has a Delete action for full administrators. The dialog identifies its title and projector code, explains what will be removed, warns about open projectors, and requires the current admin password. A stage with current presentation content receives an additional interruption warning. A current overlay is not proof that a projector is connected.

Deletion checks the captured revision again on the server. Concurrent deletion or modification cannot silently delete a newer stage. The guarded deletion and its protected `standalone_delete` audit entry are one D1 transaction. Only that stage record is removed; announcements and prompts embedded in its configuration go with it. Discussions, voting events, votes, contributions and other stages are untouched. The selected stage redirects back to the standalone list. An open or refreshed deleted projector shows **Stage unavailable**. Permanent deletion was chosen; optional archive/restore was not introduced.

Saved stages are loaded in pages of at most 50, with a Load more action for older stages. Cursor ordering includes timestamp and identifier, and deleted rows cannot reappear from a late list response.

## Shared action feedback

Atmosphere, chapter, prompt, announcement and reflection controls share one accessible feedback component. Success is announced only after the server confirms the mutation, disappears after five seconds, and is not repeated by background synchronization. Errors remain available with a Dismiss action. Pending controls prevent duplicate requests. Conflict messages ask the moderator to review current state while preserving drafts.

Atmosphere controls show the active saved preset separately from the preview. Chapter controls explain their purpose, mark the active chapter, and name it in activation feedback. Creation, removal and disabling also receive confirmation. Only the selected chapter is public. Standalone chapter labels remain subordinate to content and are suppressed during announcements and voting.

A previously fetched timed overlay that expires before a metadata edit is resolved against the current presentation before validation. This avoids rejecting an unrelated atmosphere or chapter change while still rejecting newly supplied expired timers.

## Standalone projector

The existing purple stage now uses editorial framing, restrained moving edge light, oversized slow-rotating Emblem, orbital contours, refined typography and a balanced header/content/footer composition. Idle and explicitly cleared stages have distinct copy and lighting. Prompt, reflection, announcement and voting layouts retain their existing presentation components and authoritative state.

Message transitions remain keyed to content rather than polling. Chapter transitions operate independently. Text settles and stays stationary; ambient layers carry ongoing motion. Reduced-motion disables decorative rotation and movement. Low-cost ambient quality reduces secondary effects while retaining slow branded rotation. In quiet mode, the animated watermark is capped at 1040 CSS pixels to limit 4K compositing cost; reduced-motion retains the full static treatment. Long announcements scroll within the presentation region so the header, footer and controls stay separate and all content remains reachable.

## Data and release safety

No schema migration is required. Existing stage configuration JSON remains compatible; an optional `presentationCleared` flag is written only by explicit future stage actions. Production records are not rewritten during deployment.

A full production D1 export is kept outside the repository with restricted permissions. It is restored into a private local SQLite database, checked with `integrity_check` and `foreign_key_check`, and compared before and after deployment. Backups contain private event data and credentials and must never be placed in public assets or committed.

Before release, compare actual event mutations and data snapshots rather than interpreting ordinary projector polling as event activity. Preserve production if genuine activity resumes or a critical check fails. Production verification is read-only; deletion is exercised only on disposable isolated data. The live confirmation is opened and cancelled without entering a password.

Application rollback targets the prior Pages deployment `7f7577db-37e6-408d-901e-73979abbfbfe` and API version `c9de97ba-b77d-449c-98a1-237827c64e29`. Code rollback does not restore deleted data. An intentional later deletion would require reviewed recovery from the private backup, never a database reset or whole-database overwrite.

## Verification evidence

See [release evidence](../artifacts/stage-polish/release.json), [regression summary](../artifacts/stage-polish/regression-summary.json), and [synthetic screenshots](../artifacts/stage-polish/screens).

Automated checks cover isolated deletion authorization, password verification, confirmation, stale revision, simultaneous deletion, protected audit, unrelated-data preservation, active chapter privacy, both control workflows, failed and successful feedback, expired overlays, projector refresh, reduced motion, polling stability and responsive layouts. Headless frame scheduling is a local measurement, not a physical projector or GPU certification. Browser accessibility automation does not establish complete WCAG compliance. Physical projector review and manual assistive-technology assessment remain useful operational checks.

## Completed release — 9 November 2026

- Runtime commit: `135b1dbb4af264d87a2aef2e4192b9b4eddb709f`.
- Production Pages deployment: `f6068db0-208b-42ed-ae34-d494e75abddf`.
- API version: `aff909eb-db66-4bc6-8063-7daed12ee63f`, serving 100%.
- Production: https://spill-it-4rw.pages.dev.
- Lint, 49 unit tests, Cloudflare build and bundle passed. All 91 unique end-to-end cases have passing results across 17 regression specs and the final rebuilt-projector rerun. No tests were skipped or classified flaky.
- The first 4K motion gate failed at approximately 66.7 ms p95. A compositing hint alone did not resolve it. Bounding the animated watermark in quiet mode corrected the cost without stopping rotation. The final normal-motion profile recorded 119 frames in 2000 ms, 16.8 ms p95, no long tasks and zero text movement; reduced motion recorded 121 frames in 2016.6 ms, 16.8 ms p95 and zero movement. These are headless Chromium scheduling measurements.
- Mobile, 720p, 1080p, 1440p and 4K layouts passed, including maximum-length announcements with reachable scrolling. Ten tested idle/prompt/reflection/announcement/cleared views had zero automated Axe violations. Twenty-eight synthetic screenshots are retained.
- Fresh backup restored successfully: integrity OK, zero foreign-key violations. No migration was necessary. All 25 existing tables and every previous row/column value are unchanged; post-release SQL export is byte-identical to the pre-deploy backup.
- Production retains five discussions, 24 contributions, three standalone stages and 122 activity entries. It had zero dedicated voting events and votes before and after release. No existing stage was deleted or reconfigured.
- Read-only live checks passed for authorization, new controls, active atmosphere, chapter visibility, deletion confirmation/cancellation, projector framing, unavailable links, fullscreen, reduced motion, original session controls, static assets and private-build denial. Zero attempted writes and zero browser page errors.
