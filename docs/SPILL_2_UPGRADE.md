# Spill It 2.0: initial audit and foundation record

Audit date: 2026-11-06. The current purple production identity is authoritative.
This is a delivery record, not a claim that all five milestones are complete.
The continuing integrated upgrade is recorded in [SPILL_2_RELEASE.md](SPILL_2_RELEASE.md).

## Architecture and foundations to retain

Next.js App Router renders public and admin pages. Server actions and API routes
call the Cloudflare Worker through `lib/spill-api.js`; the shared API secret stays
server-side. D1 holds sessions, submissions, nickname reservations, presentation
pointers, admin accounts and expiring admin tokens.

Retain Instrument Serif/Manrope, the purple palette, shared UI components,
fullscreen QR/poster, moderation search/filter/pagination/bulk confirmation,
session lifecycle, explicit presentation pointers and projection transition
versioning. Same-ID polling already avoids replaying a contribution reveal.
Nickname reservation constraints and submission request-ID uniqueness already
arbitrate important races. Submission retry IDs must remain stable after an
ambiguous response. Approval must never imply projection.

## Baseline before implementation

- Unit tests: 28 passed across three files.
- `npm run cf-build`: passed, including both Next builds and OpenNext bundling.
- `npm run cf-bundle`: passed; emitted worker approximately 6299 KiB,
  gzip approximately 1304 KiB. The asset-routing patch reported success.
- Build-reported first-load JS: home 150 kB; join 175 kB; room 158 kB;
  session details 199 kB; moderation 162 kB. These are bundle sizes, not
  measured interaction latency, Core Web Vitals or a capacity estimate.
- Local production-server homepage screenshots captured at 390×844, 768×1024,
  1440×900 and 1920×1080 in `artifacts/baseline-*.png`. No horizontal document
  overflow in those four checks. This does not certify every page or overlap.
- Authenticated visual and behavioral baselines are incomplete: existing E2E
  flows require disposable fixtures and skip when fixture variables are absent.
- No load measurements have been made. Existing local-only load tooling supports
  10/25/50/100 concurrent submission bursts and an idempotency probe.
- No production writes, deployments, schema changes or load tests in this stage.

## Prioritized findings

| Priority | Finding and evidence | Required response |
| --- | --- | --- |
| High | `handlePutPresentation` in `api/worker.js` writes unconditionally; Next next/prev does read/compute/write | Revision-checked writes, atomic server advance, eligibility checked in the write |
| High | Moderation/settings patches lack row revisions | Return explicit 409 conflicts and refresh without dropping moderator intent |
| High | Login/destructive throttles are isolate-local Maps; proxy does not preserve a trusted participant network key | Distributed edge/coordinator enforcement; verify trust boundary before using headers |
| High | Password rotation permits stored old hash until login with new secret; old admin tokens survive | Explicit rotation and token invalidation procedure |
| High | E2E fixture absence silently skips critical journeys | Disposable provisioner and required executed-test counts in release gate |
| Medium | Room polling fetches the approved archive every time | Compact current-pointer response plus revisions; bounded archive access |
| Medium | Nickname legacy normalization scans prior submissions repeatedly | Reviewed normalization backfill followed by indexed lookup |
| Medium | Session-open and per-participant admission checks precede insertion | Atomic admission policy; test close/submit and rate-limit races |
| Medium | Shared-password login always selects oldest admin | Be honest about shared-account activity; design explicit moderator identities separately |
| Medium | Admin serialization spreads participant/request IDs | Response/export field allowlists |
| Medium | Display font variable references itself; room toolbar exceeds narrow widths; long tokens can overflow | Focused typography/layout fixes with computed-style and geometry checks |
| Medium | Dialog hidden-focus handling and reduced-motion pointer behavior need hardening | Reuse existing modal; test focus containment and motion preferences |
| Operational | Deployment docs contain legacy remote DROP advice; no backup drill or retention runbook | Backup-first additive migration workflow; isolated restore rehearsal |

## Milestones and acceptance gates

