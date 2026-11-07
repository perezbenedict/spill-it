# Verified premium stage release — 2026-11-07

Implementation `24a83c5`; verification and accessibility fixes `ffd43ba`.

## Executed verification

92 browser tests passed across the selected corrected runs (11 specs), zero
skipped/unexpected/flaky results in those runs; 42 unit tests passed. Lint,
dependency audit (zero vulnerabilities), migration rehearsal, `cf-build`,
`cf-bundle`, and Cloudflare artifact preview passed. Final preview checked five
routes and eight static assets. The initial accessibility and animation fixture
failures were corrected and rerun; they are not counted as passes.

The new projector matrix covers short, medium and 1,000-character contributions at
1280×720, 1366×768, 1920×1080, 2560×1440 and 3840×2160 in both motion modes.
It captures entrance/settled screenshots, checks overflow, presenter clearance,
single-contribution visibility, latest-pointer state and no replay on polling.
All 30 combinations passed. Existing 47 visual baselines also passed on the final
build. Reduced-motion tests confirm stable geometry and disabled ambient motion.

Two-second headless Chromium RAF measurements at 1920×1080:

| Motion | Frame samples | p50 / p95 interval | Gaps over 50 ms | Long tasks |
| --- | --- | --- | --- | --- |
| Normal | 63 | 33.3 / 33.4 ms | 0 | 0 |
| Reduced | 121 | 16.7 / 16.8 ms | 0 | 0 |

These measure browser scheduling on this Mac, approximately 31 and 60 samples
per second respectively. They do not establish physical projector/GPU frame rate
or sustained device performance. No claim of universal 60 fps is made.

Axe WCAG A/AA checks on home, join, login, moderation, QR and room passed in both
motion modes (12 cases): zero reported violations after fixes. Fixed the
moderation connection badge's 1.41:1 contrast and invalid logo labeling roles.
Gradient-backed text still produces incomplete contrast results requiring human
review; automated results are not a complete accessibility certification.
Keyboard Tab reached exposed controls on all six surfaces.

A final disposable browser workflow applied Electric Aura, created and activated
a chapter, saved and projected a spotlight prompt, cleared it, and started an
eight-second reflection. Room View displayed each selected state, the countdown
expired, and the original contribution returned. This verifies actual control
actions without altering production settings.

Evidence: `artifacts/final-stage-release/verification.json`. Detailed local traces
and screenshots remain in the isolated run directories named there; raw logs and
credentials are not published.

## Production activity assessment

The live flag was not treated as proof of an event. Initial reads at 22:22 UTC
found the last submission at 15:39:49, moderation at 22:19:18 and projection at
22:19:22. Repeated snapshots through the final preflight showed no changes to
counts, session timestamps, moderation, pointers or revisions. A bounded Worker
tail at 22:30:45–22:31:42 observed our known health probe and no other requests,
confirming that the observation was connected. This is a bounded quiet-window
assessment, not proof that no audience exists.

The release was judged suitable for that quiet window because old clients and
tokens remain compatible, no presentation pointers or session states are reset,
and no planned application downtime is required. D1 schema application can
briefly queue operations. No session was closed, paused or reopened for release.

## Backup, migration and rollback

Private owner-only backups outside the repository:
`~/Library/Application Support/SPILL/backups/final-stage-release/predeploy.sql`
and `immediate-predeploy.sql`. Both SHA-256:
`1ffd8f9f8140385334219792ff2f386d491b5cf4595cbf2a41beb910008ce0ac`.

Restoration and migration retained three sessions, 18 contributions and all
presentation references/revisions, with SQLite integrity `ok` and no foreign-key
violations. Previous API source `199684a` was executed against that restored
post-migration SQLite schema: health, session, room and engagement reads returned
200, and pointers remained unchanged. This exercises previous application code
with a local SQLite D1 adapter, not a remote rollback deployment.

`005_stage.sql` adds `platform_state.stage_config` default `{}` and a ledger entry.
Remote column/ledger preflight confirmed it was pending. Migration applied once;
remote counts, references and foreign-key checks passed. Remote D1 does not allow
the full SQLite integrity pragma; restored-database integrity and remote foreign
keys/count/reference checks are reported separately.

Rollback Pages first, then API; leave the additive column intact. Previous stable
API version: `3d5863f1-0e26-4431-a581-c59a99524736`. Previous fully integrated Pages
release: `799dd2ea-05e6-4dcb-8689-46aa84fe3429`. Git-linked Pages had independently
published `24a83c5` as `ae6dea5e-5314-4078-a07b-1a5ba164504d` before this assignment,
while API/schema still lacked stage support; this release completes that pairing.

## Deployment

API version: `6d62287a-5a31-4093-807e-772c48ae1cac`.
API deployment: `4414838f-d9a1-4555-8a55-b86dad613615`.
Pages production deployment: `a85f121e-468b-44c5-ab24-5cfed04da10f`, source
`ffd43ba`, project `spill-it`, URL `https://spill-it-4rw.pages.dev`.

Actual production Chromium checks passed at 390×844: home, login, participant
entry through the topic introduction to nickname selection, QR and Room View
returned 200, with no horizontal overflow or browser runtime errors. Seven
referenced static assets returned 200. Authenticated admin reads returned 200,
exposed all four stage-control sections, and returned persisted default stage
settings; unauthorized access returned 401. All three existing sessions remained
readable. Settings-changing workflows run on disposable data, not production.

Final remote checks retained **three sessions, one live session and 18
contributions**. Every presentation pointer, revision and timestamp matched the
predeployment snapshot; no foreign-key violations were found. The live session
was never modified for release. No production credentials were changed and the
existing admin token remained valid.

Evidence: `artifacts/final-stage-release/{deployment,production}.json`.

Production verification is nondestructive: settings, chapter/prompt libraries and
reflection state are read and compared; create/edit/project/countdown actions
are exercised only against disposable local sessions. No production event data,
credentials or presentation selections are changed to demonstrate features.
