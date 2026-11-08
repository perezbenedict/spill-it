# Event activity retention

Event Activity is an authenticated operational record. Participants cannot access it. Entries record an operation, event reference and UTC timestamp. The shared admin account does not establish which individual moderator acted. The view omits actor identifiers, participant identifiers, contribution text, announcement bodies, voting identities, passwords and credentials.

## Clear Visible History

This action archives eligible operational entries; it never deletes them or modifies discussions, contributions, ballots, votes, nickname reservations or presentation state. Confirmation names the number of matching entries across all pages of the current filtered snapshot. Later activity is excluded using a server-signed, 15-minute maximum-row snapshot. Repeating the same confirmation is idempotent.

Archived entries remain available through **View Archived Activity**, with the same filters and bounded pagination. A protected `clear_activity_history` audit entry records the count and archival batch. Search text is not persisted in that audit or archival-batch metadata.

Ordinary lifecycle, moderation, queue, presentation and voting-configuration activity may be archived. Security, authentication, destructive, archival-administration and unrecognized operations are protected by default: they remain in the main view and cannot be archived. Database triggers reject archival, update or deletion of protected audit records. Existing permanent-deletion operations retain their activity even if the original event is gone.

## Retention policy

There is no automatic expiry or permanent-delete action for activity, archived activity or protected audit records. This release retains all existing history. Archival is a view-management operation, not a privacy or security erasure mechanism.

Before introducing permanent retention limits, administrators must define an organizational/legal retention period, back up and rehearse recovery, identify protected security records, review dependencies, and authorize a separate migration or maintenance process. No such purge is included here. A database operator can change database schema; UI and trigger safeguards do not replace access controls over Cloudflare administration and backups.

Migration `008_activity.sql` adds archive/batch tables and guards without changing existing activity rows. Application rollback should leave these additive structures in place. Never restore or reset the production database merely to undo the activity-page upgrade.
