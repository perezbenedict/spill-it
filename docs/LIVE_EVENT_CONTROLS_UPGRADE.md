# Voting Room and live-event controls

The integrated upgrade adds branded voting screens, safe reopening and separate rounds, a flame-inspired Room View cursor, organized activity history, and an additive Stage Control Centre. Existing discussion controls, navigation workflows, moderation, polling, queues and participant anonymity are preserved.

## Operating the upgrade

- **Voting:** Closed events offer **Reopen Voting**, retaining the same round, link, QR and votes. Existing voters remain ineligible for another answer in that round. **Start New Round** requires confirmation and opens a separately recorded round under the same event. Private round history remains available in administration. The latest 50 rounds are listed; authenticated round-specific reads support older history.
- **Result privacy:** Reopening clears final-release authorization and participant-result sharing. Hidden results require another explicit release. Historical public exposure remains truthfully recorded. Live results continue from authoritative current-round totals. Browser anonymity cannot enforce one physical person across devices or cleared browser storage.
- **Stage:** `/admin/stage` selects the intended discussion, previews server state, links to Room View and opens the existing announcement, prompt, reflection, queue and atmosphere controls. This is server synchronization, not a projector heartbeat. A sole live discussion can be selected automatically; ambiguous live discussions require selection. The session picker lists the latest 100 discussions; an explicit session link can access older discussions.
- **Original controls:** `Admin → Sessions → Select Session → Existing Stage Controls` remains unchanged. The central page renders the same `AdminPlatform` and `StageControls` against the same records and revision protections. SHA-256 fingerprints confirm those components and the existing session live route are byte-identical.
- **Activity:** Category, event search, UTC dates, archived view and bounded keyset pagination replace the old fixed history list. Confirmed **Clear Visible History** archives all eligible entries in the captured filtered view, across its pages. Later arrivals and protected audit entries remain visible. Actual event data is untouched. See [retention policy](ACTIVITY_RETENTION.md).

## Visual changes

Voting Room and voter pages reuse the actual Emblem and wordmark. Layered violet lighting, architectural contours, edge accents and a slow rotating watermark share existing atmosphere presets. Mobile answer selection and confirmation retain the direct voting journey. The Room View cursor uses the brand flame, preserves the native pointer fallback and text caret, and hides for selection, dragging and idle projection. Touch and reduced-motion users retain native behavior.

Synthetic screenshots are in `artifacts/live-controls/screens/`: participant mobile, Stage mobile, Activity mobile, branded projector and all four chart styles. No production contribution or voting content is included.

## Verification — 2026-11-08

- Lint passed; 47 unit tests in nine files passed.
- Full disposable regression: **144 passed across 21 specs, zero skipped, zero flaky**. Includes old and new stage workflows, bidirectional synchronization, revision conflicts, lifecycle, nickname uniqueness, idempotency, deletion, hidden results, round history, ten-question ballots across rounds, keyboard/fullscreen, recovery, all seven atmospheres and all chart styles.
- Additional Chromium/Firefox/WebKit cursor checks: **6 passed**. Visual comparison and Activity rerun without updating baselines: **29 passed**. Fifty-two screenshot assertions were exercised by the visual suites; changed voting and admin navigation baselines were reviewed. Unrelated homepage/entry baselines were retained.
- Axe WCAG A/AA checks passed on tested public/admin states, including mobile voter at 320px, Stage/Activity at 390px and branded projector. Automated checks complement the visual review; they do not establish universal accessibility compliance.
- Projector layouts covered 1280×720, 1366×768, 1920×1080, 2560×1440 and 3840×2160, with short, medium and maximum-length presentation content and animation frames. Reduced motion, stable labels and no horizontal overflow were checked.
- `npm run cf-build` and `npm run cf-bundle` passed. Packaged Worker/static preview passed, including eight assets, old routes, Stage/Activity, new rounds, stale-round rejection, preserved history and private build-path denial.

