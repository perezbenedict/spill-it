-- Additive platform upgrade. Back up D1 before applying; rollback application
-- code without dropping these event records.
ALTER TABLE discussion_sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE submissions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE presentation_state ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_sessions ADD COLUMN credential_version TEXT;
CREATE TABLE IF NOT EXISTS platform_state (
 session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 0, mutation_id TEXT,
 reactions_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reactions_enabled IN (0,1)),
 projected_poll_id TEXT
);
CREATE TABLE IF NOT EXISTS projection_queue (
 session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, PRIMARY KEY(session_id,submission_id)
);
CREATE INDEX IF NOT EXISTS projection_queue_order ON projection_queue(session_id,position);
CREATE TRIGGER IF NOT EXISTS queue_session_guard BEFORE INSERT ON projection_queue
WHEN NOT EXISTS(SELECT 1 FROM submissions WHERE id=NEW.submission_id AND session_id=NEW.session_id AND moderation_status='approved' AND hidden_from_presentation=0)
BEGIN SELECT RAISE(ABORT,'ineligible contribution'); END;
CREATE TABLE IF NOT EXISTS polls (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 question TEXT NOT NULL CHECK(length(question) BETWEEN 1 AND 300),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
 created_at TEXT NOT NULL, UNIQUE(id,session_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_poll ON polls(session_id) WHERE status='open';
CREATE TABLE IF NOT EXISTS poll_options (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120), position INTEGER NOT NULL,
 UNIQUE(id,poll_id)
);
CREATE TABLE IF NOT EXISTS poll_votes (
 poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL, option_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(poll_id,participant_id),
 FOREIGN KEY(option_id,poll_id) REFERENCES poll_options(id,poll_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reaction_events (
 session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL, reaction TEXT NOT NULL CHECK(reaction IN ('agree','insight','heart')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(session_id,participant_id,created_at)
);
CREATE INDEX IF NOT EXISTS reaction_recent ON reaction_events(session_id,created_at);
CREATE TABLE IF NOT EXISTS admin_activity (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
 actor_id TEXT, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_session_time ON admin_activity(session_id,created_at DESC);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS nickname_backfills (
 session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS legacy_nickname_claims (
 session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 normalized_nickname TEXT NOT NULL, participant_id TEXT NOT NULL,
 PRIMARY KEY(session_id,normalized_nickname,participant_id)
);
CREATE TRIGGER IF NOT EXISTS presentation_insert_guard BEFORE INSERT ON presentation_state
WHEN NEW.current_submission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM submissions WHERE id=NEW.current_submission_id AND session_id=NEW.session_id AND moderation_status='approved' AND hidden_from_presentation=0)
BEGIN SELECT RAISE(ABORT,'ineligible contribution'); END;
CREATE TRIGGER IF NOT EXISTS presentation_update_guard BEFORE UPDATE OF current_submission_id ON presentation_state
WHEN NEW.current_submission_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM submissions WHERE id=NEW.current_submission_id AND session_id=NEW.session_id AND moderation_status='approved' AND hidden_from_presentation=0)
BEGIN SELECT RAISE(ABORT,'ineligible contribution'); END;
CREATE TRIGGER IF NOT EXISTS moderated_queue_cleanup AFTER UPDATE OF moderation_status,hidden_from_presentation ON submissions
WHEN NEW.moderation_status<>'approved' OR NEW.hidden_from_presentation=1
BEGIN
 DELETE FROM projection_queue WHERE session_id=NEW.session_id AND submission_id=NEW.id;
 UPDATE platform_state SET revision=revision+1,mutation_id=NULL WHERE session_id=NEW.session_id;
 UPDATE presentation_state SET current_submission_id=NULL,revision=revision+1 WHERE session_id=NEW.session_id AND current_submission_id=NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS moderation_activity AFTER UPDATE OF moderation_status,is_pinned,hidden_from_presentation,discussed_at ON submissions
BEGIN
 INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.session_id,NULL,'moderation',NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS status_activity AFTER UPDATE OF status ON discussion_sessions
WHEN NEW.status<>OLD.status
BEGIN
 INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at)
 VALUES(lower(hex(randomblob(16))),NEW.id,NULL,'status_'||NEW.status,NEW.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS delete_contribution_activity BEFORE DELETE ON submissions
BEGIN
 UPDATE platform_state SET revision=revision+1,mutation_id=NULL WHERE session_id=OLD.session_id;
 INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at)
 VALUES(lower(hex(randomblob(16))),OLD.session_id,NULL,'delete_contribution',OLD.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER IF NOT EXISTS delete_session_activity BEFORE DELETE ON discussion_sessions
BEGIN
 INSERT INTO admin_activity(id,session_id,actor_id,action,target_id,created_at)
 VALUES(lower(hex(randomblob(16))),OLD.id,NULL,'delete_session',OLD.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

CREATE TABLE IF NOT EXISTS spill_schema_migrations (
 version TEXT PRIMARY KEY,
 applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('004_platform');
