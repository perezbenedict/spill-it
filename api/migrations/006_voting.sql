-- Additive standalone ballots. Back up D1 before applying; application rollback
-- leaves voting records intact. Existing discussion polls are unchanged.
CREATE TABLE IF NOT EXISTS voting_events (
 id TEXT PRIMARY KEY,
 public_code TEXT NOT NULL UNIQUE CHECK(length(public_code)=8 AND public_code NOT GLOB '*[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]*'),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed','archived')),
 session_id TEXT REFERENCES discussion_sessions(id) ON DELETE SET NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 results_version INTEGER NOT NULL DEFAULT 0,
 mutation_id TEXT,
 settings TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings)),
 presentation TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(presentation)),
 ever_public INTEGER NOT NULL DEFAULT 0 CHECK(ever_public IN (0,1)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 closed_at TEXT
);
CREATE INDEX IF NOT EXISTS voting_events_created ON voting_events(created_at DESC);
CREATE INDEX IF NOT EXISTS voting_events_session ON voting_events(session_id);
CREATE TABLE IF NOT EXISTS voting_questions (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
 ballot_type TEXT NOT NULL DEFAULT 'single',
 text TEXT NOT NULL CHECK(length(trim(text)) BETWEEN 1 AND 300),
 position INTEGER NOT NULL,
 revealed INTEGER NOT NULL DEFAULT 0 CHECK(revealed IN (0,1)),
 UNIQUE(id,event_id)
);
CREATE INDEX IF NOT EXISTS voting_questions_order ON voting_questions(event_id,position);
CREATE TABLE IF NOT EXISTS voting_options (
 id TEXT PRIMARY KEY,
 question_id TEXT NOT NULL REFERENCES voting_questions(id) ON DELETE CASCADE,
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),
 position INTEGER NOT NULL,
 UNIQUE(id,question_id)
);
CREATE TABLE IF NOT EXISTS voting_votes (
 event_id TEXT NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL,
 participant_id TEXT NOT NULL,
 option_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(question_id,participant_id),
 FOREIGN KEY(question_id,event_id) REFERENCES voting_questions(id,event_id) ON DELETE CASCADE,
 FOREIGN KEY(option_id,question_id) REFERENCES voting_options(id,question_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS voting_votes_option ON voting_votes(option_id);
CREATE INDEX IF NOT EXISTS voting_votes_event_time ON voting_votes(event_id,created_at);
CREATE TRIGGER IF NOT EXISTS standalone_vote_admission BEFORE INSERT ON voting_votes
WHEN NOT EXISTS (
 SELECT 1 FROM voting_events e JOIN voting_questions q ON q.event_id=e.id
 JOIN voting_options o ON o.question_id=q.id
 WHERE e.id=NEW.event_id AND e.status='open' AND q.id=NEW.question_id
 AND q.ballot_type='single' AND o.id=NEW.option_id
)
BEGIN SELECT RAISE(ABORT,'voting_closed'); END;
CREATE TRIGGER IF NOT EXISTS standalone_vote_version AFTER INSERT ON voting_votes
BEGIN
 UPDATE voting_events SET results_version=results_version+1 WHERE id=NEW.event_id;
END;
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('006_voting');