### Isolated concurrency measurements

These are loopback Next/Worker/local D1 measurements with disposable data, not production capacity guarantees. Results use near-real-time polling, not push.

| Simultaneous voters | Successful | Vote p95 | Projector after last acknowledgement |
| --- | --- | --- | --- |
| 10 | 10/10 | 66 ms | 2,297 ms |
| 25 | 25/25 | 137 ms | 2,308 ms |
| 50 | 50/50 | 269 ms | 1,798 ms |
| 100 | 100/100 | 670 ms | 1,794 ms |

All totals matched, with zero errors or duplicate-retry inflation. Separate contribution loads also passed 10/25/50/100, with p95 76/268/458/906 ms, exact database counts and successful moderation/projection recovery.

At 4K, animated voting charts recorded 52–56 RAF samples in about two seconds, with p50 intervals around 33 ms and no long tasks; reduced motion recorded 121 samples at about 17 ms. Room View recorded 60 samples/2.03s animated and 120/2s reduced. Adaptive quiet mode was active. These are headless scheduling measurements, not physical-projector or GPU benchmarks; actual venue hardware should be checked.

## Database protection and recovery

`007_voting_rounds.sql` adds event current-round metadata and per-round records, and rebuilds only the vote table to make uniqueness round-scoped. Existing votes are copied into round 1 before admission/version triggers are restored. No discussion, contribution or presentation reference is changed. `008_activity.sql` adds archival batches, archive membership, indexes and protected-audit guards. Apply version 007 once after 006, then 008; never apply fresh-schema SQL to production.

A fresh owner-only production export at `~/Library/Application Support/SPILL/backups/live-controls-release-20261108T165558Z/production.sql` restored successfully. SHA-256 `35c1d0e20b1565685d8ffda953d72bf6c778f952963838a2aaaee59273d83853`, 81,722 bytes. Both migrations were rehearsed: every original column value in all 20 existing data tables was preserved; integrity was `ok`, with zero foreign-key violations. Counts were five discussions, 24 contributions, one voting event, five votes and 99 activity records. A separate disposable migration fixture also checks admission, idempotency, historical round preservation and audit guards.

Historical application modules were executed against the migrated restored database using a local D1 read adapter: all five Room View reads and authenticated round-one voting totals passed. This was a local rollback rehearsal, not a remote rollback deployment.

**Rollback restriction:** Once round 2 exists, old API code would aggregate rounds incorrectly. Retain a known-good round-aware API thereafter; do not revert to the pre-upgrade API. Leave additive tables and preserved history in place. Before round 2, the old API can read the migrated round-one schema. Restore backups only into a separate recovery database for reviewed reconciliation; never reset production or discard later votes. Stage cursor and frontend visuals can be rolled back independently of round-aware backend support.

## Production release status

Release checks are complete, but no production migration or deployment has been performed yet. Monitoring detected active Room View and admin polling, despite stable counts and no contribution after 16:08 UTC. The live flag alone was not treated as an event; active presentation clients require confirmation of an idle maintenance window. Production remains on Pages `c932f6f3-0c4b-4a0b-96dd-d11c9759022a` and API version `07f507db-f0c4-49cb-b933-227325511482` until that window is confirmed.

Source commit `27c0c1a0edb89d618152d80909a64ff8cdc1e21d` is pushed to `main` with automatic deployment skipped. A subsequent Cloudflare API read confirmed that the canonical production deployment remains unchanged. Nondestructive homepage/login reads returned 200 and private artifact paths returned 404; the new Stage route is not yet deployed. A final remote read confirmed the same five discussions, 24 contributions, one voting event, five votes and 99 activity records, with migrations 007/008 still pending.

Machine-readable sanitized evidence: `artifacts/live-controls/verification.json`. Raw backups, tokens, operational traces and restored private data remain outside the repository. No credentials were rotated and no production event rows were changed.
