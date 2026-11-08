-- Archive operational history without deleting event data or audit records.
CREATE TABLE IF NOT EXISTS activity_history_batches (
 id TEXT PRIMARY KEY,
 actor_id TEXT,
 created_at TEXT NOT NULL,
 cutoff_rowid INTEGER NOT NULL,
 archived_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activity_archives (
 activity_id TEXT PRIMARY KEY REFERENCES admin_activity(id) ON DELETE CASCADE,
 archived_at TEXT NOT NULL,
 batch_id TEXT NOT NULL REFERENCES activity_history_batches(id)
);
CREATE INDEX IF NOT EXISTS activity_archive_batch ON activity_archives(batch_id);
CREATE INDEX IF NOT EXISTS activity_global_time ON admin_activity(created_at DESC,id DESC);
CREATE TRIGGER IF NOT EXISTS activity_archive_protected_guard BEFORE INSERT ON activity_archives
WHEN NOT EXISTS (SELECT 1 FROM admin_activity WHERE id=NEW.activity_id AND action IN (
 'moderation','status_draft','status_live','status_paused','status_closed','enqueue','remove','reorder','clearQueue','advance','project','createPoll','openPoll','closePoll','projectPoll','clearProjection','clearPoll','setReactions','configureStage','voting_create','voting_edit','voting_open','voting_close','voting_settings','voting_present','voting_reopen','voting_newRound','voting_new_round','voting_startRound','voting_start_round'
))
BEGIN SELECT RAISE(ABORT,'protected_activity'); END;
CREATE TRIGGER IF NOT EXISTS activity_security_delete_guard BEFORE DELETE ON admin_activity
WHEN OLD.action NOT IN (
 'moderation','status_draft','status_live','status_paused','status_closed','enqueue','remove','reorder','clearQueue','advance','project','createPoll','openPoll','closePoll','projectPoll','clearProjection','clearPoll','setReactions','configureStage','voting_create','voting_edit','voting_open','voting_close','voting_settings','voting_present','voting_reopen','voting_newRound','voting_new_round','voting_startRound','voting_start_round'
)
BEGIN SELECT RAISE(ABORT,'protected_activity'); END;
CREATE TRIGGER IF NOT EXISTS activity_security_update_guard BEFORE UPDATE ON admin_activity
WHEN OLD.action NOT IN (
 'moderation','status_draft','status_live','status_paused','status_closed','enqueue','remove','reorder','clearQueue','advance','project','createPoll','openPoll','closePoll','projectPoll','clearProjection','clearPoll','setReactions','configureStage','voting_create','voting_edit','voting_open','voting_close','voting_settings','voting_present','voting_reopen','voting_newRound','voting_new_round','voting_startRound','voting_start_round'
)
BEGIN SELECT RAISE(ABORT,'protected_activity'); END;
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('008_activity');
