-- SPILL D1 (SQLite) schema. Port of supabase/migrations/0001_init.sql and
-- 0003_single_live_session.sql. updated_at is maintained in worker.js, not
-- triggers. Apply with:
--   npx wrangler d1 execute spill --remote --file schema.sql

CREATE TABLE IF NOT EXISTS discussion_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
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
  session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
  -- Session-scoped pseudonymous id from an httpOnly cookie; not tied to auth.
  participant_id TEXT NOT NULL,
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
-- Fast lookup of a session's pinned submission.
CREATE INDEX IF NOT EXISTS submissions_session_pinned_idx
  ON submissions (session_id) WHERE is_pinned = 1;

-- At most one discussion may be live at a time. The partial unique index is
-- the final guarantee: even if two admins publish concurrently and both pass
-- the application-level check, the second update fails here.
CREATE UNIQUE INDEX IF NOT EXISTS discussion_sessions_one_live
  ON discussion_sessions (status)
  WHERE status = 'live';

CREATE TABLE IF NOT EXISTS presentation_state (
  session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE,
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
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx
  ON admin_sessions (user_id);
