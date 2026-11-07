# Release, backup and recovery

Run commands from the repository root with explicit configuration paths. Never
reset a production database to install an upgrade. Backups contain private event
content: keep them outside the repository with owner-only permissions and do not
upload them as public build artifacts.

The integrated upgrade is still awaiting final release gates. A private backup
already exists at
`~/Library/Application Support/SPILL/backups/2026-11-07/spill-final-predeploy.sql`, SHA-256
`e9babbc651e4296bb32b913fcf2fed99112359b4adb381bb4415cf369c05005f`.
Its restoration and additive-migration rehearsal preserved three sessions and
16 contributions. Recheck the remote counts and live-event state before relying
on that backup for release; refresh it if production changed. The November 6
backup is retained as history. The final November 7 export has the same checksum;
its separate SQLite restoration plus migration passed integrity and foreign-key
checks and retained all three sessions and 16 contributions.

## Release gate

1. Run unit tests, lint, disposable E2E (no unexplained skips), isolated load tests,
   migration rehearsal and visual review. Record actual results and limitations.
2. Confirm no live event is using the platform before a schema/API deployment.
3. Inspect remote schema and migration ledger. Do not apply historical ALTERs to
   columns that already exist. Fresh databases use the current full schema.
4. Export a remote backup into a private temporary directory:

   ```sh
   umask 077
   backup_dir=$(mktemp -d /tmp/spill-backup.XXXXXX)
   npx wrangler d1 export spill --config api/wrangler.toml --remote --output "$backup_dir/spill.sql"
   shasum -a 256 "$backup_dir/spill.sql"
   ```

5. Restore that export into a **new local** persistence directory, count sessions
   and submissions, rehearse the additive migration and compare those counts.
   Do not log or commit raw submission contents. Check foreign-key integrity.
6. Apply only the reviewed pending migration, then deploy the Worker. Build with
   `npm run cf-build` and `npm run cf-bundle`; confirm nonempty
   `.open-next/_worker.js`, static assets and the asset-routing flag. Deploy the
   resulting directory to the existing Pages project, preserving configured
   production secrets. Record Worker version and Pages deployment ID.
7. Smoke-check actual production HTML, JS/CSS, admin authentication, QR and room
   read routes. Do not create public event data just to test deployment.

## Moderator handoff and password changes

Tell moderators before the first versioned-token deployment: legacy login tokens
without a credential version will be rejected, so they must sign in again.
Ensure the existing admin password is available to authorized operators before
the event; do not print it in this runbook or release logs.

For later password rotation, update only the encrypted
`SPILL_ADMIN_PASSWORD` Worker secret. The environment credential is authoritative;
an old stored hash does not remain an alternate password while that secret is
set. Tokens tied to the previous credential version become invalid on their next
authorized request. Schedule rotation outside a live event and verify a fresh
login plus rejection of an old session. Do not delete admin/event rows, replace
the API secret, or preserve old tokens to avoid the sign-in step.

Before starting an event, confirm the discussion is open, the projector is
connected and reactions are in the intended state. Build the approved queue and
preview its first item; only **Project next** or another explicit presentation
action changes the screen. Open polls deliberately and close them when finished.
When a concurrency warning appears, review the synchronized state rather than
repeatedly clicking the same operation. See `SPILL_2_RELEASE.md` for the complete
operator controls.

## Recovery

Keep the previous Worker/Pages deployment IDs before release. For application
regressions, roll back those deployments and leave additive tables/columns intact.
Pause moderator writes during recovery. Do not attempt rollback with DROP TABLE.
If event rows need restoration, first export the current state too. Restore the
verified backup into a separate database and reconcile the affected rows after
review; restoring an old snapshot blindly loses contributions received later.
D1 point-in-time recovery is another recovery path; identify the pre-release
bookmark/time and rehearse on a disposable target before production recovery.

Back up before each event and before migration; choose a retention period with
the event owner. Exports and activity records remain private to administrators.
The platform does not schedule automatic permanent deletion: retention cleanup
requires explicit selection, password verification and confirmation through the
existing deletion workflow. Never store passwords, admin tokens, IPs or full
contribution bodies in activity metadata.

## Capacity interpretation

The isolated load runner targets loopback only. Record concurrency, success/error
counts, p50/p95/p99 latency, row deltas and idempotency probes at 10/25/50/100.
Local D1 and a single burst cannot certify distributed production capacity.
Exercise moderation and projection while traffic is active; preserve measured
evidence rather than claiming support from configuration alone.
