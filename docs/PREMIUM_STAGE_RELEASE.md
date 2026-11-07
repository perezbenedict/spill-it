# Premium stage evolution

Released on 2026-11-07 after verification and a quiet-window assessment. The
historical deferral below is superseded by `FINAL_STAGE_RELEASE.md`, which records
the completed migration, deployments, test measurements and production checks.

Implementation preserves the existing purple identity, navigation and contribution, moderation, queue, poll and deletion flows.

## Changes

- Faster coordinated homepage entrance, three distinct editorial lines and restrained CTA material.
- Refined shared cards, selected category lighting, violet success seal and in-memory composer draft preservation during back navigation.
- Room composition with midnight foundation, edge lighting, subtle contours and stationary editorial contribution typography. Transition timing: exit 200 ms, atmospheric anticipation 250 ms, reveal 500 ms, settle 200 ms. Pointer-version cancellation and reduced motion remain in place.
- Three session atmospheres: Midnight Violet, Electric Aura and Soft Reflection. Admin visual preview; synchronized Room and QR appearance.
- Optional chapter library and active chapter; saved editable spotlight prompts; reflection message with optional countdown. Dismissal/expiry restores the underlying presentation. These operations do not change contribution/poll pointers or submission availability.
- Advanced controls sit in an expandable Stage direction panel in existing moderation controls. Existing revision checks protect concurrent moderator changes. Public responses exclude saved prompts and inactive chapters.

## Data and release safety

Migration `005_stage.sql` adds only `platform_state.stage_config` plus a migration ledger record. Fresh schema includes the same column. No existing event table is reset. Roll back application deployments while retaining the additive column.

A fresh private production backup was exported outside the repository to `~/Library/Application Support/SPILL/backups/stage-upgrade/predeploy.sql`. Restoration plus migration preserved 18 contributions and passed SQLite integrity and foreign-key checks.

**Production deployment is deferred:** remote preflight found one live session, three total sessions and 18 contributions. No remote migration or deployment was performed for this upgrade, preserving the active event. Existing deployment remains in service. Recheck event state and take a fresh backup before release.

## Verification

Lint, 42 unit tests, migration rehearsal, `npm run cf-build`, `npm run cf-bundle` passed. Cloudflare preview returned 200 for home/login/join/QR/room and eight static assets.

First browser run passed 46/47 tests; the new reflection assertion matched both its label and heading. Selector corrected to the overlay heading; platform rerun recorded separately. Existing bulk deletion, recovery, fullscreen, nickname, public journey, QR layouts and distributed admission tests passed. Visual baselines updated for intended visual changes. Maximum-length projector snapshots cover 1280×720, 1366×768, 1920×1080, 2560×1440, 3840×2160 plus mobile/tablet.

## Limits

Final platform rerun passed all 20 tests with zero skipped/unexpected/flaky
results, including 47 unchanged-baseline comparisons (40 page surfaces and seven
maximum-length projection sizes). Together with the other seven passing specs,
all 47 browser tests passed across the corrected runs. Reports:
`artifacts/isolated-2026-11-07T21-31-34-566Z-058d524b/` and
`artifacts/isolated-2026-11-07T21-35-05-208Z-aaf08f54/`.

Public synchronization remains polling based, so clear/appearance operations appear after the next successful refresh. Countdown clocks use browser time. No new dependency was added. Draft preservation is in memory across steps, not across browser refresh. Full short/medium/maximum-content animation-phase matrices, automated contrast audits and device frame-rate profiling have not been completed; do not infer those from settled visual screenshots. No production write journey or load test was performed.
