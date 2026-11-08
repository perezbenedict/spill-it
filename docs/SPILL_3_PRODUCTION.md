# Spill It 3.0 production verification

Released on 8 November 2026 to **https://spill-it-4rw.pages.dev**.

- Runtime commit: `0d9872b79798e99ec337f04ab060372ccd343272` (feature commit `336d5b84e3f4a5db63b7692dff9de9c117ea962d`). Both pushed to `main`.
- Pages project: `spill-it`; production branch: `main`; canonical production domain confirmed through Cloudflare.
- Final Pages deployment: `47de6d3a-f954-40a1-be7b-2afadbca5888`, status success; immutable URL: https://47de6d3a.spill-it-4rw.pages.dev.
- API version: `07f507db-f0c4-49cb-b933-227325511482`; deployment: `8b245b40-ac51-4a0d-a776-5ec827922a8c`.
- Migration: `006_voting`, applied successfully before the API and Pages releases. Existing data was never reset or recreated.

## Safeguards and preserved data

A fresh 64,224-byte owner-only SQL backup was restored, checked and migrated twice in isolation. The previous API ran successfully against that migrated backup. After API deployment, the previous immutable Pages release still served the homepage and existing room/stage APIs successfully, confirming a usable application rollback path.

Before release, the live flag was assessed alongside activity: contributions last changed at 09:11 UTC and admin activity at 11:15 UTC; the current presentation pointer was empty and its existing spotlight prompt was retained. Counts and complete row values stayed unchanged across the verification window. A confirmed 44-second Worker tail contained our health probe and no other requests or writes. The deployment did not close or modify the live session.

After final release, a second complete production export was restored and compared with the pre-release export. Every value in every existing table was unchanged, excluding the intentionally added migration-ledger entry. Integrity and foreign-key checks passed.

| Data | Before | After |
|---|---:|---:|
| Sessions | 5 | 5 |
| Live sessions | 1 | 1 |
| Contributions | 23 | 23 |
| Nickname reservations | 30 | 30 |
| Existing discussion polls | 1 | 1 |
| Existing poll votes | 7 | 7 |
| Standalone voting events | 0 | 0 |
| Standalone votes | 0 | 0 |

All presentation pointers, persisted atmosphere/chapter configuration, saved prompt, moderation decisions, existing browser reservations, credentials and session records were preserved. No production test ballots, votes, contributions or nickname reservations were created. The final export initially encountered a transient malformed Cloudflare API response; retry succeeded and supplied the complete row comparison.

## Live verification

Nine nondestructive checks passed on the actual production domain:

1. Homepage plus eight emitted JavaScript/CSS assets returned successfully.
2. Intermediate server/environment files and reserved Worker paths returned 404, including encoded aliases.
3. Existing live status, contribution pointer, atmosphere and projected spotlight matched the backup.
4. Voting API reads enforced admin authentication (401 without it), returned the authenticated event list (200), and rejected unavailable public events (404).
5. The homepage retained its three distinct hero lines.
6. Mobile participant entry reached the nickname step without sending a contribution or reserving a nickname.
7. The QR retained the actual topic, rendered its code and entered/exited fullscreen.
8. Room View displayed the preserved spotlight and emblem; unauthorized presenter controls stayed absent.
9. Authenticated admin navigation opened the new Voting control centre.

Browser verification blocked non-read HTTP methods; no such requests were attempted. Full voting/announcement writes, concurrency, themes, timed restoration, chart switching, hidden-result privacy and final reveals were tested only with disposable local data, as detailed in [the implementation report](SPILL_3_RELEASE.md).

## Packaging finding resolved

The first production verification found older server-support paths still publicly reachable after removal from the build directory. Their responses contained no credential values. The final release adds an explicit guard before asset lookup and an all-route Worker dispatch file, then rechecks both the packaged artifact and live domain. All six tested private/encoded paths now return 404. No production credentials were changed.

The runtime commits use `[skip ci]` to retain the verified manual deployment sequence. This documentation/evidence commit does not change the deployed runtime. Raw backups, credentials and traces remain outside committed release evidence.

## Remaining limits

Live results use two-second polling, with measured isolated projector updates around two seconds. Load results describe local disposable infrastructure, not global production capacity. Physical projector/GPU power and thermal measurements were not available; headless 4K scheduling and all requested viewport dimensions were exercised. Anonymous browser voting cannot establish one vote per physical person across browsers/devices. No implementation or deployment blocker remains.

[Automated evidence](../artifacts/spill3/verification.json) · [Production browser checks](../artifacts/spill3/production-browser.json) · [Data comparison](../artifacts/spill3/production-data.json) · [Deployment IDs](../artifacts/spill3/deployment.json) · [Changed files](../artifacts/spill3/files-changed.txt)
