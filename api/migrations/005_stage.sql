-- Additive presentation preferences; existing contribution/poll pointers remain.
-- Back up production D1 before applying. Application rollback leaves this column.
ALTER TABLE platform_state ADD COLUMN stage_config TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(stage_config));
INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('005_stage');
