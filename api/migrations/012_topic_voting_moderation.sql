-- Versioned migration: apply once after 011, with a verified export first.
-- Additive only: every column has a constant default so existing voting events
-- and contributions stay valid and readable by older API code.

-- Pre-Sunday topic voting: scheduling is enforced by the Worker on every read
-- and ballot (there is no cron trigger), so the deadlines live as columns.
ALTER TABLE voting_events ADD COLUMN scheduled_open_at TEXT;
ALTER TABLE voting_events ADD COLUMN deadline_at TEXT;
ALTER TABLE voting_events ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE voting_events ADD COLUMN confirmed_option_id TEXT;
ALTER TABLE voting_events ADD COLUMN confirmed_at TEXT;
ALTER TABLE voting_events ADD COLUMN confirmed_by TEXT;

-- A proposed topic carries its own description on the ballot option.
ALTER TABLE voting_options ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Moderation undo: every status transition is recorded so a rejected
-- contribution can be restored to Pending Review with an auditable trail.
-- The content itself is never rewritten by moderation.
CREATE TABLE IF NOT EXISTS moderation_history (
 id TEXT PRIMARY KEY,
 submission_id TEXT NOT NULL,
 session_id TEXT NOT NULL,
 actor_id TEXT,
 from_status TEXT,
 to_status TEXT NOT NULL CHECK(to_status IN ('pending','approved','hidden')),
 action TEXT NOT NULL CHECK(action IN ('approve','hide','restore')),
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS moderation_history_submission
 ON moderation_history(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_history_session
 ON moderation_history(session_id, created_at DESC);

-- Restoring a contribution must not resurrect it into the projector queue or
-- the presentation pointer: only 'hidden' -> 'pending' is a restore, and the
-- queue/pointer updates for hiding are unchanged.
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('012_topic_voting_moderation');
