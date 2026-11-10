-- Standalone ownership remains independent from discussions and voting events.
CREATE TABLE IF NOT EXISTS stage_director_state (
 stage_id TEXT PRIMARY KEY REFERENCES standalone_stages(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 0,
 rundown TEXT NOT NULL DEFAULT '[]', preview TEXT, recovery TEXT, mutation_id TEXT
);
CREATE TABLE IF NOT EXISTS stage_director_receipts (
 stage_id TEXT NOT NULL REFERENCES standalone_stages(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(stage_id,request_id)
);
CREATE TABLE IF NOT EXISTS stage_projector_health (
 stage_id TEXT PRIMARY KEY REFERENCES standalone_stages(id) ON DELETE CASCADE,
 seen_at INTEGER NOT NULL, revision INTEGER NOT NULL,
 visible INTEGER NOT NULL CHECK(visible IN (0,1))
);
CREATE TABLE IF NOT EXISTS stage_audience_activities (
 id TEXT PRIMARY KEY,
 stage_id TEXT NOT NULL REFERENCES standalone_stages(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('wordcloud','debate','questions','scale')),
 prompt TEXT NOT NULL,
 questions TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(questions)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
 revealed INTEGER NOT NULL DEFAULT 0 CHECK(revealed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS stage_audience_one_open ON stage_audience_activities(stage_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS stage_audience_recent ON stage_audience_activities(stage_id,created_at);
CREATE TABLE IF NOT EXISTS stage_audience_responses (
 activity_id TEXT NOT NULL REFERENCES stage_audience_activities(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL, item TEXT NOT NULL,
 moderation TEXT NOT NULL CHECK(moderation IN ('pending','approved','hidden')),
 revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(activity_id,participant_id)
);
CREATE TRIGGER IF NOT EXISTS stage_audience_admission BEFORE INSERT ON stage_audience_responses
WHEN NOT EXISTS(SELECT 1 FROM stage_audience_activities a WHERE a.id=NEW.activity_id AND a.status='open' AND (
 (a.kind='wordcloud' AND length(NEW.item) BETWEEN 1 AND 30 AND NEW.moderation='pending') OR
 (a.kind='debate' AND NEW.item IN ('agree','disagree') AND NEW.moderation='approved') OR
 (a.kind='scale' AND NEW.item IN ('1','2','3','4','5') AND NEW.moderation='approved') OR
 (a.kind='questions' AND NEW.moderation='approved' AND EXISTS(SELECT 1 FROM json_each(a.questions) q WHERE json_extract(q.value,'$.id')=NEW.item))
)) BEGIN SELECT RAISE(ABORT,'stage_activity_closed_or_invalid'); END;
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('011_standalone_director');
