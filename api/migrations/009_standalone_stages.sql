-- Standalone stages have no discussion or voting ownership relationship.
CREATE TABLE IF NOT EXISTS standalone_stages (
 id TEXT PRIMARY KEY,
 public_code TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL DEFAULT '',
 stage_config TEXT NOT NULL DEFAULT '{"atmosphere":"midnight","chapters":[],"activeChapterId":null,"prompts":[],"announcements":[],"overlay":null}',
 revision INTEGER NOT NULL DEFAULT 0,
 mutation_id TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS standalone_stages_updated ON standalone_stages(updated_at DESC,id DESC);
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('009_standalone_stages');
