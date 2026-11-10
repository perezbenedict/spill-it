# Standalone Live Director and stage controls

Status: implemented and verified; production deployment record follows after release.

## What changed

- Live Director now works for saved standalone stages as well as discussions. Standalone preparation, receipts, recovery, projector status and audience data belong to the standalone stage; no discussion session is created or borrowed.
- Both private Preview and public Live monitors show the Spill It emblem and name at the top. Existing stage branding, watermark, themes and projector atmospheres are preserved.
- Voting cues use a named event picker, with open events first and closed events available for results. Event codes no longer need typing. Discussion polls retain their existing named picker. Selection does not open voting, change questions, reset rounds or reveal results.
- **Clear Live**, beside Emergency hide, removes the current presentation and returns to the waiting screen. Saved cues, private Preview, activity responses and voting data remain available. Emergency hide temporarily blacks out the projector; Restore is available only while that hide is still active and its content remains eligible.
- **Send Live** sends a saved cue directly to the screen. **Send Live now** does the same from the cue editor; audience activities also have a direct-send action. These actions preserve private Preview and use the same validation, concurrency guard and exact-payload safe retries as Take Live. Rehearsal direct sends stay local.
- Standalone stages gain saved rundowns, templates, cues, private rehearsal, event checks, authenticated receiver status, reconnect recovery, moderation, audience aggregates and export.
- Standalone word clouds, debate, scale voting and question priorities have their own participant link and QR at `/stage/[code]/join`. Question priorities use 2–50 moderator-prepared questions. Discussion contribution queues and discussion polls continue to use discussion records.
- Words require moderation. Results require explicit reveal plus five approved responses. Exact response retries cannot inflate totals, including after close. Participant identities are HttpOnly and separately namespaced from discussions. Aggregate exports omit question/word text, question IDs and participant tokens.
- The original standalone Stage Controls and dedicated voting controls remain below the Director. A mobile overflow in the original controls header was corrected without changing its behavior.

## Quick operator guide

1. Open Stage → Standalone Stage, choose an existing stage or create one. Its Live Director appears above the original controls.
2. Add a cue or template. Use **Preview cue → Take Live** to prepare privately first, or **Send Live** to publish that cue immediately.
3. In the cue editor, choose the content and use **Send Live now** for an immediate screen change. **Keep cue locally** retains the local rundown draft; **Save private rundown** persists it.
4. Choose voting events by name. Open or edit the actual event in Voting Room; attaching it never changes its settings, ballots or rounds.
5. Use **Clear Live** to return to waiting. Use **Emergency hide → Restore previous screen** for a temporary blackout. A subsequent manual clear prevents restoring obsolete emergency content.
6. For an audience activity, create its draft, open participation explicitly, share **Participant link / Participant QR**, moderate words, and reveal eligible results. Preview or send that activity Live. Close the activity when finished.
7. Check **Rehearsal mode** for private practice. Production activity controls and rundown saving are disabled there. Nothing is submitted or published by rehearsal actions.
8. Check the physical projector and actual event network. Receiver acknowledgements indicate a browser received state; polling is not instantaneous.

## Verification and migration

Lint, 102 unit tests, Cloudflare builds/bundle and API dry-run passed. All 110 selected Chromium/WebKit checks across eight suites have passing results, including the final 30 Director cases. There were no skipped or flaky cases in the selected projects. Coverage includes original controls, voting rounds/visibility, theme coverage, 320px–4K projection, dark/light Director layouts, accessibility, reconnection, simultaneous retries, cross-stage/discussion isolation, direct-send Preview preservation and Clear Live preparation preservation. The separate 100-answer + 100-retry scale check retained exactly 100 answers and the correct average/counts in both engines. These are local measurements, not a distributed production capacity claim.

The compiled Cloudflare Pages preview verified standalone private Preview, Take, hide/restore, Clear Live, direct sending without altering Preview, independent responses, protected identity and the QR/join page. Reserved build artifacts returned 404; the public-asset secret scan was clean.

`011_standalone_director.sql` adds only standalone-owned tables, indexes and admission safeguards. Fresh schema and upgraded existing databases agree. A protected production export outside the repository was restored; applying the final migration twice preserved all previous values and passed integrity/foreign-key checks. Raw backups and credentials are never committed. References and checksums are in `artifacts/standalone-director/migration.json`.

## Limits and recovery

Firefox UI verification remains blocked by the installed browser startup failure; BrowserOS neo tools were unavailable. Chromium and WebKit were verified. Rehearsal is local, participation is per browser, and projector acknowledgements do not prove physical output. Polling cannot instantly hide an offline projector. Rundowns allow 50 cues; activity lists show the latest 30; word review returns up to 100 records with pending items first; the voting picker prioritizes open events in a bounded 50-event list. Standalone question priorities use prepared choices; free-form discussion submissions remain in the discussion workflow.

Rollback the application versions if needed and leave the additive tables intact. Never reset or restore an older whole database just to roll back code; preserve later event data and reconcile only reviewed affected rows.
