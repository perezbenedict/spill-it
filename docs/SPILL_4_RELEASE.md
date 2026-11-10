# Spill It 4.0 release

For the subsequent standalone Director, branding, named voting picker, Clear Live and direct-send update, see `STANDALONE_DIRECTOR_RELEASE.md`. The original deployment record follows below.

Status: deployed and verified on 10 November 2026 at **https://spill-it-4rw.pages.dev**. Runtime commit `b2685403748e69a1caf92dcf21546ee631b26eb1`. The owner explicitly requested deployment after the initial hold. The additive migration, API and frontend are live; all pre-existing database rows and values, open event statuses and presentation settings were preserved. See `SPILL_4_PRODUCTION.md` and `artifacts/spill4/production.json` for deployment and rollback references.

## What changed

- **Live Director** is integrated into the discussion Stage Control Centre. A shared, authenticated private Preview and a prepared rundown are separate from public Live. Cues cover announcements, prompts, reflection/countdowns, approved contributions, discussion polls, standalone voting, audience activities and a waiting screen. Reorder, edit, save and apply three event templates privately; only Take Live publishes a prepared cue.
- **Safe live operations:** director and platform revisions are checked together inside a D1 transaction. Each director operation has a unique receipt. A lost response can be retried with the identical operation and payload without another live change. Conflicting operations synchronize for an explicit operator decision. Take Live rechecks contribution approval, session scope, poll eligibility and voting availability. Emergency hide stores one recovery snapshot; restore rechecks eligibility and refuses withdrawn contributions. Repeated hide preserves the original recovery target.
- **Event health:** server status, pending contribution and word moderation, queued content, authenticated projector acknowledgements, stale/catching-up indicators and a pre-event checklist. Open Room View from a signed-in moderator browser for acknowledgements. Receiver status stores only the latest timestamp, stage revision and visibility per event; no IP, fingerprint or display identity. It is an indication of the browser receiving state, not proof of a physical projector or every secondary display.
- **Projection recovery:** room pointer, approved visibility and stage configuration are read together. Initial HTML includes the current public stage state; a refresh restores announcements or blackout immediately. The initial countdown clock is shared between server HTML and the first browser render to prevent hydration mismatches. Polls are sequential, stale revisions are ignored, room reads have timeouts, and interrupted projection offers a local recovery action while retaining the last confirmed screen.
- **Rehearsal:** a visibly separate, client-only private monitor. Preview, take, hide, restore and sample word-cloud/debate/scale screens make no production writes. Real activity controls and rundown saving are disabled in rehearsal. Rehearsal never creates a public join link, submissions, ballots or result counts. It is a local desk rehearsal, not a shared multi-device rehearsal environment.
- **Optional audience moments:** moderated short word-cloud entries; agree/disagree debate; prioritization of approved, visible session questions; and fixed 1–5 scale voting. Activities start as drafts, open explicitly and close permanently; create another activity for another round. Participation is one answer per browser identity per activity. Closed or scheduled-closed events reject new answers; exact accepted retries remain safe. Words require approval and can subsequently be hidden. Hidden questions leave priority results. No names or participant tokens are returned in public results.
- **Result privacy:** public results require both an explicit reveal and five approved responses. Hidden result payloads do not change with votes. Pending words remain private. The new aggregate JSON export omits submission bodies, question IDs, word text, nicknames, participant tokens and precise timestamps. Category groups below five are suppressed. Existing approved-content export and insights remain available to authorized moderators.
- **Participant reliability:** opt-in low bandwidth slows participant audience polling to 15 seconds and reduces decorative background effects. It does not slow moderator or projector polling or change projector atmosphere behavior. Offline feedback keeps the current draft in the open page and sends nothing automatically. Contribution sends have a bounded wait and retain their existing retry key after an unconfirmed response.
- **Retained experience:** original session Stage Controls and projection queue, standalone stage, voting rounds and private results, anonymous identity protections, light/dark themes, all seven projector atmospheres, reduced motion, existing activity and password-protected deletion workflows. No new service, infrastructure migration or dependency upgrade.
- **Additional regression fix:** dashboard recent activity initially renders a deterministic UTC timestamp, then switches to relative time after hydration; browser timezone and second boundaries cannot break initial rendering.

## Operator quick start

1. Open **Stage → Discussion Stage**, choose the correct discussion and locate Live Director. Existing stage controls remain below it.
2. Add an event template or prepare individual cues. Save the private rundown. Click **Preview cue** and inspect its content.
3. Open the public projector from the signed-in moderator browser. Check fullscreen, the physical image and the participant link on the actual event network. Run event checks and complete the manual checklist.
4. Use **Rehearsal mode** for private sample screens. Leave rehearsal to operate public Live. Templates and cue preparation do not open audience participation.
5. Press **Take Live** deliberately. Verify the physical screen and its acknowledgement. Existing Stage Controls can still change Live; concurrent stale director actions will be rejected.
6. For an audience moment, create its draft, open it explicitly, review word entries, then enable aggregate reveal when appropriate. Preview the activity and Take Live to project it. Close participation when finished.
7. Use **Emergency hide** when needed. It arrives through polling, so allow a few seconds. A disconnected projector cannot receive it: blank that projector locally if necessary. **Restore previous screen** restores only still-eligible content.
8. If the desk reports an unconfirmed operation, use **Retry unconfirmed action safely**. Do not create another operation to guess whether the first one arrived. If another moderator changed state, inspect the synchronized Live and Preview before an explicit retry.
9. Download aggregate insights from Event Health. Existing detailed approved-content export remains separately available in session insights.

## Verification

