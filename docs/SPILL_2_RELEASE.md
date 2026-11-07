# Spill It 2.0 release record

This record supplements the original audit in `SPILL_2_UPGRADE.md`. Production
release status is recorded below only after verification.

**Release status: deployed and production smoke-checked, 2026-11-07.** Final
browser, visual, load, migration-rehearsal and Cloudflare artifact checks passed.
The additive migration, Worker and Pages release are live; event data was retained.

## Integrated upgrade

- Existing purple branding, font pairing, navigation, contribution journey,
  nickname reservations, submission retry IDs, moderation and secure bulk
  deletion remain the foundation. Shared controls, responsive room layout and
  modal focus improvements from `274736c` are retained.
- Optional discussion templates apply welcome copy, categories, length settings
  and prompts without changing session identity, schedule, title or status.
- Motion preferences disable pointer drift and ambient animation; save-data
  preference also selects quiet backgrounds. Long topic/headline wrapping and
  connection-indicator contrast are improved.
- Persisted per-session projection queue supports approved-only enqueue,
  remove, reorder, preview, explicit advance and confirmed clear. Approval and
  enqueue never project automatically. Existing manual projection remains.
- Admin event control centre includes queue, polls, reaction enablement, activity,
  session recap, category/time aggregates and private approved-only CSV. Global
  Activity navigation retains access to deletion history after a session is gone.
- Optional single-choice polls start in draft, support open/close, live result
  projection and password-confirmed deletion. Voting uses the session cookie's
  pseudonym and a database unique key; this cannot establish one physical person
  per vote. Reaction controls default off and use bounded atomic admission.
- Projected poll results occupy their own readable region. Aggregate reactions
  never float over contribution text. Existing pointer-change reveal versioning
  prevents polling from replaying contribution entrances.
- Presenter shortcuts: N advances the curated queue; H clears the screen; C
  toggles controls; F toggles fullscreen. Existing arrows navigate approved
  contributions. Inputs, modal interactions, modifiers and repeat events are
  excluded. Server revisions protect overlapping moderator commands.

## Security and data safeguards

Settings, moderation and presentation writes require revisions; conflicts return
409 with recovery feedback. D1 transactions, eligibility triggers and shared
queue/pointer revisions prevent stale commands silently overwriting each other.
SQL predicates maintain session isolation. Votes enforce open poll/session and
option ownership at insertion. Reactions enforce session state and cooldown at
insertion. API proxy actions are allowlisted and browser participant IDs are
ignored in favor of server cookie identities. Same-origin checks use the external
Host authority because Next may normalize its internal request URL.

D1-backed authentication admission works across Worker instances. Environment
password changes invalidate old tokens immediately through credential versions;
the old database hash is not an alternate password when the secret exists.
Activity never includes passwords, tokens, IPs or contribution bodies. Shared
account operations are not falsely attributed to individual moderators.

Admin response serialization omits participant/request IDs. CSV includes approved
content only and neutralizes formula prefixes, including whitespace prefixes.
Room polling returns current contribution data instead of the full archive.
Legacy nickname normalization backfills once and preserves historical claims.
Atomic submission admission preserves session-open/rate checks and retry safety.

## Migration and backup

`api/migrations/004_platform.sql` adds revisions, credential versions, platform
state, queue, polls/options/votes, reaction events, activity, authentication
admission and nickname backfill/claim tables. No event tables are reset.
`api/schema.sql` is the equivalent fresh-install schema; do not replay older
ALTER migrations on it. Application rollback leaves additive records intact.

Remote backup was restored for rehearsal and copied outside the repository to
`~/Library/Application Support/SPILL/backups/2026-11-06/spill.sql` with owner-only
permissions.
SHA-256: `e9babbc651e4296bb32b913fcf2fed99112359b4adb381bb4415cf369c05005f`.
Restoration plus the finalized additive migration retained **3 sessions and 16
contributions**, passed foreign-key checks and returned `ok` from integrity_check.
The backed-up sessions were closed/paused; none was live. See
`RELEASE_RECOVERY.md` for release and recovery procedures. Backups contain private
event data and must not be committed or published.

