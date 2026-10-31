-- Atomic, session-scoped anonymous nickname ownership. Reservations follow the
-- participant's session cookie, expire after 24 hours without refresh, and are
-- deleted automatically with their discussion.
CREATE TABLE IF NOT EXISTS nickname_reservations (
  session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
  normalized_nickname TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  display_nickname TEXT NOT NULL,
  reserved_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (session_id, normalized_nickname),
  UNIQUE (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS nickname_reservations_expiry_idx
  ON nickname_reservations (session_id, expires_at);

-- Preserve ownership established by existing submissions. INSERT OR IGNORE
-- resolves any legacy conflicts deterministically without deleting content.
INSERT OR IGNORE INTO nickname_reservations (
  session_id,
  normalized_nickname,
  participant_id,
  display_nickname,
  reserved_at,
  refreshed_at,
  expires_at
)
SELECT
  session_id,
  lower(trim(replace(replace(replace(nickname, '  ', ' '), '  ', ' '), '  ', ' '))),
  participant_id,
  trim(replace(replace(replace(nickname, '  ', ' '), '  ', ' '), '  ', ' ')),
  min(created_at),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+24 hours')
FROM submissions
GROUP BY session_id, participant_id
ORDER BY min(created_at) ASC;
