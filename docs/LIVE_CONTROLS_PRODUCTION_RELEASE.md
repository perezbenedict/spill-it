# Live-event controls production release — 2026-11-08

The authorized upgrade is deployed and verified at **https://spill-it-4rw.pages.dev**.

| Release reference | Value |
| --- | --- |
| Runtime commit | `baa29c02fcbbbdfbb1c2a2f52d1e86503b18a076` |
| Pages project | `spill-it` |
| Production deployment | `8397d612-2177-4507-997d-3f322578cf58` |
| Immutable deployment URL | https://8397d612.spill-it-4rw.pages.dev |
| API deployment | `7659056a-3709-459a-b332-7d03747c3742` |
| API version | `2b081e05-70cb-421b-b71e-ec9b089cbf9a` |

Cloudflare's canonical project metadata confirms the intended production domain, successful deployment and matching runtime commit. Secrets and credentials were not changed.

## Backup and migrations

After the owner confirmed the event had ended, a fresh full production export was taken to an owner-only directory outside the repository:

`~/Library/Application Support/SPILL/backups/live-controls-authorized-20261108T174527Z/production.sql`

SHA-256: `9defb0c3d91465119af0a3b3a27489217289c8d9c293138bf9eacc6d986c2dff`; size: **78,144 bytes**. Restoration succeeded. Both migrations were rehearsed against this restored backup before remote execution.

Migrations **007_voting_rounds** and **008_activity** were then applied successfully and confirmed in the remote ledger. Post-migration and post-release exports were restored and compared against the backup. **Every pre-existing column value across all 20 existing data tables matched.** SQLite integrity was `ok`, with zero foreign-key violations. A direct remote foreign-key PRAGMA attempt returned a Cloudflare internal error; the successful foreign-key checks reported here are against complete restored exports, not a claimed remote PRAGMA result.

| Preserved production records | Before | After |
| --- | --- | --- |
| Discussions | 5 | 5 |
| Contributions | 24 | 24 |
| Voting events | 0 | 0 |
| Votes | 0 | 0 |
| Activity entries | 101 | 101 |

All five discussions were already closed in the fresh backup and remained closed. Production history records a voting-event deletion at **17:44:01 UTC**, before this release backup, followed by discussion closure at **17:44:15 UTC**. The zero-ballot baseline therefore differs from the earlier five-vote snapshot; this release did not delete that event or its votes. Earlier private backups remain retained. No production reset, restoration, archival, session reopening or presentation change was performed by release verification.

## Release verification

- `cf-build` and `cf-bundle` passed for the released source. The Worker bundle and public assets were checked; 73 public files contained no production private configuration values.
- The previous complete suite passed 144 E2E cases and 47 unit tests, plus six cross-browser cursor checks and 29 visual/Activity checks. Final focused validation on the released build passed **20 tests**, with zero skips or flaky outcomes: voting rounds (6), Stage Centre (6), original stage controls (1), Activity (5), and mobile/projector accessibility (2).
- The packaged Cloudflare preview passed reopening with preserved votes, separate round-two eligibility, stale-round rejection, historical totals, secure voter cookies, duplicate retries, and Stage/Activity routes.
- The repeated Stage checks caught a shortcut focus race before Pages deployment. The new centre now focuses controls synchronously and waits for shared controls to load before enabling shortcuts. Added regression assertions verify announcement text stays in the intended field. Original session components and routes remain byte-identical.
- Read-only production browser verification passed homepage branding, admin authorization, default Stage selection, explicit session selection, all five quick Stage actions, original session announcement/prompt/reflection/atmosphere/queue controls, Activity pagination, voting administration, QR, participant closed-session entry and Room View.
- Presentation state was identical before and after visiting the two stage interfaces. Reduced-motion watermark behavior passed. Six deployed JS/CSS assets returned 200; private build paths returned 404. The final browser run recorded zero page errors and no attempted writes.

No production ballot existed during verification. Reopen/new-round lifecycle writes and hidden-result protections were exercised with disposable isolated data and the packaged Cloudflare build; no artificial production ballot or vote was created. Existing discussions were not reopened to test the participant journey. This distinction avoids claiming production voting writes were executed.

## Recovery

Keep this round-aware API version as the backend recovery anchor. The pre-upgrade API can misaggregate multiple rounds and does not maintain round timestamps or exposure metadata even for round-one lifecycle writes. A frontend rollback can leave the migrated database and round-aware API intact. Never reset D1 or restore an old backup over later event data; restore into a separate recovery database and reconcile reviewed rows instead.

Hank reviewed migration and rollback compatibility and found no additional data-loss blocker; the old-API write-metadata restriction above was added to the recovery guidance.

Sanitized machine-readable evidence: [production-release.json](../artifacts/live-controls/production-release.json). Implementation details and synthetic screenshots: [upgrade report](LIVE_EVENT_CONTROLS_UPGRADE.md). Raw exports, cookies, restored databases, browser logs and production screenshots remain private outside the repository.
