# Spill It 3.0 release

## Implemented experience

- Room View keeps its 54-second, low-opacity emblem, stationary editorial text, adaptive atmosphere quality and existing composition. Added seven coherent atmospheres, distinct announcement layouts, hidden ordinary topic headers for standalone content, and a Room-only pointer accent. The native pointer remains available; decoration is idle-hidden, touch/reduced-motion disabled, and locally optional.
- Dedicated `/vote/[code]` is independent of discussion nicknames and contributions. Admin Voting creates multi-question drafts, previews, edits, opens, closes, archives and password-verifies deletion. Each event has a direct link, QR and standalone projector; association to a discussion is optional.
- Live results use sequential two-second polling with authoritative D1 aggregates, revision-first freshness guards, reconnect/stale indicators and recovery. This is near-real-time polling, not push/SSE/WebSockets.
- Hidden results omit counts, percentages and vote-dependent versions from public responses. Authenticated previews remain private. Final reveal requires closed voting and explicit publication. Refresh starts settled; normal polling retains chart nodes and does not replay reveals.
- Cinematic Bars, Minimal Percentage Rows, Donut and Comparison share animated numbers and value transitions. Donut falls back to bars above six choices; Comparison above three. Largest-remainder rounding deterministically totals 100%; leadership uses exact vote counts, including ties. Zero votes have a dedicated state.
- Announcements support heading, message, subtitle, statement/notice/quote styles, private saved drafts, edit conflict protection, preview, timed or manual projection and immediate return. Server-controlled one-level restoration preserves the preceding different presentation mode, including voting. Same-mode edits preserve that return target; explicit contribution/poll/queue projections clear overrides. Existing moderation decisions, queues and vote records remain untouched.
- Royal Amethyst, Celestial Night, Velvet Glow and Aurora Violet join Midnight Violet, Electric Aura and Soft Reflection. They vary lighting geometry, contours, color and motion; settings persist per discussion or voting event. QR presentation inherits the discussion atmosphere.
- Existing sessions, anonymous contributions, nickname reservations, discussion polls, reactions, analytics/export, admin navigation and destructive password checks are retained. Stage summaries and links give moderators quick access to current mode and Voting controls.

## Security and data

- `006_voting.sql` adds events, questions, choices and votes with indexes and scoped foreign keys. Database triggers reject invalid/closed ballots and increment result versions. Unique question/token keys and conditional inserts make retries idempotent and concurrent close/vote behavior deterministic.
- Configuration mutations use server-side compare-and-swap revisions. Vote aggregation and version reads share a D1 batch snapshot. Closed events cannot reopen or accept new votes.
- Public voting uses event-scoped, HttpOnly browser identities supplied by the server proxy; client-supplied identity is discarded. Shared D1 admission caps new voting attempts at 10 per identity/event/minute and 2,400 per event/minute. No fingerprinting or personal details are collected. A browser identity cannot enforce one physical person across browsers/devices.
- Admin endpoints require the existing authenticated role; mutations check origin, bounds, enum values and scope. Queries bind values. Passwords and tokens are absent from activity entries.
- Pages packaging now removes OpenNext intermediate server/environment modules and duplicate build output. Only the self-contained reserved `_worker.js` and public assets remain. A public-asset value scan found zero secret leaks. An explicit Worker guard denies intermediate and reserved Worker paths before asset lookup, with all routes assigned to the Worker. Both local preview and production must return 404. A production check exposed older support assets still reachable after directory cleanup; the guard was added before final release verification. No credential values were present in those responses.

## Verification

- Lint, 47 unit tests across nine files, migration checks, `cf-build`, `cf-bundle`, artifact route/asset checks and compiled voting proxy/cookie/retry checks pass.
- 139 browser checks across 17 specs pass across the retained regression run and focused final reruns, including 24 stage checks in Chromium, Firefox and WebKit. 52 screenshot baselines include all four result styles and mobile voting.
- Existing projection frame tests cover short, medium and maximum content at 1280×720, 1366×768, 1920×1080, 2560×1440 and 3840×2160 with both motion preferences. New announcement frames and long voting labels cover these sizes; voting also covers 320px mobile. Long content remains available through the reserved scrollable presentation region.
- Axe WCAG A/AA checks pass on existing public surfaces, voting controls, moderator voting, all chart styles and announcement projection. Cursor focus/native-pointer, idle hiding, touch input and fullscreen checks pass in all three tested engines.
- Functional coverage includes hidden API privacy, private preview, vote isolation, same-choice retries, rejected changed answers, close/frozen totals, CAS conflicts, voting UI lifecycle, cookie identity forgery, stale responses, disconnection/reconnection, live style switching, stable chart nodes, one-time reveal and archive removing stale totals.
- Material fixes found during verification: UUID proxy validation, retained action errors, draft conflict reload, unavailable-event cache removal, long-question chart spacing, donut center typography, announcement serif overhang and restoration over voting.

