-- Additive and repeatable. Existing discussion, ballot and stage rows are untouched.
CREATE TABLE IF NOT EXISTS director_state (
 session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 0,
 rundown TEXT NOT NULL DEFAULT '[]',
 preview TEXT,
 recovery TEXT,
 mutation_id TEXT
);
CREATE TABLE IF NOT EXISTS director_receipts (
 session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(session_id,request_id)
);
CREATE TABLE IF NOT EXISTS projector_health (
 session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 seen_at INTEGER NOT NULL,
 revision INTEGER NOT NULL,
 visible INTEGER NOT NULL CHECK(visible IN (0,1))
);
CREATE TABLE IF NOT EXISTS audience_activities (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('wordcloud','debate','questions','scale')),
 prompt TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
 revealed INTEGER NOT NULL DEFAULT 0 CHECK(revealed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS audience_one_open ON audience_activities(session_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS audience_session ON audience_activities(session_id,created_at);
CREATE TABLE IF NOT EXISTS audience_responses (
 activity_id TEXT NOT NULL REFERENCES audience_activities(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL,
 item TEXT NOT NULL,
 moderation TEXT NOT NULL CHECK(moderation IN ('pending','approved','hidden')),
 revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(activity_id,participant_id)
);
CREATE TRIGGER IF NOT EXISTS audience_response_admission BEFORE INSERT ON audience_responses
WHEN NOT EXISTS(SELECT 1 FROM audience_activities a JOIN discussion_sessions s ON s.id=a.session_id
 WHERE a.id=NEW.activity_id AND a.status='open' AND s.status='live' AND (s.closes_at IS NULL OR julianday(s.closes_at)>julianday('now')) AND (
 (a.kind='wordcloud' AND length(NEW.item) BETWEEN 1 AND 30 AND NEW.moderation='pending') OR
 (a.kind='debate' AND NEW.item IN ('agree','disagree') AND NEW.moderation='approved') OR
 (a.kind='scale' AND NEW.item IN ('1','2','3','4','5') AND NEW.moderation='approved') OR
 (a.kind='questions' AND NEW.moderation='approved' AND EXISTS(SELECT 1 FROM submissions x WHERE x.id=NEW.item AND x.session_id=a.session_id AND x.category='question' AND x.moderation_status='approved' AND x.hidden_from_presentation=0))
 ))
BEGIN SELECT RAISE(ABORT,'activity_closed_or_invalid'); END;
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('010_director');