## Measured local load

Reports: `artifacts/isolated-2026-11-07T08-11-32-660Z-85dbd7be/`. Tests used disposable local
D1 data, generated credentials, simultaneous submissions, three room reads per
participant, a concurrent moderation write and explicit queue advance.

| Concurrent participants | Submission success | Submission p50 / p95 / p99 ms | Room p95 ms | Moderation ms | API projection observed ms | Browser projection observed ms |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 79.6 / 82.5 / 82.5 | 62.6 | 53.5 | 222.1 | 3524.8 |
| 25 | 25/25 | 246.8 / 249.5 / 250.4 | 244.0 | 145.6 | 426.4 | 3550.3 |
| 50 | 50/50 | 407.5 / 506.5 / 506.8 | 413.1 | 231.4 | 703.0 | 3543.3 |
| 100 | 100/100 | 1034.6 / 1052.3 / 1053.0 | 1032.5 | 354.4 | 1400.3 | 3532.7 |

All row deltas matched, every duplicate retry probe created exactly one row,
polling returned no errors and every observed projection pointer was correct.
These are local bursts under concurrent development/test activity, not sustained
distributed Cloudflare capacity certification. The observed 100-client latency
is material: plan event rehearsal and allow synchronization feedback rather than
promising instant projection under saturation.

Projection timing starts before the moderation operation and explicit advance.
The API column ends at a direct room read; the browser column observes the real
projector DOM with reduced motion. Browser results reflect the existing 3.5-second
poll interval, not instant push updates. Normal-motion pointer transitions also
passed the separate browser regression test.

## Verified release candidate — 2026-11-07

`SPILL_TEST_PRODUCTION=1 npm run test:isolated -- --pages-preview` passed end to
end: **46 browser tests, zero skipped/unexpected/flaky tests**, 43 screenshot
baselines, five Cloudflare preview routes returning 200 and eight JS/CSS assets
with valid responses. All four measured load levels passed row-count,
idempotency, moderation and actual browser projection checks.

`npm test`: **40 passed**. Lint, migration rehearsal, dependency audit (zero
vulnerabilities), `cf-build` and `cf-bundle` passed. The emitted Worker is nonempty,
static assets exist, the asset-routing flag is true and required built-in imports
are prefixed with `node:`.

A fresh private predeployment backup is at
`~/Library/Application Support/SPILL/backups/2026-11-07/spill-final-predeploy.sql`, with
the same SHA-256 recorded above. Its restoration plus the final migration,
including the `spill_schema_migrations` ledger, preserved three sessions and 16
contributions and passed integrity/foreign-key checks. Remote preflight found no
live session. Production migration/deployment results are recorded below.

Final fixes include reduced-motion hydration visibility on home/join, a dialog
autofocus race during confirmation entry, form-baseline revisions surviving
status refreshes, and measured presenter-control clearance. The obsolete
isolate-local authentication counters were removed; shared D1 admission is the
authoritative throttle.

The final run also verifies atomic reorder of a 100-item queue and concurrent
per-browser submission admission. The mobile reduced-motion join baseline now
records loaded content rather than the obsolete loading screen; screenshot
readiness requires the topic, entry control and completed content entrances.

## Verification status

The isolated runner generates its own secrets and fixtures, seeds fresh D1,
rejects missing-fixture skips, reseeds each spec, retains JSON reports and never
targets production for mutations or load. Visual snapshots cover home, join,
moderation, QR and room at four sizes and both motion preferences. Existing tests
also cover 320px layouts, long content, refresh/offline recovery, fullscreen QR,
nickname races, duplicate retries, lifecycle and bulk deletion. Added tests cover
queue conflicts, vote isolation, reactions, browser voting, cookie spoofing,
moderation revisions, authorization, password rotation and safe shortcuts.

Early runs found and corrected a proxy origin mismatch. A development hot-reload
manifest failure required a clean rerun; it is not counted as a pass.

