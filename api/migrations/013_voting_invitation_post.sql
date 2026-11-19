-- Versioned migration: apply once after 012, with a verified export first.
-- Voting invitation post: links a voting event to a standalone stage created as
-- its visual invitation. Additive only: every column has a constant default so
-- existing voting events and stages stay valid and readable by older code.
ALTER TABLE voting_events ADD COLUMN invitation_post_id TEXT;

-- Standalone stages gain optional voting-event columns so the Post Studio can
-- recognise a stage that was created as a voting invitation and restore the
-- associated event context (title, options, deadline, link).
ALTER TABLE standalone_stages ADD COLUMN voting_event_code TEXT;
ALTER TABLE standalone_stages ADD COLUMN voting_event_id TEXT;

INSERT OR IGNORE INTO spill_schema_migrations(version) VALUES('013_voting_invitation_post');