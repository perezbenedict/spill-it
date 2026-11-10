# Spill It 4.0 production release — 10 November 2026

Deployed and verified at **https://spill-it-4rw.pages.dev** after the owner explicitly requested deployment following the initial event-status hold.

| Reference | Value |
| --- | --- |
| Runtime commit | `b2685403748e69a1caf92dcf21546ee631b26eb1` |
| Pages project | `spill-it` |
| Production Pages deployment | `a8b596a0-c73c-4609-b689-34f5fd02a238` |
| Immutable URL | https://a8b596a0.spill-it-4rw.pages.dev |
| API deployment | `f8ac13dd-3fe8-487d-8fa4-19bb311e294e` |
| API version serving 100% | `4108c478-0d40-4a16-b994-0a2feb885a12` |
| Applied migration | `010_director` |

The production flags still included one live discussion and one open voting event. Read-only checks found no contribution or operator mutation since approximately 13:32 UTC, and the fresh pre-release export was byte-identical to the earlier verified backup. The migration adds tables and admission safeguards without changing existing event rows. The release did not close, pause, reopen or reconfigure any event and did not rotate credentials. The API was deployed first; all 13 existing public state responses preserved every previous key/value before the frontend was switched.

## Backup and preservation

Owner-only backup directory outside the repository: `/Users/perezbenedict/Library/Application Support/SPILL/backups/spill4-release-20261110T153840Z`.

- Pre-release SQL: `before.sql`, 105,764 bytes, SHA-256 `6231d03e7c20c8373ba640c85a4ac340538d20514a5488f96956faa7d2b54f2f`.
- Restored locally; final migration applied twice; all existing row values preserved; integrity and foreign keys passed.
- Remote migration completed in 9 queries, reported SQL duration 3.6973 ms. The ledger records it exactly once.
- Post-release SQL: `after.sql`, SHA-256 `34d79cbfa5ac412731ad8056e89aaf623444340fcf181e1bf35d32f4b066ea28`. Restoration and row comparison confirmed **every pre-existing row and column value across all 24 existing data tables was preserved**. The migration ledger was the only intentionally changed existing table.
- Preserved five discussions, 26 contributions, 32 nickname reservations, seven discussion-poll votes, one dedicated voting event/round/vote, two standalone stages, credentials, admin sessions, activity history and presentation configuration. All existing table counts are unchanged. New Director preparation records are separate.

Raw SQL and authentication material remain private and are not committed or published.

## Production verification

Chromium checked the authenticated Stage Centre/Live Director, private rehearsal Preview/Take, home, login, participant, QR, room/projector, dedicated voter/projector and both standalone stages. All 10 page checks returned 200. The rehearsal generated no production request writes. The four reserved build-artifact URLs returned 404; 19 emitted assets returned 200. Anonymous Director access returned 401; authorized aggregate export and the public audience proxy returned 200. There were **zero browser page errors and zero browser write requests**. Live Director and projector screenshots were visually inspected and retained only as private workspace deliverables.

Pre-release evidence remains in `verification.json`: 100 unit tests, all 206 distinct Chromium cases passing across full and final runs, 27 final WebKit cases, four zero-error local load runs through 100 concurrent participants, exact 100-response audience aggregation/retries, Cloudflare builds and migration rehearsal. Firefox UI checks remain blocked by installed browser startup failure. BrowserOS neo tools were unavailable; production visual verification used Chromium. No production contribution, ballot, cue, audience activity or public Take/Hide action was created just to test the release.

The first Pages upload used `--no-bundle` and was rejected for module output format before creating a deployment. Standard Pages bundling, already used by the local preview verification, succeeded. The previous frontend stayed live until the successful switch. Existing encrypted secrets, D1 binding, compatibility settings and infrastructure were preserved.

## Rollback

Previous Pages deployment: `2c9dba1e-21ba-497f-8bd6-47e2affaa2bd`. Previous API deployment: `852c2243-5b42-42de-a620-d93c6898d0a5`, version `e40c8ebe-d7b4-4b74-b97e-0e950032431d`.

For an application regression, roll back those application deployments and leave the additive tables in place. Never reset the database or restore an older full export merely to roll back code; that would risk later event data. Preserve a fresh export before any data recovery and reconcile only reviewed affected rows. See `RELEASE_RECOVERY.md`.

Git `main` was not merged as part of this deployment; the exact validated feature-branch runtime commit is the recorded production source. Release-record commits use `[CF-Pages-Skip]` to prevent redundant automatic builds.
