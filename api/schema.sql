-- SPILL D1 (SQLite) schema. Port of supabase/migrations/0001_init.sql and
-- 0003_single_live_session.sql. updated_at is maintained in worker.js, not
-- triggers. Apply with:
--   npx wrangler d1 execute spill --remote --file schema.sql

CREATE TABLE IF NOT EXISTS discussion_sessions (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  topic TEXT NOT NULL DEFAULT '' CHECK (length(topic) <= 200),
  description TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT '',
  -- 8 chars from an unambiguous alphabet (no 0/O/1/I/L), stored uppercase.
  -- The alphabet check is a single negated character class: SQLite rejects the
  -- longer 8x repeated-class GLOB as "pattern too complex" at INSERT time.
  public_code TEXT NOT NULL UNIQUE CHECK (
    length(public_code) = 8
    AND public_code NOT GLOB '*[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]*'
  ),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'paused', 'closed')),
  -- JSON array of category keys, e.g. ["question","opinion","challenge","twocents"].
  available_categories TEXT NOT NULL DEFAULT '["question","opinion","challenge","twocents"]'
    CHECK (json_valid(available_categories)),
  -- JSON object. Expected keys: min_content_length (int), max_content_length
  -- (int), allow_manual_nickname (bool), prompts (array of strings).
  configuration TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(configuration)),
  opens_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
  -- Session-scoped pseudonymous id from an httpOnly cookie; not tied to auth.
  participant_id TEXT NOT NULL,
  -- Opaque browser-generated key for one logical submit attempt. Nullable so
  -- existing rows and legacy imports remain valid; every new app submission
  -- supplies a value and the partial unique index below makes retries atomic.
  request_id TEXT,
  nickname TEXT NOT NULL CHECK (length(trim(nickname)) BETWEEN 1 AND 60),
  category TEXT NOT NULL
    CHECK (category IN ('question', 'opinion', 'challenge', 'twocents')),
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 1000),
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'hidden')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  hidden_from_presentation INTEGER NOT NULL DEFAULT 0
    CHECK (hidden_from_presentation IN (0, 1)),
  discussed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS submissions_session_created_idx
  ON submissions (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_session_moderation_idx
  ON submissions (session_id, moderation_status);
CREATE INDEX IF NOT EXISTS submissions_session_category_idx
  ON submissions (session_id, category);
CREATE INDEX IF NOT EXISTS submissions_session_participant_idx
  ON submissions (session_id, participant_id);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_request_id_idx
  ON submissions (session_id, participant_id, request_id)
  WHERE request_id IS NOT NULL;
-- Fast lookup of a session's pinned submission.
CREATE INDEX IF NOT EXISTS submissions_session_pinned_idx
  ON submissions (session_id) WHERE is_pinned = 1;

-- One active anonymous nickname per participant and one owner per normalized
-- nickname inside a discussion. The display spelling remains private to the
-- participant/submission; comparisons use the pre-normalized key.
CREATE TABLE IF NOT EXISTS nickname_reservations (
  session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
  normalized_nickname TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  display_nickname TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (session_id, normalized_nickname),
  UNIQUE (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS nickname_reservations_expiry_idx
  ON nickname_reservations (session_id, expires_at);

-- At most one discussion may be live at a time. The partial unique index is
-- the final guarantee: even if two admins publish concurrently and both pass
-- the application-level check, the second update fails here.
CREATE UNIQUE INDEX IF NOT EXISTS discussion_sessions_one_live
  ON discussion_sessions (status)
  WHERE status = 'live';

CREATE TABLE IF NOT EXISTS presentation_state (
  session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  current_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'moderator'
    CHECK (role IN ('admin', 'moderator')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  credential_version TEXT,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx
  ON admin_sessions (user_id);
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