The isolated runner now builds and serves production mode by default. To reuse a
release build after `cf-build`, run
`SPILL_TEST_PRODUCTION=1 npm run test:isolated -- --e2e-only`. Development mode is
explicitly opt-in with `SPILL_TEST_DEV=1`. `npm run test:load` starts only the local
Worker. Reports are ignored by Git; selected non-sensitive JSON measurements can
be retained explicitly. Test service logs redact generated credentials and owned
process groups are stopped even when interrupted.

Release dependency checks upgrade Zod and test tooling and pin patched transitive
PostCSS/glob/minimatch versions. The latest recorded dependency audit reports zero
vulnerabilities. Unit coverage includes the origin proxy fix and password-change
token invalidation. Presenter content now reserves the measured controls height,
including wrapped toolbars, rather than letting fixed controls cover long text.

## Operator quick start

Open a discussion's **Live moderation** page. Its event control centre keeps
**Projection queue**, **Polls & reactions**, **Insights** and **Activity** in
separate sections, without replacing the moderation feed or admin navigation.

- **Queue:** approve a contribution first. Under **Add approved contributions from
  this page**, choose **Add to queue**. Use the up/down controls to change order;
  the first item is the next-contribution preview. **Project next** is the explicit
  screen action. **Remove** changes membership only. **Clear queue** asks for
  confirmation and leaves contributions and the current screen intact. Queue
  order persists across refreshes and synchronizes between moderators. If a
  conflict appears, review the refreshed state before retrying.
- **Polls:** choose **Polls & reactions**, enter a question and distinct choices,
  and select **Create poll**. A new poll is a draft; **Open voting** admits votes,
  **Close voting** stops admission, **Project results** shows its result panel,
  and **Hide results** removes that panel. **Delete poll** requires the admin
  password and permanently removes its votes. Participants see an optional poll
  alongside their existing contribution journey. A browser can cast one stored
  vote per poll; a different browser/cookie identity may vote again.
- **Reactions:** enable them explicitly in **Polls & reactions**. Agreement,
  insight and appreciation are rate-limited and aggregated. **Disable reactions**
  stops admission immediately; projector/audience displays observe the change on
  their next successful synchronization. Reactions start disabled for each
  discussion and never create participant rankings.
- **Templates:** in discussion creation/editing, select **Open floor**,
  **Audience Q&A** or **Guided reflection**. Review the applied welcome copy,
  categories, prompts and contribution settings, then save normally. Applying a
  template does not publish a discussion or alter its title, topic, schedule or
  join code.
- **Insights and exports:** open **Insights** or **Insights & export** for private
  totals, moderation outcomes, categories, hourly activity, discussed/projected
  counts and poll result panels. **Export approved contributions CSV** excludes
  pending/rejected content and participant identifiers. Keep downloaded event
  files private. Projection totals start with upgrade activity; past projections
  cannot be reconstructed. Browser aggregates are not physical-person counts.
- **Activity:** the discussion section lists its recent operations; the main
  **Activity** navigation includes operations for deleted discussions. These are
  shared-account records, not individual moderator attribution.

Changing the encrypted admin-password secret changes the credential version.
Existing tokens from the previous version are rejected on their next authorized
request; moderators must sign in again with the current password. The first
deployment of the versioned-token schema also invalidates legacy tokens without
a credential version. Do this outside a live event and do not delete admin rows
or alter the API secret to rotate a password.

## Changed-file inventory

The foundation commit `274736c` remains the starting point. The continuing upgrade
is grouped below; commit `a0d775961a5c45511f07f6d0edfabba367c8d546` is the
authoritative full implementation diff (101 files, including 43 PNG baselines and
five sanitized measurement files). The following documentation-only release
record also retains production verification evidence.