### Isolated voting measurements

| Concurrent voters | Success/errors | Request p50 / p95 | Projector observed from first vote | After last acknowledgement |
|---|---|---|---|---|
| 10 | 10 / 0 | 44.4 / 56.8 ms | 2378.6 ms | 2320.9 ms |
| 25 | 25 / 0 | 74.0 / 108.8 ms | 2436.5 ms | 2326.2 ms |
| 50 | 50 / 0 | 215.4 / 218.0 ms | 2030.5 ms | 1808.8 ms |
| 100 | 100 / 0 | 395.4 / 403.7 ms | 2212.4 ms | 1805.5 ms |

All totals matched accepted votes; retry inflation was zero. These are loopback Next proxy + disposable Worker/local D1 measurements, not a distributed production capacity claim. Existing contribution loads also passed 10/25/50/100 with exact database deltas and continued moderation/projection.

### Animation performance

| 4K settled style | Normal average FPS / RAF p95 | Reduced average FPS / RAF p95 |
|---|---|---|
| bars | 27.8 / 50.0 ms | 60.0 / 16.8 ms |
| rows | 33.7 / 33.4 ms | 60.0 / 16.8 ms |
| donut | 31.2 / 33.4 ms | 60.0 / 16.8 ms |
| comparison | 31.5 / 33.4 ms | 60.0 / 16.8 ms |

All measured labels remained stationary and no long tasks were observed. Adaptive quiet mode was selected on the headless 4K renderer. An earlier initial sample included adaptive assessment/raster warm-up and reached 116.7ms p95; settled profiles explicitly wait for assessment plus 30 warm-up frames. This measures browser scheduling, not GPU power, thermal behavior, physical projector quality or a guaranteed 60fps experience. Physical event equipment should still be checked.

## Backup, migration and rollback

The fresh owner-only SQL export is outside the repository in `~/Library/Application Support/SPILL/backups/spill3-release-20261108T143357Z/production.sql` (64,224 bytes). SHA-256: `6b9aa59bad52a563a10a321263b8ae72bc4488c285059f182536d087f15a4c25`.

The export was restored to SQLite, integrity/foreign-key checked, and migration 006 applied twice. Every prior row and presentation reference was preserved. Production migration subsequently passed full before/after export row comparison: five sessions, one live session, 23 contributions, 30 nickname reservations, one discussion poll and seven existing poll votes.

The previous committed API was run in an isolated Worker against the migrated backup: login, authenticated session reads, and ten room/engagement reads passed. Rollback leaves additive voting tables in place; never run a destructive down migration or restore the entire database merely to roll back application code. The previous API version is `6d62287a-5a31-4093-807e-772c48ae1cac`; the previous confirmed Pages deployment is `a9e9e3a4-cfb9-4df1-9f17-9c0adac88b50`.

Emergency recovery: preserve a new export first; roll back Pages through its existing deployment history and API with `npx wrangler rollback 6d62287a-5a31-4093-807e-772c48ae1cac --config api/wrangler.toml`. Validate counts, foreign keys, stored stage configuration and presentation pointers. Use the protected SQL backup or D1 Time Travel only for confirmed data corruption, with a separate recovery decision; application rollback does not require database restoration.

## Screenshots and evidence

- [Room View](../tests/e2e/platform.spec.js-snapshots/room-projector-reduce-chromium-darwin.png)
- [Announcement](../artifacts/spill3/screens/announcement.png)
- [Mobile voting](../tests/e2e/voting-visual.spec.js-snapshots/voting-mobile-chromium-darwin.png)
- [Cinematic Bars](../tests/e2e/voting-visual.spec.js-snapshots/voting-bars-chromium-darwin.png)
- [Minimal Rows](../tests/e2e/voting-visual.spec.js-snapshots/voting-rows-chromium-darwin.png)
- [Donut](../tests/e2e/voting-visual.spec.js-snapshots/voting-donut-chromium-darwin.png)
- [Comparison](../tests/e2e/voting-visual.spec.js-snapshots/voting-comparison-chromium-darwin.png)
- [Sanitized automated measurements](../artifacts/spill3/verification.json)
- [Production migration verification](../artifacts/spill3/migration.json)
- [Files changed](../artifacts/spill3/files-changed.txt)

## Release record

Production deployment and final verification are recorded in [the production release record](SPILL_3_PRODUCTION.md). No real production ballots or contributions are created for testing. New write journeys are exercised only in disposable environments.
