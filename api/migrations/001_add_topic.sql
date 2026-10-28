-- Migration: add topic column to discussion_sessions
ALTER TABLE discussion_sessions ADD COLUMN topic TEXT NOT NULL DEFAULT '' CHECK (length(topic) <= 200);
