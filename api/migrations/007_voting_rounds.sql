-- Versioned migration: apply once after 006, with a verified export first.
-- Old API rollback is compatible before another round is created. After that,
-- retain this round-aware API: older code aggregates votes across all rounds.
ALTER TABLE voting_events ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1 CHECK(current_round > 0);

CREATE TABLE voting_rounds (
 event_id TEXT NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
 round_number INTEGER NOT NULL CHECK(round_number > 0),
 created_at TEXT NOT NULL,
 opened_at TEXT,
 last_opened_at TEXT,
 closed_at TEXT,
 reopen_count INTEGER NOT NULL DEFAULT 0,
 ever_public INTEGER NOT NULL DEFAULT 0 CHECK(ever_public IN (0,1)),
 PRIMARY KEY(event_id,round_number)
);
INSERT INTO voting_rounds(event_id,round_number,created_at,closed_at,ever_public)
 SELECT id,1,created_at,closed_at,ever_public FROM voting_events;
CREATE TRIGGER standalone_voting_round_created AFTER INSERT ON voting_events
BEGIN
 INSERT INTO voting_rounds(event_id,round_number,created_at,closed_at,ever_public)
 VALUES(NEW.id,1,NEW.created_at,NEW.closed_at,NEW.ever_public);
END;

DROP TRIGGER IF EXISTS standalone_vote_admission;
DROP TRIGGER IF EXISTS standalone_vote_version;
ALTER TABLE voting_votes RENAME TO voting_votes_legacy;
CREATE TABLE voting_votes (
 event_id TEXT NOT NULL REFERENCES voting_events(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL,
 participant_id TEXT NOT NULL,
 option_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 round_number INTEGER NOT NULL DEFAULT 1 CHECK(round_number > 0),
 PRIMARY KEY(question_id,round_number,participant_id),
 FOREIGN KEY(question_id,event_id) REFERENCES voting_questions(id,event_id) ON DELETE CASCADE,
 FOREIGN KEY(option_id,question_id) REFERENCES voting_options(id,question_id) ON DELETE CASCADE,
 FOREIGN KEY(event_id,round_number) REFERENCES voting_rounds(event_id,round_number) ON DELETE CASCADE
);
INSERT INTO voting_votes(event_id,question_id,participant_id,option_id,created_at,round_number)
 SELECT event_id,question_id,participant_id,option_id,created_at,1 FROM voting_votes_legacy;
DROP TABLE voting_votes_legacy;
CREATE INDEX voting_votes_option ON voting_votes(option_id,round_number);
CREATE INDEX voting_votes_event_time ON voting_votes(event_id,round_number,created_at);
CREATE TRIGGER standalone_vote_admission BEFORE INSERT ON voting_votes
WHEN NOT EXISTS (
 SELECT 1 FROM voting_events e JOIN voting_questions q ON q.event_id=e.id
 JOIN voting_options o ON o.question_id=q.id
 WHERE e.id=NEW.event_id AND e.status='open' AND e.current_round=NEW.round_number
 AND q.id=NEW.question_id AND q.ballot_type='single' AND o.id=NEW.option_id
)
BEGIN SELECT RAISE(ABORT,'voting_closed_or_round_changed'); END;
CREATE TRIGGER standalone_vote_version AFTER INSERT ON voting_votes
BEGIN
 UPDATE voting_events SET results_version=results_version+1 WHERE id=NEW.event_id;
END;
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('007_voting_rounds');