1. **Design and responsive foundation.** Fix typography token; refine existing
   primitives; harden modal focus, room toolbar and long content. Capture public,
   participant and authenticated admin screens at mobile/tablet/desktop/projector
   sizes with normal and reduced motion. Include long words and maximum content.
   No guarantee of zero overlap until the full matrix passes.
2. **Room and curated queue.** Add session-scoped persisted queue membership and
   revision counters. Enqueue/reorder/remove/preview never change projection.
   Explicit advance atomically consumes the next eligible item and updates the
   pointer. Add 409 conflict feedback and safe shortcuts. Test session isolation,
   concurrent moderators, refresh, polling identity and aspect ratios.
3. **Admin operations.** Extend existing moderation and status feedback; add
   revision checks and transactional activity records. Record shared admin
   account honestly; never credentials, IPs, participant IDs or contribution
   bodies. Optional templates should use existing validated settings.
4. **Optional engagement.** Add single-choice poll/options/votes with a unique
   poll/participant constraint and atomic open-state admission. Reactions default
   off, use rate buckets and aggregated presentation outside contribution text.
   Explain browser anonymity cannot prove one vote per physical person.
5. **Insights and hardening.** Private session recap, explicit export allowlists,
   approved-only default CSV, formula-safe cells, retention confirmation,
   distributed limits, compact polling, backup/restore drill, security integration
   tests and controlled 10/25/50/100 load measurements.

Each stage needs unit and isolated Worker/D1 tests, executed E2E counts, visual
review, full `cf-build`/`cf-bundle` and emitted-asset checks before deployment.
Deployments require recording the actual commit, deployment URL and smoke result.
No deployment is recorded by this document.

## Migration and data protection plan

Prefer additive queue/revision, activity, then poll/reaction migrations. Use
session/submission composite relationships or conditional writes to prevent
cross-session references. Activity writes belong in the operation's D1 batch.
Take and verify a D1 export before migration; rehearse restore in an isolated DB.
Rollback application code while retaining added data/columns; never drop event
tables as a rollback. Fresh schema already includes columns introduced by older
migrations: do not apply the full schema and all historical ALTERs together.
Review the migration ledger and historical upgrade path before remote execution.

## Remaining baseline and release work

Provision a fresh local persistence directory with generated test secrets; never
reuse production-backed Next environment for mutation tests. Seed live/paused/
closed sessions, long content and independent sessions, then supply every
`SPILL_E2E_*` fixture. Test all existing journeys before and after each milestone.
Use `scripts/load-submissions.mjs` against loopback only, retain latency percentiles,
errors, row deltas and retry results for each concurrency. A submission burst
does not measure sustained browser polling or distributed Cloudflare capacity.
Add those workloads before making readiness claims.

## Implemented: milestone 1 foundation slice

- Fixed Instrument Serif variable resolution; retained purple tokens and fonts.
- Refined shared cards, buttons and native form controls; 44px minimum shared
  control height, 16px mobile entry text, quieter shadows and explicit focus rings.
- Hardened dialog focus containment, hidden/disabled control filtering, nested
  modal handling, inert background and opener restoration.
- Wrapped room toolbar and long projection tokens; scrolling starts at accessible
  content and resets only when contribution identity changes. Guarded existing
  shortcuts against inputs, modifiers, repeats and modal interaction.
- Added five dialog regression tests and JSX transformation/discovery for the
  existing `.js` component convention. All 33 unit tests passed after integration.
- `npm run lint` passes after excluding emitted bundles and removing an unused
  import in the existing unused bundler script.
- Post-change `cf-build` and `cf-bundle` pass. Final `_worker.js` is 6,451,598 bytes;
  static assets exist and the emitted asset-routing flag is true.
- Post-change home/login screenshots exist as `artifacts/m1-*.png` at all four
  baseline viewports; eight requests returned 200 with no document horizontal
  overflow. Mobile login was visually inspected. Instrument Serif computed font
  resolves on login. This is screenshot capture, not a full visual snapshot suite.

Milestone 1 is not release-complete: authenticated visual coverage, room geometry
and keyboard browser regressions, reduced-motion ambient work and isolated E2E
baseline remain. Milestones 2–5 are planned, not implemented. No migrations,
load-test measurements, production smoke verification or deployment occurred.