| Area | Files |
| --- | --- |
| Worker and additive data model | `api/worker.js`, `api/platform.js`, `api/schema.sql`, `api/migrations/004_platform.sql` |
| Event UI | `components/platform/{AdminPlatform,ParticipantEngagement,PollResults,RoomEngagement,usePlatform}.js`, `components/moderation/SubmissionFeed.js`, `components/participant/JoinExperience.js`, `components/room/{RoomControls,RoomDisplay}.js` |
| Admin routes and navigation | `app/admin/(dashboard)/activity/page.js`, `app/admin/(dashboard)/sessions/[id]/{page.js,insights/page.js}`, `components/admin/AdminNav.js`, `components/admin/dashboard/RecentActivity.js`, `components/admin/sessions/SessionForm.js` |
| API bridge and concurrency clients | `app/api/platform/[...path]/route.js`, `app/api/presentation/route.js`, `lib/spill-api.js`, `lib/actions/{moderation,sessions}.js`, `lib/request-origin.js` |
| Design, motion and reusable configuration | `app/globals.css`, `components/HomePageContent.tsx`, `components/background/AnimatedBackground.tsx`, `components/motion/AnimatedSection.tsx`, `components/participant/TopicCard.js`, `components/ui/Dialog.js`, `lib/discussion-templates.js` |
| Test and release tooling | `scripts/{test-isolated,test-migrations,patch-assets}.mjs`, `playwright.config.js`, `tests/helpers/e2e-env.js`, `tests/e2e/{platform,zz-auth-throttle}.spec.js`, `tests/e2e/platform.spec.js-snapshots/`, `tests/unit/{dialog.test.jsx,discussion-templates.test.js,request-origin.test.js,worker-auth.test.js}` |
| Dependencies and documentation | `package.json`, `package-lock.json`, `.gitignore`, `eslint.config.mjs`, `api/DEPLOY.md`, `docs/{database,SPILL_2_UPGRADE,SPILL_2_RELEASE,RELEASE_RECOVERY}.md` |

## Production release verification

- Implementation commit: `a0d775961a5c45511f07f6d0edfabba367c8d546`, pushed to
  `main`; author `perezbenedict`. Reachable Git author/message checks found no
  Claude or Anthropic attribution.
- Additive migration `004_platform` applied remotely: 28 queries executed.
  Ledger confirmed; three sessions and 16 contributions retained, no live event,
  and remote `foreign_key_check` returned no violations. SQLite integrity checks
  passed on the backup rehearsal; remote D1 rejects `integrity_check`, so no
  remote integrity-check pass is claimed.
- Worker version: `3d5863f1-0e26-4431-a581-c59a99524736`; deployment:
  `ae9313fb-4b08-462f-9755-b6d2da55774c`.
- Pages production deployment: `799dd2ea-05e6-4dcb-8689-46aa84fe3429`, source
  `a0d7759`, URL `https://799dd2ea.spill-it-4rw.pages.dev`.
- Actual production domain `https://spill-it-4rw.pages.dev` checked in Chromium
  at 390×844: home, login, existing participant entry, QR and room returned 200,
  with no horizontal overflow or browser runtime errors. Six referenced JS/CSS
  assets returned 200. API health and public engagement returned 200.
- Paused-session vote validation returned 409 without creating a vote; a
  cross-origin request returned 403; unauthenticated platform access returned
  401 and protected navigation redirected to login. No production contribution,
  poll, destructive operation, password rotation or load test was performed.
- Authenticated production write journeys were not exercised because the live
  admin password was not available to this execution. Their equivalent isolated
  tests passed. No production secrets were replaced. Moderators must sign in
  again after this first credential-version deployment.

Evidence: `artifacts/production-2026-11-07/verification.json` and
`artifacts/production-2026-11-07/home-mobile.png`. Existing private event content
is excluded. Postdeployment row counts and foreign-key checks were repeated.

No known implementation blocker remains. Limits: anonymous browser voting cannot
guarantee one physical person per vote; local burst measurements do not certify
distributed capacity; projection synchronization uses the existing 3.5-second
poll interval; retention cleanup is operator-driven; visual baselines cover
Chromium on macOS, not every browser/device. Projection analytics begin with
upgrade activity and cannot reconstruct historical events.
