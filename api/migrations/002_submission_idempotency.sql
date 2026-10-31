-- Add an opaque, participant-scoped request key for atomic submission retries.
-- Existing rows remain valid with NULL; all new application submissions set it.
ALTER TABLE submissions ADD COLUMN request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS submissions_request_id_idx
  ON submissions (session_id, participant_id, request_id)
  WHERE request_id IS NOT NULL;