- Lint and all **100 unit tests** passed (14 test files).
- The full **34-spec Chromium regression** finished with 204 passing checks and one outdated test-cleanup failure. The cleanup now closes its disposable voting event before deletion; the product's open-event deletion guard is unchanged.
- Final checks reran the affected suites: **27/27 Chromium and 27/27 WebKit checks passed**, covering Director, all four activity modes, uncertain-operation retry, room recovery and timed/standalone stages. Across the full and final runs, all 206 distinct Chromium cases have passed. The final targeted run covers the last aggregation, moderation-health and countdown changes.
- Firefox completed 9 API-only cases. **18 UI checks were blocked before navigation** because the installed Firefox could not find its profile folder. Independent startup probes with short temporary and workspace profiles failed too. No application assertion failed in the final run. Firefox UI verification remains a release-candidate limitation.
- Local load checks at **10/25/50/100 concurrent participants** had zero errors, exact database counts, one row per retry key and correct concurrent moderation/projection. Submission p95 was 78.4/197.9/343.1/751.7 ms. These measurements describe the local setup only.
- A separate **100-response scale activity + 100 exact retries** kept exactly 100 responses, an average of 3 and 20 answers at each scale value. Aggregation runs in bounded database queries, avoiding an unbounded per-answer Worker allocation.
- Production builds, OpenNext Cloudflare build, Pages bundle and API Worker dry-run passed. Compiled Pages preview exercised private Preview/Take/hide/restore/aggregate export, standalone stages and voting rounds; HTML/assets returned 200 and reserved server artifacts returned 404. The public-asset secret scan found no leaks.
- Responsive checks covered 320px through 4K; Director and the new scale participant flow had zero tested WCAG A/AA axe violations. Dark/light desktop/mobile and projector screenshots were inspected. Original atmosphere, voting-round and privacy suites passed.
- The protected production backup restored successfully; applying the final migration twice preserved existing data and passed integrity/foreign-key checks.

Final test results and sanitized measurements are recorded in `artifacts/spill4/verification.json`. Browser screenshots in `artifacts/spill4/screens` contain disposable local fixtures only. Test reports and traces with local credentials stay under ignored `artifacts/isolated-*` directories.

The project-local Chromium/Firefox/WebKit runner is separate from BrowserOS neo. BrowserOS tools were not exposed in this session despite a connection request; production browser verification used Chromium with an existing authorized session and all browser write requests blocked. The Stage Centre/Director, private rehearsal, participant/QR/projector, dedicated voting and both standalone stages passed; 19 emitted assets returned 200, four reserved artifact routes returned 404, and there were zero page errors or write requests. Full write journeys use loopback Next, a disposable Worker/D1 and generated local credentials. No production test contribution or ballot was created.

## Backup and migration

A fresh owner-only production SQL backup was exported outside the repository. The deployment backup and post-release preservation comparison are recorded in `artifacts/spill4/production.json`; candidate migration rehearsals are retained as historical evidence. See `artifacts/spill4/migration.json` for its location, byte count and SHA-256. The final migration was applied twice to a restored copy, with every existing table row fingerprint preserved; integrity and foreign keys pass. Final migration checksum and counts are in `artifacts/spill4/migration-final.json`.

Preserved data includes five discussions, 26 contributions, 32 nickname reservations, seven discussion-poll votes, the existing standalone voting event/round/vote, two standalone stages, all presentation pointers and configuration, credentials, admin sessions and activity history.

`010_director.sql` adds only director preparation/receipts, projector status and audience-activity tables, indexes and admission safeguards. The existing production database is not reset. A reproducible local rehearsal is available:

```sh
python3 scripts/rehearse-director.py --backup /protected/path/production.sql --report /protected/path/rehearsal.json
```

## Release gate and rollback

1. Arrange a quiet event window. Recheck live discussions, open votes, operator activity and projector use. A stale status flag alone is not evidence that a live event is safe to interrupt.
2. Refresh the protected remote export and re-run the final migration rehearsal. Inspect the migration ledger; apply only pending `010_director.sql` to the existing `spill` D1 database using `api/wrangler.toml`.
3. Capture current Worker version and Pages deployment IDs. Deploy the API first, verify existing read journeys, then publish the validated Pages bundle to the existing project. Preserve existing encrypted secrets and bindings.
4. Check actual production HTML, emitted assets, authentication, private-artifact 404s, public join/room/voting/standalone reads and current presentation state. Avoid creating production test submissions or votes.
5. Export again and compare preserved records, allowing only expected new director/health records and the migration-ledger entry. Record deployment IDs and actual smoke results before marking released.

Roll back application deployments if needed and leave the additive tables in place. Do not DROP tables or restore an older full database merely to roll back code; that can erase newer event data. Preserve a new backup before any data recovery. Use the existing release/recovery runbook for reviewed reconciliation.

The release branch is committed with Cloudflare's supported `[CF-Pages-Skip]` prefix to prevent an automatic Pages build when pushed. The owner-authorized production release used an explicit Pages deployment of the verified runtime bundle. See [Cloudflare's Git integration documentation](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message). Git `main` remains unchanged; the runtime from `spill-it-4` is explicitly deployed to production. Documentation commits use the skip prefix to avoid a redundant build.

## Limits

Polling is near-real-time, not instant broadcast or a guaranteed physical-screen acknowledgement. All displays share the latest event acknowledgement. Browser identity cannot guarantee one physical person across devices or cleared cookies. Rehearsal is local to this desk. Audience activities now support independent standalone stages too; standalone question priorities use moderator-prepared choices. Discussion contributions and polls retain their discussion ownership; dedicated voting retains its own controls. Debate is binary and scale is fixed 1–5. Rundowns hold up to 50 cues, activity listings the latest 30 activities, word review up to 100 records with pending items first, and question choices up to 50 approved visible questions. There is no automated semantic word merging, toxicity classifier or automatic retention deletion. Local load results do not certify distributed production capacity.
